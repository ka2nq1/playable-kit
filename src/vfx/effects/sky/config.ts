/**
 * Sky & atmosphere configuration.
 *
 * One schema serves the whole system: the gradient, the celestial bodies, the clouds, the weather,
 * the fog, the optional lighting sync and the clock. Presets are partial overrides merged over the
 * defaults below and then run through the same reader, so a built-in preset degrades exactly the
 * way a hand-edited JSON file does — a bad value warns and falls back rather than producing a
 * black screen.
 *
 * Every field is a plain number, boolean, hex string or enum. Nothing here is a three.js object
 * and nothing here is a function, which is what keeps a config portable between projects.
 */

import { ConfigIssues, bool, colorHex, num, oneOf, section } from "../../core/config";

/** Rendering cost tier. See `SKY_QUALITY_PRESETS` for what each one actually switches off. */
export const SKY_QUALITIES = ["static", "standard", "enhanced"] as const;
export type SkyQuality = (typeof SKY_QUALITIES)[number];

/** Six looks over one cloud code path — `CLOUD_TYPE_SHAPES` turns each into shaping constants. */
export const CLOUD_TYPES = ["wispy", "scattered", "puffy", "overcast", "storm", "volcanic"] as const;
export type CloudType = (typeof CLOUD_TYPES)[number];

/**
 * `storm` is not a particle kind — it is a coordinator that darkens the deck, drops sky
 * brightness, raises haze and switches lightning on. The particles it draws are rain.
 */
export const WEATHER_TYPES = ["clear", "rain", "snow", "storm", "dust", "ash"] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];

export const FOG_TYPES = ["linear", "exp2"] as const;
export type FogType = (typeof FOG_TYPES)[number];

export const TRANSITION_EASINGS = ["linear", "smooth", "ease-in", "ease-out"] as const;
export type TransitionEasing = (typeof TRANSITION_EASINGS)[number];

export interface SkyPaletteConfig {
    zenithColor: string;
    upperSkyColor: string;
    horizonColor: string;
    lowerHorizonColor: string;
    /** Where the palette collapses toward at night, blended in by `dayNightBlend`. */
    nightZenithColor: string;
    nightHorizonColor: string;
    /** Height of the horizon line in view-direction space, -1 (underfoot) .. 1 (overhead). */
    horizonHeight: number;
    gradientSoftness: number;
    /** How strongly the sky reddens toward the sun. 0 leaves the palette untouched. */
    atmosphereIntensity: number;
    hazeIntensity: number;
    skyBrightness: number;
    skySaturation: number;
    skyContrast: number;
    /**
     * How much sun elevation is allowed to override the authored palette.
     *
     * 0 freezes the colours as written — which is what the fantasy presets want, since an alien
     * sky has no business turning navy at "night". 1 hands the palette to the clock.
     */
    dayNightBlend: number;
    /**
     * Exposure into the sky's own tone curve.
     *
     * The host renderer here uses `NoToneMapping`, so anything above 1.0 clips to flat white and
     * a sun disc becomes a disc-shaped hole with a hard contour where the glow crosses 1. The sky
     * is the only thing in frame carrying values over 1, so it tone maps itself locally rather
     * than asking the host to change a global renderer setting it does not own.
     */
    exposure: number;
}

export interface SunConfig {
    enabled: boolean;
    /** Degrees, clockwise from -Z. Derived from `time.timeOfDay` when `time.driveCelestials`. */
    azimuth: number;
    /** Degrees above the horizon; negative is below it. */
    elevation: number;
    color: string;
    /** Angular radius of the disc, in degrees. The real sun is about 0.27. */
    size: number;
    intensity: number;
    glowIntensity: number;
    /** Angular radius of the glow lobe, in degrees. */
    glowRadius: number;
    glowSoftness: number;
}

export interface MoonConfig {
    enabled: boolean;
    azimuth: number;
    elevation: number;
    size: number;
    color: string;
    intensity: number;
    glowIntensity: number;
    /** 0 new, 0.5 full, 1 new again. Drives the offset of the shadow disc across the face. */
    phase: number;
    surfaceDetail: number;
}

export interface StarsConfig {
    enabled: boolean;
    /** Cells per cube face. More cells means more, smaller stars. */
    density: number;
    brightness: number;
    size: number;
    twinkleIntensity: number;
    twinkleSpeed: number;
    color: string;
    /** Fraction of cells that actually hold a star; the rest stay empty. */
    coverage: number;
}

export interface CloudsConfig {
    enabled: boolean;
    type: CloudType;
    coverage: number;
    density: number;
    scale: number;
    detail: number;
    softness: number;
    opacity: number;
    color: string;
    shadowColor: string;
    /** Metres above the camera. The deck is a plane the view ray is intersected against. */
    height: number;
    layerCount: number;
    speed: number;
    /** Degrees. The direction the deck drifts toward. */
    direction: number;
    windStrength: number;
    /** Strength of the coarse second coverage field that stops the deck reading as a tile. */
    variation: number;
    /** How much the sun is allowed to light the deck's near edge and shade its underside. */
    lightInfluence: number;
}

export interface LightningConfig {
    enabled: boolean;
    /** Average strikes per minute. */
    frequency: number;
    intensity: number;
    /** Seconds the flash envelope runs for. */
    duration: number;
    /** Draws a stylised bolt as well as the flash. The flash alone is the cheap option. */
    bolts: boolean;
    boltColor: string;
}

export interface WeatherConfig {
    type: WeatherType;
    intensity: number;
    precipitationDensity: number;
    precipitationSpeed: number;
    /** Degrees. Drives both the particle drift and, scaled, the cloud drift. */
    windDirection: number;
    windStrength: number;
    /** 0 is a whiteout, 1 is unobstructed. Tightens fog and dims the sky. */
    visibility: number;
    particleSize: number;
    particleOpacity: number;
    particleColor: string;
    lightning: LightningConfig;
}

export interface AtmosphereConfig {
    fogEnabled: boolean;
    fogType: FogType;
    fogColor: string;
    fogDensity: number;
    fogNear: number;
    fogFar: number;
    horizonHaze: number;
    tint: string;
    tintStrength: number;
    visibilityDistance: number;
    /**
     * Drives fog colour from the live horizon colour instead of `fogColor`.
     *
     * On by default because the alternative is a hard band at the horizon: geometry dissolving
     * into one grey while the sky above it is another reads as a shader bug, and gets debugged
     * as one.
     */
    fogFollowsSky: boolean;
}

export interface LightingConfig {
    syncLighting: boolean;
    /**
     * Writes scene fog.
     *
     * Defaults on. A host that set fog for a different mood — the lab's own volcanic set fogs to
     * near-black at 44 m — produces a dark band exactly at the horizon under a bright sky.
     */
    syncFog: boolean;
    syncBackground: boolean;
    ambientIntensity: number;
    ambientColor: string;
    directionalIntensity: number;
    directionalColor: string;
    /** Exponential approach rate, so the result is frame-rate independent. */
    transitionSpeed: number;
    /** Derives light colour and intensity from sun elevation rather than the values above. */
    driveFromSun: boolean;
}

export interface TimeConfig {
    /** Hours, 0..24. The single clock every subsystem reads. */
    timeOfDay: number;
    autoCycle: boolean;
    /** Real seconds for one full 24-hour cycle. */
    cycleDuration: number;
    timeScale: number;
    paused: boolean;
    /** Sun and moon angles follow `timeOfDay`. Off hands them back to the explicit angles. */
    driveCelestials: boolean;
}

export interface TransitionConfig {
    duration: number;
    easing: TransitionEasing;
    auto: boolean;
}

export interface SkyConfig {
    version: number;
    id: string;
    quality: SkyQuality;
    sky: SkyPaletteConfig;
    sun: SunConfig;
    moon: MoonConfig;
    stars: StarsConfig;
    clouds: CloudsConfig;
    weather: WeatherConfig;
    atmosphere: AtmosphereConfig;
    lighting: LightingConfig;
    time: TimeConfig;
    transition: TransitionConfig;
}

/** Bumped only when a field changes meaning; unknown future versions are rejected on import. */
export const SKY_CONFIG_VERSION = 1;

export function normalizeSkyConfig(raw: unknown): { config: SkyConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (raw !== undefined && (!raw || typeof raw !== "object")) {
        issues.warn("config", "not an object, using defaults throughout");
    }

    const version = num(root, "version", SKY_CONFIG_VERSION, "config", issues, 1, 1000);
    if (version > SKY_CONFIG_VERSION) {
        issues.warn("config.version", `${version} is newer than this build understands (${SKY_CONFIG_VERSION}); reading it anyway`);
    }

    const rawId = root.id;
    const id = typeof rawId === "string" && rawId.length > 0 ? rawId : "custom";

    return {
        config: {
            version: SKY_CONFIG_VERSION,
            id,
            quality: oneOf(root, "quality", SKY_QUALITIES, "standard", "config", issues),
            sky: readSky(section(root, "sky"), issues),
            sun: readSun(section(root, "sun"), issues),
            moon: readMoon(section(root, "moon"), issues),
            stars: readStars(section(root, "stars"), issues),
            clouds: readClouds(section(root, "clouds"), issues),
            weather: readWeather(section(root, "weather"), issues),
            atmosphere: readAtmosphere(section(root, "atmosphere"), issues),
            lighting: readLighting(section(root, "lighting"), issues),
            time: readTime(section(root, "time"), issues),
            transition: readTransition(section(root, "transition"), issues),
        },
        issues,
    };
}

type Raw = Record<string, unknown> | undefined;

function readSky(raw: Raw, issues: ConfigIssues): SkyPaletteConfig {
    const p = "sky";
    return {
        zenithColor: colorHex(raw, "zenithColor", "#2b6ad4", p, issues),
        upperSkyColor: colorHex(raw, "upperSkyColor", "#5a9ae8", p, issues),
        horizonColor: colorHex(raw, "horizonColor", "#b9d7f2", p, issues),
        lowerHorizonColor: colorHex(raw, "lowerHorizonColor", "#8d9aa6", p, issues),
        nightZenithColor: colorHex(raw, "nightZenithColor", "#05070f", p, issues),
        nightHorizonColor: colorHex(raw, "nightHorizonColor", "#121b2e", p, issues),
        horizonHeight: num(raw, "horizonHeight", 0, p, issues, -1, 1),
        gradientSoftness: num(raw, "gradientSoftness", 0.55, p, issues, 0.01, 2),
        atmosphereIntensity: num(raw, "atmosphereIntensity", 0.6, p, issues, 0, 3),
        hazeIntensity: num(raw, "hazeIntensity", 0.45, p, issues, 0, 3),
        skyBrightness: num(raw, "skyBrightness", 1, p, issues, 0, 4),
        skySaturation: num(raw, "skySaturation", 1, p, issues, 0, 3),
        skyContrast: num(raw, "skyContrast", 1, p, issues, 0.2, 3),
        dayNightBlend: num(raw, "dayNightBlend", 1, p, issues, 0, 1),
        exposure: num(raw, "exposure", 1, p, issues, 0.05, 8),
    };
}

function readSun(raw: Raw, issues: ConfigIssues): SunConfig {
    const p = "sun";
    return {
        enabled: bool(raw, "enabled", true, p, issues),
        azimuth: num(raw, "azimuth", 140, p, issues, -360, 360),
        elevation: num(raw, "elevation", 38, p, issues, -90, 90),
        color: colorHex(raw, "color", "#fff4de", p, issues),
        size: num(raw, "size", 1.4, p, issues, 0.05, 30),
        intensity: num(raw, "intensity", 1.6, p, issues, 0, 20),
        glowIntensity: num(raw, "glowIntensity", 0.5, p, issues, 0, 10),
        glowRadius: num(raw, "glowRadius", 16, p, issues, 0.5, 90),
        glowSoftness: num(raw, "glowSoftness", 0.7, p, issues, 0.01, 1),
    };
}

function readMoon(raw: Raw, issues: ConfigIssues): MoonConfig {
    const p = "moon";
    return {
        enabled: bool(raw, "enabled", false, p, issues),
        azimuth: num(raw, "azimuth", 320, p, issues, -360, 360),
        elevation: num(raw, "elevation", 45, p, issues, -90, 90),
        size: num(raw, "size", 2.2, p, issues, 0.05, 30),
        color: colorHex(raw, "color", "#dfe7f5", p, issues),
        intensity: num(raw, "intensity", 1, p, issues, 0, 10),
        glowIntensity: num(raw, "glowIntensity", 0.35, p, issues, 0, 10),
        phase: num(raw, "phase", 0.5, p, issues, 0, 1),
        surfaceDetail: num(raw, "surfaceDetail", 0.35, p, issues, 0, 1),
    };
}

function readStars(raw: Raw, issues: ConfigIssues): StarsConfig {
    const p = "stars";
    return {
        enabled: bool(raw, "enabled", false, p, issues),
        density: num(raw, "density", 36, p, issues, 2, 200),
        brightness: num(raw, "brightness", 1, p, issues, 0, 6),
        size: num(raw, "size", 0.5, p, issues, 0.05, 3),
        twinkleIntensity: num(raw, "twinkleIntensity", 0.4, p, issues, 0, 1),
        twinkleSpeed: num(raw, "twinkleSpeed", 1, p, issues, 0, 6),
        color: colorHex(raw, "color", "#eef3ff", p, issues),
        coverage: num(raw, "coverage", 0.35, p, issues, 0.01, 1),
    };
}

function readClouds(raw: Raw, issues: ConfigIssues): CloudsConfig {
    const p = "clouds";
    return {
        enabled: bool(raw, "enabled", true, p, issues),
        type: oneOf(raw, "type", CLOUD_TYPES, "scattered", p, issues),
        coverage: num(raw, "coverage", 0.45, p, issues, 0, 1),
        density: num(raw, "density", 1, p, issues, 0, 3),
        scale: num(raw, "scale", 1, p, issues, 0.05, 10),
        detail: num(raw, "detail", 1, p, issues, 0, 2),
        softness: num(raw, "softness", 0.35, p, issues, 0.01, 1),
        opacity: num(raw, "opacity", 1, p, issues, 0, 1),
        color: colorHex(raw, "color", "#ffffff", p, issues),
        shadowColor: colorHex(raw, "shadowColor", "#8e9bb0", p, issues),
        height: num(raw, "height", 900, p, issues, 20, 20000),
        layerCount: num(raw, "layerCount", 2, p, issues, 1, 3),
        speed: num(raw, "speed", 1, p, issues, 0, 10),
        direction: num(raw, "direction", 45, p, issues, -360, 360),
        windStrength: num(raw, "windStrength", 1, p, issues, 0, 5),
        variation: num(raw, "variation", 0.5, p, issues, 0, 1),
        lightInfluence: num(raw, "lightInfluence", 0.6, p, issues, 0, 2),
    };
}

function readLightning(raw: Raw, issues: ConfigIssues): LightningConfig {
    const p = "weather.lightning";
    return {
        enabled: bool(raw, "enabled", false, p, issues),
        frequency: num(raw, "frequency", 8, p, issues, 0, 120),
        intensity: num(raw, "intensity", 1, p, issues, 0, 5),
        duration: num(raw, "duration", 0.35, p, issues, 0.05, 3),
        bolts: bool(raw, "bolts", false, p, issues),
        boltColor: colorHex(raw, "boltColor", "#dce6ff", p, issues),
    };
}

function readWeather(raw: Raw, issues: ConfigIssues): WeatherConfig {
    const p = "weather";
    return {
        type: oneOf(raw, "type", WEATHER_TYPES, "clear", p, issues),
        intensity: num(raw, "intensity", 0.6, p, issues, 0, 1),
        precipitationDensity: num(raw, "precipitationDensity", 1, p, issues, 0, 4),
        precipitationSpeed: num(raw, "precipitationSpeed", 1, p, issues, 0, 5),
        windDirection: num(raw, "windDirection", 45, p, issues, -360, 360),
        windStrength: num(raw, "windStrength", 0.4, p, issues, 0, 5),
        visibility: num(raw, "visibility", 1, p, issues, 0.02, 1),
        particleSize: num(raw, "particleSize", 1, p, issues, 0.05, 6),
        particleOpacity: num(raw, "particleOpacity", 1, p, issues, 0, 1),
        particleColor: colorHex(raw, "particleColor", "#cfe2f5", p, issues),
        lightning: readLightning(section(raw, "lightning"), issues),
    };
}

function readAtmosphere(raw: Raw, issues: ConfigIssues): AtmosphereConfig {
    const p = "atmosphere";
    return {
        fogEnabled: bool(raw, "fogEnabled", true, p, issues),
        fogType: oneOf(raw, "fogType", FOG_TYPES, "linear", p, issues),
        fogColor: colorHex(raw, "fogColor", "#b9d7f2", p, issues),
        fogDensity: num(raw, "fogDensity", 0.012, p, issues, 0, 1),
        fogNear: num(raw, "fogNear", 14, p, issues, 0, 2000),
        fogFar: num(raw, "fogFar", 120, p, issues, 0.1, 5000),
        horizonHaze: num(raw, "horizonHaze", 0.5, p, issues, 0, 2),
        tint: colorHex(raw, "tint", "#ffffff", p, issues),
        tintStrength: num(raw, "tintStrength", 0, p, issues, 0, 1),
        visibilityDistance: num(raw, "visibilityDistance", 160, p, issues, 1, 5000),
        fogFollowsSky: bool(raw, "fogFollowsSky", true, p, issues),
    };
}

function readLighting(raw: Raw, issues: ConfigIssues): LightingConfig {
    const p = "lighting";
    return {
        syncLighting: bool(raw, "syncLighting", true, p, issues),
        syncFog: bool(raw, "syncFog", true, p, issues),
        syncBackground: bool(raw, "syncBackground", false, p, issues),
        ambientIntensity: num(raw, "ambientIntensity", 0.9, p, issues, 0, 10),
        ambientColor: colorHex(raw, "ambientColor", "#9fb6d4", p, issues),
        directionalIntensity: num(raw, "directionalIntensity", 2.2, p, issues, 0, 20),
        directionalColor: colorHex(raw, "directionalColor", "#fff2d9", p, issues),
        transitionSpeed: num(raw, "transitionSpeed", 4, p, issues, 0.1, 60),
        driveFromSun: bool(raw, "driveFromSun", true, p, issues),
    };
}

function readTime(raw: Raw, issues: ConfigIssues): TimeConfig {
    const p = "time";
    return {
        timeOfDay: num(raw, "timeOfDay", 12, p, issues, 0, 24),
        autoCycle: bool(raw, "autoCycle", false, p, issues),
        cycleDuration: num(raw, "cycleDuration", 120, p, issues, 1, 100000),
        timeScale: num(raw, "timeScale", 1, p, issues, 0, 100),
        paused: bool(raw, "paused", false, p, issues),
        driveCelestials: bool(raw, "driveCelestials", true, p, issues),
    };
}

function readTransition(raw: Raw, issues: ConfigIssues): TransitionConfig {
    const p = "transition";
    return {
        duration: num(raw, "duration", 2.5, p, issues, 0, 120),
        easing: oneOf(raw, "easing", TRANSITION_EASINGS, "smooth", p, issues),
        auto: bool(raw, "auto", false, p, issues),
    };
}
