/**
 * Lightning: a flash envelope, and optionally a bolt to go with it.
 *
 * The flash is the part that matters and the part that is nearly free — one scalar that lifts the
 * sky's brightness and, when lighting sync is on, spikes the directional and ambient lights for a
 * few frames. A storm reads as a storm from that alone.
 *
 * The bolt is drawn through `StreakRenderer` rather than a new shader. A bolt is a chain of
 * tapering segments, which is exactly what that renderer already draws — including the quad
 * winding fix and the screen-space width floor that a one-pixel-wide bolt needs to stay visible.
 */

import { Color, Group, Vector3 } from "three";
import { StreakRenderer } from "../../core/StreakRenderer";
import { resolveColor } from "../../core/colorCache";
import { createRng, type Rng } from "../../core/random";
import type { SkyConfig } from "./config";

/** Segments in a bolt, including its one fork. Fixed, so nothing allocates on a strike. */
const MAX_SEGMENTS = 72;
const TRUNK_SEGMENTS = 44;

/** A strike is a few pulses, not one ramp — that irregularity is what makes it read as lightning. */
const MAX_PULSES = 3;

export class Lightning {
    readonly object3d = new Group();

    private readonly streaks: StreakRenderer;
    private readonly rng: Rng;
    private readonly color = new Color();

    /** Current flash level, 0 when nothing is happening. Read by the sky and the light sync. */
    private level = 0;

    private timer = 0;
    private strikeAge = -1;
    private strikeDuration = 0;
    private strikePeak = 0;

    // Pulse shape for the current strike: [at, width, amplitude] x MAX_PULSES.
    private readonly pulses = new Float32Array(MAX_PULSES * 3);

    private boltSegments = 0;
    private boltVisible = false;

    // Per-strike scratch; building a bolt must not allocate.
    private readonly from = new Vector3();
    private readonly to = new Vector3();
    private readonly mid = new Vector3();

    constructor(seed = 4242) {
        this.rng = createRng(seed);
        this.streaks = new StreakRenderer({ capacity: MAX_SEGMENTS, coreWhiteness: 0.85, minWidth: 0.0035 });
        this.streaks.mesh.name = "sky:lightning";
        this.streaks.mesh.visible = false;
        this.streaks.mesh.renderOrder = 1100;
        this.object3d.name = "sky:lightning";
        this.object3d.add(this.streaks.mesh);
    }

    /** 0..1-ish; can exceed 1 at high configured intensity. */
    get flash(): number {
        return this.level;
    }

    get striking(): boolean {
        return this.strikeAge >= 0;
    }

    update(dt: number, config: SkyConfig): void {
        const c = config.weather.lightning;

        if (!c.enabled) {
            if (this.level !== 0 || this.boltVisible) this.clear();
            return;
        }

        if (dt > 0) {
            // Poisson-ish: the interval is the mean scattered over a wide range, so strikes never
            // settle into a metronome.
            this.timer -= dt;
            if (this.timer <= 0) {
                const perMinute = Math.max(c.frequency, 0.01);
                const mean = 60 / perMinute;
                this.timer = mean * (0.35 + this.rng() * 1.5);
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
                if (this.boltVisible) this.fadeBolt();
            }
        }
    }

    /** Fires a strike now, regardless of the timer. Wired to the effect's `burst()`. */
    strike(config: SkyConfig): void {
        const c = config.weather.lightning;
        this.strikeAge = 0;
        this.strikeDuration = c.duration;
        this.strikePeak = c.intensity;

        // One main pulse near the start, then one or two weaker after-flashes.
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

        this.level = 0;

        if (c.bolts) {
            this.buildBolt(c.boltColor);
        } else if (this.boltVisible) {
            this.streaks.mesh.visible = false;
            this.boltVisible = false;
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
        // Tail the whole thing off so a late pulse cannot leave the sky lit at t = 1.
        return f * (1 - t * t);
    }

    /**
     * Midpoint displacement from a point in the sky down to the ground, plus one fork.
     *
     * Built in the effect's local space at a stylised distance rather than at the real cloud
     * height: a bolt starting 900 m up is a few pixels tall at playable framing, which is
     * technically correct and reads as nothing at all.
     */
    private buildBolt(colorHex: string): void {
        this.color.copy(resolveColor(colorHex));

        const azimuth = this.rng() * Math.PI * 2;
        const distance = 55 + this.rng() * 90;
        const top = 42 + this.rng() * 30;

        this.from.set(Math.cos(azimuth) * distance, top, Math.sin(azimuth) * distance);
        this.to.set(
            this.from.x + (this.rng() - 0.5) * 22,
            0,
            this.from.z + (this.rng() - 0.5) * 22,
        );

        let seg = 0;
        seg = this.writeChain(this.from, this.to, TRUNK_SEGMENTS, 0.26, 1, seg);

        // One fork, branching from somewhere in the lower half of the trunk.
        if (this.rng() < 0.75) {
            const t = 0.45 + this.rng() * 0.3;
            this.mid.lerpVectors(this.from, this.to, t);
            this.to.set(
                this.mid.x + (this.rng() - 0.5) * 34,
                this.mid.y * (0.15 + this.rng() * 0.4),
                this.mid.z + (this.rng() - 0.5) * 34,
            );
            seg = this.writeChain(this.mid, this.to, MAX_SEGMENTS - TRUNK_SEGMENTS, 0.14, 0.55, seg);
        }

        this.boltSegments = seg;
        this.streaks.commit(seg);
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
            // Displacement tapers to nothing at both ends so the chain actually lands on `b`.
            const taper = Math.sin(t * Math.PI);
            const nx = a.x + (b.x - a.x) * t + (this.rng() - 0.5) * wobble * taper;
            const ny = a.y + (b.y - a.y) * t + (this.rng() - 0.5) * wobble * taper * 0.35;
            const nz = a.z + (b.z - a.z) * t + (this.rng() - 0.5) * wobble * taper;

            const dx = nx - px;
            const dy = ny - py;
            const dz = nz - pz;
            const len = Math.hypot(dx, dy, dz);

            const o = index;
            r.aPos[o * 3] = nx;
            r.aPos[o * 3 + 1] = ny;
            r.aPos[o * 3 + 2] = nz;
            r.aVel[o * 3] = dx;
            r.aVel[o * 3 + 1] = dy;
            r.aVel[o * 3 + 2] = dz;
            r.aLength[o] = len;
            // Tapers toward the ground, like the real thing.
            r.aThickness[o] = (0.42 - 0.26 * t) * (alpha > 0.8 ? 1 : 0.6);
            r.setColorAt(o, this.color);
            r.aAlpha[o] = alpha;

            px = nx;
            py = ny;
            pz = nz;
            index++;
        }
        return index;
    }

    private fadeBolt(): void {
        // The bolt lives for the first part of the envelope only; the after-flashes are sky glow
        // with nothing drawn, which is how a real one looks.
        const t = this.strikeAge / this.strikeDuration;
        const a = Math.max(1 - t * 4.5, 0);
        if (a <= 0) {
            this.streaks.mesh.visible = false;
            this.boltVisible = false;
            return;
        }
        this.streaks.opacity = a;
    }

    private clear(): void {
        this.level = 0;
        this.strikeAge = -1;
        if (this.boltVisible) {
            this.streaks.mesh.visible = false;
            this.boltVisible = false;
        }
        this.streaks.commit(0);
        this.boltSegments = 0;
    }

    reset(): void {
        this.clear();
        this.timer = 0;
    }

    get segmentCount(): number {
        return this.boltSegments;
    }

    dispose(): void {
        this.streaks.dispose();
        this.object3d.clear();
    }
}
