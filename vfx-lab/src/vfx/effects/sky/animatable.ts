/**
 * What a preset transition is allowed to interpolate, and how.
 *
 * This is a table rather than a recursive walk over the config object, and the difference matters
 * in four specific ways:
 *
 *  - A walk would have to re-enumerate every nested object's keys on every frame of a transition.
 *    Per-frame allocation is exactly what this codebase does not do.
 *  - `[min, max]` pairs, keyframes of differing length and enum strings all need different
 *    handling, so a "generic" walker ends up being a type table anyway — just an implicit,
 *    untyped one.
 *  - Enum policy is per-field, not global. Snapping `cloudType` at the midpoint of a crossfade
 *    changes the shape of the deck at peak visibility; holding the *source* value until the end
 *    hides the change under the fade.
 *  - A field added to the schema later is either in this table or it is not, and
 *    `assertAnimatableCoverage` says which in dev.
 */

import { Color } from "three";
import { lerpHex } from "../../core/colorCache";
import type { SkyConfig } from "./config";

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;

export interface NumberField {
    readonly path: string;
    get(c: SkyConfig): number;
    set(c: SkyConfig, v: number): void;
}

export interface ColorField {
    readonly path: string;
    get(c: SkyConfig): string;
    set(c: SkyConfig, v: string): void;
}

/**
 * The one cast in this module, paid once per field at module load.
 *
 * The call sites stay fully checked: `NumericKeys` rejects a key that does not exist on the
 * section, and rejects one that exists but is not a number.
 */
function numField<S extends keyof SkyConfig>(sec: S, key: NumericKeys<SkyConfig[S]>): NumberField {
    type Section = Record<string, number>;
    return {
        path: `${String(sec)}.${key}`,
        get: (c) => (c[sec] as unknown as Section)[key],
        set: (c, v) => {
            (c[sec] as unknown as Section)[key] = v;
        },
    };
}

function colorField<S extends keyof SkyConfig>(sec: S, key: string): ColorField {
    type Section = Record<string, string>;
    return {
        path: `${String(sec)}.${key}`,
        get: (c) => (c[sec] as unknown as Section)[key],
        set: (c, v) => {
            (c[sec] as unknown as Section)[key] = v;
        },
    };
}

export const NUMBER_FIELDS: readonly NumberField[] = [
    // The dome's shape rides on `mesh.scale`, so easing it costs a matrix compose, not a rebuild.
    numField("projection", "radius"),
    numField("projection", "heightScale"),
    numField("projection", "yOffset"),

    numField("sky", "horizonHeight"),
    numField("sky", "gradientSoftness"),
    numField("sky", "atmosphereIntensity"),
    numField("sky", "hazeIntensity"),
    numField("sky", "skyBrightness"),
    numField("sky", "skySaturation"),
    numField("sky", "skyContrast"),
    numField("sky", "dayNightBlend"),
    numField("sky", "exposure"),

    numField("sun", "azimuth"),
    numField("sun", "elevation"),
    numField("sun", "size"),
    numField("sun", "intensity"),
    numField("sun", "glowIntensity"),
    numField("sun", "glowRadius"),
    numField("sun", "glowSoftness"),

    numField("moon", "azimuth"),
    numField("moon", "elevation"),
    numField("moon", "size"),
    numField("moon", "intensity"),
    numField("moon", "glowIntensity"),
    numField("moon", "phase"),
    numField("moon", "surfaceDetail"),

    numField("stars", "density"),
    numField("stars", "brightness"),
    numField("stars", "size"),
    numField("stars", "twinkleIntensity"),
    numField("stars", "twinkleSpeed"),
    numField("stars", "coverage"),

    numField("clouds", "coverage"),
    numField("clouds", "density"),
    numField("clouds", "scale"),
    numField("clouds", "detail"),
    numField("clouds", "softness"),
    numField("clouds", "opacity"),
    numField("clouds", "height"),
    numField("clouds", "speed"),
    numField("clouds", "direction"),
    numField("clouds", "windStrength"),
    numField("clouds", "variation"),
    numField("clouds", "lightInfluence"),

    numField("weather", "intensity"),
    numField("weather", "precipitationDensity"),
    numField("weather", "precipitationSpeed"),
    numField("weather", "windDirection"),
    numField("weather", "windStrength"),
    numField("weather", "visibility"),
    numField("weather", "particleSize"),
    numField("weather", "particleOpacity"),

    numField("atmosphere", "fogDensity"),
    numField("atmosphere", "fogNear"),
    numField("atmosphere", "fogFar"),
    numField("atmosphere", "horizonHaze"),
    numField("atmosphere", "tintStrength"),
    numField("atmosphere", "visibilityDistance"),

    numField("lighting", "ambientIntensity"),
    numField("lighting", "directionalIntensity"),
    numField("lighting", "transitionSpeed"),

    // Lightning sits one level deeper than the helper reaches, so these three are written out.
    {
        path: "weather.lightning.frequency",
        get: (c) => c.weather.lightning.frequency,
        set: (c, v) => {
            c.weather.lightning.frequency = v;
        },
    },
    {
        path: "weather.lightning.intensity",
        get: (c) => c.weather.lightning.intensity,
        set: (c, v) => {
            c.weather.lightning.intensity = v;
        },
    },
    {
        path: "weather.lightning.duration",
        get: (c) => c.weather.lightning.duration,
        set: (c, v) => {
            c.weather.lightning.duration = v;
        },
    },
];

export const COLOR_FIELDS: readonly ColorField[] = [
    colorField("sky", "zenithColor"),
    colorField("sky", "upperSkyColor"),
    colorField("sky", "horizonColor"),
    colorField("sky", "lowerHorizonColor"),
    colorField("sky", "nightZenithColor"),
    colorField("sky", "nightHorizonColor"),
    colorField("sun", "color"),
    colorField("moon", "color"),
    colorField("stars", "color"),
    colorField("clouds", "color"),
    colorField("clouds", "shadowColor"),
    colorField("weather", "particleColor"),
    colorField("atmosphere", "fogColor"),
    colorField("atmosphere", "tint"),
    colorField("lighting", "ambientColor"),
    colorField("lighting", "directionalColor"),
];

/**
 * Fields that cannot be interpolated and are handed over whole.
 *
 * Everything here changes the *shape* of what is drawn, so it switches at the very end of the
 * transition, under cover of the crossfade that is already most of the way to the target. The
 * exception is `quality`, which is a cost decision rather than a look and applies immediately.
 */
function applyDiscrete(out: SkyConfig, from: SkyConfig, to: SkyConfig, t: number): void {
    const src = t >= 0.999 ? to : from;
    out.projection.mode = src.projection.mode;
    out.projection.followCamera = src.projection.followCamera;
    out.clouds.type = src.clouds.type;
    out.weather.type = src.weather.type;
    out.atmosphere.fogType = src.atmosphere.fogType;

    out.sun.enabled = src.sun.enabled;
    out.moon.enabled = src.moon.enabled;
    out.stars.enabled = src.stars.enabled;
    out.clouds.enabled = src.clouds.enabled;
    out.weather.lightning.enabled = src.weather.lightning.enabled;
    out.weather.lightning.bolts = src.weather.lightning.bolts;
    out.atmosphere.fogEnabled = src.atmosphere.fogEnabled;
    out.atmosphere.fogFollowsSky = src.atmosphere.fogFollowsSky;
    out.weather.lightning.boltColor = src.weather.lightning.boltColor;

    // Cost, not look — take the target's straight away so a transition into STATIC does not keep
    // paying for ENHANCED all the way through. Dome tessellation is the same kind of decision,
    // and easing it would rebuild the mesh on every frame of the fade.
    out.quality = to.quality;
    out.projection.segments = to.projection.segments;
    out.id = t >= 0.5 ? to.id : from.id;
    out.version = to.version;

    // Lighting and clock ownership stays with the target: these are integration switches, not
    // visuals, and easing them produces a half-synced scene.
    out.lighting.syncLighting = to.lighting.syncLighting;
    out.lighting.syncFog = to.lighting.syncFog;
    out.lighting.syncBackground = to.lighting.syncBackground;
    out.lighting.driveFromSun = to.lighting.driveFromSun;
    out.time.driveCelestials = to.time.driveCelestials;
}

/** Reused by `lerpConfig` so interpolating ~75 fields a frame allocates nothing. */
const scratchColor = new Color();

/**
 * Writes the interpolated config into `out`.
 *
 * `out` may be the same object the renderer is reading from — every write is in place.
 */
export function lerpConfig(out: SkyConfig, from: SkyConfig, to: SkyConfig, t: number): void {
    for (let i = 0; i < NUMBER_FIELDS.length; i++) {
        const f = NUMBER_FIELDS[i];
        const a = f.get(from);
        f.set(out, a + (f.get(to) - a) * t);
    }
    for (let i = 0; i < COLOR_FIELDS.length; i++) {
        const f = COLOR_FIELDS[i];
        // Interpolating in linear space, because that is what `Color` holds once three's colour
        // management has converted the hex. The midpoint reads darker than the same gradient
        // drawn in sRGB would — that is correct for light, and is not a bug to be "fixed".
        lerpHex(scratchColor, f.get(from), f.get(to), t);
        f.set(out, `#${scratchColor.getHexString()}`);
    }
    applyDiscrete(out, from, to, t);
}

export type EasingName = "linear" | "smooth" | "ease-in" | "ease-out";

export function ease(name: EasingName, t: number): number {
    const x = t < 0 ? 0 : t > 1 ? 1 : t;
    switch (name) {
        case "smooth":
            return x * x * (3 - 2 * x);
        case "ease-in":
            return x * x;
        case "ease-out":
            return 1 - (1 - x) * (1 - x);
        default:
            return x;
    }
}

/**
 * Dev-only coverage check: every numeric and hex leaf in the config should be in a table above,
 * or it silently stops transitioning. Called once from `SkyVfx`'s constructor.
 */
export function assertAnimatableCoverage(config: SkyConfig): string[] {
    const covered = new Set<string>();
    for (const f of NUMBER_FIELDS) covered.add(f.path);
    for (const f of COLOR_FIELDS) covered.add(f.path);

    // Fields that are deliberately not animated, so the report stays signal rather than noise.
    const exempt = new Set([
        "version",
        "id",
        "quality",
        "projection.mode",
        "projection.followCamera",
        "projection.segments",
        "sun.enabled",
        "moon.enabled",
        "stars.enabled",
        "clouds.enabled",
        "clouds.type",
        "weather.type",
        "weather.lightning.enabled",
        "weather.lightning.bolts",
        "weather.lightning.boltColor",
        "atmosphere.fogEnabled",
        "atmosphere.fogType",
        "atmosphere.fogFollowsSky",
        "lighting.syncLighting",
        "lighting.syncFog",
        "lighting.syncBackground",
        "lighting.driveFromSun",
        "time.timeOfDay",
        "time.autoCycle",
        "time.cycleDuration",
        "time.timeScale",
        "time.paused",
        "time.driveCelestials",
        "transition.duration",
        "transition.easing",
        "transition.auto",
    ]);

    const missing: string[] = [];
    const walk = (obj: Record<string, unknown>, prefix: string): void => {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === "object" && !Array.isArray(value)) {
                walk(value as Record<string, unknown>, path);
            } else if (typeof value === "number" || (typeof value === "string" && value.startsWith("#"))) {
                if (!covered.has(path) && !exempt.has(path)) missing.push(path);
            }
        }
    };
    walk(config as unknown as Record<string, unknown>, "");
    return missing;
}
