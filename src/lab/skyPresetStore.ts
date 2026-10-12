/**
 * Custom sky presets, saved in the browser.
 *
 * Lab-side on purpose. `src/vfx` has no business knowing that `localStorage` exists — an effect
 * that reads browser storage is one more thing a playable has to reason about — so the built-in
 * preset library lives in the effect and the *saving* of custom ones lives here.
 *
 * Storage is best-effort throughout: a private window, a blocked origin or a full quota all throw
 * on write, and none of those are worth losing a tuning session over. Every call fails quietly
 * and says so in the console.
 */

import { importSkyConfig, type SkyConfig } from "../vfx/effects/sky";

const KEY = "vfx-lab:sky-presets:v1";

export interface StoredPreset {
    id: string;
    label: string;
    config: SkyConfig;
}

type StoreShape = Record<string, { label: string; config: unknown }>;

function read(): StoreShape {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoreShape) : {};
    } catch {
        return {};
    }
}

function write(store: StoreShape): boolean {
    try {
        localStorage.setItem(KEY, JSON.stringify(store));
        return true;
    } catch (err) {
        console.warn("[vfx-lab] could not save custom presets", err);
        return false;
    }
}

/** Ids of every saved preset, sorted so the dropdown order is stable between reloads. */
export function listCustomPresets(): string[] {
    return Object.keys(read()).sort();
}

export function customPresetLabel(id: string): string {
    return read()[id]?.label ?? id;
}

/**
 * Loads and re-validates a stored preset.
 *
 * Re-validating rather than trusting it matters: this data was written by an older build of the
 * schema and has been sitting in a browser since.
 */
export function loadCustomPreset(id: string): SkyConfig | null {
    const entry = read()[id];
    if (!entry) return null;
    const result = importSkyConfig(entry.config);
    if (!result.ok || !result.config) {
        console.warn(`[vfx-lab] stored preset "${id}" could not be read: ${result.error}`);
        return null;
    }
    result.issues.report(`stored preset "${id}"`);
    return result.config;
}

export function saveCustomPreset(id: string, label: string, config: SkyConfig): boolean {
    const store = read();
    store[id] = { label, config: JSON.parse(JSON.stringify(config)) };
    return write(store);
}

export function deleteCustomPreset(id: string): boolean {
    const store = read();
    if (!(id in store)) return false;
    delete store[id];
    return write(store);
}

export function renameCustomPreset(id: string, label: string): boolean {
    const store = read();
    if (!store[id]) return false;
    store[id].label = label;
    return write(store);
}

/** Turns a typed name into an id that is safe as a dropdown value and a JSON key. */
export function slugify(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || `preset-${Date.now()}`;
}
