/**
 * Typed, validated view of `swampbubbles-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * The `min*`/`max*` pairs are two keys rather than one `[min, max]` range because that is how the
 * effect is specified and how it reads in the panel. A reversed pair is swapped here, and the
 * effect re-orders them again at spawn time — the panel edits this object live, so a slider can
 * invert a pair long after this reader has run.
 */

import { bool, colorHex, colorPair, ConfigIssues, int, num, range } from "../../core/config";
import type { Range } from "../../core/random";

export interface SwampBubblesConfig {
    enabled: boolean;

    /** Pool size. Allocated once at construction; raising it later can only cap up to that. */
    bubbleCount: number;
    /** Average spawn events per second. A cluster event is still one event. */
    spawnRate: number;
    /**
     * How irregular the effect is, 0–1. It widens the gaps between spawns toward a Poisson
     * arrival pattern and jitters every bubble's growth, hold and pop timing. At 0 the effect
     * ticks like a metronome, which is the one thing swamp gas never does.
     */
    activityVariation: number;

    /** Bubble radius in world units at full size. */
    minBubbleSize: number;
    maxBubbleSize: number;
    /**
     * Exponent biasing the size draw toward the small end. 1 is uniform; above 1 makes big
     * bubbles rare, which is what keeps them an event rather than the norm.
     */
    sizeBias: number;

    /** Inverse seconds: the dome reaches full size in `1 / growthSpeed`, scaled by its own size. */
    growthSpeed: number;
    /** Inverse seconds of the collapse. High — a real film retracts in under a tenth of a second. */
    popSpeed: number;
    /** Seconds the dome holds at full size before it pops. */
    minLifetime: number;
    maxLifetime: number;

    /** Side of the square of water bubbles spawn on, centred on the effect's origin. */
    spawnAreaSize: number;
    /** Height of the water plane above the effect's own origin. Everything is placed against it. */
    surfaceOffset: number;

    bubbleColor: string;
    /** Master alpha of the domes. Swamp bubbles are mostly water — keep this well under 1. */
    bubbleOpacity: number;
    /** Strength of the specular highlight and sheen that make the dome read as wet. */
    highlightIntensity: number;
    /**
     * How far the dome stands proud of the water, 0–1. 0.5 is a hemisphere; above that more than
     * half the sphere is above the waterline, which is how a surface bubble actually sits.
     */
    emergence: number;

    /** Probability that one spawn event is a cluster of small bubbles rather than a single one. */
    clusterChance: number;
    /** Bubbles in a cluster, counting the first. */
    clusterSize: Range;

    rippleEnabled: boolean;
    /** Ring expansion in world units per second. */
    rippleSpeed: number;
    rippleOpacity: number;
    rippleColor: string;
    /** Ring reach as a multiple of the bubble's radius, so a big bubble disturbs more water. */
    rippleRadiusScale: number;
    /** Crest thickness in world units. Thin: this is a highlight on the water, not a painted disc. */
    rippleWidth: number;

    splashEnabled: boolean;
    /**
     * Chance of droplets at the largest configured size. It is scaled down by how big the bubble
     * actually was, so small bubbles pop silently and only the occasional big one throws water.
     */
    splashProbability: number;
    splashCount: Range;
    splashSpeed: Range;
    splashSize: Range;
    splashGravity: number;
    splashColor: [string, string];
}

/** Sanity ceilings. They exist to stop a mistyped zero from allocating a huge pool. */
const MAX_BUBBLES = 512;
const MAX_CLUSTER = 12;
const MAX_SPLASH = 32;

export function normalizeSwampBubblesConfig(raw: unknown): { config: SwampBubblesConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "swampbubbles";
    const config: SwampBubblesConfig = {
        enabled: bool(root, "enabled", true, p, issues),

        bubbleCount: int(root, "bubbleCount", 32, p, issues, 1, MAX_BUBBLES),
        spawnRate: num(root, "spawnRate", 1.8, p, issues, 0, 200),
        activityVariation: num(root, "activityVariation", 0.7, p, issues, 0, 1),

        minBubbleSize: num(root, "minBubbleSize", 0.035, p, issues, 0.001, 10),
        maxBubbleSize: num(root, "maxBubbleSize", 0.125, p, issues, 0.001, 10),
        sizeBias: num(root, "sizeBias", 2.4, p, issues, 0.2, 8),

        growthSpeed: num(root, "growthSpeed", 1.6, p, issues, 0.05, 50),
        popSpeed: num(root, "popSpeed", 9, p, issues, 0.5, 100),
        minLifetime: num(root, "minLifetime", 0.5, p, issues, 0, 60),
        maxLifetime: num(root, "maxLifetime", 2.4, p, issues, 0, 60),

        spawnAreaSize: num(root, "spawnAreaSize", 7, p, issues, 0.1, 500),
        surfaceOffset: num(root, "surfaceOffset", 0.012, p, issues, -100, 100),

        bubbleColor: colorHex(root, "bubbleColor", "#38421f", p, issues),
        bubbleOpacity: num(root, "bubbleOpacity", 0.8, p, issues, 0, 1),
        highlightIntensity: num(root, "highlightIntensity", 0.62, p, issues, 0, 4),
        emergence: num(root, "emergence", 0.68, p, issues, 0, 1),

        clusterChance: num(root, "clusterChance", 0.22, p, issues, 0, 1),
        clusterSize: range(root, "clusterSize", [2, 4], p, issues, 1, MAX_CLUSTER),

        rippleEnabled: bool(root, "rippleEnabled", true, p, issues),
        rippleSpeed: num(root, "rippleSpeed", 0.55, p, issues, 0.01, 50),
        rippleOpacity: num(root, "rippleOpacity", 0.5, p, issues, 0, 2),
        rippleColor: colorHex(root, "rippleColor", "#a8bd90", p, issues),
        rippleRadiusScale: num(root, "rippleRadiusScale", 6.5, p, issues, 1, 60),
        rippleWidth: num(root, "rippleWidth", 0.035, p, issues, 0.001, 5),

        splashEnabled: bool(root, "splashEnabled", true, p, issues),
        splashProbability: num(root, "splashProbability", 0.45, p, issues, 0, 1),
        splashCount: range(root, "splashCount", [2, 5], p, issues, 0, MAX_SPLASH),
        splashSpeed: range(root, "splashSpeed", [0.5, 1.25], p, issues, 0, 50),
        splashSize: range(root, "splashSize", [0.012, 0.026], p, issues, 0.0005, 2),
        splashGravity: num(root, "splashGravity", -9.8, p, issues, -200, 200),
        splashColor: colorPair(root, "splashColor", ["#d2dfbf", "#879a74"], p, issues),
    };

    // A reversed pair is a hand-edit mistake with an unambiguous intent, exactly like `range()`.
    orderPair(config, "minBubbleSize", "maxBubbleSize", p, issues);
    orderPair(config, "minLifetime", "maxLifetime", p, issues);

    return { config, issues };
}

function orderPair<K extends keyof SwampBubblesConfig>(
    config: SwampBubblesConfig,
    lo: K,
    hi: K,
    path: string,
    issues: ConfigIssues,
): void {
    const a = config[lo] as number;
    const b = config[hi] as number;
    if (a <= b) return;
    issues.warn(`${path}.${String(lo)}`, `${a} is above ${String(hi)} ${b}, swapped`);
    (config[lo] as number) = b;
    (config[hi] as number) = a;
}
