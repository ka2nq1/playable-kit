/**
 * Loading, validating and exporting preset configurations.
 *
 * A preset is a *partial* config, which means loading one is just validation: the reader in
 * `config.ts` fills everything the preset does not mention from the schema defaults. There is no
 * merge step to keep in sync, and a field added to the schema tomorrow appears in all 24 presets
 * at its default without any of them being edited.
 */

import { ConfigIssues } from "../../core/config";
import { normalizeSkyConfig, SKY_CONFIG_VERSION, type SkyConfig } from "./config";
import { SKY_PRESET_DATA, type SkyPresetEntry } from "./presetData";

export type { SkyPresetEntry };

export const SKY_PRESET_IDS: readonly string[] = Object.keys(SKY_PRESET_DATA);

export function skyPresetLabel(id: string): string {
    return SKY_PRESET_DATA[id]?.label ?? id;
}

export function isSkyPreset(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(SKY_PRESET_DATA, id);
}

/**
 * Builds a fresh, fully-populated config for a preset.
 *
 * Always returns a new object, so the caller can hand it to the renderer and then let the panel
 * mutate it without touching the preset table.
 */
export function buildPresetConfig(id: string): { config: SkyConfig; issues: ConfigIssues } | null {
    const entry = SKY_PRESET_DATA[id];
    if (!entry) return null;
    const result = normalizeSkyConfig({ ...entry.config, id });
    result.config.id = id;
    return result;
}

export interface SkyImportResult {
    ok: boolean;
    config: SkyConfig | null;
    issues: ConfigIssues;
    /** Set when the input was rejected outright rather than repaired. */
    error: string | null;
}

/**
 * Validates arbitrary JSON (a pasted string, a dropped file) into a config.
 *
 * Anything repairable is repaired with a warning, the same as a hand-edited config file. Only two
 * things are fatal: input that is not an object at all, and a schema version this build does not
 * understand — reading a future schema would silently drop whatever it added.
 */
export function importSkyConfig(raw: unknown): SkyImportResult {
    let value = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch (err) {
            return { ok: false, config: null, issues: new ConfigIssues(), error: `not valid JSON (${String(err)})` };
        }
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, config: null, issues: new ConfigIssues(), error: "expected a JSON object" };
    }

    const version = (value as Record<string, unknown>).version;
    if (typeof version === "number" && version > SKY_CONFIG_VERSION) {
        return {
            ok: false,
            config: null,
            issues: new ConfigIssues(),
            error: `schema version ${version} is newer than this build supports (${SKY_CONFIG_VERSION})`,
        };
    }

    const { config, issues } = normalizeSkyConfig(value);
    return { ok: true, config, issues, error: null };
}

/**
 * A plain, portable copy of a config.
 *
 * The config object is already nothing but numbers, booleans and strings, so this is a structural
 * clone and not a serialiser — there is no three.js object, texture or function anywhere in it to
 * strip out. Runtime state (elapsed time, flash level, wind offset) lives on the system, never in
 * the config, which is why none of it can leak into an export.
 */
export function exportSkyConfig(config: SkyConfig): SkyConfig {
    return JSON.parse(JSON.stringify(config)) as SkyConfig;
}

/**
 * Dev check: every key in every built-in preset must exist in the schema.
 *
 * The validator warns about bad *values* but silently ignores unknown *keys* — that is deliberate
 * (it is how `$about` survives), and it means a misspelled section name in a preset does nothing
 * at all, with no warning, forever. With 24 presets and no test runner, that is how dead keys
 * accumulate. Returns the offending paths; `SkyVfx` reports them once.
 */
export function findUnknownPresetKeys(): string[] {
    const reference = normalizeSkyConfig({}).config as unknown as Record<string, unknown>;
    const problems: string[] = [];

    const walk = (node: Record<string, unknown>, ref: Record<string, unknown>, path: string): void => {
        for (const [key, value] of Object.entries(node)) {
            if (key.startsWith("$")) continue;
            const here = path ? `${path}.${key}` : key;
            if (!(key in ref)) {
                problems.push(here);
                continue;
            }
            const refValue = ref[key];
            if (value && typeof value === "object" && !Array.isArray(value) && refValue && typeof refValue === "object") {
                walk(value as Record<string, unknown>, refValue as Record<string, unknown>, here);
            }
        }
    };

    for (const [id, entry] of Object.entries(SKY_PRESET_DATA)) {
        walk(entry.config, reference, id);
    }
    return problems;
}
