/**
 * Typed, validated view of `snowstorm-vfx.json`.
 *
 * Nested rather than flat, following the sky config: the storm is four subsystems sharing one
 * volume, and grouping the keys is what lets `SnowstormVfx` hand each one its own section instead
 * of passing the whole object around. Everything comes out finite and clamped — a hand-edited
 * `density` of `"0.9"` degrades to the default plus a precise warning, never to a NaN that
 * silently collapses every puff to the origin.
 *
 * The shape of this object is also the export format: the lab's "Copy JSON" writes the normalised
 * config straight back out, so it has to round-trip through this reader unchanged.
 */

import { bool, colorHex, ConfigIssues, int, num, oneOf, section, vec3 } from "../../core/config";

export const SNOWSTORM_QUALITIES = ["low", "medium", "high"] as const;
export type SnowstormQuality = (typeof SNOWSTORM_QUALITIES)[number];

export const MOVEMENT_MODES = ["loop", "pingpong", "once"] as const;
export type MovementMode = (typeof MOVEMENT_MODES)[number];

export const LIGHTNING_MODES = ["flash", "bolt"] as const;
/**
 * `flash` is the diffuse illumination alone — the bolt is taken to be buried in snow too thick to
 * see through, which is what a real snow thunderstorm usually looks like. `bolt` adds the visible
 * branching channel on top of the same flash.
 */
export type LightningMode = (typeof LIGHTNING_MODES)[number];

export interface SnowstormAppearance {
    /** Master alpha over everything the shaders work out per pixel. */
    opacity: number;
    /**
     * How much of the volume is storm, 0–1. It moves the cut in the silhouette field, so raising
     * it grows the formation outward from where it already is rather than fading a blob up.
     */
    density: number;
    /** Width of the soft band at the silhouette, in units of the normalised radius. */
    edgeSoftness: number;
    /** Feature size of the silhouette noise. Higher is lumpier; roughly lobes per storm radius. */
    shapeScale: number;
    /** How far that noise displaces the boundary. 0 is a clean ellipsoid; 0.5 is badly torn. */
    shapeWarp: number;
    /** How fast the silhouette re-forms, in field units per second. Slow — this is weather. */
    shapeDrift: number;
    /** Camera-facing puffs the body is built from, before the quality scale. The fill-rate knob. */
    puffCount: number;
    /**
     * Puff radius as a fraction of the storm's smallest half-axis.
     *
     * This and `puffCount` multiply into the overdraw, and because the renderer compensates the
     * radius against the count, their product is also what the opacity comes from. The default
     * puts about eleven puffs over any point in the core, which composites to ~0.99 — raising it
     * buys no more opacity and costs fill rate linearly.
     */
    puffSize: number;
    /** Amplitude of the per-puff wander inside the volume, as a fraction of the half-size. */
    turbulence: number;
    /** How fast puffs counter-rotate. This is what reads as the storm churning rather than drifting. */
    swirl: number;
    /** Feature size of the per-pixel noise inside a puff. Higher ragged the puff into wisps. */
    detail: number;
    /** Lit snow — the brightest tone, on the side the light comes from. */
    snowColor: string;
    /** The body tone: pale blue-grey cold fog. */
    fogColor: string;
    /** Deep storm grey, used in the shadowed core. Keep it desaturated or the mass goes blue. */
    shadowColor: string;
    /** Direction the light arrives from, in degrees around the storm (0 = +X) and above horizon. */
    lightAzimuth: number;
    lightElevation: number;
    /** How dark the unlit core goes relative to the lit face. 0 is a flat sheet with no form. */
    coreShadow: number;
    /** How much the per-pixel noise pushes brightness around. Local variation, not global tint. */
    contrast: number;
}

export interface SnowstormMovement {
    enabled: boolean;
    mode: MovementMode;
    /** Offset from the storm's home position to the far end of its path, in world units. */
    travel: [number, number, number];
    /** World units per second along that path. */
    speed: number;
    /** 0–1 slow sinusoidal modulation of the speed, so the drift never reads as a conveyor. */
    speedVariation: number;
    /** Amplitude of the vertical bob, in world units, independent of the path. */
    verticalDrift: number;
    /** Seconds for one bob. */
    verticalPeriod: number;
}

export interface SnowstormSnow {
    /** 0–1 over the streak budget. 0 leaves the fog with no visible flakes in it. */
    intensity: number;
    /** Local units per second the streaks travel. This is the apparent wind inside the storm. */
    windSpeed: number;
    /** Degrees the wind blows toward, measured in the storm's local XZ plane. */
    windAngle: number;
    /** How steeply the snow falls, in degrees below horizontal. */
    windPitch: number;
    /** 0–1 how far individual streaks deviate from the shared wind. This is the chaos knob. */
    spread: number;
    /** Peak extra wind during a gust, as a fraction of `windSpeed`. */
    gustStrength: number;
    /** Gusts per minute, roughly — they are built from beating sines, so they never repeat exactly. */
    gustFrequency: number;
    /** Streak width in local units before the screen-space floor applies. */
    size: number;
    /** How many times its own width a streak is stretched along its velocity. */
    stretch: number;
    color: string;
    opacity: number;
}

export interface SnowstormLightning {
    enabled: boolean;
    mode: LightningMode;
    /** Strikes per minute on average. Scattered around the mean, never on a metronome. */
    frequency: number;
    /** Peak brightness added to the storm at the flash centre. */
    intensity: number;
    /** Seconds from the first pulse to full darkness. */
    duration: number;
    color: string;
    /** How far the illumination reaches, as a fraction of the storm's largest half-axis. */
    radius: number;
    /** 0–1 over the number of forks on a visible bolt. Ignored in `flash` mode. */
    branching: number;
}

export interface SnowstormConfig {
    enabled: boolean;
    quality: SnowstormQuality;
    /** Where the storm sits when it is at the start of its path, in the parent's space. */
    position: [number, number, number];
    /** Yaw in degrees. Rotates the volume and, with it, the wind axis. */
    yaw: number;
    /** Uniform multiplier over the whole volume, so one storm can be re-used at two distances. */
    scale: number;
    size: { width: number; height: number; depth: number };
    appearance: SnowstormAppearance;
    movement: SnowstormMovement;
    snow: SnowstormSnow;
    lightning: SnowstormLightning;
}

/** Puff instances allocated once. `puffCount` and quality only move `instanceCount`. */
export const PUFF_CAPACITY = 512;
/** Snow streak instances allocated once. Same deal — `intensity` is a draw-call argument. */
export const STREAK_CAPACITY = 2400;

export interface SnowstormQualityPreset {
    /** Multiplies the configured puff count. Overdraw is this effect's entire cost. */
    puffScale: number;
    /** Multiplies the streak budget. */
    snowScale: number;
    /** Octaves of per-pixel noise inside a puff. The fragment-shader cost. */
    bodyOctaves: number;
    /** Octaves in the silhouette field. Two gives sub-lobes; one is a smooth blob. */
    maskOctaves: number;
}

/**
 * The only place rendering cost is decided.
 *
 * Both scales are instance counts, so switching between `low` and `high` is two `instanceCount`
 * writes; only the octave counts are defines, so a quality change costs at most one shader
 * compile and never a reallocation. Puff radius is compensated against `puffScale` in
 * `StormBody`, so a cheaper preset is a coarser storm of the same size and density, not a
 * thinner one.
 */
export const SNOWSTORM_QUALITY_PRESETS: Record<SnowstormQuality, SnowstormQualityPreset> = {
    low: { puffScale: 0.4, snowScale: 0.35, bodyOctaves: 2, maskOctaves: 1 },
    medium: { puffScale: 0.7, snowScale: 0.7, bodyOctaves: 3, maskOctaves: 2 },
    high: { puffScale: 1, snowScale: 1, bodyOctaves: 4, maskOctaves: 2 },
};

export function normalizeSnowstormConfig(raw: unknown): { config: SnowstormConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "snowstorm";
    const rawSize = section(root, "size");
    const rawLook = section(root, "appearance");
    const rawMove = section(root, "movement");
    const rawSnow = section(root, "snow");
    const rawBolt = section(root, "lightning");

    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            quality: oneOf(root, "quality", SNOWSTORM_QUALITIES, "medium", p, issues),
            position: vec3(root, "position", [0, 9, -46], p, issues),
            yaw: num(root, "yaw", 0, p, issues, -360, 360),
            scale: num(root, "scale", 1, p, issues, 0.05, 20),
            size: {
                width: num(rawSize, "width", 34, `${p}.size`, issues, 0.5, 2000),
                height: num(rawSize, "height", 16, `${p}.size`, issues, 0.5, 2000),
                depth: num(rawSize, "depth", 14, `${p}.size`, issues, 0.5, 2000),
            },
            appearance: {
                opacity: num(rawLook, "opacity", 1, `${p}.appearance`, issues, 0, 1),
                density: num(rawLook, "density", 0.62, `${p}.appearance`, issues, 0, 1),
                edgeSoftness: num(rawLook, "edgeSoftness", 0.42, `${p}.appearance`, issues, 0.02, 1.5),
                shapeScale: num(rawLook, "shapeScale", 1.35, `${p}.appearance`, issues, 0.1, 8),
                shapeWarp: num(rawLook, "shapeWarp", 0.3, `${p}.appearance`, issues, 0, 1),
                shapeDrift: num(rawLook, "shapeDrift", 0.045, `${p}.appearance`, issues, 0, 2),
                puffCount: int(rawLook, "puffCount", 300, `${p}.appearance`, issues, 0, PUFF_CAPACITY),
                puffSize: num(rawLook, "puffSize", 0.45, `${p}.appearance`, issues, 0.05, 3),
                turbulence: num(rawLook, "turbulence", 0.55, `${p}.appearance`, issues, 0, 2),
                swirl: num(rawLook, "swirl", 0.22, `${p}.appearance`, issues, 0, 3),
                detail: num(rawLook, "detail", 1.7, `${p}.appearance`, issues, 0.1, 12),
                snowColor: colorHex(rawLook, "snowColor", "#eef3f8", `${p}.appearance`, issues),
                fogColor: colorHex(rawLook, "fogColor", "#a8b6c4", `${p}.appearance`, issues),
                shadowColor: colorHex(rawLook, "shadowColor", "#4d5663", `${p}.appearance`, issues),
                lightAzimuth: num(rawLook, "lightAzimuth", 125, `${p}.appearance`, issues, -360, 360),
                lightElevation: num(rawLook, "lightElevation", 38, `${p}.appearance`, issues, -90, 90),
                coreShadow: num(rawLook, "coreShadow", 0.45, `${p}.appearance`, issues, 0, 1),
                contrast: num(rawLook, "contrast", 0.35, `${p}.appearance`, issues, 0, 1),
            },
            movement: {
                enabled: bool(rawMove, "enabled", true, `${p}.movement`, issues),
                mode: oneOf(rawMove, "mode", MOVEMENT_MODES, "pingpong", `${p}.movement`, issues),
                travel: vec3(rawMove, "travel", [34, 0, 0], `${p}.movement`, issues),
                speed: num(rawMove, "speed", 0.55, `${p}.movement`, issues, 0, 50),
                speedVariation: num(rawMove, "speedVariation", 0.3, `${p}.movement`, issues, 0, 1),
                verticalDrift: num(rawMove, "verticalDrift", 0.9, `${p}.movement`, issues, 0, 50),
                verticalPeriod: num(rawMove, "verticalPeriod", 23, `${p}.movement`, issues, 0.5, 600),
            },
            snow: {
                intensity: num(rawSnow, "intensity", 0.7, `${p}.snow`, issues, 0, 1),
                windSpeed: num(rawSnow, "windSpeed", 7.5, `${p}.snow`, issues, 0, 80),
                windAngle: num(rawSnow, "windAngle", 10, `${p}.snow`, issues, -360, 360),
                windPitch: num(rawSnow, "windPitch", 22, `${p}.snow`, issues, -90, 90),
                spread: num(rawSnow, "spread", 0.45, `${p}.snow`, issues, 0, 1),
                gustStrength: num(rawSnow, "gustStrength", 0.45, `${p}.snow`, issues, 0, 3),
                gustFrequency: num(rawSnow, "gustFrequency", 7, `${p}.snow`, issues, 0, 120),
                size: num(rawSnow, "size", 0.075, `${p}.snow`, issues, 0.001, 2),
                stretch: num(rawSnow, "stretch", 5.5, `${p}.snow`, issues, 0, 60),
                color: colorHex(rawSnow, "color", "#f2f7fb", `${p}.snow`, issues),
                opacity: num(rawSnow, "opacity", 0.85, `${p}.snow`, issues, 0, 1),
            },
            lightning: {
                enabled: bool(rawBolt, "enabled", false, `${p}.lightning`, issues),
                mode: oneOf(rawBolt, "mode", LIGHTNING_MODES, "flash", `${p}.lightning`, issues),
                frequency: num(rawBolt, "frequency", 9, `${p}.lightning`, issues, 0.01, 240),
                intensity: num(rawBolt, "intensity", 1.1, `${p}.lightning`, issues, 0, 8),
                duration: num(rawBolt, "duration", 0.55, `${p}.lightning`, issues, 0.05, 6),
                color: colorHex(rawBolt, "color", "#cfe2ff", `${p}.lightning`, issues),
                radius: num(rawBolt, "radius", 0.65, `${p}.lightning`, issues, 0.05, 3),
                branching: num(rawBolt, "branching", 0.55, `${p}.lightning`, issues, 0, 1),
            },
        },
        issues,
    };
}
