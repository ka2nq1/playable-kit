/**
 * Typed, validated view of `smokewisps-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads. Every number is finite and clamped, every colour parses, and a bad
 * value degrades to the default with a console warning rather than a NaN in a vertex shader.
 *
 * Key names are flat (`minWidth` / `maxWidth` rather than `width: [min, max]`) because the lab's
 * "Copy JSON" round-trips the normalised object straight back through this reader.
 */

import { bool, colorHex, ConfigIssues, int, num, oneOf } from "../../core/config";

/**
 * How the source region is sampled.
 *
 * A smouldering patch is an `area`, a cracked seam or a line of embers is a `line`, and a single
 * vent is a `point`. There is no disc here on purpose: at the widths smoke sources actually have,
 * a disc and a box are the same picture, and the third shape earns its keep by being a *line*.
 */
export const WISP_EMISSION_SHAPES = ["point", "line", "area"] as const;
export type WispEmissionShape = (typeof WISP_EMISSION_SHAPES)[number];

export interface SmokeWispsConfig {
    enabled: boolean;

    /** Ceiling on simultaneously visible wisps. The strip buffer is sized from this. */
    wispCount: number;
    /**
     * Wisps entering the system per second. The live population settles at
     * `emissionRate × average lifetime`, capped by `wispCount` — so these two knobs are not
     * redundant: the rate sets the density, the count sets the budget.
     */
    emissionRate: number;
    /** Full width/depth of the source region, in world units. */
    emissionWidth: number;
    emissionDepth: number;
    /** Height of the source above the effect's own origin. */
    emissionHeight: number;
    emissionShape: WispEmissionShape;

    /** Average upward speed in units/second. Each wisp draws around it. */
    riseSpeed: number;
    /** Spread of that draw, 0–1: 0.4 means ±40% of `riseSpeed`. */
    riseSpeedVariation: number;
    /** Coherent sideways wind in units/second. The only horizontal motion with a direction. */
    horizontalDrift: number;
    /** Heading of that wind in degrees, counter-clockwise from +X. */
    driftAngle: number;
    /** Amplitude of the curl written into the strand itself, in world units. */
    turbulence: number;
    /** How many curls a strand carries per second of travel. Low numbers are long, lazy bends. */
    curlFrequency: number;
    /** How far a wisp fans away from the source by the end of its life, in world units. */
    spread: number;
    /** How fast smoke widens as it ages, in world units per second. */
    expansionRate: number;
    /** Hard ceiling on vertical travel, so a long-lived wisp cannot leave the shot. */
    maxHeight: number;

    /** Base smoke colour. The interior sits a little under it, the edges a little over. */
    smokeColor: string;
    /** Per-wisp brightness and temperature jitter around that colour, 0–1. */
    colorVariation: number;
    /** Master alpha. Density should come from more wisps, not from more opaque ones. */
    baseOpacity: number;
    /** Per-wisp alpha jitter, 0–1. */
    opacityVariation: number;
    /** Strand width at birth, in world units, before expansion. */
    minWidth: number;
    maxWidth: number;
    /** Strand length, in world units. Converted to a time lag, so a fast wisp is not a long one. */
    minLength: number;
    maxLength: number;
    /** Edge softness, 0–1. At 0 the strand has a defined core, at 1 it is all gradient. */
    softness: number;
    /** Scale of the procedural smoke detail that erodes the silhouette. */
    noiseScale: number;
    /** How hard that noise distorts and eats into the strand, 0–1. */
    noiseIntensity: number;
    /** Scale of the second, finer octave. */
    detailScale: number;
    /**
     * Floor on a strand's on-screen width, as a fraction of viewport height. A wisp sized
     * correctly in world units goes sub-pixel at playable framing and scintillates out.
     */
    minScreenWidth: number;

    minLifetime: number;
    maxLifetime: number;
    /** Seconds spent fading up at birth. */
    fadeInDuration: number;
    /** Seconds spent fading out. Long on purpose — smoke dissolves, it does not switch off. */
    fadeOutDuration: number;
    /**
     * Master on every per-wisp draw, 0–1. At 0 every wisp is the average of its ranges and the
     * column marches in step; at 1 the ranges are used in full.
     */
    randomness: number;
}

/**
 * Sanity ceiling: stops a mistyped count from allocating a buffer nobody asked for. Exported
 * because the effect re-applies it — config can be edited live, bypassing this reader.
 */
export const MAX_WISPS = 400;

/** Swaps a reversed min/max pair, the way `range()` does for the bracketed form. */
function ordered(min: number, max: number, path: string, keys: [string, string], issues: ConfigIssues): [number, number] {
    if (min <= max) return [min, max];
    issues.warn(path, `${keys[0]} ${min} > ${keys[1]} ${max}, swapped`);
    return [max, min];
}

export function normalizeSmokeWispsConfig(raw: unknown): { config: SmokeWispsConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "smokewisps";
    const [minWidth, maxWidth] = ordered(
        num(root, "minWidth", 0.11, p, issues, 0.001, 20),
        num(root, "maxWidth", 0.28, p, issues, 0.001, 20),
        p,
        ["minWidth", "maxWidth"],
        issues,
    );
    const [minLength, maxLength] = ordered(
        num(root, "minLength", 0.8, p, issues, 0.01, 200),
        num(root, "maxLength", 1.9, p, issues, 0.01, 200),
        p,
        ["minLength", "maxLength"],
        issues,
    );
    // A zero minimum lifetime would divide by zero in the shader's cycle cursor, so the floor is
    // a tenth of a second rather than nothing.
    const [minLifetime, maxLifetime] = ordered(
        num(root, "minLifetime", 5, p, issues, 0.1, 120),
        num(root, "maxLifetime", 8.5, p, issues, 0.1, 120),
        p,
        ["minLifetime", "maxLifetime"],
        issues,
    );

    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),

            wispCount: int(root, "wispCount", 26, p, issues, 0, MAX_WISPS),
            emissionRate: num(root, "emissionRate", 3.6, p, issues, 0, 400),
            emissionWidth: num(root, "emissionWidth", 0.7, p, issues, 0, 200),
            emissionDepth: num(root, "emissionDepth", 0.7, p, issues, 0, 200),
            emissionHeight: num(root, "emissionHeight", 0.04, p, issues, -100, 100),
            emissionShape: oneOf(root, "emissionShape", WISP_EMISSION_SHAPES, "area", p, issues),

            riseSpeed: num(root, "riseSpeed", 0.42, p, issues, 0.01, 50),
            riseSpeedVariation: num(root, "riseSpeedVariation", 0.4, p, issues, 0, 1),
            horizontalDrift: num(root, "horizontalDrift", 0.07, p, issues, 0, 20),
            driftAngle: num(root, "driftAngle", 35, p, issues, -720, 720),
            turbulence: num(root, "turbulence", 0.16, p, issues, 0, 10),
            curlFrequency: num(root, "curlFrequency", 0.85, p, issues, 0.01, 20),
            spread: num(root, "spread", 0.35, p, issues, 0, 50),
            expansionRate: num(root, "expansionRate", 0.07, p, issues, 0, 10),
            maxHeight: num(root, "maxHeight", 3.6, p, issues, 0.01, 500),

            smokeColor: colorHex(root, "smokeColor", "#9aa1a9", p, issues),
            colorVariation: num(root, "colorVariation", 0.18, p, issues, 0, 1),
            baseOpacity: num(root, "baseOpacity", 0.38, p, issues, 0, 1),
            opacityVariation: num(root, "opacityVariation", 0.4, p, issues, 0, 1),
            minWidth,
            maxWidth,
            minLength,
            maxLength,
            softness: num(root, "softness", 0.62, p, issues, 0, 1),
            noiseScale: num(root, "noiseScale", 1.35, p, issues, 0.01, 40),
            noiseIntensity: num(root, "noiseIntensity", 0.55, p, issues, 0, 1),
            detailScale: num(root, "detailScale", 3.4, p, issues, 0.01, 80),
            minScreenWidth: num(root, "minScreenWidth", 0.0025, p, issues, 0, 0.1),

            minLifetime,
            maxLifetime,
            fadeInDuration: num(root, "fadeInDuration", 0.9, p, issues, 0, 60),
            fadeOutDuration: num(root, "fadeOutDuration", 2.4, p, issues, 0, 60),
            randomness: num(root, "randomness", 1, p, issues, 0, 1),
        },
        issues,
    };
}
