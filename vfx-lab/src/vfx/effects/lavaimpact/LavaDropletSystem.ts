/**
 * The lava thrown clear of the impact: glowing droplets on simple ballistic arcs, cooling as they
 * fly.
 *
 * Burst-only — `emissionRate` is zero and nothing ever emits continuously — because droplets exist
 * because something happened, never on a timer.
 *
 * Three things keep them reading as part of the splash rather than as a particle system bolted
 * onto one. They leave from a *ring* around the impact at varied heights, so they look like lava
 * coming off the tongues instead of a point emitter underneath them; the size draw is biased
 * small, so a burst is mostly fine spatter with a few heavy blobs arcing through it; and every
 * droplet carries its own cooling rate, so the burst dims raggedly rather than as one piece.
 *
 * Rendering goes through the shared {@link StreakRenderer}: at `length ≈ thickness` its capsule is
 * a round blob, and stretching the length along the velocity turns the fast ones into streaks. One
 * draw call covers both, with no texture at all, and its screen-space width floor is what stops a
 * correctly-sized droplet going sub-pixel and scintillating at playable framing.
 */

import { Color, Vector3 } from "three";
import { lerpHex } from "../../core/colorCache";
import { StreakRenderer } from "../../core/StreakRenderer";
import { ParticleEffect } from "../../core/VfxEffect";
import type { LavaImpactConfig } from "./config";

export class LavaDropletSystem extends ParticleEffect {
    config: LavaImpactConfig;

    /** Local height droplets fall back into. Set by the owning effect from the surface config. */
    surfaceY = 0;

    /** Per-burst spawn parameters, set by the owner immediately before `burst()`. */
    spawnScale = 1;
    /** Height of the splash the droplets are coming off, so they do not all leave from the floor. */
    spawnHeight = 0.3;

    private readonly renderer: StreakRenderer;

    private readonly chSize: Float32Array;
    /** 0–1 per-droplet share of `dropletStreakAmount`: some of the burst stays round. */
    private readonly chStreak: Float32Array;
    /** Heat at birth, 0–1. The few that start at 1 are the ones that read as freshly thrown. */
    private readonly chHeat: Float32Array;
    /** Per-droplet multiplier on the cooling rate. Small droplets cool first, as they should. */
    private readonly chCool: Float32Array;

    private readonly tmpColor = new Color();

    constructor(config: LavaImpactConfig, capacity: number, seed = 8821) {
        super("lavaimpact-droplets", capacity, seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chStreak = this.buffer.channel("streak");
        this.chHeat = this.buffer.channel("heat");
        this.chCool = this.buffer.channel("cool");

        this.renderer = new StreakRenderer({
            capacity: this.buffer.capacity,
            opacity: config.dropletOpacity,
            coreWhiteness: coreWhitenessFor(config.emissiveIntensity),
        });
        // Above the tongues: droplets are the lava that got clear of the splash.
        this.renderer.mesh.renderOrder = 11;
        this.object3d.add(this.renderer.mesh);
    }

    get opacity(): number {
        return this.renderer.opacity;
    }

    set opacity(v: number) {
        this.renderer.opacity = v;
    }

    /** Re-reads the shared config. Only the two renderer uniforms need pushing. */
    applyConfig(): void {
        this.renderer.opacity = this.config.dropletOpacity;
        this.renderer.coreWhiteness = coreWhitenessFor(this.config.emissiveIntensity);
    }

    protected get configuredMax(): number {
        return this.buffer.capacity;
    }

    /** Burst-only. */
    protected emissionRate(): number {
        return 0;
    }

    protected defaultBurstCount(): number {
        return Math.round(this.config.dropletCount * this.config.impactIntensity);
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;
        const scale = this.spawnScale;

        // Off a ring around the impact rather than out of its centre: the lava is already
        // travelling outward by the time it comes apart into droplets.
        const a = this.rng() * Math.PI * 2;
        const outX = Math.cos(a);
        const outZ = Math.sin(a);
        const r = cfg.impactRadius * scale * (0.15 + 0.85 * this.rng());

        b.px[slot] = origin.x + outX * r;
        // Leaving from varied heights is what visually attaches the spatter to the tongues; all of
        // it starting at the surface reads as a second effect firing underneath the first.
        b.py[slot] = this.surfaceY + this.spawnHeight * this.rng() * this.rng();
        b.pz[slot] = origin.z + outZ * r;

        // Biased toward the small end, so a burst is fine spatter with the occasional heavy blob
        // in it rather than a uniform scatter of identical beads.
        const big = Math.pow(this.rng(), 2.2);
        const lo = Math.min(cfg.dropletSizeMin, cfg.dropletSizeMax);
        const hi = Math.max(cfg.dropletSizeMin, cfg.dropletSizeMax);
        const size = (lo + (hi - lo) * big) * scale;

        // How flat this droplet leaves. `dropletSpread` is the width of that band, so 0 throws a
        // column straight up and 1 throws a wide fan — and the heavy ones leave flatter, which is
        // the cheapest way to make a burst read as material of different masses.
        const side = cfg.dropletSpread * (0.25 + 0.75 * this.rng()) * (1 + 0.3 * big);
        const speed =
            cfg.dropletSpeed * scale * speedScale * (1 + (this.rng() * 2 - 1) * cfg.dropletSpeedVariation) * (1 - 0.2 * big);

        b.vx[slot] = outX * speed * side;
        b.vz[slot] = outZ * speed * side;
        b.vy[slot] = (speed * (1 - 0.45 * side) + cfg.dropletUpwardForce * scale) * (0.7 + 0.6 * this.rng()) * (1 - 0.25 * big);

        b.age[slot] = 0;
        b.life[slot] = Math.max(
            0.05,
            cfg.dropletLifetime * (1 + (this.rng() * 2 - 1) * cfg.dropletLifetimeVariation),
        );
        b.seed[slot] = this.rng();

        this.chSize[slot] = size;
        // Only part of the burst streaks, however fast it is going: a shower where every droplet
        // is a dash reads as rain, not as molten rock.
        this.chStreak[slot] = this.rng() < 0.55 ? this.rng() : 0;
        this.chHeat[slot] = 0.6 + 0.4 * this.rng();
        // A small droplet has less to lose and goes dark first.
        this.chCool[slot] = (0.75 + 0.5 * this.rng()) * (1.35 - 0.5 * big);
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

            // Back into the lava. A droplet that keeps falling past the surface is one the player
            // watches sink through the world; there is no collision here beyond this one plane.
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
        const streakAmount = cfg.dropletStreakAmount;
        // The speed a droplet has to reach to earn its full streak. Taking it from the configured
        // launch speed means the streaks stay proportional when the whole burst is scaled.
        const refSpeed = Math.max(0.5, cfg.dropletSpeed + cfg.dropletUpwardForce);

        for (let i = 0; i < n; i++) {
            const t = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;

            const o3 = i * 3;
            r.aPos[o3] = b.px[i];
            r.aPos[o3 + 1] = b.py[i];
            r.aPos[o3 + 2] = b.pz[i];
            r.aVel[o3] = b.vx[i];
            r.aVel[o3 + 1] = b.vy[i];
            r.aVel[o3 + 2] = b.vz[i];

            const size = this.chSize[i];
            const speed = Math.hypot(b.vx[i], b.vy[i], b.vz[i]);
            // Stretch along the flight path, never thinner than the droplet: this is motion blur,
            // not a different particle.
            r.aLength[i] = size * (1 + streakAmount * this.chStreak[i] * 6 * Math.min(1.5, speed / refSpeed));
            r.aThickness[i] = size;

            // One heat scalar drives colour and brightness together, so a cooling droplet can
            // never end up dim and yellow or bright and red.
            const heat = Math.max(0, this.chHeat[i] - cfg.coolingIntensity * this.chCool[i] * t);
            if (heat > 0.5) lerpHex(this.tmpColor, cfg.lavaColor, cfg.hotColor, (heat - 0.5) * 2);
            else lerpHex(this.tmpColor, cfg.coolColor, cfg.lavaColor, heat * 2);
            this.tmpColor.multiplyScalar(cfg.dropletGlowIntensity * (0.35 + 0.75 * heat));
            r.setColorAt(i, this.tmpColor);

            // Full strength for most of the flight, then out over the last third. A droplet that
            // fades from birth never reads as hot; one that simply stops existing reads as a
            // dropped frame.
            r.aAlpha[i] = 1 - smoothstep(0.62, 1, t);
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}

/**
 * How far the droplet core is pushed toward white, from the master emissive knob. A hot core is
 * what makes an additive blob read as molten instead of as a tinted dot, but past ~0.85 the whole
 * burst goes white and the palette stops mattering.
 */
function coreWhitenessFor(emissive: number): number {
    return Math.min(0.85, 0.3 * emissive);
}

/** The GLSL function, on the CPU. */
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
