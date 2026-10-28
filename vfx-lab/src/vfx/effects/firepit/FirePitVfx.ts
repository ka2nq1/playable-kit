/**
 * The fire pit effect: sparks + embers + smoke behind one lifecycle.
 *
 * This is the object a game integrates. It owns the shared texture provider and the quality
 * preset, forwards the lifecycle to the three sub-effects, and otherwise stays out of the way —
 * each sub-effect is public, so a game that wants only embers can disable the other two without
 * taking them apart.
 *
 * Usage inside an existing game loop:
 *
 *     const firePit = new FirePitVfx(config);
 *     scene.add(firePit.object3d);
 *     firePit.start();
 *     // ...once per frame, from the loop you already have:
 *     firePit.update(delta);
 *     // ...and on teardown:
 *     firePit.dispose();
 */

import { Group, Object3D, Vector3 } from "three";
import { TextureProvider } from "../../core/textures";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { EmbersEffect } from "./EmbersEffect";
import { SmokeEffect } from "./SmokeEffect";
import { SparksEffect } from "./SparksEffect";
import { FirePitVfxConfig, normalizeFirePitConfig, QualityPresetName } from "./config";

export interface FirePitVfxOptions {
    /**
     * Supply your own provider to swap the procedural canvas textures for artist sprites.
     * When omitted, the effect creates — and disposes — its own.
     */
    textures?: TextureProvider;
    /** Base RNG seed; two instances with the same seed produce identical motion. */
    seed?: number;
}

export class FirePitVfx implements VfxEffect {
    readonly id = "firepit";
    readonly object3d: Group;

    readonly config: FirePitVfxConfig;
    readonly sparks: SparksEffect;
    readonly embers: EmbersEffect;
    readonly smoke: SmokeEffect;

    private readonly textures: TextureProvider;
    private readonly ownsTextures: boolean;
    private readonly parts: Array<SparksEffect | EmbersEffect | SmokeEffect>;

    private running = false;

    constructor(rawConfig: unknown, options: FirePitVfxOptions = {}) {
        const { config, issues } = normalizeFirePitConfig(rawConfig);
        issues.report("FirePitVfx");
        this.config = config;

        this.textures = options.textures ?? new TextureProvider();
        this.ownsTextures = !options.textures;

        const seed = options.seed ?? 1;
        this.smoke = new SmokeEffect(config.smoke, this.textures, seed * 31 + 7013);
        this.embers = new EmbersEffect(config.embers, this.textures, seed * 17 + 2045);
        this.sparks = new SparksEffect(config.sparks, seed * 13 + 9021);
        this.parts = [this.smoke, this.embers, this.sparks];

        this.object3d = new Group();
        this.object3d.name = "vfx:firepit";
        for (const part of this.parts) this.object3d.add(part.object3d);

        this.setQuality(config.quality.preset);
    }

    /** `true` while any sub-effect is enabled. Setting it toggles all three at once. */
    get enabled(): boolean {
        return this.parts.some((p) => p.enabled);
    }

    set enabled(v: boolean) {
        for (const part of this.parts) part.enabled = v;
    }

    get activeCount(): number {
        return this.sparks.activeCount + this.embers.activeCount + this.smoke.activeCount;
    }

    get isRunning(): boolean {
        return this.running;
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
        for (const part of this.parts) part.setQuality({ particles: scale.particles, emission: scale.emission });
    }

    /** Moves the whole pit. Equivalent to positioning `object3d`, kept for symmetry with `burst`. */
    setPosition(position: Vector3): void {
        this.object3d.position.copy(position);
    }

    start(): void {
        this.running = true;
        for (const part of this.parts) part.start();
    }

    stop(): void {
        this.running = false;
        for (const part of this.parts) part.stop();
    }

    /** Bursts every enabled sub-effect. For a sparks-only pop, call `firePit.sparks.burst()`. */
    burst(position?: Vector3 | null, options?: BurstOptions): void {
        for (const part of this.parts) part.burst(position, options);
    }

    update(dt: number): void {
        for (const part of this.parts) part.update(dt);
    }

    reset(): void {
        for (const part of this.parts) part.reset();
    }

    /** Re-bakes every curve after `opacityOverLife` / `scaleOverLife` were edited in the config. */
    rebuildCurves(): void {
        for (const part of this.parts) part.rebuildCurves();
    }

    dispose(): void {
        this.stop();
        for (const part of this.parts) part.dispose();
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
