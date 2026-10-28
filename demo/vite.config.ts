import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * The demo is a playable laid out exactly like a real one — `src/kit`, `src/vfx`, `dev/kit`,
 * `src/controllers/VFX`, `dev/vfx/entries` … — except that nothing is copied: the kit-owned parts
 * are read straight from playable-kit's own folders. So the demo always runs the kit as it is now,
 * and a broken import path here is a broken import path in every playable.
 *
 * `playableLayout` resolves a relative import the way it would resolve inside a playable: the
 * importer's real path is turned into its path *in a playable*, the import is joined to that, and
 * the result is turned back into a real file — from the table below, or from `demo/` itself.
 */

const DEMO = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(DEMO, "..");
const ADAPTERS = join(KIT, "vfx/adapters");

/** Playable path prefix → kit folder. Mirrors what `scripts/kit.mjs` copies where. */
const LAYOUT: Array<[string, string]> = [
    ["src/kit/", join(KIT, "editor/files/src/kit/")],
    ["src/vendor/", join(KIT, "editor/files/src/vendor/")],
    ["dev/kit/", join(KIT, "editor/files/dev/kit/")],
    ["dev/vendor/", join(KIT, "editor/files/dev/vendor/")],
    // A single file: no trailing slash, and the extension is found like any other import's.
    ["dev/boot", join(KIT, "editor/files/dev/boot")],
    ["src/vfx/", join(KIT, "vfx-lab/src/vfx/")],
];
/** Playable path prefixes that live in some `vfx/adapters/<id>/`. */
const ADAPTER_PREFIXES = ["src/controllers/VFX/", "dev/vfx/entries/", "dev/vfx/panels/"];

const EXTENSIONS = ["", ".ts", ".js", "/index.ts", "/index.js"];
const posix = (p: string) => p.split(sep).join("/");

function asFile(path: string): string | null {
    for (const ext of EXTENSIONS) {
        const candidate = path + ext;
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

/** Real file → its path inside a playable, or null when it belongs to neither the kit nor the demo. */
function toPlayable(real: string): string | null {
    const file = posix(real);
    for (const [prefix, dir] of LAYOUT) {
        const d = posix(dir);
        if (file === d || file.startsWith(d)) return prefix + file.slice(d.length);
    }
    const adapters = `${posix(ADAPTERS)}/`;
    if (file.startsWith(adapters)) return file.slice(adapters.length).split("/").slice(1).join("/");
    const demo = `${posix(DEMO)}/`;
    if (file.startsWith(demo)) return file.slice(demo.length);
    return null;
}

/** Path inside a playable → real file. */
function toReal(path: string): string | null {
    const own = asFile(join(DEMO, path));
    if (own) return own;
    for (const [prefix, dir] of LAYOUT) {
        if (path === prefix || path.startsWith(prefix)) return asFile(dir + path.slice(prefix.length));
    }
    if (ADAPTER_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        for (const id of readdirSync(ADAPTERS)) {
            const found = asFile(join(ADAPTERS, id, path));
            if (found) return found;
        }
    }
    return null;
}

function playableLayout(): Plugin {
    return {
        name: "playable-layout",
        enforce: "pre",
        async resolveId(source, importer) {
            if (!importer) return null;
            const [bare, query = ""] = source.split("?");
            // One `three` for everything: the lab's folder has its own node_modules.
            if (bare === "three" || bare.startsWith("three/")) {
                return this.resolve(source, join(DEMO, "src/main.ts"), { skipSelf: true });
            }
            if (!bare.startsWith(".")) return null;
            const from = toPlayable(importer.split("?")[0]);
            if (from === null) return null;
            const target = posix(join(dirname(from), bare));
            const real = toReal(target);
            return real ? real + (query ? `?${query}` : "") : null;
        },
    };
}

export default defineConfig({
    root: join(DEMO, "src"),
    // GitHub Pages serves the demo under /<repo>/.
    base: process.env.DEMO_BASE ?? "/",
    plugins: [playableLayout()],
    server: { fs: { allow: [KIT] }, open: true },
    build: { outDir: join(DEMO, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
