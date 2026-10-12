/**
 * Typed, validated view of `risingembers-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads. Every number is finite and clamped, every colour parses, and a bad
 * value degrades to the default with a console warning rather than a NaN in a vertex shader.
 *
 * Key names are flat (`minSize` / `maxSize` rather than `size: [min, max]`) because the lab's
 * "Copy JSON" round-trips the normalised object straight back through this reader.
 */

import { bool, colorHex, ConfigIssues, int, num, oneOf } from "../../core/config";

/**
 * How the source area is sampled.
 *
 * `ring` exists because a vent whose middle has crusted over emits from its rim — the shape that
 * stops a wide source from reading as a solid rectangle of embers.
 */
export const EMISSION_SHAPES = ["box", "disc", "ring"] as const;
export type EmissionShape = (typeof EMISSION_SHAPES)[number];

export interface RisingEmbersConfig {
    enabled: boolean;

    /** Ceiling on simultaneously live embers. The pool is sized from this. */
    particleCount: number;
    /**
     * Embers entering the system per second. The live population settles at
     * `emissionRate × average lifetime`, capped by `particleCount` — so these two knobs are not
     * redundant: the rate sets the density, the count sets the budget.
     */
    emissionRate: number;
    /** Full width/depth of the source area, in world units. */
    emissionWidth: number;
    emissionDepth: number;
    /** Height of the source above the effect's own origin. */
    emissionHeight: number;
    emissionShape: EmissionShape;

    /** Average upward speed in units/second. Each ember draws around it. */
    riseSpeed: number;
    /** Spread of that draw, 0–1: 0.4 means ±40% of `riseSpeed`. */
    riseSpeedVariation: number;
    /** Coherent wind, in units/second. This is the only horizontal motion that has a direction. */
    driftSpeed: number;
    /** Heading of that wind in degrees, counter-clockwise from +X. */
    driftAngle: number;
    /** Amplitude of the smooth sideways wander, in world units. */
    turbulence: number;
    /** How far the column fans out by the end of a life, in world units. */
    spread: number;
    /** Hard ceiling on vertical travel, so a long-lived ember cannot leave the shot. */
    maxHeight: number;

    minSize: number;
    maxSize: number;
    /**
     * How far size is allowed to come loose from heat, 0–1. At 0 the hottest embers are the
     * biggest; at 1 size is drawn independently.
     */
    sizeVariation: number;
    /** The hottest centres. Reached only by the few embers drawn hot, and only while young. */
    hotColor: string;
    /** The colour most embers actually are. */
    baseColor: string;
    /** Where every ember ends up as it cools. */
    coolColor: string;
    glowIntensity: number;
    opacity: number;
    /**
     * Floor on an ember's on-screen size, as a fraction of viewport height. An ember sized
     * correctly in world units covers well under a pixel at playable framing and scintillates out.
     */
    minScreenSize: number;

    minLifetime: number;
    maxLifetime: number;
    /** Seconds spent fading up at birth. Keep it short or embers appear to ignite in mid-air. */
    fadeInDuration: number;
    /** Seconds spent fading out at the end of life. */
    fadeOutDuration: number;
    /** Base flicker rate in radians/second; each ember scatters around it. */
    flickerSpeed: number;
    /** Depth of the flicker, 0–1. Past ~0.6 the field reads as noise rather than fire. */
    flickerIntensity: number;
    /** How hard age pushes an ember toward `coolColor` and toward dark, 0–1. */
    coolingIntensity: number;
}

/**
 * Sanity ceiling: stops a mistyped count from allocating a buffer nobody asked for. Exported
 * because the effect re-applies it — config can be edited live, bypassing this reader.
 */
export const MAX_PARTICLES = 4000;

/** Swaps a reversed min/max pair, the way `range()` does for the bracketed form. */
function ordered(min: number, max: number, path: string, keys: [string, string], issues: ConfigIssues): [number, number] {
    if (min <= max) return [min, max];
    issues.warn(path, `${keys[0]} ${min} > ${keys[1]} ${max}, swapped`);
    return [max, min];
}

export function normalizeRisingEmbersConfig(raw: unknown): { config: RisingEmbersConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "risingembers";
    const [minSize, maxSize] = ordered(
        num(root, "minSize", 0.016, p, issues, 0.0001, 10),
        num(root, "maxSize", 0.055, p, issues, 0.0001, 10),
        p,
        ["minSize", "maxSize"],
        issues,
    );
    // A zero minimum lifetime would divide by zero in the shader's cycle cursor, so the floor is
    // a tenth of a second rather than nothing.
    const [minLifetime, maxLifetime] = ordered(
        num(root, "minLifetime", 4.5, p, issues, 0.1, 120),
        num(root, "maxLifetime", 11, p, issues, 0.1, 120),
        p,
        ["minLifetime", "maxLifetime"],
        issues,
    );

    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),

            particleCount: int(root, "particleCount", 260, p, issues, 0, MAX_PARTICLES),
            emissionRate: num(root, "emissionRate", 30, p, issues, 0, 2000),
            emissionWidth: num(root, "emissionWidth", 2.6, p, issues, 0, 200),
            emissionDepth: num(root, "emissionDepth", 2.6, p, issues, 0, 200),
            emissionHeight: num(root, "emissionHeight", 0.05, p, issues, -100, 100),
            emissionShape: oneOf(root, "emissionShape", EMISSION_SHAPES, "disc", p, issues),

            riseSpeed: num(root, "riseSpeed", 0.55, p, issues, 0, 50),
            riseSpeedVariation: num(root, "riseSpeedVariation", 0.45, p, issues, 0, 1),
            driftSpeed: num(root, "driftSpeed", 0.12, p, issues, 0, 20),
            driftAngle: num(root, "driftAngle", 35, p, issues, -720, 720),
            turbulence: num(root, "turbulence", 0.14, p, issues, 0, 10),
            spread: num(root, "spread", 0.5, p, issues, 0, 50),
            maxHeight: num(root, "maxHeight", 6.5, p, issues, 0.01, 500),

            minSize,
            maxSize,
            sizeVariation: num(root, "sizeVariation", 0.45, p, issues, 0, 1),
            hotColor: colorHex(root, "hotColor", "#fff0b4", p, issues),
            baseColor: colorHex(root, "baseColor", "#ff7a1e", p, issues),
            coolColor: colorHex(root, "coolColor", "#8c1c06", p, issues),
            glowIntensity: num(root, "glowIntensity", 1.1, p, issues, 0, 8),
            opacity: num(root, "opacity", 0.95, p, issues, 0, 1),
            minScreenSize: num(root, "minScreenSize", 0.004, p, issues, 0, 0.1),

            minLifetime,
            maxLifetime,
            fadeInDuration: num(root, "fadeInDuration", 0.35, p, issues, 0, 60),
            fadeOutDuration: num(root, "fadeOutDuration", 2.2, p, issues, 0, 60),
            flickerSpeed: num(root, "flickerSpeed", 7, p, issues, 0, 60),
            flickerIntensity: num(root, "flickerIntensity", 0.42, p, issues, 0, 1),
            coolingIntensity: num(root, "coolingIntensity", 0.8, p, issues, 0, 1),
        },
        issues,
    };
}
