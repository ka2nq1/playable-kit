/**
 * Expanding surface ripples: the reusable half of the water effect.
 *
 * It is event-driven rather than emitting — nothing happens until something calls `emit()` — so it
 * is not a `ParticleEffect`: there is no rate, no continuous spawn, no burst interval. What it does
 * share is the storage model. Every ring lives in a `ParticleBuffer` slot, live rings are packed at
 * the front, and `emit()` on a full pool recycles the ring closest to finishing instead of
 * allocating. A running system allocates nothing and draws in one call no matter how many events
 * overlap.
 *
 * One event produces several rings, each its own slot with its own delay, radius, width and
 * duration. That is the whole reason the rings do not look stamped: they are not a loop over a
 * shared animation, they are independent ripples that happen to have started together.
 *
 *     ripples.emit(impactWorldPosition, { rings: 3, maxRadius: 1.6 });
 *     ripples.update(dt);
 */

import { Group, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { Curve } from "../../core/curves";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import { RingRenderer } from "../../core/RingRenderer";
import type { RippleOptions, RipplesConfig } from "./config";

const TAU = Math.PI * 2;

/** Everything one event can override, plus `speed` as an alternative way to state `duration`. */
export type RippleEmitOptions = Partial<RippleOptions> & {
    /** Expansion speed in units/second. Overrides `duration` when given. */
    speed?: number;
};

export interface RippleQualityScale {
    /** Scales the pool: how many rings may be alive at once. */
    particles: number;
    /** Scales the ring count of each event. */
    rings: number;
}

const NO_SCALE: RippleQualityScale = { particles: 1, rings: 1 };

export class WaterRippleSystem {
    readonly id = "water-ripples";
    readonly object3d: Group;

    config: RipplesConfig;
    enabled: boolean;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: RingRenderer;
    private readonly rng: Rng;

    /** Seconds since emit, including the ring's own delay, is `age`; `life` is delay + duration. */
    private readonly chDelay: Float32Array;
    private readonly chStartRadius: Float32Array;
    private readonly chEndRadius: Float32Array;
    private readonly chWidth: Float32Array;
    private readonly chGrowth: Float32Array;
    private readonly chIntensity: Float32Array;
    private readonly chWobble: Float32Array;
    private readonly chPriority: Float32Array;
    private readonly chR: Float32Array;
    private readonly chG: Float32Array;
    private readonly chB: Float32Array;

    private opacityCurve: Curve;
    private quality: RippleQualityScale = NO_SCALE;

    /** Scratch for the world→local conversion, so `emit` costs no allocation. */
    private readonly tmpLocal = new Vector3();

    constructor(config: RipplesConfig, seed = 7717) {
        this.config = config;
        this.buffer = new ParticleBuffer(Math.max(1, config.maxRipples));
        this.rng = createRng(seed);

        this.chDelay = this.buffer.channel("delay");
        this.chStartRadius = this.buffer.channel("r0");
        this.chEndRadius = this.buffer.channel("r1");
        this.chWidth = this.buffer.channel("width");
        this.chGrowth = this.buffer.channel("growth");
        this.chIntensity = this.buffer.channel("intensity");
        this.chWobble = this.buffer.channel("wobble");
        this.chPriority = this.buffer.channel("priority");
        this.chR = this.buffer.channel("r");
        this.chG = this.buffer.channel("g");
        this.chB = this.buffer.channel("b");

        this.opacityCurve = Curve.fromKeyframes(config.opacityOverLife);

        this.renderer = new RingRenderer({
            capacity: this.buffer.capacity,
            trough: resolveColor(config.troughColor),
        });
        // Rings sit on the water, under anything floating in it.
        this.renderer.mesh.renderOrder = 5;

        this.object3d = new Group();
        this.object3d.name = "vfx:water-ripples";
        this.object3d.add(this.renderer.mesh);

        this.enabled = config.enabled;
    }

    /** Rings currently alive, counting the ones still inside their start delay. */
    get activeCount(): number {
        return this.buffer.count;
    }

    /** Hard pool size. `config.maxRipples` can only cap below this. */
    get capacity(): number {
        return this.buffer.capacity;
    }

    /** Master multiplier on ring alpha. */
    get opacity(): number {
        return this.renderer.opacity;
    }

    set opacity(v: number) {
        this.renderer.opacity = v;
    }

    setQuality(scale: RippleQualityScale): void {
        this.quality = scale;
        this.buffer.trimTo(this.ringLimit);
    }

    /** Re-bakes the fade curve after `opacityOverLife` was edited in the config. */
    rebuildCurves(): void {
        this.opacityCurve = Curve.fromKeyframes(this.config.opacityOverLife);
    }

    /** Picks up a `troughColor` edited in the config. */
    refreshColors(): void {
        this.renderer.setTrough(resolveColor(this.config.troughColor));
    }

    /**
     * Emits one ripple event at a **world-space** position.
     *
     * Only the horizontal position is used: the ripple is placed on the surface plane this system
     * sits on, so an object entering the water 2m up and a creature surfacing from below both
     * produce their rings in the same place. Returns the number of rings actually started, which
     * is lower than requested when the pool is saturated.
     */
    emit(worldPosition: Vector3, options?: RippleEmitOptions): number {
        this.object3d.updateWorldMatrix(true, false);
        this.tmpLocal.copy(worldPosition);
        this.object3d.worldToLocal(this.tmpLocal);
        return this.emitLocal(this.tmpLocal, options);
    }

    /** As {@link emit}, for a position already expressed in this system's local space. */
    emitLocal(position: Vector3, options?: RippleEmitOptions): number {
        if (!this.enabled) return 0;

        const d = this.config.defaults;
        const scale = options?.scale ?? d.scale;
        const ringCount = Math.max(1, Math.round((options?.rings ?? d.rings) * this.quality.rings));
        const jitter = options?.jitter ?? d.jitter;
        const startRadius = (options?.startRadius ?? d.startRadius) * scale;
        const maxRadius = Math.max(startRadius + 0.001, (options?.maxRadius ?? d.maxRadius) * scale);
        const speed = options?.speed;
        const duration =
            speed !== undefined && speed > 0 ? (maxRadius - startRadius) / speed : Math.max(0.05, options?.duration ?? d.duration);
        const width = Math.max(0.001, (options?.width ?? d.width) * scale);
        const growth = options?.widthGrowth ?? d.widthGrowth;
        const intensity = Math.max(0, options?.intensity ?? d.intensity);
        const wobble = Math.max(0, options?.wobble ?? d.wobble);
        const ringDelay = Math.max(0, options?.ringDelay ?? d.ringDelay);
        const priority = options?.priority ?? d.priority;
        const color = resolveColor(options?.color ?? d.color);

        const y = this.config.surfaceOffset;
        const b = this.buffer;
        let emitted = 0;

        for (let i = 0; i < ringCount; i++) {
            const slot = this.acquire(priority);
            if (slot < 0) break;

            // Each ring is drawn separately rather than scaled off the first one: identical rings
            // offset in time read as a target reticle, not as water.
            const delay = i * ringDelay * (1 + (this.rng() * 2 - 1) * jitter * 0.5);
            const span = duration * (1 + i * 0.1) * (1 + (this.rng() * 2 - 1) * jitter * 0.2);

            b.px[slot] = position.x;
            b.py[slot] = y;
            b.pz[slot] = position.z;
            b.age[slot] = 0;
            b.life[slot] = delay + span;
            b.seed[slot] = this.rng();

            this.chDelay[slot] = delay;
            this.chStartRadius[slot] = startRadius * (1 + i * 0.25);
            this.chEndRadius[slot] = maxRadius * (1 + i * 0.14) * (1 + (this.rng() * 2 - 1) * jitter * 0.15);
            this.chWidth[slot] = width * (1 + i * 0.12) * (1 + (this.rng() * 2 - 1) * jitter * 0.2);
            this.chGrowth[slot] = growth;
            // Outer rings carry less energy. Without this the last ring is the loudest one, which
            // is exactly backwards.
            this.chIntensity[slot] = intensity * Math.pow(0.74, i);
            this.chWobble[slot] = wobble * (1 + (this.rng() * 2 - 1) * jitter * 0.4);
            this.chPriority[slot] = priority;
            this.chR[slot] = color.r;
            this.chG[slot] = color.g;
            this.chB[slot] = color.b;

            emitted++;
        }

        return emitted;
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
        // Guard against the huge delta a backgrounded tab produces on return.
        const step = Math.min(dt, 0.1);

        const b = this.buffer;
        let i = 0;
        while (i < b.count) {
            b.age[i] += step;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }
            i++;
        }

        this.flush();
    }

    /** Drops every live ripple instantly. */
    clear(): void {
        this.buffer.clear();
        this.flush();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.renderer.dispose();
    }

    /** Effective pool cap this frame: configured maximum, scaled by quality, clamped to the pool. */
    private get ringLimit(): number {
        return Math.min(this.buffer.capacity, Math.max(0, Math.round(this.config.maxRipples * this.quality.particles)));
    }

    /**
     * Reserves a slot, recycling when the pool is full.
     *
     * The victim is the ring closest to the end of its life, and only among rings no more
     * important than the newcomer — a background ambient ripple must never cut short the splash
     * the player is actually looking at. If everything alive outranks it, the event is dropped.
     */
    private acquire(priority: number): number {
        const slot = this.buffer.spawn(this.ringLimit);
        if (slot >= 0) return slot;

        const b = this.buffer;
        let victim = -1;
        let bestProgress = -1;
        for (let i = 0; i < b.count; i++) {
            if (this.chPriority[i] > priority) continue;
            const progress = b.life[i] > 0 ? b.age[i] / b.life[i] : 1;
            if (progress > bestProgress) {
                bestProgress = progress;
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
            const delay = this.chDelay[i];
            const span = b.life[i] - delay;
            // Rings still inside their delay exist in the pool but own no instance yet.
            if (b.age[i] < delay || span <= 0) continue;

            const t = Math.min(1, (b.age[i] - delay) / span);
            const alpha = this.chIntensity[i] * this.opacityCurve.at(t);
            if (alpha <= 0.002) continue;

            // Fast at birth, settling as it spreads: the impulse was spent at t=0 and nothing
            // sustains it. Linear expansion is the single thing that makes a ripple look fake.
            const ease = 1 - Math.pow(1 - t, 2.6);
            const radius = this.chStartRadius[i] + (this.chEndRadius[i] - this.chStartRadius[i]) * ease;

            r.setCenterAt(w, b.px[i], b.py[i], b.pz[i]);
            r.setRingAt(w, radius, this.chWidth[i] * (1 + this.chGrowth[i] * t), alpha, this.chWobble[i] * (1 - 0.55 * t));

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
