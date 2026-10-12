/**
 * Config validation primitives.
 *
 * Tuning happens in JSON, which means a typo lands at runtime with no compiler to catch it. Every
 * reader here takes a default, clamps to a legal range and records *why* it rejected a value, so
 * a bad config degrades to a working effect plus a precise console warning instead of a black
 * screen or a NaN that quietly poisons every particle position.
 */

import type { Keyframe } from "./curves";
import type { Range } from "./random";

export class ConfigIssues {
    readonly warnings: string[] = [];

    warn(path: string, message: string): void {
        this.warnings.push(`${path}: ${message}`);
    }

    /** Prints everything collected, once, under a collapsed group. */
    report(label: string): void {
        if (!this.warnings.length) return;
        console.warn(`[${label}] ${this.warnings.length} config issue(s), defaults used:\n  ${this.warnings.join("\n  ")}`);
    }
}

type Raw = Record<string, unknown> | undefined;

/** `JSON.stringify` turns NaN and Infinity into `null`, which hides the actual mistake. */
function show(v: unknown): string {
    return typeof v === "number" ? String(v) : JSON.stringify(v);
}

export function section(raw: Raw, key: string): Raw {
    const v = raw?.[key];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function num(raw: Raw, key: string, def: number, path: string, issues: ConfigIssues, min = -Infinity, max = Infinity): number {
    const v = raw?.[key];
    if (v === undefined) return def;
    if (typeof v !== "number" || !Number.isFinite(v)) {
        issues.warn(`${path}.${key}`, `expected a finite number, got ${show(v)}`);
        return def;
    }
    if (v < min || v > max) {
        issues.warn(`${path}.${key}`, `${v} is outside [${min}, ${max}], clamped`);
        return Math.min(max, Math.max(min, v));
    }
    return v;
}

export function int(raw: Raw, key: string, def: number, path: string, issues: ConfigIssues, min = 0, max = Infinity): number {
    return Math.round(num(raw, key, def, path, issues, min, max));
}

export function bool(raw: Raw, key: string, def: boolean, path: string, issues: ConfigIssues): boolean {
    const v = raw?.[key];
    if (v === undefined) return def;
    if (typeof v !== "boolean") {
        issues.warn(`${path}.${key}`, `expected a boolean, got ${JSON.stringify(v)}`);
        return def;
    }
    return v;
}

/**
 * Reads a `[min, max]` pair. A reversed pair is swapped rather than rejected — it is the most
 * common hand-edit mistake and the author's intent is unambiguous.
 */
export function range(raw: Raw, key: string, def: Range, path: string, issues: ConfigIssues, min = -Infinity, max = Infinity): Range {
    const v = raw?.[key];
    if (v === undefined) return [def[0], def[1]];
    if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        issues.warn(`${path}.${key}`, `expected [min, max] numbers, got ${show(v)}`);
        return [def[0], def[1]];
    }
    let [a, b] = v as [number, number];
    if (a > b) {
        issues.warn(`${path}.${key}`, `min ${a} > max ${b}, swapped`);
        [a, b] = [b, a];
    }
    return [Math.min(max, Math.max(min, a)), Math.min(max, Math.max(min, b))];
}

export function vec3(raw: Raw, key: string, def: [number, number, number], path: string, issues: ConfigIssues): [number, number, number] {
    const v = raw?.[key];
    if (v === undefined) return [...def];
    if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        issues.warn(`${path}.${key}`, `expected [x, y, z] numbers, got ${show(v)}`);
        return [...def];
    }
    return [v[0], v[1], v[2]] as [number, number, number];
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function colorHex(raw: Raw, key: string, def: string, path: string, issues: ConfigIssues): string {
    const v = raw?.[key];
    if (v === undefined) return def;
    if (typeof v !== "string" || !HEX.test(v)) {
        issues.warn(`${path}.${key}`, `expected a "#rgb"/"#rrggbb" colour, got ${JSON.stringify(v)}`);
        return def;
    }
    return v;
}

export function colorPair(raw: Raw, key: string, def: [string, string], path: string, issues: ConfigIssues): [string, string] {
    const v = raw?.[key];
    if (v === undefined) return [...def];
    if (!Array.isArray(v) || v.length !== 2 || v.some((c) => typeof c !== "string" || !HEX.test(c))) {
        issues.warn(`${path}.${key}`, `expected two hex colours, got ${JSON.stringify(v)}`);
        return [...def];
    }
    return [v[0], v[1]] as [string, string];
}

/**
 * Reads `[[time, value], ...]` keyframes. Times outside [0,1] are clamped by {@link Curve}; an
 * empty or malformed list falls back to the default so a curve never ends up undefined.
 */
export function keyframes(raw: Raw, key: string, def: Keyframe[], path: string, issues: ConfigIssues): Keyframe[] {
    const v = raw?.[key];
    if (v === undefined) return def.map((k) => [k[0], k[1]] as Keyframe);
    const ok =
        Array.isArray(v) &&
        v.length > 0 &&
        v.every((k) => Array.isArray(k) && k.length === 2 && k.every((n) => typeof n === "number" && Number.isFinite(n)));
    if (!ok) {
        issues.warn(`${path}.${key}`, `expected [[time, value], ...] pairs, got ${JSON.stringify(v)}`);
        return def.map((k) => [k[0], k[1]] as Keyframe);
    }
    return (v as Keyframe[]).map((k) => [k[0], k[1]] as Keyframe);
}

export function oneOf<T extends string>(raw: Raw, key: string, options: readonly T[], def: T, path: string, issues: ConfigIssues): T {
    const v = raw?.[key];
    if (v === undefined) return def;
    if (typeof v !== "string" || !options.includes(v as T)) {
        issues.warn(`${path}.${key}`, `expected one of ${options.join(" | ")}, got ${JSON.stringify(v)}`);
        return def;
    }
    return v as T;
}
