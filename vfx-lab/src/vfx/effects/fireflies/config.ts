/**
 * Typed, validated view of `fireflies-vfx.json`.
 *
 * Same contract as the fire pit and water configs: the JSON is the authoring surface, this module is
 * what the effect actually reads. Every number is finite and clamped, every colour parses.
 *
 * The key names are flat (`minSize` / `maxSize` rather than a `size: [min, max]` pair) because the
 * lab's "Copy JSON" round-trips the normalised object straight back through this reader — what the
 * effect holds and what the file contains have to be the same shape.
 */

import { bool, ConfigIssues, int, num, vec3 } from "../../core/config";

export interface FirefliesConfig {
    enabled: boolean;
    /** How many fireflies exist. They never die, so this is a live count, not a pool ceiling. */
    count: number;
    /** Full extents `[x, y, z]` of the volume, centred on the effect's own origin. */
    areaSize: [number, number, number];
    /** Horizontal radius kept empty at the centre, so the volume is a ring around the action. */
    clearRadius: number;
    minSize: number;
    maxSize: number;
    /** Drift speed in world units per second. Each firefly picks its own point in the range. */
    minSpeed: number;
    maxSpeed: number;
    /** Master brightness multiplier. Above ~1.5 the halos start to merge into a haze. */
    glowIntensity: number;
    /** Base blink rate in radians per second; each firefly scatters around it. */
    pulseSpeed: number;
    /** Depth of the blink: 0 is a steady light, 1 goes fully dark at the bottom of the cycle. */
    pulseAmount: number;
    /** Peak vertical bob, in world units. */
    verticalAmplitude: number;
    /** Palette; each firefly takes one entry whole, so every colour here stays recognisable. */
    colors: string[];
    opacity: number;
    /**
     * Floor on a firefly's on-screen size, as a fraction of viewport height. Without it the ones
     * at the far end of the volume fall under a pixel and scintillate instead of glowing.
     */
    minScreenSize: number;
}

/**
 * Sanity ceiling: stops a mistyped count from allocating a buffer nobody asked for. Exported
 * because the effect re-applies it — config can be edited live, bypassing this reader.
 */
export const MAX_COUNT = 4000;

const DEFAULT_AREA: [number, number, number] = [16, 5, 11];

const DEFAULT_COLORS = ["#d6f06a", "#a8e04f", "#ffd978"];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Reads a palette. A single bad entry drops the whole list rather than silently shifting the mix,
 * which is easier to spot than one firefly quietly turning the default green.
 */
function colorList(raw: Record<string, unknown> | undefined, key: string, def: string[], path: string, issues: ConfigIssues): string[] {
    const v = raw?.[key];
    if (v === undefined) return [...def];
    if (!Array.isArray(v) || v.length === 0 || v.some((c) => typeof c !== "string" || !HEX.test(c))) {
        issues.warn(`${path}.${key}`, `expected a non-empty array of hex colours, got ${JSON.stringify(v)}`);
        return [...def];
    }
    return v as string[];
}

/** Swaps a reversed min/max pair, the way `range()` does for the bracketed form. */
function ordered(min: number, max: number, path: string, keys: [string, string], issues: ConfigIssues): [number, number] {
    if (min <= max) return [min, max];
    issues.warn(path, `${keys[0]} ${min} > ${keys[1]} ${max}, swapped`);
    return [max, min];
}

export function normalizeFirefliesConfig(raw: unknown): { config: FirefliesConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "fireflies";
    const [minSize, maxSize] = ordered(
        num(root, "minSize", 0.035, p, issues, 0.0001, 10),
        num(root, "maxSize", 0.085, p, issues, 0.0001, 10),
        p,
        ["minSize", "maxSize"],
        issues,
    );
    const [minSpeed, maxSpeed] = ordered(
        num(root, "minSpeed", 0.12, p, issues, 0, 50),
        num(root, "maxSpeed", 0.32, p, issues, 0, 50),
        p,
        ["minSpeed", "maxSpeed"],
        issues,
    );

    const area = vec3(root, "areaSize", DEFAULT_AREA, p, issues);
    for (let i = 0; i < 3; i++) {
        if (area[i] <= 0) {
            issues.warn(`${p}.areaSize`, `axis ${i} is ${area[i]}, must be positive — using the default extent`);
            area[i] = DEFAULT_AREA[i];
        }
    }

    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            count: int(root, "count", 60, p, issues, 0, MAX_COUNT),
            areaSize: area,
            clearRadius: num(root, "clearRadius", 2.6, p, issues, 0, 1000),
            minSize,
            maxSize,
            minSpeed,
            maxSpeed,
            glowIntensity: num(root, "glowIntensity", 1, p, issues, 0, 8),
            pulseSpeed: num(root, "pulseSpeed", 0.9, p, issues, 0, 20),
            pulseAmount: num(root, "pulseAmount", 0.75, p, issues, 0, 1),
            verticalAmplitude: num(root, "verticalAmplitude", 0.35, p, issues, 0, 100),
            colors: colorList(root, "colors", DEFAULT_COLORS, p, issues),
            opacity: num(root, "opacity", 0.85, p, issues, 0, 1),
            minScreenSize: num(root, "minScreenSize", 0.007, p, issues, 0, 0.1),
        },
        issues,
    };
}
