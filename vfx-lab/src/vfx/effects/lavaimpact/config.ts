/**
 * Typed, validated view of `lavaimpact-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Pool sizes are deliberately *not* config: `dropletCount` and `splashTongueCount` are per-impact
 * amounts, and the pools are sized from them once at construction, so two impacts in the same
 * frame both play without a slider for it.
 *
 * Scheduling is not config either. `autoTrigger` and `previewTriggerInterval` from the brief live
 * in the lab panel rather than here, because nothing in `src/vfx/` owns a timer — the game decides
 * when an impact happens, exactly as it does for the water splash.
 */

import { bool, colorHex, ConfigIssues, int, num } from "../../core/config";

export interface LavaImpactConfig {
    enabled: boolean;
    /**
     * Height of the lava plane above the effect's own origin. Everything is placed against it.
     *
     * Default a little higher than the water splash's: a lava surface is usually a displaced
     * mesh rather than a flat plane, and a glow patch laid exactly on y=0 is swallowed by the
     * crust heaving over it.
     */
    surfaceOffset: number;

    /** Master size. Multiplies every radius, height, speed and droplet size at impact time. */
    impactScale: number;
    /**
     * Master energy. It decides how many tongues and droplets an impact is made of as well as
     * scaling the flash and the glow — one knob for "harder hit".
     */
    impactIntensity: number;
    /** Brightness of the flash at the moment of contact. */
    impactFlashIntensity: number;
    /** Seconds the flash lasts. Short: it exists to hand over to the splash, not to be looked at. */
    impactFlashDuration: number;
    /** Radius of the impact area, in world units. The flash, the glow and the tongue feet use it. */
    impactRadius: number;
    /** Brightness of the molten patch left behind once the flash is gone. */
    surfaceGlowIntensity: number;
    /** Seconds that patch takes to cool back to the surface. */
    surfaceGlowDuration: number;

    /** Peak height of the tallest tongue, in world units. */
    splashHeight: number;
    /** Width of the tongues themselves — the thickness of the molten ribbons. */
    splashWidth: number;
    /** How far the tongues lean out as they rise. The horizontal reach of the splash. */
    splashSpread: number;
    /** Seconds from the impact to the last tongue coming apart. */
    splashDuration: number;
    /** Tongues in one splash, before `impactIntensity` scales it. */
    splashTongueCount: number;
    /**
     * 0–1. How far the tongues are allowed to differ in azimuth, height, width, taper, lean and
     * timing. **0 produces an even, symmetrical starburst**, which is the one thing molten rock
     * thrown out of a surface never is.
     */
    splashShapeVariation: number;
    /** How sharply a tongue narrows toward its tip. Low is a broad lobe, high is a thin ribbon. */
    splashTaper: number;
    /** How much a tongue arcs over as it rises, instead of leaving on a straight line. */
    splashCurvature: number;

    /** Airborne droplets per impact, before `impactIntensity` scales it. */
    dropletCount: number;
    /** Smallest droplet, in world units. Most of the burst sits near this end. */
    dropletSizeMin: number;
    /** Largest droplet. The few that draw near it are what give the burst its sense of scale. */
    dropletSizeMax: number;
    /** Launch speed in world units per second, before per-droplet variation. */
    dropletSpeed: number;
    /** 0–1 spread around `dropletSpeed`. */
    dropletSpeedVariation: number;
    /** 0–1. How flat the trajectories are allowed to be: 0 is a column, 1 a wide fan. */
    dropletSpread: number;
    /** Extra upward launch speed on top of `dropletSpeed`, in units per second. */
    dropletUpwardForce: number;
    /** Downward acceleration. Negative pulls down. */
    gravity: number;
    /** Seconds a droplet may live. Most die earlier, on falling back into the surface. */
    dropletLifetime: number;
    /** 0–1 spread around `dropletLifetime`. */
    dropletLifetimeVariation: number;
    /** 0–1. How far a fast droplet stretches into a streak. 0 leaves every droplet round. */
    dropletStreakAmount: number;

    /** The hottest colour: the core of a fresh tongue and of a newly thrown droplet. */
    hotColor: string;
    /** The main molten body colour. */
    lavaColor: string;
    /** What everything cools toward before it disappears. */
    coolColor: string;
    /** Perceived brightness of the molten elements. Above 1 the hot core burns toward white. */
    emissiveIntensity: number;
    /** Glow strength around the droplets. They are additive, so above 1 is a hot core. */
    dropletGlowIntensity: number;
    /** Master alpha of the splash tongues. Molten rock is opaque; keep this high. */
    splashOpacity: number;
    dropletOpacity: number;
    /** 0–1. How far colour and brightness fall over a lifetime. 0 means nothing ever cools. */
    coolingIntensity: number;
    /** 0–1 irregularity of the silhouettes: tongue edges, lumps, and the glow's outline. */
    edgeVariation: number;

    /** 0–1. How much one trigger differs from the next in size, count, speed and timing. */
    randomness: number;
    /** Small trailing droplets fired a beat after the main burst. 0 turns the second beat off. */
    secondaryDropletCount: number;
    /** Seconds between the impact and that second beat. */
    secondaryBurstDelay: number;
}

/** Sanity ceilings. They exist to stop a mistyped zero from allocating a huge pool. */
const MAX_TONGUES = 16;
const MAX_DROPLETS = 200;

export function normalizeLavaImpactConfig(raw: unknown): { config: LavaImpactConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "lavaimpact";
    const config: LavaImpactConfig = {
        enabled: bool(root, "enabled", true, p, issues),
        surfaceOffset: num(root, "surfaceOffset", 0.08, p, issues, -100, 100),

        impactScale: num(root, "impactScale", 1, p, issues, 0.05, 20),
        impactIntensity: num(root, "impactIntensity", 1, p, issues, 0, 3),
        impactFlashIntensity: num(root, "impactFlashIntensity", 1.6, p, issues, 0, 6),
        impactFlashDuration: num(root, "impactFlashDuration", 0.14, p, issues, 0.01, 2),
        impactRadius: num(root, "impactRadius", 0.55, p, issues, 0.02, 20),
        surfaceGlowIntensity: num(root, "surfaceGlowIntensity", 0.85, p, issues, 0, 6),
        surfaceGlowDuration: num(root, "surfaceGlowDuration", 0.95, p, issues, 0.02, 10),

        splashHeight: num(root, "splashHeight", 1.25, p, issues, 0.02, 40),
        splashWidth: num(root, "splashWidth", 0.4, p, issues, 0.01, 20),
        splashSpread: num(root, "splashSpread", 0.8, p, issues, 0, 20),
        splashDuration: num(root, "splashDuration", 0.72, p, issues, 0.05, 10),
        splashTongueCount: int(root, "splashTongueCount", 7, p, issues, 0, MAX_TONGUES),
        splashShapeVariation: num(root, "splashShapeVariation", 0.78, p, issues, 0, 1),
        splashTaper: num(root, "splashTaper", 1.5, p, issues, 0.2, 6),
        splashCurvature: num(root, "splashCurvature", 0.5, p, issues, 0, 1),

        dropletCount: int(root, "dropletCount", 34, p, issues, 0, MAX_DROPLETS),
        dropletSizeMin: num(root, "dropletSizeMin", 0.018, p, issues, 0.002, 1),
        dropletSizeMax: num(root, "dropletSizeMax", 0.085, p, issues, 0.002, 2),
        dropletSpeed: num(root, "dropletSpeed", 3.1, p, issues, 0.05, 60),
        dropletSpeedVariation: num(root, "dropletSpeedVariation", 0.45, p, issues, 0, 1),
        dropletSpread: num(root, "dropletSpread", 0.62, p, issues, 0, 1),
        dropletUpwardForce: num(root, "dropletUpwardForce", 1.9, p, issues, 0, 40),
        gravity: num(root, "gravity", -9.8, p, issues, -200, 0),
        dropletLifetime: num(root, "dropletLifetime", 1.15, p, issues, 0.05, 20),
        dropletLifetimeVariation: num(root, "dropletLifetimeVariation", 0.45, p, issues, 0, 1),
        dropletStreakAmount: num(root, "dropletStreakAmount", 0.55, p, issues, 0, 1),

        hotColor: colorHex(root, "hotColor", "#ffe6a0", p, issues),
        lavaColor: colorHex(root, "lavaColor", "#ff6a14", p, issues),
        coolColor: colorHex(root, "coolColor", "#8c1c06", p, issues),
        emissiveIntensity: num(root, "emissiveIntensity", 1.3, p, issues, 0, 4),
        dropletGlowIntensity: num(root, "dropletGlowIntensity", 1.15, p, issues, 0, 4),
        splashOpacity: num(root, "splashOpacity", 0.95, p, issues, 0, 1),
        dropletOpacity: num(root, "dropletOpacity", 0.95, p, issues, 0, 1),
        coolingIntensity: num(root, "coolingIntensity", 0.85, p, issues, 0, 1),
        edgeVariation: num(root, "edgeVariation", 0.7, p, issues, 0, 1),

        randomness: num(root, "randomness", 0.8, p, issues, 0, 1),
        secondaryDropletCount: int(root, "secondaryDropletCount", 10, p, issues, 0, MAX_DROPLETS),
        secondaryBurstDelay: num(root, "secondaryBurstDelay", 0.16, p, issues, 0, 3),
    };

    return { config, issues };
}
