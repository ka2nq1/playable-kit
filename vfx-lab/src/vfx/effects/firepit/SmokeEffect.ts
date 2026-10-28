/**
 * Smoke wisps: soft warm-grey puffs that rise, swell and dissolve.
 *
 * Two things keep this from looking like grey squares. The texture's alpha reaches zero well
 * inside the quad, so the sprite border is never a visible edge; and every puff gets its own
 * start rotation and spin, so the same texture never appears twice in the same orientation.
 *
 * Smoke is also the only alpha-blended type here, which makes it the one that can ruin a
 * gameplay view. Per-particle opacity is deliberately low and capped by a master multiplier —
 * density should come from more puffs, not from more opaque ones.
 */

import { Color, Vector3 } from "three";
import { lerpHex, resolveColor } from "../../core/colorCache";
import { Curve } from "../../core/curves";
import { ParticleEffect } from "../../core/VfxEffect";
import { QuadParticleRenderer } from "../../core/QuadParticleRenderer";
import { randPointOnDisc, randRange } from "../../core/random";
import type { TextureProvider } from "../../core/textures";
import type { SmokeConfig } from "./config";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export class SmokeEffect extends ParticleEffect {
    config: SmokeConfig;

    private readonly renderer: QuadParticleRenderer;

    private readonly chSize: Float32Array;
    private readonly chOpacity: Float32Array;
    private readonly chRot: Float32Array;
    private readonly chRotSpeed: Float32Array;
    private readonly chMix: Float32Array;
    private readonly chAccent: Float32Array;
    private readonly chDriftAmp: Float32Array;
    private readonly chDriftFreq: Float32Array;
    private readonly chDriftPhase: Float32Array;

    private opacityCurve: Curve;
    private scaleCurve: Curve;

    private elapsed = 0;

    private readonly tmpDisc = { x: 0, z: 0 };
    private readonly tmpColor = new Color();

    constructor(config: SmokeConfig, textures: TextureProvider, seed = 70133) {
        super("smoke", Math.max(1, config.maxParticles), seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chOpacity = this.buffer.channel("opacity");
        this.chRot = this.buffer.channel("rot");
        this.chRotSpeed = this.buffer.channel("rotSpeed");
        this.chMix = this.buffer.channel("mix");
        this.chAccent = this.buffer.channel("accent");
        this.chDriftAmp = this.buffer.channel("driftAmp");
        this.chDriftFreq = this.buffer.channel("driftFreq");
        this.chDriftPhase = this.buffer.channel("driftPhase");

        this.opacityCurve = Curve.fromKeyframes(config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(config.scaleOverLife);

        this.renderer = new QuadParticleRenderer({
            capacity: this.buffer.capacity,
            map: textures.get("smoke"),
            additive: false,
        });
        // Drawn before the additive types so sparks and embers read as light *through* the smoke.
        this.renderer.mesh.renderOrder = 0;
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.enabled;
    }

    rebuildCurves(): void {
        this.opacityCurve = Curve.fromKeyframes(this.config.opacityOverLife);
        this.scaleCurve = Curve.fromKeyframes(this.config.scaleOverLife);
    }

    /** Master multiplier on smoke alpha — the lab's "opacity" knob. */
    get density(): number {
        return this.renderer.opacity;
    }

    set density(v: number) {
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
        this.chOpacity[slot] = randRange(this.rng, cfg.opacity);
        this.chRot[slot] = randRange(this.rng, cfg.rotation.startDeg) * DEG;
        this.chRotSpeed[slot] = randRange(this.rng, cfg.rotation.speedDeg) * DEG;
        this.chMix[slot] = this.rng();
        this.chAccent[slot] = this.rng() < cfg.color.accentChance ? 1 : 0;
        this.chDriftAmp[slot] = randRange(this.rng, cfg.drift.amplitude);
        this.chDriftFreq[slot] = randRange(this.rng, cfg.drift.frequency);
        this.chDriftPhase[slot] = this.rng() * TAU;
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

            const phase = this.elapsed * this.chDriftFreq[i] * TAU + this.chDriftPhase[i];
            const amp = this.chDriftAmp[i];

            b.px[i] += (b.vx[i] + Math.sin(phase) * amp) * dt;
            b.py[i] += b.vy[i] * dt;
            b.pz[i] += (b.vz[i] + Math.cos(phase * 0.61 + 2.3) * amp) * dt;

            this.chRot[i] += this.chRotSpeed[i] * dt;
            i++;
        }
    }

    protected flush(): void {
        const cfg = this.config;
        const b = this.buffer;
        const r = this.renderer;
        const n = b.count;
        const accent = resolveColor(cfg.color.accent);

        for (let i = 0; i < n; i++) {
            const t = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;

            const o3 = i * 3;
            r.aPos[o3] = b.px[i];
            r.aPos[o3 + 1] = b.py[i];
            r.aPos[o3 + 2] = b.pz[i];

            // Expansion is the main growth driver (absolute units per second so it stays readable
            // regardless of lifetime); scaleOverLife only shapes the profile on top of it.
            const grown = this.chSize[i] + cfg.expansion * b.age[i];
            r.aSize[i] = grown * this.scaleCurve.at(t);
            r.aRot[i] = this.chRot[i];
            r.aFrame[i] = 0;

            if (this.chAccent[i] > 0.5) {
                this.tmpColor.copy(accent);
            } else {
                lerpHex(this.tmpColor, cfg.color.range[0], cfg.color.range[1], this.chMix[i]);
            }
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
