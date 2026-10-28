/**
 * Swamp water bubbles: gas breaking the surface of stagnant water, swelling into a translucent
 * dome, bursting, and leaving a ring behind.
 *
 *     const bubbles = new SwampBubblesVfx(config);
 *     bubbles.object3d.position.y = WATER_LEVEL;   // the surface the bubbles break
 *     scene.add(bubbles.object3d);
 *
 *     bubbles.update(delta);   // from the loop you already have
 *     bubbles.dispose();       // on teardown
 *
 * Three draw calls for the whole effect — domes, rings, droplets — and no allocation per frame.
 *
 * ### Why it is built this way
 *
 * A bubble is not a particle with a velocity; it is a short scripted animation pinned to a point on
 * the water. So the simulation is a phase machine rather than an integrator: formation, swell, a
 * held moment at full size, then a rupture. Nothing integrates and nothing can drift, which means
 * a bubble physically cannot end up somewhere a bubble could not be — and the whole per-bubble
 * state is seven numbers in a `ParticleBuffer`, so the CPU work per frame is a loop over the live
 * ones with no branches that matter.
 *
 * ### Why the timing is drawn the way it is
 *
 * Marsh gas arrives at random. A fixed interval with ±x% jitter still reads as a pulse, because the
 * gaps never get *long*. `activityVariation` therefore blends the interval toward an exponential
 * draw — Poisson arrivals — which produces real lulls and the occasional double. The same knob
 * jitters every bubble's growth, hold and pop times, so two bubbles born in the same frame never
 * burst in the same frame. Sizes are drawn with a bias exponent instead of uniformly, which is what
 * keeps a large bubble an event rather than every third bubble.
 *
 * Clusters are drawn from the same scheduler: one spawn event may seed several small bubbles with
 * staggered delays, which is how a slow effect gets variety without raising the average rate.
 */

import { Group, Object3D, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, randRange, type Rng } from "../../core/random";
import { TextureProvider } from "../../core/textures";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { BubbleRenderer } from "./BubbleRenderer";
import { normalizeSwampBubblesConfig, type SwampBubblesConfig } from "./config";
import { PopRipples } from "./PopRipples";
import { SplashDroplets } from "./SplashDroplets";

export interface SwampBubblesVfxOptions {
    /**
     * Supply your own provider to swap the procedural droplet sprite for artist art. When omitted,
     * the effect creates — and disposes — its own.
     */
    textures?: TextureProvider;
    /** Base RNG seed; two instances with the same seed bubble identically. */
    seed?: number;
}

export class SwampBubblesVfx implements VfxEffect {
    readonly id = "swampbubbles";
    readonly object3d: Group;

    readonly config: SwampBubblesConfig;
    readonly ripples: PopRipples;
    readonly splash: SplashDroplets;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: BubbleRenderer;
    private readonly rng: Rng;
    private readonly textures: TextureProvider;
    private readonly ownsTextures: boolean;

    /** Phase durations, in seconds, baked per bubble at spawn. */
    private readonly chDelay: Float32Array;
    private readonly chGrow: Float32Array;
    private readonly chHold: Float32Array;
    private readonly chPop: Float32Array;
    private readonly chRadius: Float32Array;
    /** Where this bubble sits in the configured size band, 0–1. Drives ripple and splash weight. */
    private readonly chBig: Float32Array;
    /** 1 once the pop has fired its ripple and droplets, so they can never fire twice. */
    private readonly chBurst: Float32Array;

    private enabledFlag = true;
    private running = true;
    private spawnTimer = 0;

    /** Scratch spawn position, so a spawn costs no allocation. */
    private readonly tmpSpawn = new Vector3();

    constructor(rawConfig?: unknown, options: SwampBubblesVfxOptions = {}) {
        const { config, issues } = normalizeSwampBubblesConfig(rawConfig);
        issues.report("SwampBubblesVfx");
        this.config = config;

        const seed = options.seed ?? 1;
        this.rng = createRng(seed * 7 + 20717);
        this.textures = options.textures ?? new TextureProvider();
        this.ownsTextures = !options.textures;

        // Pools are sized once, from the config as loaded. Raising `bubbleCount` later can only
        // raise the effective cap up to this allocation — same contract as every other effect
        // here, and the reason a running effect never allocates.
        this.buffer = new ParticleBuffer(config.bubbleCount);

        this.chDelay = this.buffer.channel("delay");
        this.chGrow = this.buffer.channel("grow");
        this.chHold = this.buffer.channel("hold");
        this.chPop = this.buffer.channel("pop");
        this.chRadius = this.buffer.channel("radius");
        this.chBig = this.buffer.channel("big");
        this.chBurst = this.buffer.channel("burst");

        this.renderer = new BubbleRenderer({
            capacity: this.buffer.capacity,
            surfaceY: config.surfaceOffset,
            opacity: config.bubbleOpacity,
            highlight: config.highlightIntensity,
        });
        // Above the rings on the water, below the droplets thrown off the surface.
        this.renderer.mesh.renderOrder = 8;

        // Rings outlive the bubble that made them, so they need their own headroom; droplets come
        // a handful at a time from the occasional large pop.
        this.ripples = new PopRipples(
            { capacity: Math.max(8, config.bubbleCount * 2), surfaceY: config.surfaceOffset, opacity: config.rippleOpacity },
            seed * 13 + 4231,
        );
        this.ripples.setColor(config.rippleColor);

        this.splash = new SplashDroplets(config, Math.max(16, config.bubbleCount * 3), this.textures, seed * 17 + 8123);
        this.splash.surfaceY = config.surfaceOffset;

        this.object3d = new Group();
        this.object3d.name = "vfx:swampbubbles";
        this.object3d.add(this.renderer.mesh, this.ripples.object3d, this.splash.object3d);

        // Through the setter, so a config that ships disabled takes the rings and droplets with it.
        this.enabled = config.enabled;
        this.spawnTimer = this.nextInterval();
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    set enabled(v: boolean) {
        this.enabledFlag = v;
        this.ripples.enabled = v && this.config.rippleEnabled;
        this.splash.enabled = v && this.config.splashEnabled;
    }

    /** Live bubbles, counting the clustered ones still inside their start delay. */
    get activeCount(): number {
        return this.buffer.count;
    }

    /** Hard pool size. `config.bubbleCount` can only cap below this. */
    get capacity(): number {
        return this.buffer.capacity;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /**
     * Re-reads `config` after an edit.
     *
     * Everything that is a uniform lands on the next frame; everything else is read at spawn time,
     * so a changed size or lifetime shows up on the next bubble and leaves the ones already
     * swelling alone — exactly as an engine behaves.
     */
    applyConfig(): void {
        const cfg = this.config;
        this.renderer.opacity = cfg.bubbleOpacity;
        this.renderer.highlight = cfg.highlightIntensity;
        this.renderer.surfaceY = cfg.surfaceOffset;

        this.ripples.surfaceY = cfg.surfaceOffset;
        this.ripples.opacity = cfg.rippleOpacity;
        this.ripples.setColor(cfg.rippleColor);
        this.ripples.enabled = this.enabledFlag && cfg.rippleEnabled;

        this.splash.surfaceY = cfg.surfaceOffset;
        this.splash.enabled = this.enabledFlag && cfg.splashEnabled;

        this.buffer.trimTo(this.bubbleLimit);
    }

    /** Resumes spawning. The effect starts running, so this is only needed after a `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Stops spawning; bubbles already on the surface finish their lifecycle and pop normally. */
    stop(): void {
        this.running = false;
    }

    /**
     * Spawns bubbles immediately, whether or not the effect is running.
     *
     * `position` is read in the effect's own local space and only its horizontal part is used —
     * bubbles belong to the surface plane, not to the height of whatever asked for them.
     */
    burst(position?: Vector3 | null, options?: BurstOptions): void {
        if (!this.enabledFlag) return;
        const count = Math.max(1, Math.round(options?.count ?? 1));
        const x = position ? position.x : 0;
        const z = position ? position.z : 0;
        for (let i = 0; i < count; i++) {
            this.spawnBubble(x, z, 0, 1);
        }
    }

    update(dt: number): void {
        if (!this.enabledFlag) {
            // A disabled effect still has to publish an empty instance count, otherwise last
            // frame's domes stay frozen on the water.
            if (this.buffer.count > 0) {
                this.buffer.clear();
                this.flush();
            }
            this.ripples.update(dt);
            this.splash.update(dt);
            return;
        }
        if (dt <= 0) return;
        // Guard against the huge delta a backgrounded tab produces on return, which would
        // otherwise fire a minute's worth of spawns into one frame.
        const step = Math.min(dt, 0.1);

        if (this.running) this.schedule(step);
        this.simulate(step);
        this.flush();

        this.ripples.update(step);
        this.splash.update(step);
    }

    /** Drops every live bubble, ring and droplet instantly. */
    clear(): void {
        this.buffer.clear();
        this.flush();
        this.ripples.clear();
        this.splash.reset();
    }

    reset(): void {
        this.clear();
        this.spawnTimer = this.nextInterval();
    }

    dispose(): void {
        this.running = false;
        this.renderer.dispose();
        this.ripples.dispose();
        this.splash.dispose();
        this.object3d.removeFromParent();
        this.object3d.clear();
        // Only tear down textures we made ourselves — an injected provider is the caller's.
        if (this.ownsTextures) this.textures.dispose();
    }

    /** The node to parent into a scene; identical to `object3d`, typed for convenience. */
    asObject3D(): Object3D {
        return this.object3d;
    }

    /** Effective cap this frame: the configured count, clamped to what was allocated. */
    private get bubbleLimit(): number {
        return Math.min(this.buffer.capacity, Math.max(0, Math.round(this.config.bubbleCount)));
    }

    /**
     * Seconds until the next spawn event.
     *
     * At `activityVariation` 0 this is a flat interval; at 1 it is an exponential draw, whose mean
     * is the same but whose gaps actually vary — including the long quiet ones that make the next
     * bubble feel like something happening rather than the next tick. The draw is clamped so one
     * unlucky sample cannot stall the effect for half a minute.
     */
    private nextInterval(): number {
        const rate = this.config.spawnRate;
        if (rate <= 0) return Infinity;
        const base = 1 / rate;
        const v = this.config.activityVariation;
        // -ln(1-u) has mean 1, so blending it in leaves the average rate alone.
        const exp = Math.min(3.2, Math.max(0.04, -Math.log(1 - this.rng() * 0.999)));
        return base * (1 - v + v * exp);
    }

    private schedule(dt: number): void {
        if (this.config.spawnRate <= 0) return;
        // The rate may have been raised off zero since the last frame, which left the timer at
        // infinity. Draw a fresh interval rather than never spawning again.
        if (!Number.isFinite(this.spawnTimer)) this.spawnTimer = this.nextInterval();

        this.spawnTimer -= dt;
        // A while-loop rather than a single check: at a high rate several events can fall inside
        // one frame, and dropping them would silently cap the effect at one per frame. The guard
        // is there because a very high rate with full variation can draw an interval near zero.
        let guard = 16;
        while (this.spawnTimer <= 0 && guard-- > 0) {
            this.spawnEvent();
            this.spawnTimer += this.nextInterval();
        }
    }

    /** One spawn event: usually a single bubble, occasionally a small staggered cluster. */
    private spawnEvent(): void {
        const cfg = this.config;
        const half = cfg.spawnAreaSize * 0.5;
        const x = (this.rng() * 2 - 1) * half;
        const z = (this.rng() * 2 - 1) * half;

        this.spawnBubble(x, z, 0, 1);

        if (this.rng() >= cfg.clusterChance) return;

        // A cluster is small bubbles trailing the first one, not a second full-size event: one big
        // bubble is an event, three big bubbles at once is boiling water.
        const extra = Math.round(randRange(this.rng, cfg.clusterSize)) - 1;
        for (let i = 0; i < extra; i++) {
            const a = this.rng() * Math.PI * 2;
            const r = 0.08 + this.rng() * 0.3;
            this.spawnBubble(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.1 + this.rng() * 0.55, 0.4 + this.rng() * 0.3);
        }
    }

    /**
     * Initialises one bubble.
     *
     * `delay` holds it invisible for a moment, which is how a cluster staggers without a queue, and
     * `sizeScale` shrinks the clustered followers.
     */
    private spawnBubble(x: number, z: number, delay: number, sizeScale: number): void {
        const cfg = this.config;
        const slot = this.buffer.spawn(this.bubbleLimit);
        if (slot < 0) return;

        const lo = Math.min(cfg.minBubbleSize, cfg.maxBubbleSize);
        const hi = Math.max(cfg.minBubbleSize, cfg.maxBubbleSize);
        // Biased draw: `sizeBias` above 1 pushes the distribution toward the small end, so a large
        // bubble stays rare however wide the band is set.
        const big = Math.pow(this.rng(), cfg.sizeBias);
        const radius = (lo + (hi - lo) * big) * sizeScale;

        const v = cfg.activityVariation;
        const jitter = () => 1 + (this.rng() * 2 - 1) * v * 0.45;

        // Bigger bubbles take longer to form and longer to tear — the one place where size has to
        // reach the timing, or every bubble reads as the same animation at a different scale.
        const grow = Math.max(0.05, (1 / cfg.growthSpeed) * (0.55 + 0.9 * big) * jitter());
        const holdLo = Math.min(cfg.minLifetime, cfg.maxLifetime);
        const holdHi = Math.max(cfg.minLifetime, cfg.maxLifetime);
        const hold = Math.max(0, (holdLo + (holdHi - holdLo) * this.rng()) * jitter());
        const pop = Math.max(0.02, (1 / cfg.popSpeed) * (0.7 + 0.6 * big) * jitter());

        const b = this.buffer;
        b.px[slot] = x;
        b.py[slot] = cfg.surfaceOffset;
        b.pz[slot] = z;
        b.vx[slot] = 0;
        b.vy[slot] = 0;
        b.vz[slot] = 0;
        b.age[slot] = 0;
        b.life[slot] = delay + grow + hold + pop;
        b.seed[slot] = this.rng();

        this.chDelay[slot] = delay;
        this.chGrow[slot] = grow;
        this.chHold[slot] = hold;
        this.chPop[slot] = pop;
        this.chRadius[slot] = radius;
        // Bigness, not raw size: it weights the ring and the splash, and a clustered follower
        // that drew a high sample must not throw the water a full-size bubble would.
        this.chBig[slot] = big * sizeScale;
        this.chBurst[slot] = 0;
    }

    private simulate(dt: number): void {
        const b = this.buffer;
        let i = 0;
        while (i < b.count) {
            b.age[i] += dt;
            if (b.age[i] >= b.life[i]) {
                b.kill(i);
                continue;
            }

            // The instant the film tears: ring first, then the handful of drops a big one throws.
            // Indices are not stable across frames, so this flag lives in the buffer and moves
            // with the bubble when something above it is swap-removed.
            if (this.chBurst[i] === 0 && b.age[i] >= this.chDelay[i] + this.chGrow[i] + this.chHold[i]) {
                this.chBurst[i] = 1;
                this.onPop(i);
            }
            i++;
        }
    }

    private onPop(i: number): void {
        const cfg = this.config;
        const b = this.buffer;
        const radius = this.chRadius[i];
        const big = this.chBig[i];

        if (cfg.rippleEnabled) {
            this.ripples.emit(
                b.px[i],
                b.pz[i],
                radius * 0.7,
                radius * cfg.rippleRadiusScale,
                cfg.rippleSpeed,
                cfg.rippleWidth,
                // Faint, and fainter still for the small ones. A ring as strong as the bubble that
                // made it is the fastest way to turn this effect into target reticles.
                0.35 + 0.5 * big,
            );
        }

        // Scaled by size, so most bubbles pop silently and only the occasional large one throws
        // water. `splashProbability` is therefore the chance at the top of the size band.
        if (cfg.splashEnabled && this.rng() < cfg.splashProbability * big) {
            this.splash.burstRadius = radius;
            this.tmpSpawn.set(b.px[i], cfg.surfaceOffset, b.pz[i]);
            const count = Math.max(1, Math.round(randRange(this.rng, cfg.splashCount) * (0.5 + 0.5 * big)));
            this.splash.burst(this.tmpSpawn, { count, speedScale: 0.7 + 0.5 * big });
        }
    }

    private flush(): void {
        const cfg = this.config;
        const b = this.buffer;
        const r = this.renderer;
        const tint = resolveColor(cfg.bubbleColor);
        let w = 0;

        for (let i = 0; i < b.count; i++) {
            const age = b.age[i] - this.chDelay[i];
            // Clustered followers exist in the pool but own no instance until their delay is up.
            if (age < 0) continue;

            const grow = this.chGrow[i];
            const hold = this.chHold[i];
            const full = this.chRadius[i];
            const seed = b.seed[i];

            let scale: number;
            let alpha: number;
            let pop = 0;
            let emerge: number;

            if (age < grow) {
                const u = age / grow;
                // Quick at first, settling as surface tension takes over — the opposite of a
                // linear ramp, which reads as a sphere being scaled by a tween.
                scale = 1 - Math.pow(1 - u, 2.3);
                // The first fifth is the disturbance before the dome: faded in, barely clear of
                // the water, so nothing ever appears at full contrast.
                alpha = Math.min(1, u / 0.2);
                emerge = cfg.emergence * (0.3 + 0.7 * scale);
            } else if (age < grow + hold) {
                const t = age - grow;
                // A held bubble is not a still image: the skin breathes a couple of percent, each
                // at its own rate, which is what stops a group of domes looking like decals.
                scale = 1 + 0.022 * Math.sin(t * (5.5 + seed * 4.5) + seed * 6.283);
                alpha = 1;
                emerge = cfg.emergence;
            } else {
                const t = Math.min(1, (age - grow - hold) / this.chPop[i]);
                pop = t;
                // The film bulges as it lets go, then there is nothing left to hold a shape.
                scale = 1 + 0.14 * t;
                alpha = 1;
                emerge = cfg.emergence;
            }

            const radius = full * scale;
            if (radius <= 1e-5 || alpha <= 0.002) continue;

            // `emerge` is how much of the sphere stands clear of the water: 0.5 is a hemisphere,
            // and above that the waterline cuts below the sphere's equator — which is how a
            // surface bubble actually sits. The shader derives the cut from this centre height.
            r.setPositionAt(w, b.px[i], cfg.surfaceOffset + radius * (2 * emerge - 1), b.pz[i]);
            r.setShapeAt(w, radius, alpha, pop, seed * 2 - 1);
            r.setColorAt(w, tint);
            w++;
        }

        r.commit(w);
    }
}
