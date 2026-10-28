/**
 * Sparks: short, fast, velocity-aligned streaks that burst out of the pit and die quickly.
 *
 * Everything here is tuned around one idea — a spark must read as *motion*. It launches fast,
 * stretches in proportion to its speed, keeps a white-hot head for the first fraction of its life
 * and then drops to a dull red as drag and gravity take over. The burst cadence is irregular by
 * design: a steady stream of sparks looks like a sprinkler, not like a fire spitting.
 */

import { Color, Vector3 } from "three";
import { Curve } from "../../core/curves";
import { lerpHex } from "../../core/colorCache";
import { ParticleEffect } from "../../core/VfxEffect";
import { randConeDirection, randPointOnDisc, randRange } from "../../core/random";
import { StreakRenderer } from "../../core/StreakRenderer";
import type { SparksConfig } from "./config";

const TAU = Math.PI * 2;

export class SparksEffect extends ParticleEffect {
    config: SparksConfig;

    private readonly renderer: StreakRenderer;

    // Per-particle channels beyond the common position/velocity/age set.
    private readonly chLength: Float32Array;
    private readonly chThickness: Float32Array;
    private readonly chBright: Float32Array;
    private readonly chFlicker: Float32Array;
    /** Where this particle sits inside the configured start/end colour pairs, so the pairs stay live-editable. */
    private readonly chMixStart: Float32Array;
    private readonly chMixEnd: Float32Array;

    private opacityCurve: Curve;
    private scaleCurve: Curve;

    private elapsed = 0;
    private nextAutoBurst = 0;

    private readonly tmpDir = { x: 0, y: 0, z: 0 };
    private readonly tmpDisc = { x: 0, z: 0 };
    private readonly tmpColor = new Color();
    private readonly tmpColorEnd = new Color();

    constructor(config: SparksConfig, seed = 90210) {
        super("sparks", Math.max(1, config.maxParticles), seed);
        this.config = config;

        this.chLength = this.buffer.channel("length");
        this.chThickness = this.buffer.channel("thickness");
        this.chBright = this.buffer.channel("bright");
        this.chFlicker = this.buffer.channel("flicker");
        this.chMixStart = this.buffer.channel("mixStart");
        this.chMixEnd = this.buffer.channel("mixEnd");

        this.opacityCurve = Curve.fromKeyframes(config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(config.scaleOverLife);

        this.renderer = new StreakRenderer({
            capacity: this.buffer.capacity,
            coreWhiteness: config.color.coreWhiteness,
            minWidth: config.streak.minWidth,
        });
        this.renderer.mesh.renderOrder = 20;
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.enabled;
        this.scheduleAutoBurst();
    }

    /** Rebuilds the baked curves after `opacityOverLife` / `scaleOverLife` were edited. */
    rebuildCurves(): void {
        this.opacityCurve = Curve.fromKeyframes(this.config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(this.config.scaleOverLife);
    }

    protected get configuredMax(): number {
        return this.config.maxParticles;
    }

    protected emissionRate(): number {
        return this.config.emission.rate;
    }

    protected defaultBurstCount(): number {
        return randRange(this.rng, this.config.emission.burstCount);
    }

    override update(dt: number): void {
        // Both live on the material, so re-publish them each frame to keep sliders immediate.
        this.renderer.coreWhiteness = this.config.color.coreWhiteness;
        this.renderer.minWidth = this.config.streak.minWidth;
        if (this.enabled && dt > 0) {
            this.elapsed += Math.min(dt, 0.1);
            if (this.emitting) this.tickAutoBurst(Math.min(dt, 0.1));
        }
        super.update(dt);
    }

    /**
     * Fires an extra burst at a randomised interval while emitting.
     *
     * An interval of `[0, 0]` turns this off and leaves only the continuous trickle — which is
     * what you want when the pit should simmer rather than spit.
     */
    private tickAutoBurst(dt: number): void {
        const [, max] = this.config.emission.autoBurstInterval;
        if (max <= 0) return;
        this.nextAutoBurst -= dt;
        if (this.nextAutoBurst <= 0) {
            this.burst();
            this.scheduleAutoBurst();
        }
    }

    private scheduleAutoBurst(): void {
        this.nextAutoBurst = randRange(this.rng, this.config.emission.autoBurstInterval);
    }

    protected override onReset(): void {
        this.elapsed = 0;
        this.scheduleAutoBurst();
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;

        randPointOnDisc(this.rng, cfg.spawn.radius, this.tmpDisc);
        const px = origin.x + cfg.spawn.offset[0] + this.tmpDisc.x;
        const py = origin.y + cfg.spawn.offset[1] + this.rng() * cfg.spawn.height;
        const pz = origin.z + cfg.spawn.offset[2] + this.tmpDisc.z;

        // Launch axis: radially outward from the pit centre, pulled toward vertical. A spark born
        // dead-centre has no radial direction, so give it a random one instead of a zero vector.
        let rx = this.tmpDisc.x;
        let rz = this.tmpDisc.z;
        const rl = Math.hypot(rx, rz);
        if (rl < 1e-4) {
            const a = this.rng() * TAU;
            rx = Math.cos(a);
            rz = Math.sin(a);
        } else {
            rx /= rl;
            rz /= rl;
        }
        const up = cfg.direction.upward;
        let ax = rx * (1 - up);
        let ay = up;
        let az = rz * (1 - up);
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al;
        ay /= al;
        az /= al;

        randConeDirection(this.rng, ax, ay, az, (cfg.direction.spreadDeg * Math.PI) / 180, this.tmpDir);

        const speed = randRange(this.rng, cfg.velocity.speed) * speedScale;

        b.px[slot] = px;
        b.py[slot] = py;
        b.pz[slot] = pz;
        b.vx[slot] = this.tmpDir.x * speed;
        b.vy[slot] = this.tmpDir.y * speed;
        b.vz[slot] = this.tmpDir.z * speed;
        b.age[slot] = 0;
        b.life[slot] = randRange(this.rng, cfg.lifetime);
        b.seed[slot] = this.rng();

        // Fast sparks are longer: the streak is a speed cue, not just a shape.
        this.chLength[slot] = randRange(this.rng, cfg.streak.length) + speed * cfg.streak.lengthPerSpeed;
        this.chThickness[slot] = randRange(this.rng, cfg.streak.thickness);
        this.chBright[slot] = randRange(this.rng, cfg.brightness);
        this.chFlicker[slot] = this.rng() * TAU;
        this.chMixStart[slot] = this.rng();
        this.chMixEnd[slot] = this.rng();
    }

    protected simulate(dt: number): void {
        const cfg = this.config;
        const b = this.buffer;
        const gravity = cfg.gravity;
        // Exponential drag integrated over the step, so the result does not depend on frame rate.
        const damp = cfg.drag > 0 ? Math.exp(-cfg.drag * dt) : 1;

        let i = 0;
        while (i < b.count) {
            b.age[i] += dt;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }
            b.vy[i] += gravity * dt;
            if (damp !== 1) {
                b.vx[i] *= damp;
                b.vy[i] *= damp;
                b.vz[i] *= damp;
            }
            b.px[i] += b.vx[i] * dt;
            b.py[i] += b.vy[i] * dt;
            b.pz[i] += b.vz[i] * dt;
            i++;
        }
    }

    protected flush(): void {
        const cfg = this.config;
        const b = this.buffer;
        const r = this.renderer;
        const n = b.count;
        const flickAmount = cfg.flicker.amount;
        const flickSpeed = cfg.flicker.speed;

        for (let i = 0; i < n; i++) {
            const t = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;
            const scale = this.scaleCurve.at(t);

            const o3 = i * 3;
            r.aPos[o3] = b.px[i];
            r.aPos[o3 + 1] = b.py[i];
            r.aPos[o3 + 2] = b.pz[i];
            r.aVel[o3] = b.vx[i];
            r.aVel[o3 + 1] = b.vy[i];
            r.aVel[o3 + 2] = b.vz[i];

            r.aLength[i] = this.chLength[i] * scale;
            r.aThickness[i] = this.chThickness[i] * scale;

            // Heat drains faster than the particle fades. The exponent biases the ramp: below 1 it
            // pushes a spark into its cooled colour early, which is what keeps a burst from reading
            // as a cloud of white needles.
            const heat = Math.pow(t, 0.55);
            lerpHex(this.tmpColor, cfg.color.start[0], cfg.color.start[1], this.chMixStart[i]);
            lerpHex(this.tmpColorEnd, cfg.color.end[0], cfg.color.end[1], this.chMixEnd[i]);
            const bright = this.chBright[i];
            r.aColor[o3] = (this.tmpColor.r + (this.tmpColorEnd.r - this.tmpColor.r) * heat) * bright;
            r.aColor[o3 + 1] = (this.tmpColor.g + (this.tmpColorEnd.g - this.tmpColor.g) * heat) * bright;
            r.aColor[o3 + 2] = (this.tmpColor.b + (this.tmpColorEnd.b - this.tmpColor.b) * heat) * bright;

            const flick = flickAmount > 0 ? 1 - flickAmount * (0.5 + 0.5 * Math.sin(this.elapsed * flickSpeed + this.chFlicker[i])) : 1;
            r.aAlpha[i] = this.opacityCurve.at(t) * flick;
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}
