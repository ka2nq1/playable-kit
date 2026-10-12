/**
 * A water impact: the crown that leaps out of the surface, the droplets it throws and the rings it
 * leaves behind.
 *
 *     const splash = new WaterSplashVfx(config);
 *     splash.object3d.position.y = WATER_LEVEL;   // the surface things fall into
 *     scene.add(splash.object3d);
 *
 *     splash.emit(ball.position);                 // something hit the water
 *     splash.emit(creature.position, { scale: 1.8 });   // something much bigger did
 *
 *     splash.update(delta);   // from the loop you already have
 *     splash.dispose();       // on teardown
 *
 * Three draw calls for the whole effect — sheets, droplets, rings — and nothing allocated per
 * frame or per impact.
 *
 * ### Why it is built this way
 *
 * The crown is the part that decides whether a splash is convincing, and it is the part a particle
 * system is worst at: water leaving a surface comes off as a few *sheets*, not as a cloud of
 * sprites. So the main splash is a handful of animated sheets (see {@link SplashSheetRenderer}),
 * each one a scripted rise-and-collapse rather than an integrated particle — nothing drifts,
 * nothing can end up where water could not be, and the whole per-sheet state is nine numbers in a
 * `ParticleBuffer`.
 *
 * The droplets *are* a particle system, because that is exactly what airborne water is, and the
 * ripples are an event-driven ring field. The three share one impact origin and one set of
 * timings, which is the only reason they read as one event instead of three effects that happen to
 * have fired together.
 *
 * ### Why the crown is drawn asymmetrically on purpose
 *
 * An even ring of identical streams is a crown shape, and it reads instantly as a mesh. Every
 * stream here therefore draws its own azimuth jitter, height, width, taper, lean and lifetime from
 * `shapeVariation`, and height is correlated with narrowness — tall streams are thin, short ones
 * are broad lobes — so the silhouette has both in it. At `shapeVariation` 0 the crown really is
 * symmetrical, which is there as a visible demonstration of what the knob buys.
 */

import { Color, Group, Object3D, Vector3 } from "three";
import { lerpHex, resolveColor } from "../../core/colorCache";
import { ParticleBuffer } from "../../core/ParticleBuffer";
import { createRng, type Rng } from "../../core/random";
import { TextureProvider } from "../../core/textures";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeWaterSplashConfig, type WaterSplashConfig } from "./config";
import { SplashDropletSystem } from "./SplashDropletSystem";
import { SplashRippleSystem } from "./SplashRippleSystem";
import { SplashSheetRenderer } from "./SplashSheetRenderer";

const TAU = Math.PI * 2;

/** Streams in the crown at `splashIntensity` 3, plus the broad mass at the centre. */
const MAX_STREAMS = 13;
/** Concurrent impacts the sheet pool is sized for; a fourth recycles the oldest crown. */
const CONCURRENT_IMPACTS = 3;

export interface WaterSplashVfxOptions {
    /**
     * Supply your own provider to swap the procedural droplet sprite for artist art. When omitted,
     * the effect creates — and disposes — its own.
     */
    textures?: TextureProvider;
    /** Base RNG seed; two instances with the same seed splash identically. */
    seed?: number;
}

export interface SplashOptions {
    /** Multiplies every size, distance and speed — one knob for "the same impact, but bigger". */
    scale?: number;
    /** Multiplies `splashIntensity` for this impact only. */
    intensity?: number;
}

export class WaterSplashVfx implements VfxEffect {
    readonly id = "watersplash";
    readonly object3d: Group;

    readonly config: WaterSplashConfig;
    readonly droplets: SplashDropletSystem;
    readonly ripples: SplashRippleSystem;

    private readonly buffer: ParticleBuffer;
    private readonly renderer: SplashSheetRenderer;
    private readonly rng: Rng;
    private readonly textures: TextureProvider;
    private readonly ownsTextures: boolean;

    /** Per-sheet shape, baked at the moment of impact. */
    private readonly chDelay: Float32Array;
    private readonly chHeight: Float32Array;
    private readonly chWidth: Float32Array;
    private readonly chLeanX: Float32Array;
    private readonly chLeanZ: Float32Array;
    private readonly chTaper: Float32Array;
    private readonly chPeak: Float32Array;
    private readonly chAlpha: Float32Array;

    private enabledFlag = true;
    private running = true;

    /** Scratch, so an impact costs no allocation. */
    private readonly tmpSpawn = new Vector3();
    private readonly tmpColor = new Color();

    constructor(rawConfig?: unknown, options: WaterSplashVfxOptions = {}) {
        const { config, issues } = normalizeWaterSplashConfig(rawConfig);
        issues.report("WaterSplashVfx");
        this.config = config;

        const seed = options.seed ?? 1;
        this.rng = createRng(seed * 11 + 31337);
        this.textures = options.textures ?? new TextureProvider();
        this.ownsTextures = !options.textures;

        // Pools are sized once, from the config as loaded, and every one of them recycles rather
        // than allocating when it fills — so repeated triggering is bounded by construction and a
        // running effect never allocates.
        this.buffer = new ParticleBuffer((MAX_STREAMS + 1) * CONCURRENT_IMPACTS);

        this.chDelay = this.buffer.channel("delay");
        this.chHeight = this.buffer.channel("height");
        this.chWidth = this.buffer.channel("width");
        this.chLeanX = this.buffer.channel("leanX");
        this.chLeanZ = this.buffer.channel("leanZ");
        this.chTaper = this.buffer.channel("taper");
        this.chPeak = this.buffer.channel("peak");
        this.chAlpha = this.buffer.channel("alpha");

        this.renderer = new SplashSheetRenderer({
            capacity: this.buffer.capacity,
            opacity: config.opacity,
            highlight: config.highlightIntensity,
            color: resolveColor(config.waterColor),
        });
        // Above the rings on the water, below the droplets that got clear of the crown.
        this.renderer.mesh.renderOrder = 9;

        this.droplets = new SplashDropletSystem(
            config,
            Math.min(512, Math.max(96, Math.round(config.dropletCount * Math.max(1, config.splashIntensity) * 3))),
            this.textures,
            seed * 17 + 7717,
        );
        this.droplets.surfaceY = config.surfaceOffset;
        // Bound as a field rather than a closure per droplet: this fires several times a second
        // during a busy splash and must not allocate.
        this.droplets.onSurfaceReturn = this.handleSurfaceReturn;

        this.ripples = new SplashRippleSystem(
            {
                // Headroom over the rings one impact starts: the secondary splashes arrive while
                // the primary train is still expanding.
                capacity: Math.min(64, Math.max(16, config.rippleCount * 4 + 12)),
                surfaceY: config.surfaceOffset,
                opacity: config.rippleOpacity,
            },
            seed * 23 + 5519,
        );

        this.object3d = new Group();
        this.object3d.name = "vfx:watersplash";
        this.object3d.add(this.renderer.mesh, this.ripples.object3d, this.droplets.object3d);

        this.applyConfig();
        // Through the setter, so a config that ships disabled takes the droplets and rings with it.
        this.enabled = config.enabled;
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    set enabled(v: boolean) {
        this.enabledFlag = v;
        this.droplets.enabled = v;
        this.ripples.enabled = v && this.config.rippleEnabled;
    }

    /** Everything live across the three systems — sheets, droplets and rings. */
    get activeCount(): number {
        return this.buffer.count + this.droplets.activeCount + this.ripples.activeCount;
    }

    /** Live sheets of the main splash. */
    get sheetCount(): number {
        return this.buffer.count;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /**
     * Re-reads `config` after an edit.
     *
     * Everything that is a uniform lands on the next frame; everything else is read at impact
     * time, so a changed height or droplet count shows up on the next splash and leaves the one
     * already collapsing alone — exactly as an engine behaves.
     */
    applyConfig(): void {
        const cfg = this.config;

        this.renderer.opacity = cfg.opacity;
        this.renderer.highlight = cfg.highlightIntensity;
        this.renderer.setColor(resolveColor(cfg.waterColor));

        this.droplets.surfaceY = cfg.surfaceOffset;
        this.droplets.opacity = cfg.dropletOpacity;

        this.ripples.surfaceY = cfg.surfaceOffset;
        this.ripples.opacity = cfg.rippleOpacity;
        this.ripples.enabled = this.enabledFlag && cfg.rippleEnabled;
        // The rings are the same water seen edge-on, so they are the body colour lifted toward
        // white rather than a colour of their own — one fewer knob that can be set wrong.
        this.ripples.setColor(lerpHex(this.tmpColor, cfg.waterColor, "#ffffff", 0.45));
    }

    /**
     * Plays one impact at a local position. The real entry point.
     *
     * Only the horizontal part of `position` is used: a splash belongs to the surface plane, not
     * to the height of whatever fell through it, so an object entering from 2m up and a creature
     * rising from below both splash in the right place with no conversion at the call site.
     */
    emit(position?: Vector3 | null, options?: SplashOptions): void {
        if (!this.enabledFlag || !this.running) return;

        const scale = Math.max(0.01, options?.scale ?? 1);
        const intensity = Math.max(0, this.config.splashIntensity * (options?.intensity ?? 1));
        const x = position ? position.x : 0;
        const z = position ? position.z : 0;

        this.spawnCrown(x, z, scale, intensity);
        this.spawnDroplets(x, z, scale, intensity);
        this.spawnRings(x, z, scale, intensity);
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
            // frame's sheets stay frozen above the water.
            if (this.buffer.count > 0) {
                this.buffer.clear();
                this.flush();
            }
            this.droplets.update(dt);
            this.ripples.update(dt);
            return;
        }
        if (dt <= 0) return;
        // Guard against the huge delta a backgrounded tab produces on return, which would
        // otherwise teleport every droplet and skip a whole crown.
        const step = Math.min(dt, 0.1);

        this.simulate(step);
        this.flush();

        this.droplets.update(step);
        this.ripples.update(step);
    }

    /** Drops every live sheet, droplet and ring instantly. */
    clear(): void {
        this.buffer.clear();
        this.flush();
        this.droplets.reset();
        this.ripples.clear();
    }

    reset(): void {
        this.clear();
    }

    dispose(): void {
        this.running = false;
        this.droplets.onSurfaceReturn = null;
        this.renderer.dispose();
        this.droplets.dispose();
        this.ripples.dispose();
        this.object3d.removeFromParent();
        this.object3d.clear();
        // Only tear down textures we made ourselves — an injected provider is the caller's.
        if (this.ownsTextures) this.textures.dispose();
    }

    /** The node to parent into a scene; identical to `object3d`, typed for convenience. */
    asObject3D(): Object3D {
        return this.object3d;
    }

    /**
     * The crown: one broad mass at the centre, then the streams around it.
     *
     * The streams are laid out on an even ring and then pushed off it by `shapeVariation`, which
     * is what keeps the silhouette irregular without ever leaving a gap big enough to read as a
     * missing piece.
     */
    private spawnCrown(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        if (intensity <= 0) return;

        const v = cfg.shapeVariation;
        const height = cfg.splashHeight * scale;
        const width = cfg.splashWidth * scale;

        // The broad, short mass of water directly under the impact. It is what the streams appear
        // to come out of; without it a crown is a ring of unconnected blades.
        this.spawnSheet(
            x,
            z,
            width * 0.62,
            height * (0.3 + 0.14 * this.rng()),
            0,
            0,
            0.22,
            cfg.splashDuration * (0.5 + 0.12 * this.rng()),
            0,
            0.26,
            0.9,
        );

        const streams = Math.min(MAX_STREAMS, Math.max(2, Math.round(2 + 6 * intensity)));
        const base = this.rng() * TAU;
        for (let i = 0; i < streams; i++) {
            // Even spacing jittered by up to half a slot: at variation 0 this is a perfectly
            // regular crown, which is exactly the look the knob exists to get away from.
            const ang = base + (i / streams) * TAU + (this.rng() * 2 - 1) * v * (Math.PI / streams);
            const outX = Math.cos(ang);
            const outZ = Math.sin(ang);

            // Tall streams are narrow, short ones are broad lobes. Correlating the two is what
            // puts both shapes the brief asks for into one crown from one draw.
            const tall = Math.pow(this.rng(), 1.5);
            const jitter = 1 + (this.rng() * 2 - 1) * v * 0.4;

            const footR = width * (0.1 + 0.3 * this.rng());
            const h = height * (0.35 + 0.85 * tall) * jitter;
            const w = width * (0.16 + 0.2 * (1 - tall) + 0.12 * this.rng()) * jitter;
            const lean = width * (0.5 + 1.1 * this.rng()) * (1 - 0.35 * tall);
            // A little tangential lean as well, so the fan is not a perfect radial star.
            const tang = (this.rng() * 2 - 1) * v * 0.5;

            this.spawnSheet(
                x + outX * footR,
                z + outZ * footR,
                w,
                h,
                outX * lean - outZ * lean * tang,
                outZ * lean + outX * lean * tang,
                // Narrow streams taper hard; broad lobes keep their width most of the way up.
                0.35 + 1.5 * tall,
                cfg.splashDuration * (0.55 + 0.55 * tall) * (1 + (this.rng() * 2 - 1) * v * 0.3),
                this.rng() * 0.05 * v,
                0.28 + 0.1 * this.rng(),
                0.7 + 0.3 * this.rng(),
            );
        }
    }

    private spawnSheet(
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
    ): void {
        const slot = this.acquireSheet();
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
    }

    private spawnDroplets(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        const count = Math.round(cfg.dropletCount * intensity);
        if (count <= 0) return;

        this.droplets.spawnScale = scale;
        this.droplets.spawnGeneration = 0;
        // Droplets leave from the lower part of the crown, so the spray and the sheets share a
        // silhouette instead of overlapping as two separate events.
        this.droplets.spawnHeight = cfg.splashHeight * scale * 0.35;
        this.tmpSpawn.set(x, cfg.surfaceOffset, z);
        this.droplets.burst(this.tmpSpawn, { count, speedScale: 0.75 + 0.25 * Math.min(2, intensity) });
    }

    private spawnRings(x: number, z: number, scale: number, intensity: number): void {
        const cfg = this.config;
        if (!cfg.rippleEnabled || cfg.rippleCount <= 0 || intensity <= 0) return;

        for (let i = 0; i < cfg.rippleCount; i++) {
            // Later rings start wider and a beat behind, which is what turns three circles into
            // one wave train leaving the impact.
            const start = cfg.splashWidth * scale * (0.5 + 0.5 * i);
            const duration = cfg.rippleDuration * (1 - 0.08 * i);
            this.ripples.emit(
                x,
                z,
                start,
                start + cfg.rippleSpeed * scale * duration * (1 - 0.1 * i),
                duration,
                cfg.rippleWidth * scale * (1 + 0.12 * i),
                Math.min(1.5, 0.9 * Math.pow(0.72, i) * Math.min(1.6, intensity)),
                i * cfg.rippleDuration * 0.12,
            );
        }
    }

    /**
     * A droplet came back down. Leave a small ring where it landed and, for the bigger ones, a
     * couple of micro-droplets.
     *
     * Only primary droplets ever reach here (the system filters by generation), so this cannot
     * cascade — the effect always terminates.
     */
    private readonly handleSurfaceReturn = (x: number, z: number, size: number): void => {
        const cfg = this.config;
        if (!cfg.secondarySplashEnabled) return;
        const strength = cfg.secondarySplashIntensity;
        if (strength <= 0) return;

        // Weighted by how heavy the drop was: a fine droplet landing is not an event, and firing
        // one of these for every droplet is both wrong and the fastest way to flood the pools.
        const weight = Math.min(1, size / Math.max(cfg.dropletSize, 1e-4) - 0.35);
        if (weight <= 0 || this.rng() > strength * weight) return;

        if (cfg.rippleEnabled) {
            this.ripples.emit(
                x,
                z,
                size * 1.5,
                size * (8 + 10 * strength),
                0.4 + 0.45 * strength,
                cfg.rippleWidth * 0.5,
                0.45 * strength,
            );
        }

        this.droplets.spawnScale = 0.5;
        this.droplets.spawnGeneration = 1;
        this.droplets.spawnHeight = size;
        this.tmpSpawn.set(x, cfg.surfaceOffset, z);
        this.droplets.burst(this.tmpSpawn, { count: this.rng() < strength ? 2 : 1, speedScale: 0.3 });
        // Put the spawn parameters back: the next primary burst sets them anyway, but a stale
        // generation flag here would stop the real droplets ever splashing back.
        this.droplets.spawnScale = 1;
        this.droplets.spawnGeneration = 0;
    };

    /** Reserves a sheet slot, recycling the one closest to collapsing when the pool is full. */
    private acquireSheet(): number {
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
            // A delayed sheet occupies a pool slot but owns no instance until it leaves the water.
            if (age < 0) continue;

            const span = b.life[i] - this.chDelay[i];
            const u = span > 0 ? Math.min(1, age / span) : 1;
            const peak = this.chPeak[i];

            // Up fast and easing into the peak, then down accelerating — the shape of a throw,
            // not a tween. The two halves meet at exactly 1, so nothing snaps at the top.
            let rise: number;
            let collapse = 0;
            if (u < peak) {
                rise = 1 - Math.pow(1 - u / peak, 2.4);
            } else {
                collapse = (u - peak) / Math.max(1e-3, 1 - peak);
                rise = 1 - Math.pow(collapse, 1.8);
            }

            const height = this.chHeight[i] * rise;
            // The sheet spreads as it rises and pulls back in as it falls: water that is still
            // the width it left at is water nothing is pulling on.
            const grow = Math.sqrt(Math.min(1, u / Math.max(peak, 1e-3)));
            const halfWidth = this.chWidth[i] * (0.5 + 0.65 * grow) * (1 - 0.3 * collapse);

            const alpha = this.chAlpha[i] * Math.min(1, u / 0.07) * (1 - smoothstep(0.6, 1, u));
            if (height <= 1e-4 || alpha <= 0.004) continue;

            // The lean opens as the sheet stretches, so it leaves the water upright and only
            // arcs outward on the way over.
            const leanT = Math.min(1, u * 1.4);

            r.setBaseAt(w, b.px[i], b.py[i], b.pz[i]);
            r.setColumnAt(w, halfWidth, height, alpha, u);
            r.setFormAt(w, this.chLeanX[i] * leanT, this.chLeanZ[i] * leanT, b.seed[i], this.chTaper[i]);
            w++;
        }

        r.commit(w);
    }
}

/** The GLSL function, on the CPU: the sheet fade and the shader's tear have to agree. */
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
