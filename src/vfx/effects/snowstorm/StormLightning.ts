/**
 * Lightning buried in the storm: a flash envelope, and in `bolt` mode a branching channel to go
 * with it.
 *
 * The flash is the part that matters and the part that is nearly free — one position and one
 * scalar, handed to the body and the snow, where a local falloff brightens the fog around it.
 * Everything is in the storm's **local** space, which is the whole reason a strike stays put
 * inside a storm that is drifting across the scene: nothing here ever sees a world coordinate.
 *
 * There is deliberately no light in this file. A `PointLight` would be the obvious way to make
 * snow glow, and it would also mean re-lighting every material in the scene for three frames —
 * which is precisely the global change the storm is not allowed to make. A uniform does the same
 * job for the two materials that should actually respond, and for nothing else.
 *
 * The channel is drawn through `StreakRenderer` rather than a new shader: a bolt is a chain of
 * tapering segments, which is what that renderer already draws, including the quad winding fix
 * and the screen-space width floor a one-pixel-wide bolt needs to stay visible at all.
 */

import { Color, Group, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { StreakRenderer } from "../../core/StreakRenderer";
import { createRng, type Rng } from "../../core/random";
import type { SnowstormConfig } from "./config";

/** Trunk plus the forks `branching` can ask for. Fixed, so a strike allocates nothing. */
const TRUNK_SEGMENTS = 40;
const FORK_SEGMENTS = 14;
const MAX_FORKS = 4;
const MAX_SEGMENTS = TRUNK_SEGMENTS + MAX_FORKS * FORK_SEGMENTS;

/** A strike is a few pulses, not one ramp. That irregularity is most of what reads as lightning. */
const MAX_PULSES = 3;

export class StormLightning {
    readonly object3d = new Group();

    /** Centre of the illumination, in storm-local space. Read by the body and the snow. */
    readonly flashPosition = new Vector3();
    readonly flashColor = new Color();

    private readonly streaks: StreakRenderer;
    private readonly rng: Rng;

    private level = 0;
    private timer = 0;
    private strikeAge = -1;
    private strikeDuration = 0;
    private strikePeak = 0;
    private boltVisible = false;
    private segments = 0;

    /** Half-extents of the storm, kept current so a strike lands inside whatever size it is now. */
    private readonly halfSize = new Vector3(17, 8, 7);
    private flashRadiusValue = 8;

    // Pulse shape for the current strike: [at, width, amplitude] x MAX_PULSES.
    private readonly pulses = new Float32Array(MAX_PULSES * 3);

    // Per-strike scratch; building a bolt must not allocate.
    private readonly from = new Vector3();
    private readonly to = new Vector3();
    private readonly mid = new Vector3();
    private readonly color = new Color();

    constructor(seed = 9173) {
        this.rng = createRng(seed);
        this.streaks = new StreakRenderer({ capacity: MAX_SEGMENTS, coreWhiteness: 0.8, minWidth: 0.003 });
        this.streaks.mesh.name = "snowstorm:bolt";
        this.streaks.mesh.visible = false;
        // Above the snow: the channel is the brightest thing in the storm and the few puffs in
        // front of it are already brightening from the same flash.
        this.streaks.mesh.renderOrder = 2;
        this.object3d.name = "snowstorm:lightning";
        this.object3d.add(this.streaks.mesh);
    }

    /** Current flash level. 0 when nothing is happening; can exceed 1 at high intensity. */
    get flash(): number {
        return this.level;
    }

    get striking(): boolean {
        return this.strikeAge >= 0;
    }

    /** Segments drawn in the current bolt, for the stats line. 0 in `flash` mode. */
    get segmentCount(): number {
        return this.boltVisible ? this.segments : 0;
    }

    /** Reach of the illumination in local units, derived from the storm's largest half-axis. */
    get flashRadius(): number {
        return this.flashRadiusValue;
    }

    applyConfig(config: SnowstormConfig): void {
        const s = config.scale;
        this.halfSize.set(config.size.width * 0.5 * s, config.size.height * 0.5 * s, config.size.depth * 0.5 * s);
        this.flashRadiusValue = config.lightning.radius * Math.max(this.halfSize.x, this.halfSize.y, this.halfSize.z);
        this.flashColor.copy(resolveColor(config.lightning.color));

        // A bolt the config just turned off has to go now, not at the end of its envelope.
        if (config.lightning.mode !== "bolt" && this.boltVisible) this.hideBolt();
    }

    update(dt: number, config: SnowstormConfig): void {
        const c = config.lightning;

        if (!c.enabled) {
            // A strike already in flight is allowed to finish. `strike()` is reachable directly
            // through `triggerLightning()`, and cutting a manual flash off mid-pulse because the
            // subsystem is nominally off would read as a bug rather than as a setting.
            if (!this.striking) {
                if (this.level !== 0 || this.boltVisible) this.clear();
                return;
            }
        } else if (dt > 0) {
            // Poisson-ish: the configured frequency is a mean scattered over a wide range, so
            // strikes never settle into a metronome.
            this.timer -= dt;
            if (this.timer <= 0) {
                this.timer = (60 / Math.max(c.frequency, 0.01)) * (0.35 + this.rng() * 1.5);
                this.strike(config);
            }
        }

        if (this.strikeAge >= 0) {
            this.strikeAge += dt;
            const t = this.strikeAge / this.strikeDuration;
            if (t >= 1) {
                this.clear();
            } else {
                this.level = this.envelope(t) * this.strikePeak;
                if (this.boltVisible) this.fadeBolt(t);
            }
        }
    }

    /** Fires a strike now, whatever the timer says. This is what `triggerLightning()` calls. */
    strike(config: SnowstormConfig): void {
        const c = config.lightning;
        this.strikeAge = 0;
        this.strikeDuration = c.duration;
        this.strikePeak = c.intensity;
        this.level = 0;
        this.color.copy(resolveColor(c.color));

        // One main pulse near the start, then one or two weaker after-flashes — the "occasional
        // multiple rapid flashes" of a real strike, and they come out of the envelope for free.
        const count = 2 + (this.rng() < 0.45 ? 1 : 0);
        for (let i = 0; i < MAX_PULSES; i++) {
            if (i >= count) {
                this.pulses[i * 3 + 2] = 0;
                continue;
            }
            this.pulses[i * 3] = i === 0 ? 0.06 + this.rng() * 0.05 : 0.2 + this.rng() * 0.65;
            this.pulses[i * 3 + 1] = 0.04 + this.rng() * 0.07;
            this.pulses[i * 3 + 2] = i === 0 ? 1 : 0.25 + this.rng() * 0.45;
        }

        if (c.mode === "bolt") {
            this.buildBolt(c.branching);
        } else {
            if (this.boltVisible) this.hideBolt();
            // No channel to anchor to, so the glow sits at a random point in the upper half of
            // the volume — where the charge would be, and where the fog is thick enough to be
            // doing the scattering.
            this.randomPoint(this.flashPosition, 0.62);
            this.flashPosition.y = Math.abs(this.flashPosition.y) * 0.6;
        }
    }

    private envelope(t: number): number {
        let f = 0;
        for (let i = 0; i < MAX_PULSES; i++) {
            const amp = this.pulses[i * 3 + 2];
            if (amp <= 0) continue;
            const at = this.pulses[i * 3];
            const width = this.pulses[i * 3 + 1];
            const x = (t - at) / width;
            f += amp * Math.exp(-x * x);
        }
        // Tail the whole thing off, or a late pulse can leave the storm lit at t = 1.
        return f * (1 - t * t);
    }

    /**
     * Midpoint displacement from a point high in the volume down through it, plus up to four
     * forks. Everything is clamped inside the half-extents, so the channel can never stick out
     * of the snow it is supposed to be buried in.
     */
    private buildBolt(branching: number): void {
        this.randomPoint(this.from, 0.55);
        this.from.y = Math.abs(this.from.y) * 0.85 + this.halfSize.y * 0.1;

        this.to.set(
            this.from.x + (this.rng() - 0.5) * this.halfSize.x * 0.7,
            -this.halfSize.y * (0.3 + this.rng() * 0.5),
            this.from.z + (this.rng() - 0.5) * this.halfSize.z * 0.7,
        );

        // The flash follows the channel: anchoring it a little below the midpoint is what makes
        // the glow look like it is coming out of the bolt rather than sitting beside it.
        this.flashPosition.lerpVectors(this.from, this.to, 0.55);

        let seg = this.writeChain(this.from, this.to, TRUNK_SEGMENTS, 0.2, 1, 0);

        const forks = Math.round(Math.max(0, Math.min(1, branching)) * MAX_FORKS);
        for (let i = 0; i < forks; i++) {
            const t = 0.25 + this.rng() * 0.6;
            this.mid.lerpVectors(this.from, this.to, t);
            this.to.set(
                this.mid.x + (this.rng() - 0.5) * this.halfSize.x * 0.8,
                this.mid.y - this.halfSize.y * (0.1 + this.rng() * 0.45),
                this.mid.z + (this.rng() - 0.5) * this.halfSize.z * 0.8,
            );
            seg = this.writeChain(this.mid, this.to, FORK_SEGMENTS, 0.22, 0.55, seg);
        }

        this.segments = seg;
        this.streaks.commit(seg);
        this.streaks.opacity = 1;
        this.streaks.mesh.visible = true;
        this.boltVisible = true;
    }

    /** Walks a jagged chain between two points, writing one streak per segment. */
    private writeChain(a: Vector3, b: Vector3, segments: number, jitter: number, alpha: number, start: number): number {
        const r = this.streaks;
        let px = a.x;
        let py = a.y;
        let pz = a.z;
        let index = start;

        const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const wobble = span * jitter;

        for (let i = 1; i <= segments && index < MAX_SEGMENTS; i++) {
            const t = i / segments;
            // The displacement tapers to nothing at both ends, so the chain actually lands on `b`
            // instead of wandering off and leaving a gap where the next fork starts.
            const taper = Math.sin(t * Math.PI);
            const nx = a.x + (b.x - a.x) * t + (this.rng() - 0.5) * wobble * taper;
            const ny = a.y + (b.y - a.y) * t + (this.rng() - 0.5) * wobble * taper * 0.4;
            const nz = a.z + (b.z - a.z) * t + (this.rng() - 0.5) * wobble * taper;

            const o = index;
            r.aPos[o * 3] = nx;
            r.aPos[o * 3 + 1] = ny;
            r.aPos[o * 3 + 2] = nz;
            r.aVel[o * 3] = nx - px;
            r.aVel[o * 3 + 1] = ny - py;
            r.aVel[o * 3 + 2] = nz - pz;
            r.aLength[o] = Math.hypot(nx - px, ny - py, nz - pz);
            r.aThickness[o] = (this.halfSize.y * 0.035) * (1 - t * 0.6) * (alpha > 0.8 ? 1 : 0.6);
            r.setColorAt(o, this.color);
            r.aAlpha[o] = alpha;

            px = nx;
            py = ny;
            pz = nz;
            index++;
        }
        return index;
    }

    /** A point inside the ellipsoid at `fill` of the way out, written into `out`. */
    private randomPoint(out: Vector3, fill: number): void {
        const z = this.rng() * 2 - 1;
        const a = this.rng() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - z * z)) * Math.cbrt(this.rng()) * fill;
        out.set(Math.cos(a) * r * this.halfSize.x, z * fill * this.halfSize.y, Math.sin(a) * r * this.halfSize.z);
    }

    private fadeBolt(t: number): void {
        // The channel lives for the first part of the envelope only; the after-flashes are glow
        // with nothing drawn, which is how a real one looks — and in dense snow, usually all of it.
        const a = Math.max(1 - t * 4.5, 0);
        if (a <= 0) {
            this.hideBolt();
            return;
        }
        this.streaks.opacity = a;
    }

    private hideBolt(): void {
        this.streaks.mesh.visible = false;
        this.streaks.commit(0);
        this.boltVisible = false;
        this.segments = 0;
    }

    private clear(): void {
        this.level = 0;
        this.strikeAge = -1;
        if (this.boltVisible) this.hideBolt();
    }

    reset(): void {
        this.clear();
        this.timer = 0;
        this.flashPosition.set(0, 0, 0);
    }

    dispose(): void {
        this.streaks.dispose();
        this.object3d.removeFromParent();
        this.object3d.clear();
    }
}
