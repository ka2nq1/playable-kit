/**
 * Typed, validated view of `firepit-vfx.json`.
 *
 * The JSON is the authoring surface; this module is the contract. Nothing downstream reads raw
 * JSON, so an effect can assume every number is finite, every range is ordered and every colour
 * parses — the defaults below are what actually ships if the file is missing a key or wrong.
 *
 * The returned object is plain and mutable on purpose: the lab's sliders write straight into it
 * and the effects read it live, which is what makes tuning feel immediate.
 */

import type { Keyframe } from "../../core/curves";
import type { Range } from "../../core/random";
import { bool, colorHex, colorPair, ConfigIssues, int, keyframes, num, oneOf, range, section, vec3 } from "../../core/config";

export type QualityPresetName = "low" | "high";

export interface QualityConfig {
    preset: QualityPresetName;
    presets: Record<QualityPresetName, { particles: number; emission: number }>;
}

export interface SparksConfig {
    enabled: boolean;
    maxParticles: number;
    emission: { rate: number; burstCount: Range; autoBurstInterval: Range };
    lifetime: Range;
    spawn: { radius: number; height: number; offset: [number, number, number] };
    direction: { upward: number; spreadDeg: number };
    velocity: { speed: Range };
    gravity: number;
    drag: number;
    streak: { length: Range; lengthPerSpeed: number; thickness: Range; minWidth: number };
    color: { start: [string, string]; end: [string, string]; coreWhiteness: number };
    brightness: Range;
    flicker: { amount: number; speed: number };
    opacityOverLife: Keyframe[];
    scaleOverLife: Keyframe[];
}

export interface EmbersConfig {
    enabled: boolean;
    maxParticles: number;
    emission: { rate: number; burstCount: Range };
    lifetime: Range;
    spawn: { radius: number; height: number; offset: [number, number, number] };
    velocity: { rise: Range; lateral: number };
    buoyancy: number;
    drag: number;
    drift: { amplitude: Range; frequency: Range };
    size: Range;
    color: { range: [string, string]; accent: string; accentChance: number };
    brightness: Range;
    pulse: { amount: number; speed: Range };
    opacityOverLife: Keyframe[];
    scaleOverLife: Keyframe[];
}

export interface SmokeConfig {
    enabled: boolean;
    maxParticles: number;
    emission: { rate: number; burstCount: Range };
    lifetime: Range;
    spawn: { radius: number; height: number; offset: [number, number, number] };
    velocity: { rise: Range; lateral: number };
    buoyancy: number;
    drag: number;
    drift: { amplitude: Range; frequency: Range };
    size: Range;
    expansion: number;
    rotation: { startDeg: Range; speedDeg: Range };
    color: { range: [string, string]; accent: string; accentChance: number };
    opacity: Range;
    opacityOverLife: Keyframe[];
    scaleOverLife: Keyframe[];
}

export interface FirePitVfxConfig {
    quality: QualityConfig;
    sparks: SparksConfig;
    embers: EmbersConfig;
    smoke: SmokeConfig;
}

/** Sanity ceilings. They exist to stop a mistyped zero from allocating a hundred-megabyte pool. */
const MAX_POOL = 20000;
const MAX_RATE = 5000;

export function normalizeFirePitConfig(raw: unknown): { config: FirePitVfxConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    return {
        config: {
            quality: readQuality(section(root, "quality"), issues),
            sparks: readSparks(section(root, "sparks"), issues),
            embers: readEmbers(section(root, "embers"), issues),
            smoke: readSmoke(section(root, "smoke"), issues),
        },
        issues,
    };
}

function readQuality(raw: Record<string, unknown> | undefined, issues: ConfigIssues): QualityConfig {
    const presets = section(raw, "presets");
    const read = (name: QualityPresetName, defParticles: number, defEmission: number) => {
        const p = section(presets, name);
        return {
            particles: num(p, "particles", defParticles, `quality.presets.${name}`, issues, 0, 4),
            emission: num(p, "emission", defEmission, `quality.presets.${name}`, issues, 0, 4),
        };
    };
    return {
        preset: oneOf(raw, "preset", ["low", "high"] as const, "high", "quality", issues),
        presets: { low: read("low", 0.4, 0.45), high: read("high", 1, 1) },
    };
}

function readSparks(raw: Record<string, unknown> | undefined, issues: ConfigIssues): SparksConfig {
    const p = "sparks";
    const emission = section(raw, "emission");
    const spawn = section(raw, "spawn");
    const direction = section(raw, "direction");
    const velocity = section(raw, "velocity");
    const streak = section(raw, "streak");
    const color = section(raw, "color");
    const flicker = section(raw, "flicker");

    return {
        enabled: bool(raw, "enabled", true, p, issues),
        maxParticles: int(raw, "maxParticles", 500, p, issues, 0, MAX_POOL),
        emission: {
            rate: num(emission, "rate", 24, `${p}.emission`, issues, 0, MAX_RATE),
            burstCount: range(emission, "burstCount", [14, 30], `${p}.emission`, issues, 0, MAX_POOL),
            autoBurstInterval: range(emission, "autoBurstInterval", [0.55, 1.7], `${p}.emission`, issues, 0, 120),
        },
        lifetime: range(raw, "lifetime", [0.25, 0.75], p, issues, 0.01, 60),
        spawn: {
            radius: num(spawn, "radius", 0.4, `${p}.spawn`, issues, 0, 1000),
            height: num(spawn, "height", 0.08, `${p}.spawn`, issues, 0, 1000),
            offset: vec3(spawn, "offset", [0, 0.05, 0], `${p}.spawn`, issues),
        },
        direction: {
            upward: num(direction, "upward", 0.78, `${p}.direction`, issues, 0, 1),
            spreadDeg: num(direction, "spreadDeg", 58, `${p}.direction`, issues, 0, 180),
        },
        velocity: { speed: range(velocity, "speed", [3.6, 9.5], `${p}.velocity`, issues, 0, 500) },
        gravity: num(raw, "gravity", -11, p, issues, -200, 200),
        drag: num(raw, "drag", 1.8, p, issues, 0, 50),
        streak: {
            length: range(streak, "length", [0.08, 0.2], `${p}.streak`, issues, 0.001, 50),
            lengthPerSpeed: num(streak, "lengthPerSpeed", 0.026, `${p}.streak`, issues, 0, 10),
            thickness: range(streak, "thickness", [0.016, 0.034], `${p}.streak`, issues, 0.0005, 10),
            minWidth: num(streak, "minWidth", 0.003, `${p}.streak`, issues, 0, 0.1),
        },
        color: {
            start: colorPair(color, "start", ["#fff6d2", "#ffd072"], `${p}.color`, issues),
            end: colorPair(color, "end", ["#ff5a12", "#b81c05"], `${p}.color`, issues),
            coreWhiteness: num(color, "coreWhiteness", 0.5, `${p}.color`, issues, 0, 1),
        },
        brightness: range(raw, "brightness", [0.9, 1.6], p, issues, 0, 20),
        flicker: {
            amount: num(flicker, "amount", 0.3, `${p}.flicker`, issues, 0, 1),
            speed: num(flicker, "speed", 34, `${p}.flicker`, issues, 0, 500),
        },
        opacityOverLife: keyframes(raw, "opacityOverLife", [[0, 0], [0.05, 1], [0.6, 0.9], [1, 0]], p, issues),
        scaleOverLife: keyframes(raw, "scaleOverLife", [[0, 0.7], [0.15, 1], [1, 0.3]], p, issues),
    };
}

function readEmbers(raw: Record<string, unknown> | undefined, issues: ConfigIssues): EmbersConfig {
    const p = "embers";
    const emission = section(raw, "emission");
    const spawn = section(raw, "spawn");
    const velocity = section(raw, "velocity");
    const drift = section(raw, "drift");
    const color = section(raw, "color");
    const pulse = section(raw, "pulse");

    return {
        enabled: bool(raw, "enabled", true, p, issues),
        maxParticles: int(raw, "maxParticles", 260, p, issues, 0, MAX_POOL),
        emission: {
            rate: num(emission, "rate", 16, `${p}.emission`, issues, 0, MAX_RATE),
            burstCount: range(emission, "burstCount", [8, 16], `${p}.emission`, issues, 0, MAX_POOL),
        },
        lifetime: range(raw, "lifetime", [2.2, 5.2], p, issues, 0.01, 120),
        spawn: {
            radius: num(spawn, "radius", 1.3, `${p}.spawn`, issues, 0, 1000),
            height: num(spawn, "height", 0.25, `${p}.spawn`, issues, 0, 1000),
            offset: vec3(spawn, "offset", [0, 0.08, 0], `${p}.spawn`, issues),
        },
        velocity: {
            rise: range(velocity, "rise", [0.4, 1], `${p}.velocity`, issues, -100, 100),
            lateral: num(velocity, "lateral", 0.18, `${p}.velocity`, issues, 0, 100),
        },
        buoyancy: num(raw, "buoyancy", 0.12, p, issues, -50, 50),
        drag: num(raw, "drag", 0.3, p, issues, 0, 50),
        drift: {
            amplitude: range(drift, "amplitude", [0.1, 0.45], `${p}.drift`, issues, 0, 50),
            frequency: range(drift, "frequency", [0.2, 0.7], `${p}.drift`, issues, 0, 50),
        },
        size: range(raw, "size", [0.05, 0.14], p, issues, 0.001, 100),
        color: {
            range: colorPair(color, "range", ["#ff3c0a", "#ff9b2e"], `${p}.color`, issues),
            accent: colorHex(color, "accent", "#ffe08a", `${p}.color`, issues),
            accentChance: num(color, "accentChance", 0.18, `${p}.color`, issues, 0, 1),
        },
        brightness: range(raw, "brightness", [0.65, 1.7], p, issues, 0, 20),
        pulse: {
            amount: num(pulse, "amount", 0.35, `${p}.pulse`, issues, 0, 1),
            speed: range(pulse, "speed", [1.2, 3.8], `${p}.pulse`, issues, 0, 100),
        },
        opacityOverLife: keyframes(raw, "opacityOverLife", [[0, 0], [0.12, 1], [0.7, 0.85], [1, 0]], p, issues),
        scaleOverLife: keyframes(raw, "scaleOverLife", [[0, 0.7], [0.25, 1], [1, 0.55]], p, issues),
    };
}

function readSmoke(raw: Record<string, unknown> | undefined, issues: ConfigIssues): SmokeConfig {
    const p = "smoke";
    const emission = section(raw, "emission");
    const spawn = section(raw, "spawn");
    const velocity = section(raw, "velocity");
    const drift = section(raw, "drift");
    const rotation = section(raw, "rotation");
    const color = section(raw, "color");

    return {
        enabled: bool(raw, "enabled", true, p, issues),
        maxParticles: int(raw, "maxParticles", 110, p, issues, 0, MAX_POOL),
        emission: {
            rate: num(emission, "rate", 9, `${p}.emission`, issues, 0, MAX_RATE),
            burstCount: range(emission, "burstCount", [3, 6], `${p}.emission`, issues, 0, MAX_POOL),
        },
        lifetime: range(raw, "lifetime", [2.6, 6], p, issues, 0.01, 120),
        spawn: {
            radius: num(spawn, "radius", 1, `${p}.spawn`, issues, 0, 1000),
            height: num(spawn, "height", 0.15, `${p}.spawn`, issues, 0, 1000),
            offset: vec3(spawn, "offset", [0, 0.15, 0], `${p}.spawn`, issues),
        },
        velocity: {
            rise: range(velocity, "rise", [0.35, 0.85], `${p}.velocity`, issues, -100, 100),
            lateral: num(velocity, "lateral", 0.3, `${p}.velocity`, issues, 0, 100),
        },
        buoyancy: num(raw, "buoyancy", 0.05, p, issues, -50, 50),
        drag: num(raw, "drag", 0.45, p, issues, 0, 50),
        drift: {
            amplitude: range(drift, "amplitude", [0.08, 0.3], `${p}.drift`, issues, 0, 50),
            frequency: range(drift, "frequency", [0.12, 0.45], `${p}.drift`, issues, 0, 50),
        },
        size: range(raw, "size", [0.42, 0.9], p, issues, 0.001, 100),
        expansion: num(raw, "expansion", 0.5, p, issues, 0, 50),
        rotation: {
            startDeg: range(rotation, "startDeg", [0, 360], `${p}.rotation`, issues, -3600, 3600),
            speedDeg: range(rotation, "speedDeg", [-20, 20], `${p}.rotation`, issues, -3600, 3600),
        },
        color: {
            range: colorPair(color, "range", ["#262220", "#584d45"], `${p}.color`, issues),
            accent: colorHex(color, "accent", "#7d5a44", `${p}.color`, issues),
            accentChance: num(color, "accentChance", 0.35, `${p}.color`, issues, 0, 1),
        },
        opacity: range(raw, "opacity", [0.2, 0.42], p, issues, 0, 1),
        opacityOverLife: keyframes(raw, "opacityOverLife", [[0, 0], [0.2, 1], [0.6, 0.8], [1, 0]], p, issues),
        scaleOverLife: keyframes(raw, "scaleOverLife", [[0, 0.5], [1, 1]], p, issues),
    };
}
