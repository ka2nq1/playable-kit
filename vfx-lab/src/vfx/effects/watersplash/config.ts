/**
 * Typed, validated view of `watersplash-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Pool sizes are deliberately *not* config: `dropletCount` and `rippleCount` are per-impact
 * amounts, and the pools are sized from them once at construction. A game that fires two impacts
 * in the same frame gets both without a slider for it.
 */

import { bool, colorHex, ConfigIssues, int, num } from "../../core/config";

export interface WaterSplashConfig {
    enabled: boolean;
    /** Height of the water plane above the effect's own origin. Everything is placed against it. */
    surfaceOffset: number;

    /** Peak height of the tallest stream, in world units. */
    splashHeight: number;
    /** Horizontal reach of the crown: how far the streams lean out as they rise. */
    splashWidth: number;
    /**
     * Overall impact energy. It decides how many streams the crown is made of and scales the
     * droplet count, the launch speed and the ripple strength — one knob for "harder hit".
     */
    splashIntensity: number;
    /** Seconds from the impact to the last stream collapsing. */
    splashDuration: number;
    /**
     * 0–1. How far the streams are allowed to differ from each other in height, width, taper,
     * lean and timing. **0 produces an even, symmetrical crown**, which is the one thing a real
     * splash never is.
     */
    shapeVariation: number;

    /** Main water tint. Highlights push toward white from here, so keep it a real water hue. */
    waterColor: string;
    /** Strength of the bright edges and foam. Past ~1.5 the crown reads as white plastic. */
    highlightIntensity: number;
    /** Master alpha of the splash sheets. Water is see-through; well under 1 is correct. */
    opacity: number;

    /** Droplets thrown by one impact, before `splashIntensity` scales it. */
    dropletCount: number;
    /** Droplet world size at the middle of the band. */
    dropletSize: number;
    /** 0–1 spread around `dropletSize`. The draw is biased small, so big drops stay occasional. */
    dropletSizeVariation: number;
    /** Radius of the ring droplets leave from — the footprint of the impact itself. */
    spreadRadius: number;
    /** Launch speed in world units per second, before per-droplet variation. */
    launchVelocity: number;
    /** Downward acceleration. Negative pulls down. */
    gravity: number;
    /** Seconds a droplet may live. Most die earlier, when they fall back through the surface. */
    dropletLifetime: number;
    dropletOpacity: number;

    rippleEnabled: boolean;
    /** Expanding rings per impact. Later rings start wider, weaker and a beat behind. */
    rippleCount: number;
    /** Expansion in world units per second. With `rippleDuration` it sets how far a ring reaches. */
    rippleSpeed: number;
    /** Crest thickness in world units. Thin: this is a highlight on the water, not a painted disc. */
    rippleWidth: number;
    rippleOpacity: number;
    /** Seconds a ring lives. Longer rings also travel further, since speed is unchanged. */
    rippleDuration: number;

    /** Whether a droplet falling back through the surface leaves a small splash of its own. */
    secondarySplashEnabled: boolean;
    /** 0–1. How often a returning droplet splashes, and how strongly. */
    secondarySplashIntensity: number;
}

/** Sanity ceilings. They exist to stop a mistyped zero from allocating a huge pool. */
const MAX_DROPLETS = 160;
const MAX_RIPPLES = 8;

export function normalizeWaterSplashConfig(raw: unknown): { config: WaterSplashConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "watersplash";
    const config: WaterSplashConfig = {
        enabled: bool(root, "enabled", true, p, issues),
        surfaceOffset: num(root, "surfaceOffset", 0.012, p, issues, -100, 100),

        splashHeight: num(root, "splashHeight", 1.15, p, issues, 0.02, 40),
        splashWidth: num(root, "splashWidth", 0.52, p, issues, 0.01, 20),
        splashIntensity: num(root, "splashIntensity", 1, p, issues, 0, 3),
        splashDuration: num(root, "splashDuration", 0.78, p, issues, 0.05, 10),
        shapeVariation: num(root, "shapeVariation", 0.72, p, issues, 0, 1),

        waterColor: colorHex(root, "waterColor", "#79c4d8", p, issues),
        highlightIntensity: num(root, "highlightIntensity", 0.85, p, issues, 0, 3),
        opacity: num(root, "opacity", 0.78, p, issues, 0, 1),

        dropletCount: int(root, "dropletCount", 26, p, issues, 0, MAX_DROPLETS),
        dropletSize: num(root, "dropletSize", 0.038, p, issues, 0.002, 1),
        dropletSizeVariation: num(root, "dropletSizeVariation", 0.55, p, issues, 0, 1),
        spreadRadius: num(root, "spreadRadius", 0.34, p, issues, 0.01, 20),
        launchVelocity: num(root, "launchVelocity", 3.4, p, issues, 0.05, 60),
        gravity: num(root, "gravity", -9.8, p, issues, -200, 0),
        dropletLifetime: num(root, "dropletLifetime", 1.1, p, issues, 0.05, 20),
        dropletOpacity: num(root, "dropletOpacity", 0.85, p, issues, 0, 1),

        rippleEnabled: bool(root, "rippleEnabled", true, p, issues),
        rippleCount: int(root, "rippleCount", 3, p, issues, 0, MAX_RIPPLES),
        rippleSpeed: num(root, "rippleSpeed", 1.5, p, issues, 0.01, 50),
        rippleWidth: num(root, "rippleWidth", 0.085, p, issues, 0.002, 5),
        rippleOpacity: num(root, "rippleOpacity", 0.6, p, issues, 0, 2),
        rippleDuration: num(root, "rippleDuration", 1.6, p, issues, 0.05, 20),

        secondarySplashEnabled: bool(root, "secondarySplashEnabled", true, p, issues),
        secondarySplashIntensity: num(root, "secondarySplashIntensity", 0.5, p, issues, 0, 1),
    };

    return { config, issues };
}
