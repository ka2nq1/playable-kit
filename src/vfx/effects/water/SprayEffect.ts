/**
 * Water thrown off the surface by an event: a short ballistic burst of droplets.
 *
 * It exists only to sell the first fifth of a second — the moment the ring alone cannot carry,
 * because a ripple with no spray reads as something that appeared on the water rather than
 * something that hit it. Hence burst-only: `emissionRate` is zero and nothing ever emits
 * continuously.
 *
 * Droplets die on the way down as soon as they reach the surface, so they never sink through it
 * and never need the ring system to know they exist.
 */

import { Color, Vector3 } from "three";
import { lerpHex } from "../../core/colorCache";
import { Curve } from "../../core/curves";
import { QuadParticleRenderer } from "../../core/QuadParticleRenderer";
import { randConeDirection, randPointOnDisc, randRange } from "../../core/random";
import type { TextureProvider } from "../../core/textures";
import { ParticleEffect } from "../../core/VfxEffect";
import type { SprayConfig } from "./config";

const DEG = Math.PI / 180;

export class SprayEffect extends ParticleEffect {
    config: SprayConfig;

    /** Local height droplets fall back into. Set by the owning effect from the surface config. */
    surfaceY = 0;

    private readonly renderer: QuadParticleRenderer;

    private readonly chSize: Float32Array;
    private readonly chOpacity: Float32Array;
    private readonly chMix: Float32Array;

    private opacityCurve: Curve;
    private scaleCurve: Curve;

    private readonly tmpDisc = { x: 0, z: 0 };
    private readonly tmpDir = { x: 0, y: 0, z: 0 };
    private readonly tmpColor = new Color();

    constructor(config: SprayConfig, textures: TextureProvider, seed = 5501) {
        super("water-spray", Math.max(1, config.maxParticles), seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chOpacity = this.buffer.channel("opacity");
        this.chMix = this.buffer.channel("mix");

        this.opacityCurve = Curve.fromKeyframes(config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(config.scaleOverLife);

        this.renderer = new QuadParticleRenderer({
            capacity: this.buffer.capacity,
            map: textures.get("glow"),
            // Droplets are lit water, not light sources. Additive would turn a splash into a
            // spark shower the moment two of them overlapped.
            additive: false,
        });
        this.renderer.mesh.renderOrder = 11;
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.enabled;
    }

    rebuildCurves(): void {
        this.opacityCurve = Curve.fromKeyframes(this.config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(this.config.scaleOverLife);
    }

    /** Master multiplier on droplet alpha. */
    get intensity(): number {
        return this.renderer.opacity;
    }

    set intensity(v: number) {
        this.renderer.opacity = v;
    }

    protected get configuredMax(): number {
        return this.config.maxParticles;
    }

    /** Burst-only: droplets exist because something happened, never on a timer. */
    protected emissionRate(): number {
        return 0;
    }

    protected defaultBurstCount(): number {
        return randRange(this.rng, this.config.emission.burstCount);
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;

        randPointOnDisc(this.rng, cfg.spawn.radius, this.tmpDisc);
        b.px[slot] = origin.x + this.tmpDisc.x;
        b.py[slot] = origin.y + this.rng() * cfg.spawn.height;
        b.pz[slot] = origin.z + this.tmpDisc.z;

        // Launch axis: radially outward from where the droplet left the water, tilted toward
        // vertical. A droplet thrown back across the impact point looks like debris, not water.
        const len = Math.hypot(this.tmpDisc.x, this.tmpDisc.z);
        const outX = len > 1e-4 ? this.tmpDisc.x / len : 1;
        const outZ = len > 1e-4 ? this.tmpDisc.z / len : 0;
        const up = cfg.direction.upward;
        let axisX = outX * (1 - up);
        let axisY = up;
        let axisZ = outZ * (1 - up);
        const axisLen = Math.hypot(axisX, axisY, axisZ) || 1;
        axisX /= axisLen;
        axisY /= axisLen;
        axisZ /= axisLen;

        randConeDirection(this.rng, axisX, axisY, axisZ, cfg.direction.spreadDeg * DEG, this.tmpDir);
        const speed = randRange(this.rng, cfg.velocity.speed) * speedScale;
        b.vx[slot] = this.tmpDir.x * speed;
        b.vy[slot] = this.tmpDir.y * speed;
        b.vz[slot] = this.tmpDir.z * speed;

        b.age[slot] = 0;
        b.life[slot] = randRange(this.rng, cfg.lifetime);
        b.seed[slot] = this.rng();

        this.chSize[slot] = randRange(this.rng, cfg.size);
        this.chOpacity[slot] = randRange(this.rng, cfg.opacity);
        this.chMix[slot] = this.rng();
    }

    protected simulate(dt: number): void {
        const cfg = this.config;
        const b = this.buffer;
        const damp = cfg.drag > 0 ? Math.exp(-cfg.drag * dt) : 1;

        let i = 0;
        while (i < b.count) {
            b.age[i] += dt;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }

            b.vy[i] += cfg.gravity * dt;
            if (damp !== 1) {
                b.vx[i] *= damp;
                b.vy[i] *= damp;
                b.vz[i] *= damp;
            }

            b.px[i] += b.vx[i] * dt;
            b.py[i] += b.vy[i] * dt;
            b.pz[i] += b.vz[i] * dt;

            // Back in the water: a droplet that keeps falling past the surface is a droplet the
            // player watches sink through the world.
            if (b.vy[i] < 0 && b.py[i] <= this.surfaceY) {
                b.kill(i);
                continue;
            }
            i++;
        }
    }

    protected flush(): void {
        const cfg = this.config;
        const b = this.buffer;
        const r = this.renderer;
        const n = b.count;

        for (let i = 0; i < n; i++) {
            const t = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;

            const o3 = i * 3;
            r.aPos[o3] = b.px[i];
            r.aPos[o3 + 1] = b.py[i];
            r.aPos[o3 + 2] = b.pz[i];

            r.aSize[i] = this.chSize[i] * this.scaleCurve.at(t);
            r.aRot[i] = 0;
            r.aFrame[i] = 0;

            lerpHex(this.tmpColor, cfg.color.range[0], cfg.color.range[1], this.chMix[i]);
            r.aColor[o3] = this.tmpColor.r;
            r.aColor[o3 + 1] = this.tmpColor.g;
            r.aColor[o3 + 2] = this.tmpColor.b;

            r.aAlpha[i] = this.opacityCurve.at(t) * this.chOpacity[i];
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}
