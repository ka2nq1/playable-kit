/**
 * The water thrown clear of the impact: airborne droplets on simple ballistic arcs.
 *
 * Burst-only — `emissionRate` is zero and nothing ever emits continuously — because droplets exist
 * because something happened, never on a timer.
 *
 * Two things keep them reading as part of the splash rather than as a particle system bolted onto
 * one. They leave from a *ring* around the impact at varied heights, so they look like water
 * coming off the sheets instead of a point emitter underneath them; and the size draw is biased
 * small, with the big ones launched slightly slower, so a burst is mostly spray with a few heavy
 * drops arcing through it — which is what gives a splash its sense of scale.
 *
 * A droplet dies the moment it falls back through the surface, and tells its owner where, so the
 * secondary ring it leaves is the owner's decision rather than a second system's assumption.
 */

import { Color, Vector3 } from "three";
import { lerpHex } from "../../core/colorCache";
import { QuadParticleRenderer } from "../../core/QuadParticleRenderer";
import { randConeDirection } from "../../core/random";
import type { TextureProvider } from "../../core/textures";
import { ParticleEffect } from "../../core/VfxEffect";
import type { WaterSplashConfig } from "./config";

/** Called with the local XZ a droplet fell back through the surface at, and how big it was. */
export type SurfaceReturn = (x: number, z: number, size: number) => void;

export class SplashDropletSystem extends ParticleEffect {
    config: WaterSplashConfig;

    /** Local height droplets fall back into. Set by the owning effect from the surface config. */
    surfaceY = 0;
    /** Notified when a primary droplet returns to the water; the owner decides what that costs. */
    onSurfaceReturn: SurfaceReturn | null = null;

    /** Per-burst spawn parameters, set by the owner immediately before `burst()`. */
    spawnScale = 1;
    /** Height of the crown the droplets are coming off, so they do not all leave from the water. */
    spawnHeight = 0.3;
    /** 0 for the impact's own droplets, 1 for the ones a secondary splash throws. */
    spawnGeneration = 0;

    private readonly renderer: QuadParticleRenderer;

    private readonly chSize: Float32Array;
    private readonly chTint: Float32Array;
    private readonly chGen: Float32Array;

    private readonly tmpDir = { x: 0, y: 0, z: 0 };
    private readonly tmpColor = new Color();

    constructor(config: WaterSplashConfig, capacity: number, textures: TextureProvider, seed = 7717) {
        super("watersplash-droplets", capacity, seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chTint = this.buffer.channel("tint");
        this.chGen = this.buffer.channel("gen");

        this.renderer = new QuadParticleRenderer({
            capacity: this.buffer.capacity,
            map: textures.get("glow"),
            // Droplets are lit water, not light sources. Additive would turn a splash into a
            // spark shower the moment two of them overlapped.
            additive: false,
            opacity: config.dropletOpacity,
        });
        // Above the sheets: droplets are the water that got clear of the crown.
        this.renderer.mesh.renderOrder = 11;
        this.object3d.add(this.renderer.mesh);
    }

    get opacity(): number {
        return this.renderer.opacity;
    }

    set opacity(v: number) {
        this.renderer.opacity = v;
    }

    protected get configuredMax(): number {
        return this.buffer.capacity;
    }

    /** Burst-only. */
    protected emissionRate(): number {
        return 0;
    }

    protected defaultBurstCount(): number {
        return Math.round(this.config.dropletCount * this.config.splashIntensity);
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;
        const scale = this.spawnScale;

        // Off a ring around the impact rather than out of its centre: the water is already
        // travelling outward by the time it comes apart into droplets.
        const a = this.rng() * Math.PI * 2;
        const outX = Math.cos(a);
        const outZ = Math.sin(a);
        const r = cfg.spreadRadius * scale * (0.2 + 0.7 * this.rng());

        b.px[slot] = origin.x + outX * r;
        // Leaving from varied heights is what visually attaches the spray to the sheets; all of
        // it starting at the waterline reads as a second effect firing underneath the first.
        b.py[slot] = this.surfaceY + this.spawnHeight * this.rng() * this.rng();
        b.pz[slot] = origin.z + outZ * r;

        // How upright this droplet leaves. The spread is wide on purpose: an impact throws water
        // at every angle between straight up and almost flat, and a narrow band reads as a jet.
        const up = 0.42 + 0.5 * this.rng();
        let axisX = outX * (1 - up);
        let axisY = up;
        let axisZ = outZ * (1 - up);
        const len = Math.hypot(axisX, axisY, axisZ) || 1;
        axisX /= len;
        axisY /= len;
        axisZ /= len;
        randConeDirection(this.rng, axisX, axisY, axisZ, 0.4, this.tmpDir);

        // Biased toward the small end, so a burst is spray with the occasional heavy drop in it
        // rather than a uniform scatter of identical beads.
        const big = Math.pow(this.rng(), 2.1);
        const v = cfg.dropletSizeVariation;
        const size = cfg.dropletSize * (1 - v + 2 * v * big) * scale;

        // Heavier drops leave slower and arc lower — the cheapest way to make a burst read as
        // water of different masses rather than one substance at one speed.
        const speed = cfg.launchVelocity * scale * speedScale * (0.5 + 0.8 * this.rng()) * (1 - 0.25 * big);
        b.vx[slot] = this.tmpDir.x * speed;
        b.vy[slot] = this.tmpDir.y * speed;
        b.vz[slot] = this.tmpDir.z * speed;

        b.age[slot] = 0;
        b.life[slot] = cfg.dropletLifetime * (0.55 + 0.6 * this.rng());
        b.seed[slot] = this.rng();

        // Floor relative to the configured size, not an absolute: a secondary splash spawns at a
        // fraction of `spawnScale` and a droplet under a pixel wide scintillates instead of
        // falling. The floor only ever bites on the scaled-down bursts.
        this.chSize[slot] = Math.max(cfg.dropletSize * 0.35, size);
        this.chTint[slot] = this.rng();
        this.chGen[slot] = this.spawnGeneration;
    }

    protected simulate(dt: number): void {
        const g = this.config.gravity;
        const b = this.buffer;

        let i = 0;
        while (i < b.count) {
            b.age[i] += dt;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }

            b.vy[i] += g * dt;
            b.px[i] += b.vx[i] * dt;
            b.py[i] += b.vy[i] * dt;
            b.pz[i] += b.vz[i] * dt;

            // Back in the water. A droplet that keeps falling past the surface is one the player
            // watches sink through the world.
            if (b.vy[i] < 0 && b.py[i] <= this.surfaceY) {
                const x = b.px[i];
                const z = b.pz[i];
                const size = this.chSize[i];
                const primary = this.chGen[i] === 0;
                b.kill(i);
                // Only the impact's own droplets may splash back, so a secondary splash can never
                // seed a third one and the effect always terminates.
                if (primary && this.onSurfaceReturn) this.onSurfaceReturn(x, z, size);
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

            r.aSize[i] = this.chSize[i];
            r.aRot[i] = 0;
            r.aFrame[i] = 0;

            // A droplet is water with a highlight on it: the tint sits between the body colour
            // and white, and the highlight knob decides how far toward white it is allowed.
            const lit = Math.min(0.85, (0.25 + 0.55 * this.chTint[i]) * cfg.highlightIntensity);
            lerpHex(this.tmpColor, cfg.waterColor, "#ffffff", lit);
            r.aColor[o3] = this.tmpColor.r;
            r.aColor[o3 + 1] = this.tmpColor.g;
            r.aColor[o3 + 2] = this.tmpColor.b;

            // Full strength for most of the flight, then out. A droplet that fades from birth
            // reads as a spark; one that simply stops existing reads as a dropped frame.
            r.aAlpha[i] = 1 - t * t * t;
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}
