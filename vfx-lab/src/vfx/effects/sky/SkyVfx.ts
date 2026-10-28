/**
 * The sky and atmosphere system.
 *
 * Three drawn things (the dome, the precipitation field, the occasional bolt) and three that only
 * write numbers (the clock, the preset transition, the environment sync). Everything reads one
 * config object and one clock, which is what keeps a 90-field system coherent: there is no second
 * timer anywhere, and nothing caches a value the config can change underneath it.
 *
 * Integration is the same three lines as every other effect here:
 *
 *     const sky = new SkyVfx(rawConfig, { scene, directionalLight, ambientLight });
 *     scene.add(sky.object3d);
 *     sky.update(deltaSeconds);
 *
 * The options are all optional. Pass none and the sky draws and touches nothing else in the
 * scene; pass lights and it can drive them, reversibly.
 */

import { Group, Vector3, type Object3D } from "three";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { assertAnimatableCoverage, ease, lerpConfig, type EasingName } from "./animatable";
import { normalizeSkyConfig, type SkyConfig, type SkyQuality, type WeatherType } from "./config";
import { EnvironmentSync, nightFactor, type SkyLightTargets } from "./EnvironmentSync";
import { Lightning } from "./Lightning";
import { PrecipitationField } from "./PrecipitationField";
import { buildPresetConfig, exportSkyConfig, findUnknownPresetKeys, isSkyPreset, SKY_PRESET_IDS } from "./presets";
import { SKY_QUALITY_PRESETS } from "./quality";
import { SkyDome } from "./SkyDome";

const DEG2RAD = Math.PI / 180;

/**
 * Elevation the sun reaches at noon.
 *
 * A real one depends on latitude and season. This is a single number because the thing being
 * authored is a look, not an ephemeris — and one number is a slider a designer can reason about.
 */
const MAX_SUN_ELEVATION = 62;

export interface SkyVfxOptions extends SkyLightTargets {
    seed?: number;
}

export interface SkyTransitionOptions {
    duration?: number;
    easing?: EasingName;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}

/** Azimuth measured clockwise from -Z, elevation above the horizon; both in degrees. */
function directionFrom(azimuth: number, elevation: number, out: Vector3): Vector3 {
    const el = elevation * DEG2RAD;
    const az = azimuth * DEG2RAD;
    const c = Math.cos(el);
    return out.set(Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c).normalize();
}

export class SkyVfx implements VfxEffect {
    readonly id = "sky";
    readonly object3d: Group;

    /** Live, mutable and validated. Edit it in place, the next frame picks the change up. */
    readonly config: SkyConfig;

    /** Public so a host can switch parts off without taking the system apart. */
    readonly dome: SkyDome;
    readonly precipitation: PrecipitationField;
    readonly lightning: Lightning;

    private readonly sync: EnvironmentSync;

    private running = true;
    private visible = true;
    private elapsed = 0;

    private presetId: string | null = null;

    // Transition state. `from` and `to` are whole configs; `config` is written in place between
    // them, so the renderer never sees a half-updated object.
    private transitionFrom: SkyConfig | null = null;
    private transitionTo: SkyConfig | null = null;
    private transitionTime = 0;
    private transitionDuration = 0;
    private transitionEasing: EasingName = "smooth";

    // Per-frame scratch; `update` allocates nothing.
    private readonly sunDir = new Vector3(0, 1, 0);
    private readonly moonDir = new Vector3(0, -1, 0);

    constructor(rawConfig?: unknown, options: SkyVfxOptions = {}) {
        const { config, issues } = normalizeSkyConfig(rawConfig);
        issues.report("SkyVfx");
        this.config = config;

        const seed = options.seed ?? 1;
        this.dome = new SkyDome(config);
        this.precipitation = new PrecipitationField(seed * 31 + 7777);
        this.lightning = new Lightning(seed * 17 + 4242);

        this.object3d = new Group();
        this.object3d.name = "vfx:sky";
        this.object3d.add(this.dome.mesh, this.precipitation.mesh, this.lightning.object3d);

        this.sync = new EnvironmentSync(options);

        {
            // Two cheap structural checks, run once at construction. They exist because the
            // validator deliberately ignores unknown *keys* (that is how `$about` survives), so a
            // misspelled section in a preset does nothing at all, with no warning, forever — and
            // there is no test runner here to catch it instead. They are silent when correct, and
            // this is deliberately not gated on a bundler-specific DEV flag: `src/vfx` must build
            // under any bundler, not just Vite.
            const unknown = findUnknownPresetKeys();
            if (unknown.length) {
                console.warn(`[SkyVfx] preset keys that do not exist in the schema (silently ignored):\n  ${unknown.join("\n  ")}`);
            }
            const uncovered = assertAnimatableCoverage(config);
            if (uncovered.length) {
                console.warn(`[SkyVfx] config fields missing from the transition table (they will snap, not blend):\n  ${uncovered.join("\n  ")}`);
            }
        }

        this.refreshDerived();
    }

    // ---- VfxEffect ---------------------------------------------------------------------------

    get enabled(): boolean {
        return this.visible;
    }

    set enabled(v: boolean) {
        if (this.visible === v) return;
        this.visible = v;
        this.object3d.visible = v;
        // A switched-off sky must stop driving the host's fog and lights, or the scene is left
        // lit by something that is no longer on screen.
        if (!v) this.sync.restoreAll();
    }

    /**
     * Weather particles currently drawn, plus any live bolt segments.
     *
     * The dome is not counted: it is always exactly one draw call, so including it would only
     * make the number harder to read.
     */
    get activeCount(): number {
        return this.precipitation.activeCount + this.lightning.segmentCount;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Resumes animation. The sky starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the sky where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /**
     * Fires a lightning strike now.
     *
     * The sky has nothing to emit, so `burst` is wired to the one event it does have. It fires
     * whether or not the frequency timer was ready, but still respects `lightning.enabled`.
     */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {
        if (this.config.weather.lightning.enabled) this.lightning.strike(this.config);
    }

    update(dt: number): void {
        if (!this.visible) return;

        // Clamped like every other effect here: a backgrounded tab returns with a delta measured
        // in seconds and an unclamped clock would jump the sky to a different time of day.
        const step = this.running ? Math.min(Math.max(dt, 0), 0.1) : 0;
        const animated = SKY_QUALITY_PRESETS[this.config.quality].animated;

        if (step > 0) {
            this.elapsed += step;
            this.advanceTransition(step);
            if (animated) this.advanceClock(step);
        }

        this.refreshDerived();

        const elevation = this.config.sun.elevation;
        const nightRaw = nightFactor(this.config, elevation);
        const night = nightRaw * this.config.sky.dayNightBlend;
        const lowSun = 1 - smoothstep(0, 20, Math.abs(elevation));

        this.lightning.update(step, this.config);
        const flash = this.lightning.flash;

        // Feature-set changes (quality, clouds off, stars off) are the only thing that recompiles,
        // and this early-returns when none of them moved.
        this.dome.syncFeatures(this.config);
        if (animated && step > 0) this.dome.advanceWind(step, this.config);
        this.dome.apply({
            config: this.config,
            sunDir: this.sunDir,
            moonDir: this.moonDir,
            night,
            nightRaw,
            lowSun,
            flash,
            elapsed: animated ? this.elapsed : 0,
        });

        this.precipitation.apply(this.config, SKY_QUALITY_PRESETS[this.config.quality].particleScale);
        if (animated) this.precipitation.advance(step, this.config);

        if (this.sync.hasTargets) {
            this.sync.update(step, this.config, this.sunDir, elevation, flash);
        }
    }

    reset(): void {
        this.elapsed = 0;
        this.transitionFrom = null;
        this.transitionTo = null;
        this.precipitation.reset();
        this.lightning.reset();
        this.refreshDerived();
    }

    dispose(): void {
        this.sync.dispose();
        this.dome.dispose();
        this.precipitation.dispose();
        this.lightning.dispose();
        this.object3d.clear();
    }

    // ---- Configuration -----------------------------------------------------------------------

    /**
     * Kept for symmetry with the other shader effects.
     *
     * `update` already re-reads the whole config every frame — the sky changes continuously
     * anyway once the clock is running, so there is nothing an explicit apply could cache. This
     * exists so a caller that edits the config and wants the change *now*, before the next frame,
     * has a way to say so.
     */
    applyConfig(): void {
        this.dome.syncFeatures(this.config);
        this.refreshDerived();
    }

    get presetNames(): readonly string[] {
        return SKY_PRESET_IDS;
    }

    /** The preset currently loaded, or null once the config has diverged by hand. */
    get currentPreset(): string | null {
        return this.presetId;
    }

    /** Replaces the config with a preset's, immediately. Returns false for an unknown id. */
    loadPreset(id: string): boolean {
        const built = buildPresetConfig(id);
        if (!built) {
            console.warn(`[SkyVfx] unknown preset "${id}"`);
            return false;
        }
        built.issues.report(`SkyVfx preset "${id}"`);
        this.adopt(built.config);
        this.presetId = id;
        this.transitionFrom = null;
        this.transitionTo = null;
        this.refreshDerived();
        return true;
    }

    /**
     * Eases from the current look to a preset.
     *
     * Colours and intensities interpolate; discrete settings — weather type, cloud type, fog type
     * — hand over at the end, under cover of the fade that is already most of the way there.
     * Advanced by `dt`, so the result does not depend on frame rate.
     */
    transitionToPreset(id: string, options: SkyTransitionOptions = {}): boolean {
        const built = buildPresetConfig(id);
        if (!built) {
            console.warn(`[SkyVfx] unknown preset "${id}"`);
            return false;
        }
        built.issues.report(`SkyVfx preset "${id}"`);

        const duration = options.duration ?? this.config.transition.duration;
        if (duration <= 0) return this.loadPreset(id);

        this.transitionFrom = exportSkyConfig(this.config);
        this.transitionTo = built.config;
        this.transitionTime = 0;
        this.transitionDuration = duration;
        this.transitionEasing = options.easing ?? this.config.transition.easing;
        this.presetId = id;
        return true;
    }

    get transitioning(): boolean {
        return this.transitionFrom !== null;
    }

    /** 0..1 through the current transition; 1 when none is running. */
    get transitionProgress(): number {
        if (!this.transitionFrom) return 1;
        return clamp01(this.transitionTime / Math.max(this.transitionDuration, 1e-4));
    }

    setQuality(quality: SkyQuality): void {
        if (this.config.quality === quality) return;
        this.config.quality = quality;
        this.dome.syncFeatures(this.config);
    }

    setWeather(type: WeatherType, intensity?: number): void {
        this.config.weather.type = type;
        if (intensity !== undefined) this.config.weather.intensity = clamp01(intensity);
    }

    /** Hours, 0..24. Wraps rather than clamping, so 25 is 1am and -1 is 11pm. */
    setTimeOfDay(hours: number): void {
        this.config.time.timeOfDay = ((hours % 24) + 24) % 24;
        this.refreshDerived();
    }

    get timeOfDay(): number {
        return this.config.time.timeOfDay;
    }

    startCycle(durationSeconds?: number): void {
        if (durationSeconds !== undefined) this.config.time.cycleDuration = Math.max(durationSeconds, 1);
        this.config.time.autoCycle = true;
        this.config.time.paused = false;
    }

    stopCycle(): void {
        this.config.time.autoCycle = false;
    }

    /** A plain, portable copy. No three.js objects, no runtime state. */
    exportConfig(): SkyConfig {
        return exportSkyConfig(this.config);
    }

    /** Overwrites the config in place from validated data — the import half of the pair above. */
    adopt(next: SkyConfig): void {
        copyInto(this.config, next);
        if (!isSkyPreset(this.config.id)) this.presetId = null;
        this.dome.syncFeatures(this.config);
    }

    asObject3D(): Object3D {
        return this.object3d;
    }

    // ---- Internals ---------------------------------------------------------------------------

    private advanceClock(step: number): void {
        const t = this.config.time;
        if (!t.autoCycle || t.paused) return;
        const hours = (step / Math.max(t.cycleDuration, 1)) * 24 * t.timeScale;
        t.timeOfDay = (((t.timeOfDay + hours) % 24) + 24) % 24;
    }

    private advanceTransition(step: number): void {
        const from = this.transitionFrom;
        const to = this.transitionTo;
        if (!from || !to) return;

        this.transitionTime += step;
        const raw = clamp01(this.transitionTime / this.transitionDuration);
        const t = ease(this.transitionEasing, raw);

        lerpConfig(this.config, from, to, t);

        // The clock is interpolated here rather than in the table because it is circular: a
        // straight lerp from 23:00 to 02:00 runs backwards through the entire day.
        let delta = to.time.timeOfDay - from.time.timeOfDay;
        if (delta > 12) delta -= 24;
        if (delta < -12) delta += 24;
        this.config.time.timeOfDay = ((from.time.timeOfDay + delta * t) % 24 + 24) % 24;

        if (raw >= 1) {
            // Land exactly on the target rather than within a float of it.
            copyInto(this.config, to);
            this.transitionFrom = null;
            this.transitionTo = null;
        } else {
            // Clock *settings* are integration choices, not a look — take them immediately so a
            // preset that wants the cycle running does not wait for the fade to finish.
            this.config.time.autoCycle = to.time.autoCycle;
            this.config.time.cycleDuration = to.time.cycleDuration;
            this.config.time.timeScale = to.time.timeScale;
            this.config.time.paused = to.time.paused;
        }
    }

    /**
     * Recomputes the sun and moon directions.
     *
     * When the clock owns the celestials, the derived angles are written *back into the config*.
     * That keeps an export coherent with what is on screen, and makes the panel's azimuth and
     * elevation sliders read as live values rather than as settings that silently do nothing.
     */
    private refreshDerived(): void {
        const t = this.config.time;
        if (t.driveCelestials) {
            const hourAngle = ((t.timeOfDay - 12) / 24) * Math.PI * 2;
            const elevation = MAX_SUN_ELEVATION * Math.cos(hourAngle);
            const azimuth = ((((t.timeOfDay - 6) / 12) * 180 + 90) % 360 + 360) % 360;
            this.config.sun.elevation = elevation;
            this.config.sun.azimuth = azimuth;
            // The moon sits opposite the sun, which is what puts it up at night. Its phase stays
            // an independent control — phase and position are not linked here on purpose.
            this.config.moon.elevation = -elevation;
            this.config.moon.azimuth = (azimuth + 180) % 360;
        }
        directionFrom(this.config.sun.azimuth, this.config.sun.elevation, this.sunDir);
        directionFrom(this.config.moon.azimuth, this.config.moon.elevation, this.moonDir);
    }
}

/**
 * Deep copy between two configs of the same shape, in place.
 *
 * In place because the lab panel, the console and any host code hold a reference to
 * `sky.config` — replacing the object would leave every one of them writing to a config nothing
 * reads any more.
 */
function copyInto(dst: SkyConfig, src: SkyConfig): void {
    const a = dst as unknown as Record<string, unknown>;
    const b = src as unknown as Record<string, unknown>;
    for (const key of Object.keys(b)) {
        const value = b[key];
        if (value && typeof value === "object" && !Array.isArray(value)) {
            copyInto(a[key] as SkyConfig, value as SkyConfig);
        } else {
            a[key] = value;
        }
    }
}
