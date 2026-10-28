/**
 * What a brand-new instance of an effect starts out as: one file per effect in
 * `src/resources/editor/defaults/`, holding a sensible starting point rather than the raw schema
 * defaults, so a freshly placed point already looks like the thing it is.
 *
 * Only this module reads that folder, and it lives outside `src/`, so nothing a build walks can
 * reach it: none of it ships, and nothing in it can put an effect on a map.
 */

// Root-relative: a playable's Vite root is `src/`, so this is `src/resources/editor/defaults/` wherever
// this file itself sits.
const DEFAULTS = import.meta.glob("/resources/editor/defaults/*.json", { eager: true }) as Record<string, { default: unknown }>;

export const DEFAULTS_ROOT = "src/resources/editor/defaults";

export function defaultsPath(effect: string): string {
    return `${DEFAULTS_ROOT}/${effect}.json`;
}

/** The settings a new instance starts with, or `{}` — every effect's normalizer fills the rest. */
export function defaultsFor(effect: string): unknown {
    for (const [path, module] of Object.entries(DEFAULTS)) {
        if (path.endsWith(`/${effect}.json`)) return structuredClone(module.default);
    }
    return {};
}
