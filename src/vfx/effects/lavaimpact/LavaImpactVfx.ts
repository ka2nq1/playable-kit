/**
 * A lava impact: the flash at the point of contact, the molten tongues that erupt out of the
 * surface, the droplets they throw, and the glowing patch left cooling behind them.
 *
 *     const impact = new LavaImpactVfx(config);
 *     impact.object3d.position.y = LAVA_LEVEL;   // the surface things land on
 *     scene.add(impact.object3d);
 *
 *     impact.emit(rock.position);                      // something hit the lava
 *     impact.emit(boss.position, { scale: 1.8 });      // something much bigger did
 *
 *     impact.update(delta);   // from the loop you already have
 *     impact.dispose();       // on teardown
 *
 * Three draw calls for the whole effect — surface glow, tongues, droplets — and nothing allocated
 * per frame or per impact. Every trigger is one shot: the pools recycle, so firing it again while
 * the last one is still in the air costs no allocation and cannot corrupt what is already flying.
 *
 * ### Why it is built this way
 *
 * The splash is the part that decides whether the impact is convincing, and it is the part a
 * particle system is worst at: lava leaving a surface comes off as a few thick *ribbons*, not as a
 * cloud of sprites. So the main splash is a handful of animated tongues (see
 * {@link LavaSplashRenderer}), each one a scripted rise-and-break-up rather than an integrated
 * particle — nothing drifts, nothing ends up where molten rock could not be, and the whole
 * per-tongue state is ten numbers in a `ParticleBuffer`.
 *
 * The droplets *are* a particle system, because that is exactly what airborne lava is, and the
 * flash and the residual glow are one event-driven field of patches on the surface. The three
 * share one impact origin and one set of timings, which is the only reason they read as one event
 * instead of three effects that happen to have fired together.
 *
 * ### Why the splash is drawn asymmetrically on purpose
 *
 * An even ring of identical tongues is a starburst, and it reads instantly as a mesh. Every tongue
 * draws its own azimuth jitter, height, width, taper, curvature, lean and lifetime from
 * `splashShapeVariation`, and height is correlated with narrowness — tall tongues are thin ribbons,
 * short ones are broad lobes — so the silhouette has both in it. `randomness` then varies the
 * whole burst between triggers, which is what stops a retriggered effect reading as a looping
 * animation.
 */

import { Color, Group, Object3D, Vector3 } from "three";
import { lerpHex, resolveColor } from "../../core/colorCache";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeLavaImpactConfig, type LavaImpactConfig } from "./config";
import { ImpactGlowSystem } from "./ImpactGlowSystem";
import { LavaDropletSystem } from "./LavaDropletSystem";
import { LavaSplashRenderer } from "./LavaSplashRenderer";

const TAU = Math.PI * 2;

/** Tongues one impact may spawn, plus the broad mass at the centre. */
const MAX_TONGUES = 16;
/** Concurrent impacts the pools are sized for; a fourth recycles the oldest splash. */
const CONCURRENT_IMPACTS = 3;
/** Secondary beats that can be waiting to fire at once. A dropped one is a detail, not an event. */
const PENDING_SECONDARIES = 4;

export interface LavaImpactVfxOptions {
    /** Base RNG seed; two instances with the same seed burst identically. */
    seed?: number;
}

export interface LavaImpactOptions {
    /** Multiplies every size, distance and speed on top of `impactScale` — one knob for "bigger". */
    scale?: number;
    /** Multiplies `impactIntensity` for this impact only. */
    intensity?: number;
}

export class LavaImpactVfx implements VfxEffect {
    readonly id = "lavaimpact";
    readonly object3d: Group;

    readonly config: LavaImpactConfig;
    readonly droplets: LavaDropletSystem;
    readonly glow: ImpactGlowSystem;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: LavaSplashRenderer;
    private readonly rng: Rng;

    /** Per-tongue shape, baked at the moment of impact. */
    private readonly chDelay: Float32Array;
    private readonly chHeight: Float32Array;
    private readonly chWidth: Float32Array;
    private readonly chLeanX: Float32Array;
    private readonly chLeanZ: Float32Array;
    private readonly chTaper: Float32Array;
    private readonly chPeak: Float32Array;
    private readonly chAlpha: Float32Array;
    private readonly chCurve: Float32Array;
    private readonly chHeat: Float32Array;

    /** The secondary beat: a few trailing droplets a moment after the main burst. */
    private readonly pendTimer = new Float32Array(PENDING_SECONDARIES);
    private readonly pendX = new Float32Array(PENDING_SECONDARIES);
    private readonly pendZ = new Float32Array(PENDING_SECONDARIES);
    private readonly pendScale = new Float32Array(PENDING_SECONDARIES);
    private readonly pendCount = new Float32Array(PENDING_SECONDARIES);

    private enabledFlag = true;
    private running = true;

    /** Scratch, so an impact costs no allocation. */
    private readonly tmpSpawn = new Vector3();
    private readonly tmpColor = new Color();

    constructor(rawConfig?: unknown, options: LavaImpactVfxOptions = {}) {
        const { config, issues } = normalizeLavaImpactConfig(rawConfig);
        issues.report("LavaImpactVfx");
        this.config = config;

        const seed = options.seed ?? 1;
        this.rng = createRng(seed * 13 + 20947);

        // Pools are sized once, from the config as loaded, and every one of them recycles rather
        // than allocating when it fills — so repeated triggering is bounded by construction and a
        // running effect never allocates.
        this.buffer = new ParticleBuffer((MAX_TONGUES + 1) * CONCURRENT_IMPACTS);

        this.chDelay = this.buffer.channel("delay");
        this.chHeight = this.buffer.channel("height");
        this.chWidth = this.buffer.channel("width");
        this.chLeanX = this.buffer.channel("leanX");
        this.chLeanZ = this.buffer.channel("leanZ");
        this.chTaper = this.buffer.channel("taper");
        this.chPeak = this.buffer.channel("peak");
        this.chAlpha = this.buffer.channel("alpha");
        this.chCurve = this.buffer.channel("curve");
        this.chHeat = this.buffer.channel("heat");

        this.renderer = new LavaSplashRenderer({
            capacity: this.buffer.capacity,
            opacity: config.splashOpacity,
            emissive: config.emissiveIntensity,
            edgeVariation: config.edgeVariation,
            cooling: config.coolingIntensity,
        });
        // Above the glow on the surface, below the droplets that got clear of the splash.
        this.renderer.mesh.renderOrder = 9;

        const perImpact = (config.dropletCount + config.secondaryDropletCount) * Math.max(1, config.impactIntensity);
        this.droplets = new LavaDropletSystem(
            config,
            Math.min(512, Math.max(96, Math.round(perImpact * CONCURRENT_IMPACTS))),
            seed * 19 + 8821,
        );
        this.droplets.surfaceY = config.surfaceOffset;

        this.glow = new ImpactGlowSystem(
            {
                // Two patches per impact, plus headroom so a retrigger never cuts the last one off.
                capacity: 2 * CONCURRENT_IMPACTS + 4,
                surfaceY: config.surfaceOffset,
                edgeVariation: config.edgeVariation,
            },
            seed * 29 + 4231,
        );

        this.object3d = new Group();
        this.object3d.name = "vfx:lavaimpact";
        this.object3d.add(this.glow.object3d, this.renderer.mesh, this.droplets.object3d);

        this.applyConfig();
        // Through the setter, so a config that ships disabled takes the droplets and glow with it.
        this.enabled = config.enabled;
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    set enabled(v: boolean) {
        this.enabledFlag = v;
        this.droplets.enabled = v;
        this.glow.enabled = v;
    }

    /** Everything live across the three systems — tongues, droplets and surface patches. */
    get activeCount(): number {
        return this.buffer.count + this.droplets.activeCount + this.glow.activeCount;
    }

    /** Live tongues of the main splash. */
    get tongueCount(): number {
        return this.buffer.count;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /**
     * Re-reads `config` after an edit.
     *
     * Everything that is a uniform lands on the next frame; everything else is read at impact
     * time, so a changed height or droplet count shows up on the next impact and leaves the one
     * already in the air alone — exactly as an engine behaves.
     */
    applyConfig(): void {
        const cfg = this.config;

        this.renderer.opacity = cfg.splashOpacity;
        this.renderer.emissive = cfg.emissiveIntensity;
        this.renderer.edgeVariation = cfg.edgeVariation;
        this.renderer.cooling = cfg.coolingIntensity;
        this.renderer.setPalette(resolveColor(cfg.hotColor), resolveColor(cfg.lavaColor), resolveColor(cfg.coolColor));

        this.droplets.surfaceY = cfg.surfaceOffset;
        this.droplets.applyConfig();

        this.glow.surfaceY = cfg.surfaceOffset;
        this.glow.edgeVariation = cfg.edgeVariation;
    }

    /**
     * Plays one impact at a local position. The real entry point.
     *
     * Only the horizontal part of `position` is used: an impact belongs to the surface plane, not
     * to the height of whatever landed on it, so a rock arriving from 3m up and a creature
     * punching through from below both burst in the right place with no conversion at the call
     * site.
     */
    emit(position?: Vector3 | null, options?: LavaImpactOptions): void {
        if (!this.enabledFlag || !this.running) return;

        const cfg = this.config;
        const r = cfg.randomness;
        // One draw per trigger, applied to the whole burst: this is what makes two impacts from
        // the same config land differently instead of replaying one animation.
        const scale = Math.max(0.01, cfg.impactScale * (options?.scale ?? 1) * (1 + (this.rng() * 2 - 1) * 0.18 * r));
        const intensity = Math.max(0, cfg.impactIntensity * (options?.intensity ?? 1) * (1 + (this.rng() * 2 - 1) * 0.15 * r));
        const x = position ? position.x : 0;
        const z = position ? position.z : 0;

        this.spawnFlash(x, z, scale, intensity);
        this.spawnTongues(x, z, scale, intensity);
        this.spawnDroplets(x, z, scale, intensity);
        this.queueSecondary(x, z, scale, intensity);
    }

    /** `VfxEffect` compatibility: one impact at `position`, with `speedScale` read as the size. */
    burst(position?: Vector3 | null, options?: BurstOptions): void {
        this.emit(position, { scale: options?.speedScale });
    }

    /** Accepts impacts again after a `stop()`. The effect starts running, so this is rarely needed. */
    start(): void {
        this.running = true;
    }

    /** Ignores new impacts. Splashes already in the air finish normally. */
    stop(): void {
        this.running = false;
    }

    update(dt: number): void {
        if (!this.enabledFlag) {
            // A disabled effect still has to publish an empty instance count, otherwise last
            // frame's tongues stay frozen above the surface.
            if (this.buffer.count > 0) {
                this.buffer.clear();
                this.flush();
            }
            this.droplets.update(dt);
            this.glow.update(dt);
            return;
        }
        if (dt <= 0) return;
        // Guard against the huge delta a backgrounded tab produces on return, which would
        // otherwise teleport every droplet and skip a whole splash.
        const step = Math.min(dt, 0.1);

        this.advanceSecondaries(step);
        this.simulate(step);
        this.flush();

        this.droplets.update(step);
        this.glow.update(step);
    }

    /** Drops every live tongue, droplet and patch instantly, and cancels any pending beat. */
    clear(): void {
        this.buffer.clear();
        this.flush();
        this.pendTimer.fill(0);
        this.droplets.reset();
        this.glow.clear();
    }

    reset(): void {
        this.clear();
    }

    dispose(): void {
        this.running = false;
        this.renderer.dispose();
        this.droplets.dispose();
        this.glow.dispose();
        this.object3d.removeFromParent();
        this.object3d.clear();
    }

    /** The node to parent into a scene; identical to `object3d`, typed for convenience. */
    asObject3D(): Object3D {
        return this.object3d;
    }

    /**
     * The flash and the patch it leaves behind.
     *
     * They are one system with two settings: the flash is bright, wide and gone in a tenth of a
     * second, the patch is dim, tight and takes a second to cool. Starting the patch a beat into
     * the flash is what makes the two read as one event cooling down rather than as a light
     * switching off and another switching on.
     */
    private spawnFlash(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        if (intensity <= 0) return;

        if (cfg.impactFlashIntensity > 0) {
            // Hotter than the hot colour: the instant of contact is the one moment the palette is
            // allowed to run out of hue.
            lerpHex(this.tmpColor, cfg.hotColor, "#ffffff", 0.35);
            this.glow.emit(
                x,
                z,
                cfg.impactRadius * scale * 1.25,
                cfg.impactFlashDuration,
                cfg.impactFlashIntensity * intensity,
                this.tmpColor,
                { growth: 0.55, attack: 0.08, falloff: 1.4, core: 2.2 },
            );
        }

        if (cfg.surfaceGlowIntensity > 0) {
            lerpHex(this.tmpColor, cfg.lavaColor, cfg.hotColor, 0.25);
            this.glow.emit(x, z, cfg.impactRadius * scale, cfg.surfaceGlowDuration, cfg.surfaceGlowIntensity * intensity, this.tmpColor, {
                delay: cfg.impactFlashDuration * 0.35,
                growth: 0.3,
                attack: 0.25,
                falloff: 2.4,
                core: 5,
            });
        }
    }

    /**
     * The splash: one broad mass at the centre, then the tongues around it.
     *
     * The tongues are laid out on an even ring and then pushed off it by `splashShapeVariation`,
     * which keeps the silhouette irregular without ever leaving a gap big enough to read as a
     * missing piece. The central mass is what they appear to come out of; without it a splash is a
     * ring of unconnected blades.
     */
    private spawnTongues(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        if (intensity <= 0 || cfg.splashTongueCount <= 0) return;

        const v = cfg.splashShapeVariation;
        const height = cfg.splashHeight * scale;
        const width = cfg.splashWidth * scale;
        const foot = cfg.impactRadius * scale;

        this.spawnTongue(
            x,
            z,
            width * 1.15,
            height * (0.26 + 0.12 * this.rng()),
            0,
            0,
            Math.max(0.3, cfg.splashTaper * 0.45),
            cfg.splashDuration * (0.45 + 0.12 * this.rng()),
            0,
            0.24,
            0.95,
            cfg.splashCurvature * 0.3,
            1,
        );

        const count = Math.max(1, Math.min(MAX_TONGUES, Math.round(cfg.splashTongueCount * Math.min(3, intensity))));
        const base = this.rng() * TAU;
        for (let i = 0; i < count; i++) {
            // Even spacing jittered by up to half a slot: at variation 0 this is a perfectly
            // regular starburst, which is exactly the look the knob exists to get away from.
            const ang = base + (i / count) * TAU + (this.rng() * 2 - 1) * v * (Math.PI / count);
            const outX = Math.cos(ang);
            const outZ = Math.sin(ang);

            // Tall tongues are narrow ribbons, short ones are broad lobes. Correlating the two is
            // what puts both shapes into one splash from one draw call.
            const tall = Math.pow(this.rng(), 1.5);
            const jitter = 1 + (this.rng() * 2 - 1) * v * 0.45;

            const footR = foot * (0.12 + 0.5 * this.rng());
            const h = height * (0.3 + 0.85 * tall) * jitter;
            const w = width * (0.35 + 0.5 * (1 - tall) + 0.25 * this.rng()) * jitter;
            const lean = cfg.splashSpread * scale * (0.45 + 1.0 * this.rng()) * (1 - 0.3 * tall);
            // A little tangential lean as well, so the fan is not a perfect radial star.
            const tang = (this.rng() * 2 - 1) * v * 0.55;

            this.spawnTongue(
                x + outX * footR,
                z + outZ * footR,
                w,
                h,
                outX * lean - outZ * lean * tang,
                outZ * lean + outX * lean * tang,
                // Narrow ribbons taper hard; broad lobes keep their width most of the way up.
                cfg.splashTaper * (0.55 + 0.9 * tall),
                cfg.splashDuration * (0.5 + 0.6 * tall) * (1 + (this.rng() * 2 - 1) * v * 0.3),
                this.rng() * 0.06 * v,
                0.3 + 0.12 * this.rng(),
                0.75 + 0.25 * this.rng(),
                Math.min(1, cfg.splashCurvature * (0.55 + 0.9 * this.rng())),
                0.68 + 0.32 * this.rng(),
            );
        }
    }

    private spawnTongue(
        x: number,
        z: number,
        halfWidth: number,
        height: number,
        leanX: number,
        leanZ: number,
        taper: number,
        life: number,
        delay: number,
        peak: number,
        alpha: number,
        curve: number,
        heat: number,
    ): void {
        const slot = this.acquireTongue();
        if (slot < 0) return;

        const b = this.buffer;
        b.px[slot] = x;
        b.py[slot] = this.config.surfaceOffset;
        b.pz[slot] = z;
        b.age[slot] = 0;
        b.life[slot] = Math.max(0.06, delay + life);
        b.seed[slot] = this.rng();

        this.chDelay[slot] = delay;
        this.chHeight[slot] = height;
        this.chWidth[slot] = halfWidth;
        this.chLeanX[slot] = leanX;
        this.chLeanZ[slot] = leanZ;
        this.chTaper[slot] = taper;
        this.chPeak[slot] = peak;
        this.chAlpha[slot] = alpha;
        this.chCurve[slot] = curve;
        this.chHeat[slot] = heat;
    }

    private spawnDroplets(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        const count = Math.round(cfg.dropletCount * intensity);
        if (count <= 0) return;

        this.droplets.spawnScale = scale;
        // Droplets leave from the lower part of the splash, so the spatter and the tongues share a
        // silhouette instead of overlapping as two separate events.
        this.droplets.spawnHeight = cfg.splashHeight * scale * 0.35;
        this.tmpSpawn.set(x, cfg.surfaceOffset, z);
        this.droplets.burst(this.tmpSpawn, { count, speedScale: 0.8 + 0.2 * Math.min(2, intensity) });
    }

    /**
     * Queues the second beat: a few small droplets lobbed out of the splash after the main burst
     * has peaked. A dropped beat when the queue is full is a detail nobody can see, which is why
     * it is dropped rather than allowed to allocate.
     */
    private queueSecondary(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        const count = Math.round(cfg.secondaryDropletCount * intensity);
        if (count <= 0) return;

        for (let i = 0; i < PENDING_SECONDARIES; i++) {
            if (this.pendTimer[i] > 0) continue;
            // A zero delay still goes through the queue, firing on the next update rather than
            // inside this call: "timer not running" is how a free slot is recognised, and a beat
            // that fired immediately would be indistinguishable from the main burst anyway.
            this.pendTimer[i] = Math.max(1e-3, cfg.secondaryBurstDelay);
            this.pendX[i] = x;
            this.pendZ[i] = z;
            this.pendScale[i] = scale;
            this.pendCount[i] = count;
            return;
        }
    }

    private advanceSecondaries(dt: number): void {
        const cfg = this.config;
        for (let i = 0; i < PENDING_SECONDARIES; i++) {
            if (this.pendTimer[i] <= 0) continue;
            this.pendTimer[i] -= dt;
            if (this.pendTimer[i] > 0) continue;
            this.pendTimer[i] = 0;

            // Smaller, slower and from higher up: this is material peeling off the tongues as they
            // come apart, not a second impact.
            this.droplets.spawnScale = this.pendScale[i] * 0.6;
            this.droplets.spawnHeight = cfg.splashHeight * this.pendScale[i] * 0.7;
            this.tmpSpawn.set(this.pendX[i], cfg.surfaceOffset, this.pendZ[i]);
            this.droplets.burst(this.tmpSpawn, { count: this.pendCount[i], speedScale: 0.55 });
        }
    }

    /** Reserves a tongue slot, recycling the one closest to finishing when the pool is full. */
    private acquireTongue(): number {
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

    private simulate(dt: number): void {
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
    }

    private flush(): void {
        const b = this.buffer;
        const r = this.renderer;
        let w = 0;

        for (let i = 0; i < b.count; i++) {
            const age = b.age[i] - this.chDelay[i];
            // A delayed tongue occupies a pool slot but owns no instance until it leaves the lava.
            if (age < 0) continue;

            const span = b.life[i] - this.chDelay[i];
            const u = span > 0 ? Math.min(1, age / span) : 1;
            const peak = this.chPeak[i];

            // Up fast and easing into the peak — the shape of a throw, not a tween. Past the peak
            // the tongue only sags: molten rock comes apart into droplets rather than retracting
            // the way a sheet of water does, and the break-up in the shader is what ends it.
            let rise: number;
            let collapse = 0;
            if (u < peak) {
                rise = 1 - Math.pow(1 - u / peak, 2.2);
            } else {
                collapse = (u - peak) / Math.max(1e-3, 1 - peak);
                rise = 1 - 0.45 * Math.pow(collapse, 1.7);
            }

            const height = this.chHeight[i] * rise;
            // The tongue spreads as it rises and pulls in as it falls apart: lava that is still
            // the width it left at is lava nothing is pulling on.
            const grow = Math.sqrt(Math.min(1, u / Math.max(peak, 1e-3)));
            const halfWidth = this.chWidth[i] * (0.45 + 0.7 * grow) * (1 - 0.3 * collapse);

            const alpha = this.chAlpha[i] * Math.min(1, u / 0.05) * (1 - smoothstep(0.62, 1, u));
            if (height <= 1e-4 || alpha <= 0.004) continue;

            // The lean opens as the tongue stretches, so it leaves the surface upright and only
            // arcs outward on the way over.
            const leanT = Math.min(1, u * 1.3);

            r.setBaseAt(w, b.px[i], b.py[i], b.pz[i]);
            r.setColumnAt(w, halfWidth, height, alpha, u);
            r.setFormAt(w, this.chLeanX[i] * leanT, this.chLeanZ[i] * leanT, b.seed[i], this.chTaper[i]);
            r.setStyleAt(w, this.chCurve[i], this.chHeat[i]);
            w++;
        }

        r.commit(w);
    }
}

/** The GLSL function, on the CPU: the tongue fade and the shader's break-up have to agree. */
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
