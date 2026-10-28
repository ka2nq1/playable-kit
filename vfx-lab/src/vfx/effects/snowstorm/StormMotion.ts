/**
 * Where the storm is, this frame.
 *
 * This is the entire world-space motion of the effect: one scalar of progress along a path, a bob
 * on top, and a write into the parent `Object3D.position`. Nothing else in the storm has any idea
 * it is moving — the puffs, the snow and the lightning are all expressed in the storm's local
 * space, so translating the parent carries them along at no cost and their internal animation
 * keeps running independently of it.
 *
 * Progress is integrated from `dt`, not from a wall clock, so the storm travels the same distance
 * per second at any frame rate. `loop` teleports back to the start, which only reads as a cut if
 * the storm is on screen at the time — `pingpong` is the default for that reason.
 */

import { Vector3 } from "three";
import type { SnowstormConfig } from "./config";

export class StormMotion {
    /** 0..1 along the path from `position` to `position + travel`. */
    private progress = 0;
    /** +1 or -1. Only `pingpong` ever uses -1. */
    private heading = 1;
    private bobPhase = 0;
    /** Drives the slow speed modulation. Separate from the bob so the two never lock together. */
    private speedPhase = 0;

    private readonly travel = new Vector3();

    /** Advances the storm and writes its position into `out`. Allocates nothing. */
    update(dt: number, config: SnowstormConfig, out: Vector3): void {
        const m = config.movement;
        const [px, py, pz] = config.position;

        if (m.enabled && dt > 0) {
            this.travel.set(m.travel[0], m.travel[1], m.travel[2]);
            const span = this.travel.length();

            if (span > 1e-4) {
                this.speedPhase += dt * 0.11;
                // A single slow sine, not noise: the point is that the formation occasionally
                // stalls and occasionally runs, not that it jitters.
                const speed = m.speed * (1 + m.speedVariation * Math.sin(this.speedPhase * Math.PI * 2));
                this.progress += (speed * this.heading * dt) / span;

                if (m.mode === "pingpong") {
                    if (this.progress > 1) {
                        this.progress = 2 - this.progress;
                        this.heading = -1;
                    } else if (this.progress < 0) {
                        this.progress = -this.progress;
                        this.heading = 1;
                    }
                } else if (m.mode === "loop") {
                    this.progress -= Math.floor(this.progress);
                } else {
                    this.progress = Math.min(1, Math.max(0, this.progress));
                }
            }

            this.bobPhase += dt / Math.max(m.verticalPeriod, 0.5);
        }

        this.travel.set(m.travel[0], m.travel[1], m.travel[2]);
        out.set(
            px + this.travel.x * this.progress,
            py + this.travel.y * this.progress + Math.sin(this.bobPhase * Math.PI * 2) * m.verticalDrift,
            pz + this.travel.z * this.progress,
        );
    }

    /** Back to the start of the path. The internal animation is untouched — that is the point. */
    reset(): void {
        this.progress = 0;
        this.heading = 1;
        this.bobPhase = 0;
        this.speedPhase = 0;
    }
}
