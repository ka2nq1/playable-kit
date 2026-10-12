/**
 * The lifecycle every effect in this lab implements.
 *
 * It is deliberately small and host-agnostic: an effect owns an `Object3D` you parent wherever
 * you like, and it advances only when the host game loop hands it a delta. There is no internal
 * `requestAnimationFrame` anywhere in this package, so dropping an effect into a playable means
 * one `add()` and one `update(dt)` inside that game's existing loop — never a competing loop.
 */

import { Group, Object3D, Vector3 } from "three";
import { ParticleBuffer } from "./ParticleBuffer";
import { createRng, Rng } from "./random";

export interface BurstOptions {
    /** Overrides the configured burst size. */
    count?: number;
    /** Multiplies the configured launch speed — a punchier burst without editing config. */
    speedScale?: number;
}

export interface VfxEffect {
    readonly id: string;
    /** Parent this into your scene. Particles simulate in this object's local space. */
    readonly object3d: Object3D;
    /** Live particle count, for debug readouts and budget checks. */
    readonly activeCount: number;
    enabled: boolean;

    /** Begins continuous emission. Idempotent. */
    start(): void;
    /** Stops emitting; particles already alive finish their lifetime. */
    stop(): void;
    /** Emits one burst immediately, whether or not continuous emission is running. */
    burst(position?: Vector3 | null, options?: BurstOptions): void;
    /** Advances the simulation by `dt` seconds. Call once per frame from the host loop. */
    update(dt: number): void;
    /** Clears live particles and emission state, leaving the effect ready to run again. */
    reset(): void;
    /** Releases GPU resources this effect created. The effect is unusable afterwards. */
    dispose(): void;
}

/** Scales applied on top of config by the active quality preset. */
export interface QualityScale {
    particles: number;
    emission: number;
}

const NO_SCALE: QualityScale = { particles: 1, emission: 1 };

/**
 * Shared machinery for the CPU-simulated effects: pooled storage, a seeded RNG, fractional
 * emission accounting and the quality scaling.
 *
 * Subclasses implement only `spawnOne`, `simulate` and `writeInstances` — the parts that actually
 * differ between a spark and a smoke puff.
 */
export abstract class ParticleEffect implements VfxEffect {
    readonly id: string;
    readonly object3d: Group;

    enabled = true;

    protected readonly buffer: ParticleBuffer;
    protected readonly rng: Rng;
    /** Where new particles originate, in the effect's local space. */
    protected readonly origin = new Vector3();

    protected emitting = false;
    /**
     * Carries the fractional part of "rate × dt" between frames. Without it, any rate below one
     * particle per frame would round to zero and the emitter would silently never fire.
     */
    private emissionDebt = 0;
    private quality: QualityScale = NO_SCALE;

    /** Scratch spawn origin so `burst(position)` costs no allocation. */
    private readonly burstOrigin = new Vector3();

    protected constructor(id: string, capacity: number, seed: number) {
        this.id = id;
        this.buffer = new ParticleBuffer(capacity);
        this.rng = createRng(seed);
        this.object3d = new Group();
        this.object3d.name = `vfx:${id}`;
    }

    get activeCount(): number {
        return this.buffer.count;
    }

    /** Hard capacity the pool was allocated with; config can only cap below this. */
    get capacity(): number {
        return this.buffer.capacity;
    }

    setQuality(scale: QualityScale): void {
        this.quality = scale;
        this.buffer.trimTo(this.particleLimit);
    }

    /** Effective cap this frame: configured maximum, scaled by quality, clamped to the pool. */
    protected get particleLimit(): number {
        return Math.min(this.buffer.capacity, Math.max(0, Math.round(this.configuredMax * this.quality.particles)));
    }

    protected get emissionScale(): number {
        return this.quality.emission;
    }

    start(): void {
        this.emitting = true;
    }

    stop(): void {
        this.emitting = false;
        this.emissionDebt = 0;
    }

    reset(): void {
        this.buffer.clear();
        this.emissionDebt = 0;
        this.onReset();
        this.flush();
    }

    burst(position?: Vector3 | null, options?: BurstOptions): void {
        if (!this.enabled) return;
        const count = Math.max(0, Math.round(options?.count ?? this.defaultBurstCount()));
        if (count <= 0) return;

        const target = position ? this.burstOrigin.copy(position) : this.origin;
        const speedScale = options?.speedScale ?? 1;
        const limit = this.particleLimit;
        for (let i = 0; i < count; i++) {
            const slot = this.buffer.spawn(limit);
            if (slot < 0) break;
            this.spawnOne(slot, target, speedScale);
        }
    }

    update(dt: number): void {
        if (!this.enabled) {
            // A disabled effect still has to publish an empty instance count, otherwise last
            // frame's particles stay frozen on screen.
            if (this.buffer.count > 0) {
                this.buffer.clear();
                this.flush();
            }
            return;
        }
        if (dt <= 0) return;
        // Guard against the huge delta a backgrounded tab produces on return, which would
        // otherwise teleport every particle and fire a frame's worth of emission at once.
        const step = Math.min(dt, 0.1);

        if (this.emitting) this.emitContinuous(step);
        this.simulate(step);
        this.flush();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.onDispose();
    }

    private emitContinuous(dt: number): void {
        const rate = Math.max(0, this.emissionRate()) * this.emissionScale;
        if (rate <= 0) {
            this.emissionDebt = 0;
            return;
        }
        this.emissionDebt += rate * dt;
        const limit = this.particleLimit;
        while (this.emissionDebt >= 1) {
            this.emissionDebt -= 1;
            const slot = this.buffer.spawn(limit);
            if (slot < 0) {
                // Pool is full; drop the backlog rather than letting it build into a burst the
                // moment capacity frees up.
                this.emissionDebt = 0;
                break;
            }
            this.spawnOne(slot, this.origin, 1);
        }
    }

    /** Configured maximum particle count, before quality scaling. */
    protected abstract get configuredMax(): number;
    /** Particles per second for continuous emission, before quality scaling. */
    protected abstract emissionRate(): number;
    /** Burst size used when `burst()` is called without an explicit count. */
    protected abstract defaultBurstCount(): number;
    /** Initialises one particle in `slot`, spawning around `origin`. */
    protected abstract spawnOne(slot: number, origin: Vector3, speedScale: number): void;
    /** Advances every live particle and kills the expired ones. */
    protected abstract simulate(dt: number): void;
    /** Copies live particle state into instance attributes and uploads them. */
    protected abstract flush(): void;

    protected onReset(): void {}
    protected abstract onDispose(): void;
}
