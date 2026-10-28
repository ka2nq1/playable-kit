/**
 * Typed, validated view of `water-vfx.json`.
 *
 * Same contract as the fire pit config: the JSON is the authoring surface, this module is what the
 * effect actually reads. Every number is finite, every range ordered, every colour parses.
 *
 * One addition — presets. A preset is a *complete* set of ripple options: the JSON only has to
 * list what it overrides, and anything it leaves out is filled from `ripples.defaults` here. That
 * is what lets the lab bind a slider straight to `config.presets.impact.ripple.maxRadius` without
 * having to reason about which values are present.
 */

import type { Keyframe } from "../../core/curves";
import type { Range } from "../../core/random";
import { bool, colorHex, colorPair, ConfigIssues, int, keyframes, num, oneOf, range, section } from "../../core/config";

export type QualityPresetName = "low" | "high";

export interface QualityConfig {
    preset: QualityPresetName;
    /** `particles` scales the pools, `rings` the number of rings one emit produces. */
    presets: Record<QualityPresetName, { particles: number; rings: number }>;
}

/** The full set of knobs one `emit()` understands. Presets and overrides are partials of this. */
export interface RippleOptions {
    /** Concentric rings per event. Later rings start wider, travel further and fade sooner. */
    rings: number;
    /** Seconds between one ring and the next. */
    ringDelay: number;
    startRadius: number;
    maxRadius: number;
    /** Seconds from `startRadius` to `maxRadius`. `speed` in an emit overrides it. */
    duration: number;
    /** Crest thickness in world units. */
    width: number;
    /** How much the crest thickens over its life, as a fraction of `width`. */
    widthGrowth: number;
    /** Peak alpha of the first ring. */
    intensity: number;
    /** How far the crest wanders off a perfect circle, as a fraction of its radius. */
    wobble: number;
    /** Per-ring randomisation of delay, radius, width and duration. 0 makes every ring identical. */
    jitter: number;
    /** Multiplies every radius and width — one knob for "same event, bigger". */
    scale: number;
    /** Ripples with a lower priority are the ones recycled when the pool overflows. */
    priority: number;
    color: string;
}

export interface RipplesConfig {
    enabled: boolean;
    /** Pool size in *rings*, not events: a 3-ring impact takes three slots. */
    maxRipples: number;
    /** Height above the system's own origin plane. Lifts the rings off the water to avoid z-fighting. */
    surfaceOffset: number;
    /** Colour the trough pushes the water toward. Keep it near the water's own darkest value. */
    troughColor: string;
    defaults: RippleOptions;
    opacityOverLife: Keyframe[];
}

export interface SprayConfig {
    enabled: boolean;
    maxParticles: number;
    emission: { burstCount: Range };
    lifetime: Range;
    spawn: { radius: number; height: number };
    direction: { upward: number; spreadDeg: number };
    velocity: { speed: Range };
    gravity: number;
    drag: number;
    size: Range;
    opacity: Range;
    color: { range: [string, string] };
    opacityOverLife: Keyframe[];
    scaleOverLife: Keyframe[];
}

export interface WaterPresetConfig {
    ripple: RippleOptions;
    spray: { count: number; speedScale: number };
}

export interface WaterVfxConfig {
    quality: QualityConfig;
    ripples: RipplesConfig;
    spray: SprayConfig;
    /** Preset used by `burst()` and by `emit()` when the name is unknown. */
    defaultPreset: string;
    presets: Record<string, WaterPresetConfig>;
}

/** Sanity ceilings. They exist to stop a mistyped zero from allocating a hundred-megabyte pool. */
const MAX_POOL = 20000;
const MAX_RINGS = 16;

/** Built-in presets. These are what ships if the JSON is missing, so they have to be usable. */
const PRESET_DEFAULTS: Record<string, { ripple: Partial<RippleOptions>; spray: { count: number; speedScale: number } }> = {
    impact: {
        ripple: { rings: 3, ringDelay: 0.13, startRadius: 0.05, maxRadius: 1.5, duration: 1.5, width: 0.1, intensity: 0.8 },
        spray: { count: 10, speedScale: 1 },
    },
    emergence: {
        ripple: { rings: 4, ringDelay: 0.28, startRadius: 0.45, maxRadius: 3.4, duration: 2.9, width: 0.2, intensity: 0.85, wobble: 0.08 },
        spray: { count: 22, speedScale: 1.3 },
    },
    ambient: {
        ripple: { rings: 2, ringDelay: 0.34, startRadius: 0.04, maxRadius: 0.85, duration: 2.2, width: 0.07, intensity: 0.3, priority: 0 },
        spray: { count: 0, speedScale: 0 },
    },
};

export function normalizeWaterConfig(raw: unknown): { config: WaterVfxConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const ripples = readRipples(section(root, "ripples"), issues);

    return {
        config: {
            quality: readQuality(section(root, "quality"), issues),
            ripples,
            spray: readSpray(section(root, "spray"), issues),
            defaultPreset: oneOfKey(root, "defaultPreset", "impact", issues),
            presets: readPresets(section(root, "presets"), ripples.defaults, issues),
        },
        issues,
    };
}

function oneOfKey(raw: Record<string, unknown> | undefined, key: string, def: string, issues: ConfigIssues): string {
    const v = raw?.[key];
    if (v === undefined) return def;
    if (typeof v !== "string" || !v) {
        issues.warn(key, `expected a preset name, got ${JSON.stringify(v)}`);
        return def;
    }
    return v;
}

function readQuality(raw: Record<string, unknown> | undefined, issues: ConfigIssues): QualityConfig {
    const presets = section(raw, "presets");
    const read = (name: QualityPresetName, defParticles: number, defRings: number) => {
        const p = section(presets, name);
        return {
            particles: num(p, "particles", defParticles, `quality.presets.${name}`, issues, 0, 4),
            rings: num(p, "rings", defRings, `quality.presets.${name}`, issues, 0, 4),
        };
    };
    return {
        preset: oneOf(raw, "preset", ["low", "high"] as const, "high", "quality", issues),
        presets: { low: read("low", 0.5, 0.6), high: read("high", 1, 1) },
    };
}

/**
 * Reads one ripple option set. Every key falls back to `def`, which is how a preset listing three
 * overrides still comes out complete.
 */
function readRippleOptions(raw: Record<string, unknown> | undefined, def: RippleOptions, path: string, issues: ConfigIssues): RippleOptions {
    return {
        rings: int(raw, "rings", def.rings, path, issues, 1, MAX_RINGS),
        ringDelay: num(raw, "ringDelay", def.ringDelay, path, issues, 0, 10),
        startRadius: num(raw, "startRadius", def.startRadius, path, issues, 0, 1000),
        maxRadius: num(raw, "maxRadius", def.maxRadius, path, issues, 0.001, 1000),
        duration: num(raw, "duration", def.duration, path, issues, 0.05, 60),
        width: num(raw, "width", def.width, path, issues, 0.001, 100),
        widthGrowth: num(raw, "widthGrowth", def.widthGrowth, path, issues, 0, 8),
        intensity: num(raw, "intensity", def.intensity, path, issues, 0, 4),
        wobble: num(raw, "wobble", def.wobble, path, issues, 0, 0.5),
        jitter: num(raw, "jitter", def.jitter, path, issues, 0, 1),
        scale: num(raw, "scale", def.scale, path, issues, 0.01, 20),
        priority: num(raw, "priority", def.priority, path, issues, 0, 10),
        color: colorHex(raw, "color", def.color, path, issues),
    };
}

const BASE_DEFAULTS: RippleOptions = {
    rings: 2,
    ringDelay: 0.16,
    startRadius: 0.05,
    maxRadius: 1.4,
    duration: 1.8,
    width: 0.11,
    widthGrowth: 0.65,
    intensity: 0.6,
    wobble: 0.045,
    jitter: 0.3,
    scale: 1,
    priority: 1,
    color: "#cfece2",
};

function readRipples(raw: Record<string, unknown> | undefined, issues: ConfigIssues): RipplesConfig {
    const p = "ripples";
    return {
        enabled: bool(raw, "enabled", true, p, issues),
        maxRipples: int(raw, "maxRipples", 48, p, issues, 1, MAX_POOL),
        surfaceOffset: num(raw, "surfaceOffset", 0.015, p, issues, -100, 100),
        troughColor: colorHex(raw, "troughColor", "#02100d", p, issues),
        defaults: readRippleOptions(section(raw, "defaults"), BASE_DEFAULTS, `${p}.defaults`, issues),
        opacityOverLife: keyframes(
            raw,
            "opacityOverLife",
            [
                [0, 0],
                [0.08, 1],
                [0.5, 0.7],
                [1, 0],
            ],
            p,
            issues,
        ),
    };
}

function readSpray(raw: Record<string, unknown> | undefined, issues: ConfigIssues): SprayConfig {
    const p = "spray";
    const emission = section(raw, "emission");
    const spawn = section(raw, "spawn");
    const direction = section(raw, "direction");
    const velocity = section(raw, "velocity");
    const color = section(raw, "color");

    return {
        enabled: bool(raw, "enabled", true, p, issues),
        maxParticles: int(raw, "maxParticles", 160, p, issues, 0, MAX_POOL),
        emission: { burstCount: range(emission, "burstCount", [8, 14], `${p}.emission`, issues, 0, MAX_POOL) },
        lifetime: range(raw, "lifetime", [0.35, 0.8], p, issues, 0.01, 60),
        spawn: {
            radius: num(spawn, "radius", 0.09, `${p}.spawn`, issues, 0, 1000),
            height: num(spawn, "height", 0.04, `${p}.spawn`, issues, 0, 1000),
        },
        direction: {
            upward: num(direction, "upward", 0.72, `${p}.direction`, issues, 0, 1),
            spreadDeg: num(direction, "spreadDeg", 34, `${p}.direction`, issues, 0, 180),
        },
        velocity: { speed: range(velocity, "speed", [1.1, 2.6], `${p}.velocity`, issues, 0, 200) },
        gravity: num(raw, "gravity", -9.8, p, issues, -200, 200),
        drag: num(raw, "drag", 0.5, p, issues, 0, 50),
        size: range(raw, "size", [0.018, 0.05], p, issues, 0.0001, 10),
        opacity: range(raw, "opacity", [0.45, 0.85], p, issues, 0, 1),
        color: { range: colorPair(color, "range", ["#e8f7f2", "#a4d4c8"], `${p}.color`, issues) },
        opacityOverLife: keyframes(
            raw,
            "opacityOverLife",
            [
                [0, 1],
                [0.6, 0.9],
                [1, 0],
            ],
            p,
            issues,
        ),
        scaleOverLife: keyframes(
            raw,
            "scaleOverLife",
            [
                [0, 1],
                [1, 0.65],
            ],
            p,
            issues,
        ),
    };
}

/**
 * Reads the preset table. Names are open: the three built-ins always exist, and any extra key in
 * the JSON becomes a preset too, so a new event type is a config edit rather than a code change.
 */
function readPresets(
    raw: Record<string, unknown> | undefined,
    defaults: RippleOptions,
    issues: ConfigIssues,
): Record<string, WaterPresetConfig> {
    const names = new Set<string>(Object.keys(PRESET_DEFAULTS));
    for (const key of Object.keys(raw ?? {})) {
        // `$about` notes live in the JSON next to real data; they are not presets.
        if (!key.startsWith("$")) names.add(key);
    }

    const out: Record<string, WaterPresetConfig> = {};
    for (const name of names) {
        const path = `presets.${name}`;
        const builtin = PRESET_DEFAULTS[name];
        const base = builtin ? { ...defaults, ...builtin.ripple } : defaults;
        const entry = section(raw, name);
        const spray = section(entry, "spray");
        out[name] = {
            ripple: readRippleOptions(entry, base, path, issues),
            spray: {
                count: int(spray, "count", builtin?.spray.count ?? 0, `${path}.spray`, issues, 0, MAX_POOL),
                speedScale: num(spray, "speedScale", builtin?.spray.speedScale ?? 1, `${path}.spray`, issues, 0, 20),
            },
        };
    }
    return out;
}
