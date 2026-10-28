/**
 * The light an impact leaves on the surface: the flash at the moment of contact and the molten
 * patch that cools behind it.
 *
 * Event-driven rather than emitting — nothing happens until something lands — so it is not a
 * `ParticleEffect`: there is no rate and no burst interval. What it shares is the storage model.
 * Every patch owns one `ParticleBuffer` slot, live patches are packed at the front, a full pool
 * recycles the one closest to finishing rather than allocating, and the whole field draws in one
 * call through {@link ImpactGlowRenderer}.
 *
 * Flash and residual glow are the same thing with different numbers — a short bright one and a
 * long dim one — so they share a pool and a shader rather than being two systems that have to be
 * kept in step. The one thing a patch adds over a plain fade is an `attack`: the flash has to
 * arrive within a frame or two, and everything after it fades out over its whole life.
 */

import { Color, Group } from "three";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import { ImpactGlowRenderer } from "./ImpactGlowRenderer";

const TAU = Math.PI * 2;

export interface ImpactGlowSystemOptions {
    capacity: number;
    /** Height of the surface plane in the owner's local space. */
    surfaceY?: number;
    opacity?: number;
    edgeVariation?: number;
}

export class ImpactGlowSystem {
    readonly object3d: Group;

    enabled = true;
    /** Height the patches are laid out on, in the owner's local space. */
    surfaceY: number;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: ImpactGlowRenderer;
    private readonly rng: Rng;

    private readonly chDelay: Float32Array;
    private readonly chRadius: Float32Array;
    private readonly chGrowth: Float32Array;
    private readonly chBrightness: Float32Array;
    private readonly chAttack: Float32Array;
    private readonly chFalloff: Float32Array;
    private readonly chCore: Float32Array;
    // Colour lives in the buffer, not in the renderer's attribute: `kill` swap-removes, and only
    // channels registered here are moved with the patch.
    private readonly chR: Float32Array;
    private readonly chG: Float32Array;
    private readonly chB: Float32Array;

    constructor(opts: ImpactGlowSystemOptions, seed = 4231) {
        this.buffer = new ParticleBuffer(Math.max(1, Math.floor(opts.capacity)));
        this.rng = createRng(seed);
        this.surfaceY = opts.surfaceY ?? 0;

        this.chDelay = this.buffer.channel("delay");
        this.chRadius = this.buffer.channel("radius");
        this.chGrowth = this.buffer.channel("growth");
        this.chBrightness = this.buffer.channel("brightness");
        this.chAttack = this.buffer.channel("attack");
        this.chFalloff = this.buffer.channel("falloff");
        this.chCore = this.buffer.channel("core");
        this.chR = this.buffer.channel("r");
        this.chG = this.buffer.channel("g");
        this.chB = this.buffer.channel("b");

        this.renderer = new ImpactGlowRenderer({
            capacity: this.buffer.capacity,
            opacity: opts.opacity ?? 1,
            edgeVariation: opts.edgeVariation ?? 0.7,
        });
        // On the surface, under the tongues that stand in it.
        this.renderer.mesh.renderOrder = 6;

        this.object3d = new Group();
        this.object3d.name = "vfx:lava-impact-glow";
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

    get edgeVariation(): number {
        return this.renderer.edgeVariation;
    }

    set edgeVariation(v: number) {
        this.renderer.edgeVariation = v;
    }

    /**
     * Starts one patch at a local XZ position.
     *
     * `growth` is how much the patch spreads over its life — a flash punches out to its full size
     * almost at once, a cooling patch creeps outward a few percent — and `falloff` is the exponent
     * the brightness decays with: low holds and then drops, high is gone almost immediately.
     */
    emit(
        x: number,
        z: number,
        radius: number,
        duration: number,
        brightness: number,
        color: Color,
        options?: { delay?: number; growth?: number; attack?: number; falloff?: number; core?: number },
    ): boolean {
        if (!this.enabled || brightness <= 0 || radius <= 0) return false;

        const slot = this.acquire();
        if (slot < 0) return false;

        const delay = Math.max(0, options?.delay ?? 0);
        const b = this.buffer;
        b.px[slot] = x;
        b.py[slot] = this.surfaceY;
        b.pz[slot] = z;
        b.age[slot] = 0;
        b.life[slot] = delay + Math.max(0.02, duration);
        b.seed[slot] = this.rng();

        this.chDelay[slot] = delay;
        this.chRadius[slot] = radius;
        this.chGrowth[slot] = options?.growth ?? 0.25;
        this.chBrightness[slot] = brightness;
        this.chAttack[slot] = Math.max(1e-3, options?.attack ?? 0.12);
        this.chFalloff[slot] = Math.max(0.2, options?.falloff ?? 1.8);
        this.chCore[slot] = Math.max(0.5, options?.core ?? 4);

        this.chR[slot] = color.r;
        this.chG[slot] = color.g;
        this.chB[slot] = color.b;

        return true;
    }

    update(dt: number): void {
        if (!this.enabled) {
            // A disabled system still has to publish an empty instance count, otherwise last
            // frame's patches stay frozen on the surface.
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

    /** Reserves a slot, recycling the patch closest to the end of its life when the pool is full. */
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
            // A delayed patch occupies a pool slot but owns no instance until its beat arrives.
            if (age < 0) continue;

            const span = b.life[i] - this.chDelay[i];
            const t = span > 0 ? Math.min(1, age / span) : 1;

            // In over the attack, out over everything after it, reaching exactly zero at t = 1 so
            // a patch can never be cut off mid-fade when its slot is recycled.
            const fade = Math.min(1, t / this.chAttack[i]) * Math.pow(1 - t, this.chFalloff[i]);
            const brightness = this.chBrightness[i] * fade;
            if (brightness <= 0.002) continue;

            // Fast at birth, settling as it spreads: the energy was spent at the moment of impact
            // and nothing sustains it.
            const radius = this.chRadius[i] * (1 + this.chGrowth[i] * (1 - Math.pow(1 - t, 2.4)));

            r.setCenterAt(w, b.px[i], b.py[i], b.pz[i]);
            r.setGlowAt(w, radius, brightness, this.chCore[i], b.seed[i] * TAU);
            const o3 = w * 3;
            r.aColor[o3] = this.chR[i];
            r.aColor[o3 + 1] = this.chG[i];
            r.aColor[o3 + 2] = this.chB[i];
            w++;
        }

        r.commit(w);
    }
}
