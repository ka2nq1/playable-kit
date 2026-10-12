/**
 * Embers: slow glowing motes that rise, wander and pulse.
 *
 * Where sparks are about speed, embers are about *persistence* — they are what keeps the pit
 * alive between bursts. The sideways motion is a per-particle sine rather than random jitter, so
 * each ember traces a smooth, lazy path and no two are in phase; random walks at this speed read
 * as noise, not as air currents.
 */

import { Color, Vector3 } from "three";
import { lerpHex, resolveColor } from "../../core/colorCache";
import { Curve } from "../../core/curves";
import { ParticleEffect } from "../../core/VfxEffect";
import { QuadParticleRenderer } from "../../core/QuadParticleRenderer";
import { randPointOnDisc, randRange } from "../../core/random";
import type { TextureProvider } from "../../core/textures";
import type { EmbersConfig } from "./config";

const TAU = Math.PI * 2;

export class EmbersEffect extends ParticleEffect {
    config: EmbersConfig;

    private readonly renderer: QuadParticleRenderer;

    private readonly chSize: Float32Array;
    private readonly chBright: Float32Array;
    private readonly chMix: Float32Array;
    /** 1 when this ember drew the rare yellow accent colour. */
    private readonly chAccent: Float32Array;
    private readonly chDriftAmp: Float32Array;
    private readonly chDriftFreq: Float32Array;
    private readonly chDriftPhase: Float32Array;
    private readonly chPulseSpeed: Float32Array;
    private readonly chPulsePhase: Float32Array;

    private opacityCurve: Curve;
    private scaleCurve: Curve;

    private elapsed = 0;

    private readonly tmpDisc = { x: 0, z: 0 };
    private readonly tmpColor = new Color();

    constructor(config: EmbersConfig, textures: TextureProvider, seed = 20451) {
        super("embers", Math.max(1, config.maxParticles), seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chBright = this.buffer.channel("bright");
        this.chMix = this.buffer.channel("mix");
        this.chAccent = this.buffer.channel("accent");
        this.chDriftAmp = this.buffer.channel("driftAmp");
        this.chDriftFreq = this.buffer.channel("driftFreq");
        this.chDriftPhase = this.buffer.channel("driftPhase");
        this.chPulseSpeed = this.buffer.channel("pulseSpeed");
        this.chPulsePhase = this.buffer.channel("pulsePhase");

        this.opacityCurve = Curve.fromKeyframes(config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(config.scaleOverLife);

        this.renderer = new QuadParticleRenderer({
            capacity: this.buffer.capacity,
            map: textures.get("ember"),
            additive: true,
        });
        this.renderer.mesh.renderOrder = 10;
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.enabled;
    }

    rebuildCurves(): void {
        this.opacityCurve = Curve.fromKeyframes(this.config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(this.config.scaleOverLife);
    }

    /** Master multiplier on ember alpha — the lab's "intensity" knob. */
    get intensity(): number {
        return this.renderer.opacity;
    }

    set intensity(v: number) {
        this.renderer.opacity = v;
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
        if (this.enabled && dt > 0) this.elapsed += Math.min(dt, 0.1);
        super.update(dt);
    }

    protected override onReset(): void {
        this.elapsed = 0;
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;

        randPointOnDisc(this.rng, cfg.spawn.radius, this.tmpDisc);
        b.px[slot] = origin.x + cfg.spawn.offset[0] + this.tmpDisc.x;
        b.py[slot] = origin.y + cfg.spawn.offset[1] + this.rng() * cfg.spawn.height;
        b.pz[slot] = origin.z + cfg.spawn.offset[2] + this.tmpDisc.z;

        const lateral = cfg.velocity.lateral;
        b.vx[slot] = (this.rng() * 2 - 1) * lateral;
        b.vy[slot] = randRange(this.rng, cfg.velocity.rise) * speedScale;
        b.vz[slot] = (this.rng() * 2 - 1) * lateral;

        b.age[slot] = 0;
        b.life[slot] = randRange(this.rng, cfg.lifetime);
        b.seed[slot] = this.rng();

        this.chSize[slot] = randRange(this.rng, cfg.size);
        this.chBright[slot] = randRange(this.rng, cfg.brightness);
        this.chMix[slot] = this.rng();
        this.chAccent[slot] = this.rng() < cfg.color.accentChance ? 1 : 0;
        this.chDriftAmp[slot] = randRange(this.rng, cfg.drift.amplitude);
        this.chDriftFreq[slot] = randRange(this.rng, cfg.drift.frequency);
        this.chDriftPhase[slot] = this.rng() * TAU;
        this.chPulseSpeed[slot] = randRange(this.rng, cfg.pulse.speed);
        this.chPulsePhase[slot] = this.rng() * TAU;
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

            b.vy[i] += cfg.buoyancy * dt;
            if (damp !== 1) {
                b.vx[i] *= damp;
                b.vy[i] *= damp;
                b.vz[i] *= damp;
            }

            // Drift is a velocity offset, not an integrated force: the ember sways around its
            // path instead of accumulating a sideways runaway over a five-second lifetime.
            const phase = this.elapsed * this.chDriftFreq[i] * TAU + this.chDriftPhase[i];
            const amp = this.chDriftAmp[i];
            const driftX = Math.sin(phase) * amp;
            const driftZ = Math.cos(phase * 0.73 + 1.7) * amp;

            b.px[i] += (b.vx[i] + driftX) * dt;
            b.py[i] += b.vy[i] * dt;
            b.pz[i] += (b.vz[i] + driftZ) * dt;
            i++;
        }
    }

    protected flush(): void {
        const cfg = this.config;
        const b = this.buffer;
        const r = this.renderer;
        const n = b.count;
        const pulseAmount = cfg.pulse.amount;
        const accent = resolveColor(cfg.color.accent);

        for (let i = 0; i < n; i++) {
            const t = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;

            const o3 = i * 3;
            r.aPos[o3] = b.px[i];
            r.aPos[o3 + 1] = b.py[i];
            r.aPos[o3 + 2] = b.pz[i];

            r.aSize[i] = this.chSize[i] * this.scaleCurve.at(t);
            // Embers are round glows; rotating them would be invisible work.
            r.aRot[i] = 0;
            r.aFrame[i] = 0;

            const pulse = pulseAmount > 0 ? 1 - pulseAmount * (0.5 + 0.5 * Math.sin(this.elapsed * this.chPulseSpeed[i] + this.chPulsePhase[i])) : 1;
            const bright = this.chBright[i] * pulse;

            if (this.chAccent[i] > 0.5) {
                this.tmpColor.copy(accent);
            } else {
                lerpHex(this.tmpColor, cfg.color.range[0], cfg.color.range[1], this.chMix[i]);
            }
            r.aColor[o3] = this.tmpColor.r * bright;
            r.aColor[o3 + 1] = this.tmpColor.g * bright;
            r.aColor[o3 + 2] = this.tmpColor.b * bright;

            r.aAlpha[i] = this.opacityCurve.at(t);
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}
