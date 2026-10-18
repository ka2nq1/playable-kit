/**
 * A localized, slowly moving blizzard: a dense impostor volume, a layer of wind-driven snow, and
 * an optional lightning subsystem buried inside it. Three draw calls, two when lightning is off.
 *
 * The one structural idea worth knowing before changing anything here: **the storm is a local
 * space.** The puffs, the flakes and the flash are all expressed relative to this object's own
 * origin, and the only thing that ever moves in world space is the `Group` itself. That is what
 * buys the two behaviours the effect is for — the formation drifts across the scene while its
 * insides churn independently, and it affects nothing outside its own volume. There is no scene
 * fog, no global snowfall, no light and no post pass anywhere in this folder; a material outside
 * the storm cannot tell it exists.
 *
 *     const storm = new SnowstormVfx(config);
 *     storm.object3d.position.set(0, 9, -46);   // or leave it to config.position
 *     scene.add(storm.object3d);
 *
 *     storm.update(delta);            // from the loop you already have
 *     storm.setMovementTarget(40, 9, -40);
 *     storm.setLightningEnabled(true);
 *     storm.triggerLightning();
 *     storm.enabled = false;          // off, without tearing anything down
 *     storm.dispose();                // on teardown
 *
 * Cost is overdraw and almost nothing else: `update` advances five scalars and writes a handful
 * of uniforms, and no attribute is uploaded after construction. The knob that matters on a phone
 * is `quality`, which scales the instance counts — see `SNOWSTORM_QUALITY_PRESETS`.
 */

import { Color, Group, Vector3 } from "three";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeSnowstormConfig, type SnowstormConfig, type SnowstormQuality } from "./config";
import { SnowStreaks } from "./SnowStreaks";
import { StormBody } from "./StormBody";
import { StormLightning } from "./StormLightning";
import { StormMotion } from "./StormMotion";

export interface SnowstormVfxOptions {
    /** Base RNG seed. Same seed is the same storm: same puff lattice, same flake headings. */
    seed?: number;
}

const DEG = Math.PI / 180;

export class SnowstormVfx implements VfxEffect {
    readonly id = "snowstorm";
    readonly object3d: Group;

    readonly config: SnowstormConfig;

    private readonly body: StormBody;
    private readonly streaks: SnowStreaks;
    private readonly lightning: StormLightning;
    private readonly motion = new StormMotion();

    private running = true;
    /** Drives the gust envelope. Advanced from `dt`, so gusts arrive at the same rate at any fps. */
    private gustPhase = 0;
    private gust = 1;
    /** Lets `update` stop rewriting the flash uniforms once a strike has finished. */
    private flashWasLit = false;
    /** Lets `update` stop writing flash uniforms once a strike has finished. */
    /** Scratch so nothing in `update` or `applyConfig` allocates, however fast a slider is dragged. */
    private readonly scratch = new Vector3();
    private readonly noColor = new Color(0, 0, 0);

    constructor(rawConfig?: unknown, options: SnowstormVfxOptions = {}) {
        const { config, issues } = normalizeSnowstormConfig(rawConfig);
        issues.report("SnowstormVfx");
        this.config = config;

        const seed = options.seed ?? 7;
        this.body = new StormBody(seed);
        this.streaks = new SnowStreaks(seed + 1);
        this.lightning = new StormLightning(seed * 1311 + 17);

        this.object3d = new Group();
        this.object3d.name = "vfx:snowstorm";
        this.object3d.add(this.body.mesh, this.streaks.mesh, this.lightning.object3d);

        this.applyConfig();
    }

    get enabled(): boolean {
        return this.object3d.visible;
    }

    set enabled(v: boolean) {
        this.config.enabled = v;
        this.object3d.visible = v;
    }

    /** Instances drawn this frame, across all three layers. This is what the budget is. */
    get activeCount(): number {
        if (!this.object3d.visible) return 0;
        return this.body.instanceCount + this.streaks.instanceCount + this.lightning.segmentCount;
    }

    get puffCount(): number {
        return this.object3d.visible ? this.body.instanceCount : 0;
    }

    get snowCount(): number {
        return this.object3d.visible ? this.streaks.instanceCount : 0;
    }

    /** Current flash level, 0 when no strike is in flight. Useful for a stats readout. */
    get flashLevel(): number {
        return this.lightning.flash;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Resumes the animation. The storm starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the storm where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. The one thing a storm can burst is a strike, so that is what it does. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {
        this.triggerLightning();
    }

    update(dt: number): void {
        if (!this.object3d.visible || dt <= 0) return;

        // Guard against the huge delta a backgrounded tab produces on return: without it the
        // storm teleports most of the way along its path and the snow jumps a wrap boundary.
        const step = this.running ? Math.min(dt, 0.1) : 0;

        if (step > 0) {
            this.gust = this.advanceGust(step);
            this.body.advance(step, this.config, this.gust);
            this.streaks.advance(step, this.config, this.gust, this.body.shapePhase);
            this.lightning.update(step, this.config);
        }

        // Always, even when stopped: `setPosition` has to land on a paused storm too.
        this.motion.update(step, this.config, this.object3d.position);

        const level = this.lightning.flash;
        if (level > 0) {
            this.body.setFlash(this.lightning.flashPosition, this.lightning.flashColor, level, this.lightning.flashRadius);
            this.streaks.setFlash(this.lightning.flashPosition, this.lightning.flashColor, level, this.lightning.flashRadius);
        } else if (this.flashWasLit) {
            this.body.setFlash(this.lightning.flashPosition, this.noColor, 0, 1);
            this.streaks.setFlash(this.lightning.flashPosition, this.noColor, 0, 1);
        }
        this.flashWasLit = level > 0;
    }

    /**
     * Re-reads the config object after an edit.
     *
     * Every knob is a uniform, an `instanceCount` or a `#define`, so this is the whole of it —
     * nothing is baked that a slider could invalidate and no buffer is touched however fast the
     * panel calls it. The one cost is a shader compile, and only when `quality` changed the
     * octave counts.
     */
    applyConfig(): void {
        const c = this.config;
        this.object3d.visible = c.enabled;
        this.object3d.rotation.y = c.yaw * DEG;

        // One heading, handed to both layers: the fog has to be dragged the same way the flakes
        // are blown or the two read as separate effects that happen to overlap.
        const a = c.snow.windAngle * DEG;
        const pitch = c.snow.windPitch * DEG;
        const ch = Math.cos(pitch);
        this.scratch.set(Math.cos(a) * ch, -Math.sin(pitch), Math.sin(a) * ch).normalize();
        this.body.setWindDirection(this.scratch.x, this.scratch.y, this.scratch.z);
        this.streaks.setWindDirection(this.scratch.x, this.scratch.y, this.scratch.z);

        this.body.applyConfig(c);
        this.streaks.applyConfig(c);
        this.lightning.applyConfig(c);
    }

    /** Moves the storm's home — the start of its path. Takes effect on the next `update`. */
    setPosition(x: number, y: number, z: number): void {
        this.config.position[0] = x;
        this.config.position[1] = y;
        this.config.position[2] = z;
    }

    /** Aims the path at a world point by rewriting `movement.travel`. Does not enable movement. */
    setMovementTarget(x: number, y: number, z: number): void {
        const p = this.config.position;
        this.config.movement.travel[0] = x - p[0];
        this.config.movement.travel[1] = y - p[1];
        this.config.movement.travel[2] = z - p[2];
    }

    setLightningEnabled(enabled: boolean): void {
        this.config.lightning.enabled = enabled;
        if (!enabled) this.lightning.reset();
    }

    /** Fires a strike now, whatever the schedule says and whether or not lightning is enabled. */
    triggerLightning(): void {
        this.lightning.strike(this.config);
    }

    setQuality(quality: SnowstormQuality): void {
        this.config.quality = quality;
        this.applyConfig();
    }

    /**
     * Back to the start: the path, the wind, the churn and any strike in flight.
     *
     * The storm re-forms out of the same fields rather than fading in, so this is a cut, not a
     * spawn — which is what you want when you are comparing two settings frame by frame.
     */
    reset(): void {
        this.motion.reset();
        this.body.reset();
        this.streaks.reset();
        this.lightning.reset();
        this.gustPhase = 0;
        this.gust = 1;
        this.flashWasLit = false;
        this.applyConfig();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.body.dispose();
        this.streaks.dispose();
        this.lightning.dispose();
    }

    /**
     * Two sines an irrational ratio apart, rectified and squared.
     *
     * Squaring is what makes a gust a *gust*: the envelope sits near zero most of the time and
     * spikes occasionally, instead of the storm breathing in and out on a steady cycle. The
     * result multiplies the wind only — the churn and the swirl keep their own clocks, because a
     * gust moves the snow along faster, it does not speed the whole animation up like a tape.
     */
    private advanceGust(dt: number): number {
        this.gustPhase += (dt * this.config.snow.gustFrequency) / 60;
        const t = this.gustPhase * Math.PI * 2;
        const g = Math.max(0, Math.sin(t) * 0.62 + Math.sin(t * 0.37 + 1.7) * 0.38);
        return 1 + this.config.snow.gustStrength * g * g;
    }
}
