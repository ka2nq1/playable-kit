/**
 * The circular ring a bubble leaves behind when it pops.
 *
 * It is event-driven rather than emitting — nothing happens until a bubble bursts — so it is not a
 * `ParticleEffect`: there is no rate and no burst interval. What it shares is the storage model.
 * Every ring owns one `ParticleBuffer` slot, live rings are packed at the front, and a full pool
 * recycles the ring closest to finishing rather than allocating. The whole field draws in one call
 * through the shared `RingRenderer`, which evaluates the crest analytically and so stays exactly
 * one width thick whether the ring is 5cm or 50cm across.
 *
 * This is deliberately a much smaller thing than `WaterRippleSystem` next door: a bubble pop is one
 * faint ring, not a wave train with presets and priorities, and the two effects stay independently
 * copyable into a game because neither imports the other.
 */

import { Group } from "three";
import { resolveColor } from "../../core/colorCache";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import { RingRenderer } from "../../core/RingRenderer";

const TAU = Math.PI * 2;

export interface PopRipplesOptions {
    capacity: number;
    /** Height of the water plane in the owner's local space. */
    surfaceY?: number;
    opacity?: number;
}

export class PopRipples {
    readonly object3d: Group;

    enabled = true;
    /** Height the rings are laid out on, in the owner's local space. */
    surfaceY: number;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: RingRenderer;
    private readonly rng: Rng;

    private readonly chStart: Float32Array;
    private readonly chEnd: Float32Array;
    private readonly chWidth: Float32Array;
    private readonly chIntensity: Float32Array;
    // Colour lives in the buffer, not in the renderer's attribute: `kill` swap-removes, and only
    // channels registered here are moved with the particle.
    private readonly chR: Float32Array;
    private readonly chG: Float32Array;
    private readonly chB: Float32Array;

    private color = "#a8bd90";

    constructor(opts: PopRipplesOptions, seed = 4231) {
        this.buffer = new ParticleBuffer(Math.max(1, Math.floor(opts.capacity)));
        this.rng = createRng(seed);
        this.surfaceY = opts.surfaceY ?? 0;

        this.chStart = this.buffer.channel("r0");
        this.chEnd = this.buffer.channel("r1");
        this.chWidth = this.buffer.channel("width");
        this.chIntensity = this.buffer.channel("intensity");
        this.chR = this.buffer.channel("r");
        this.chG = this.buffer.channel("g");
        this.chB = this.buffer.channel("b");

        this.renderer = new RingRenderer({
            capacity: this.buffer.capacity,
            // The trough is what lets the ring darken the water as well as brighten it. Keep it
            // near the swamp's own deepest value or the ring reads as a painted outline.
            trough: resolveColor("#0a1208"),
            opacity: opts.opacity ?? 1,
        });
        // On the water, under anything standing in it.
        this.renderer.mesh.renderOrder = 5;

        this.object3d = new Group();
        this.object3d.name = "vfx:swamp-pop-ripples";
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

    /** Picks up a ring colour edited in the config; the hex is resolved per emit, not per frame. */
    setColor(hex: string): void {
        this.color = hex;
    }

    /**
     * Starts one ring at a local XZ position.
     *
     * `startRadius` is the bubble that just burst, so the ring leaves the dome's own footprint
     * rather than growing out of a point — a ripple that starts at zero under a 10cm bubble reads
     * as a second, unrelated event.
     */
    emit(x: number, z: number, startRadius: number, maxRadius: number, speed: number, width: number, intensity: number): boolean {
        if (!this.enabled) return false;

        const slot = this.acquire();
        if (slot < 0) return false;

        const end = Math.max(startRadius + 0.01, maxRadius);
        const b = this.buffer;
        b.px[slot] = x;
        b.py[slot] = this.surfaceY;
        b.pz[slot] = z;
        b.age[slot] = 0;
        b.life[slot] = Math.max(0.05, (end - startRadius) / Math.max(speed, 0.01));
        b.seed[slot] = this.rng();

        this.chStart[slot] = startRadius;
        this.chEnd[slot] = end;
        this.chWidth[slot] = width;
        this.chIntensity[slot] = intensity;

        const c = resolveColor(this.color);
        this.chR[slot] = c.r;
        this.chG[slot] = c.g;
        this.chB[slot] = c.b;

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

        for (let i = 0; i < b.count; i++) {
            const t = b.life[i] > 0 ? Math.min(1, b.age[i] / b.life[i]) : 1;

            // Fast at birth, settling as it spreads: the impulse was spent the moment the film
            // tore and nothing sustains it. Linear expansion is the one thing that makes a ripple
            // look fake.
            const ease = 1 - Math.pow(1 - t, 2.6);
            const radius = this.chStart[i] + (this.chEnd[i] - this.chStart[i]) * ease;

            // In over the first instant, out over everything after it, and reaching exactly zero
            // at t = 1 so the ring can never be cut off mid-fade when its slot is recycled.
            const fade = Math.min(1, t / 0.07) * (1 - t) * (1 - t);

            r.setCenterAt(i, b.px[i], b.py[i], b.pz[i]);
            r.setRingAt(i, radius, this.chWidth[i] * (1 + 0.8 * t), this.chIntensity[i] * fade, 0.05);
            const o3 = i * 3;
            r.aColor[o3] = this.chR[i];
            r.aColor[o3 + 1] = this.chG[i];
            r.aColor[o3 + 2] = this.chB[i];
            r.aPhase[i] = b.seed[i] * TAU;
        }

        r.commit(b.count);
    }
}
