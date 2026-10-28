/**
 * The water effect a game integrates: ripples + spray behind one lifecycle and one preset table.
 *
 * Everything here is event-driven. The game tells it *what happened and where* — an object hit the
 * water, a creature surfaced, something stirred in the background — and the preset decides what
 * that looks like. No gameplay type, model name or asset path appears anywhere in this package;
 * the coupling is a world position and a preset name, both of which live in config.
 *
 *     const water = new WaterVfx(config);
 *     water.object3d.position.y = WATER_LEVEL;   // the surface the ripples live on
 *     scene.add(water.object3d);
 *
 *     water.emit("impact", ball.position);                       // something fell in
 *     water.emit("emergence", gator.position, { scale: 1.4 });    // something came up
 *     water.emit("ambient", somewhereDistant);                   // scripted background stir
 *
 *     water.update(delta);   // from the loop you already have
 *     water.dispose();       // on teardown
 */

import { Group, Object3D, Vector3 } from "three";
import { TextureProvider } from "../../core/textures";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeWaterConfig, type QualityPresetName, type WaterVfxConfig } from "./config";
import { SprayEffect } from "./SprayEffect";
import { WaterRippleSystem, type RippleEmitOptions } from "./WaterRippleSystem";

export interface WaterVfxOptions {
    /**
     * Supply your own provider to swap the procedural canvas textures for artist sprites.
     * When omitted, the effect creates — and disposes — its own.
     */
    textures?: TextureProvider;
    /** Base RNG seed; two instances with the same seed produce identical motion. */
    seed?: number;
}

/** Per-event overrides on top of a preset. `spray` is partial too, so `{ count: 0 }` is legal. */
export type WaterEmitOptions = RippleEmitOptions & {
    spray?: Partial<{ count: number; speedScale: number }>;
};

export class WaterVfx implements VfxEffect {
    readonly id = "water";
    readonly object3d: Group;

    readonly config: WaterVfxConfig;
    readonly ripples: WaterRippleSystem;
    readonly spray: SprayEffect;

    private readonly textures: TextureProvider;
    private readonly ownsTextures: boolean;

    /** Unknown preset names are reported once each, not once per event. */
    private readonly warnedPresets = new Set<string>();
    private running = true;

    /** Scratch for the world→surface conversion, so emitting costs no allocation. */
    private readonly tmpLocal = new Vector3();

    constructor(rawConfig: unknown, options: WaterVfxOptions = {}) {
        const { config, issues } = normalizeWaterConfig(rawConfig);
        issues.report("WaterVfx");
        this.config = config;

        this.textures = options.textures ?? new TextureProvider();
        this.ownsTextures = !options.textures;

        const seed = options.seed ?? 1;
        this.ripples = new WaterRippleSystem(config.ripples, seed * 29 + 7717);
        this.spray = new SprayEffect(config.spray, this.textures, seed * 11 + 5501);
        this.spray.surfaceY = config.ripples.surfaceOffset;

        this.object3d = new Group();
        this.object3d.name = "vfx:water";
        this.object3d.add(this.ripples.object3d, this.spray.object3d);

        this.setQuality(config.quality.preset);
    }

    get enabled(): boolean {
        return this.ripples.enabled || this.spray.enabled;
    }

    set enabled(v: boolean) {
        this.ripples.enabled = v;
        this.spray.enabled = v;
    }

    get activeCount(): number {
        return this.ripples.activeCount + this.spray.activeCount;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** The preset names available to {@link emit}, including any added in the JSON. */
    get presetNames(): string[] {
        return Object.keys(this.config.presets);
    }

    /**
     * Plays one event at a **world-space** position.
     *
     * Only the horizontal position matters: both the rings and the droplets are placed on the
     * surface plane this effect sits on, whatever height the triggering object was at. Returns the
     * number of rings started — 0 when the effect is stopped, disabled, or the pool is saturated
     * with more important events.
     */
    emit(preset: string, worldPosition: Vector3, overrides?: WaterEmitOptions): number {
        if (!this.running) return 0;

        const entry = this.config.presets[preset] ?? this.config.presets[this.config.defaultPreset];
        if (!this.config.presets[preset] && !this.warnedPresets.has(preset)) {
            this.warnedPresets.add(preset);
            console.warn(`[WaterVfx] unknown preset "${preset}", using "${this.config.defaultPreset}"`);
        }
        if (!entry) return 0;

        // One conversion for both subsystems: the group they share is the surface frame.
        this.object3d.updateWorldMatrix(true, false);
        this.tmpLocal.copy(worldPosition);
        this.object3d.worldToLocal(this.tmpLocal);
        this.tmpLocal.y = this.config.ripples.surfaceOffset;

        const rings = this.ripples.emitLocal(this.tmpLocal, overrides ? { ...entry.ripple, ...overrides } : entry.ripple);

        const count = overrides?.spray?.count ?? entry.spray.count;
        if (count > 0) {
            const speedScale = (overrides?.spray?.speedScale ?? entry.spray.speedScale) * (overrides?.scale ?? entry.ripple.scale);
            this.spray.burst(this.tmpLocal, { count, speedScale });
        }

        return rings;
    }

    /**
     * Applies a quality preset.
     *
     * Pools are allocated once at full size and the preset only lowers the *effective* cap, so
     * switching presets mid-frame costs nothing and never reallocates or drops a draw call.
     */
    setQuality(preset: QualityPresetName): void {
        this.config.quality.preset = preset;
        const scale = this.config.quality.presets[preset];
        this.ripples.setQuality({ particles: scale.particles, rings: scale.rings });
        this.spray.setQuality({ particles: scale.particles, emission: scale.rings });
    }

    /** Moves the surface. Equivalent to positioning `object3d`, kept for symmetry with `emit`. */
    setPosition(position: Vector3): void {
        this.object3d.position.copy(position);
    }

    /**
     * Resumes accepting events. The effect starts in this state — there is nothing to kick off,
     * so `start()` is only ever needed after a `stop()`.
     */
    start(): void {
        this.running = true;
    }

    /** Ignores new events; ripples and droplets already in flight finish normally. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance: one event of the default preset. `emit` is the real entry point. */
    burst(position?: Vector3 | null, options?: BurstOptions): void {
        const target = position ?? this.object3d.getWorldPosition(this.tmpLocal);
        this.emit(this.config.defaultPreset, target, options?.count ? { rings: options.count } : undefined);
    }

    update(dt: number): void {
        this.ripples.update(dt);
        this.spray.update(dt);
    }

    /** Drops every live ripple and droplet instantly. */
    clear(): void {
        this.ripples.clear();
        this.spray.reset();
    }

    reset(): void {
        this.clear();
    }

    /** Re-bakes every curve after the `*OverLife` keyframes were edited in the config. */
    rebuildCurves(): void {
        this.ripples.rebuildCurves();
        this.spray.rebuildCurves();
    }

    dispose(): void {
        this.stop();
        this.ripples.dispose();
        this.spray.dispose();
        this.object3d.removeFromParent();
        this.object3d.clear();
        // Only tear down textures we made ourselves — an injected provider is the caller's.
        if (this.ownsTextures) this.textures.dispose();
    }

    /** The node to parent into a scene; identical to `object3d`, typed for convenience. */
    asObject3D(): Object3D {
        return this.object3d;
    }
}
