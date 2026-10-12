/**
 * The rings an impact leaves on the water, and the small ones a returning droplet leaves after it.
 *
 * Event-driven rather than emitting — nothing happens until something hits the water — so it is
 * not a `ParticleEffect`: there is no rate and no burst interval. What it shares is the storage
 * model. Every ring owns one `ParticleBuffer` slot, live rings are packed at the front, a full
 * pool recycles the ring closest to finishing rather than allocating, and the whole field draws in
 * one call through the shared `RingRenderer`, which evaluates the crest analytically so it stays
 * exactly one width thick whether the ring is 10cm or 3m across.
 *
 * The one thing it adds over the bubbles' `PopRipples` next door is a per-ring **delay**: an
 * impact throws a short wave train, not a single circle, and the second and third rings have to
 * leave a beat after the first. Holding that in the ring itself means the owning effect needs no
 * timer and no queue.
 */

import { Color, Group } from "three";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import { RingRenderer } from "../../core/RingRenderer";

const TAU = Math.PI * 2;

export interface SplashRippleSystemOptions {
    capacity: number;
    /** Height of the water plane in the owner's local space. */
    surfaceY?: number;
    opacity?: number;
    /** Colour the water is pushed toward in the trough. Keep it near the water's darkest value. */
    trough?: Color;
}

export class SplashRippleSystem {
    readonly object3d: Group;

    enabled = true;
    /** Height the rings are laid out on, in the owner's local space. */
    surfaceY: number;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: RingRenderer;
    private readonly rng: Rng;

    private readonly chDelay: Float32Array;
    private readonly chStart: Float32Array;
    private readonly chEnd: Float32Array;
    private readonly chWidth: Float32Array;
    private readonly chIntensity: Float32Array;
    // Colour lives in the buffer, not in the renderer's attribute: `kill` swap-removes, and only
    // channels registered here are moved with the ring.
    private readonly chR: Float32Array;
    private readonly chG: Float32Array;
    private readonly chB: Float32Array;

    private readonly color = new Color(0xbfe9f4);

    constructor(opts: SplashRippleSystemOptions, seed = 5519) {
        this.buffer = new ParticleBuffer(Math.max(1, Math.floor(opts.capacity)));
        this.rng = createRng(seed);
        this.surfaceY = opts.surfaceY ?? 0;

        this.chDelay = this.buffer.channel("delay");
        this.chStart = this.buffer.channel("r0");
        this.chEnd = this.buffer.channel("r1");
        this.chWidth = this.buffer.channel("width");
        this.chIntensity = this.buffer.channel("intensity");
        this.chR = this.buffer.channel("r");
        this.chG = this.buffer.channel("g");
        this.chB = this.buffer.channel("b");

        this.renderer = new RingRenderer({
            capacity: this.buffer.capacity,
            trough: opts.trough ?? new Color(0x04100f),
            opacity: opts.opacity ?? 1,
        });
        // On the water, under everything standing in it.
        this.renderer.mesh.renderOrder = 5;

        this.object3d = new Group();
        this.object3d.name = "vfx:splash-ripples";
        this.object3d.add(this.renderer.mesh);
    }

    get activeCount(): number {
        return this.buffer.count;
    }

    get capacity(): number {
        return this.buffer.capacity;
    }

    get opacity(): number {
        return this.renderer.opacity;
    }

    set opacity(v: number) {
        this.renderer.opacity = v;
    }

    /** Copies `color` in; the system never holds a reference the caller could mutate. */
    setColor(color: Color): void {
        this.color.copy(color);
    }

    /**
     * Starts one ring at a local XZ position.
     *
     * `startRadius` is the footprint of whatever caused it, so the ring leaves the splash's own
     * edge rather than growing out of a point — a ripple starting at zero under a half-metre
     * crown reads as a second, unrelated event.
     */
    emit(
        x: number,
        z: number,
        startRadius: number,
        maxRadius: number,
        duration: number,
        width: number,
        intensity: number,
        delay = 0,
    ): boolean {
        if (!this.enabled || intensity <= 0) return false;

        const slot = this.acquire();
        if (slot < 0) return false;

        const b = this.buffer;
        b.px[slot] = x;
        b.py[slot] = this.surfaceY;
        b.pz[slot] = z;
        b.age[slot] = 0;
        b.life[slot] = delay + Math.max(0.05, duration);
        b.seed[slot] = this.rng();

        this.chDelay[slot] = Math.max(0, delay);
        this.chStart[slot] = startRadius;
        this.chEnd[slot] = Math.max(startRadius + 0.01, maxRadius);
        this.chWidth[slot] = width;
        this.chIntensity[slot] = intensity;

        this.chR[slot] = this.color.r;
        this.chG[slot] = this.color.g;
        this.chB[slot] = this.color.b;

        return true;
    }

    update(dt: number): void {
        if (!this.enabled) {
            // A disabled system still has to publish an empty instance count, otherwise last
            // frame's rings stay frozen on the water.
            if (this.buffer.count > 0) {
                this.buffer.clear();
                this.flush();
            }
            return;
        }
        if (dt <= 0) return;

        const b = this.buffer;
        let i = 0;
        while (i < b.count) {
            b.age[i] += dt;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }
            i++;
        }

        this.flush();
    }

    clear(): void {
        this.buffer.clear();
        this.flush();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.renderer.dispose();
    }

    /** Reserves a slot, recycling the ring closest to the end of its life when the pool is full. */
    private acquire(): number {
        const slot = this.buffer.spawn();
        if (slot >= 0) return slot;

        const b = this.buffer;
        let victim = -1;
        let best = -1;
        for (let i = 0; i < b.count; i++) {
            const progress = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;
            if (progress > best) {
                best = progress;
                victim = i;
            }
        }
        return victim;
    }

    private flush(): void {
        const b = this.buffer;
        const r = this.renderer;
        let w = 0;

        for (let i = 0; i < b.count; i++) {
            const age = b.age[i] - this.chDelay[i];
            // A delayed ring occupies a pool slot but owns no instance until its beat arrives.
            if (age < 0) continue;

            const span = b.life[i] - this.chDelay[i];
            const t = span > 0 ? Math.min(1, age / span) : 1;

            // Fast at birth, settling as it spreads: the impulse was spent at the moment of
            // impact and nothing sustains it. Linear expansion is the one thing that makes a
            // ripple look fake.
            const ease = 1 - Math.pow(1 - t, 2.6);
            const radius = this.chStart[i] + (this.chEnd[i] - this.chStart[i]) * ease;

            // In over the first instant, out over everything after it, reaching exactly zero at
            // t = 1 so a ring can never be cut off mid-fade when its slot is recycled.
            const fade = Math.min(1, t / 0.06) * (1 - t) * (1 - t);

            r.setCenterAt(w, b.px[i], b.py[i], b.pz[i]);
            r.setRingAt(w, radius, this.chWidth[i] * (1 + 0.9 * t), this.chIntensity[i] * fade, 0.07);
            const o3 = w * 3;
            r.aColor[o3] = this.chR[i];
            r.aColor[o3 + 1] = this.chG[i];
            r.aColor[o3 + 2] = this.chB[i];
            r.aPhase[w] = b.seed[i] * TAU;
            w++;
        }

        r.commit(w);
    }
}
