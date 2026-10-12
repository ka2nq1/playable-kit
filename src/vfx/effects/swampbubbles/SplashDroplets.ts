/**
 * The few drops of water a larger bubble throws when it bursts.
 *
 * Burst-only — `emissionRate` is zero and nothing ever emits continuously — because droplets exist
 * because something happened, never on a timer. They are deliberately tiny and short-lived: the
 * brief here is "a bubble popped", not "something fell in", and anything that reads as a fountain
 * is wrong by definition.
 *
 * Droplets die the moment they fall back through the surface, so they never sink through the water
 * and the ripple system never has to know they exist.
 */

import { Color, Vector3 } from "three";
import { lerpHex } from "../../core/colorCache";
import { QuadParticleRenderer } from "../../core/QuadParticleRenderer";
import { randConeDirection, randRange } from "../../core/random";
import type { TextureProvider } from "../../core/textures";
import { ParticleEffect } from "../../core/VfxEffect";
import type { SwampBubblesConfig } from "./config";

export class SplashDroplets extends ParticleEffect {
    config: SwampBubblesConfig;

    /** Local height droplets fall back into. Set by the owning effect from the surface config. */
    surfaceY = 0;
    /** Radius of the bubble that threw the current burst, so droplets leave its rim, not its centre. */
    burstRadius = 0.05;

    private readonly renderer: QuadParticleRenderer;

    private readonly chSize: Float32Array;
    private readonly chMix: Float32Array;

    private readonly tmpDir = { x: 0, y: 0, z: 0 };
    private readonly tmpColor = new Color();

    constructor(config: SwampBubblesConfig, capacity: number, textures: TextureProvider, seed = 8123) {
        super("swamp-splash", capacity, seed);
        this.config = config;

        this.chSize = this.buffer.channel("size");
        this.chMix = this.buffer.channel("mix");

        this.renderer = new QuadParticleRenderer({
            capacity: this.buffer.capacity,
            map: textures.get("glow"),
            // Droplets are lit water, not light sources. Additive would turn a quiet pop into a
            // spark shower the moment two of them overlapped.
            additive: false,
        });
        this.renderer.mesh.renderOrder = 11;
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.splashEnabled;
    }

    protected get configuredMax(): number {
        return this.buffer.capacity;
    }

    /** Burst-only. */
    protected emissionRate(): number {
        return 0;
    }

    protected defaultBurstCount(): number {
        return Math.round(randRange(this.rng, this.config.splashCount));
    }

    protected spawnOne(slot: number, origin: Vector3, speedScale: number): void {
        const cfg = this.config;
        const b = this.buffer;

        // Leave from somewhere on the dome's rim rather than from its centre: the film tore at the
        // top and the water it carried is flung outward, so a droplet starting in the middle and
        // travelling up reads as a jet.
        const a = this.rng() * Math.PI * 2;
        const r = this.burstRadius * (0.35 + 0.6 * this.rng());
        const outX = Math.cos(a);
        const outZ = Math.sin(a);

        b.px[slot] = origin.x + outX * r;
        b.py[slot] = this.surfaceY + this.burstRadius * (0.3 + 0.7 * this.rng());
        b.pz[slot] = origin.z + outZ * r;

        // Mostly up, leaning outward. The cone is wide because a popping film throws water
        // unevenly — a tight cone is what makes four droplets look like a sprinkler head.
        const up = 0.82;
        let axisX = outX * (1 - up);
        let axisY = up;
        let axisZ = outZ * (1 - up);
        const len = Math.hypot(axisX, axisY, axisZ) || 1;
        axisX /= len;
        axisY /= len;
        axisZ /= len;

        randConeDirection(this.rng, axisX, axisY, axisZ, 0.52, this.tmpDir);
        const speed = randRange(this.rng, cfg.splashSpeed) * speedScale;
        b.vx[slot] = this.tmpDir.x * speed;
        b.vy[slot] = this.tmpDir.y * speed;
        b.vz[slot] = this.tmpDir.z * speed;

        b.age[slot] = 0;
        // Long enough to arc, short enough that the surface check is what usually ends it.
        b.life[slot] = 0.3 + this.rng() * 0.4;
        b.seed[slot] = this.rng();

        this.chSize[slot] = randRange(this.rng, cfg.splashSize);
        this.chMix[slot] = this.rng();
    }

    protected simulate(dt: number): void {
        const g = this.config.splashGravity;
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

            // Back in the water: a droplet that keeps falling past the surface is one the player
            // watches sink through the world.
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

            r.aSize[i] = this.chSize[i];
            r.aRot[i] = 0;
            r.aFrame[i] = 0;

            lerpHex(this.tmpColor, cfg.splashColor[0], cfg.splashColor[1], this.chMix[i]);
            r.aColor[o3] = this.tmpColor.r;
            r.aColor[o3 + 1] = this.tmpColor.g;
            r.aColor[o3 + 2] = this.tmpColor.b;

            // Full strength for most of the flight, then out. A droplet that fades from birth
            // reads as a spark; one that simply stops existing reads as a dropped frame.
            r.aAlpha[i] = 0.85 * (1 - t * t * t);
        }

        r.commit(n);
    }

    protected onDispose(): void {
        this.renderer.dispose();
    }
}
