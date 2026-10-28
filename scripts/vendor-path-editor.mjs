#!/usr/bin/env node
/**
 * Refreshes the kit's vendored three-path-editor from a built checkout of the package.
 *
 *   node scripts/vendor-path-editor.mjs [path-to-three-js-path-editor]   (default ../three-js-path-editor)
 *
 * Runtime files go to `editor/files/src/vendor/three-path-editor/dist/` (they may ship); the editor
 * bundle goes to `editor/files/dev/vendor/three-path-editor/` with its chunk imports rewritten to
 * the runtime copy, so game and editor share one `Path`. Build the package first (`npm run build`).
 * Playables then pick the update up with `kit.mjs pull`.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = resolve(process.argv[2] ?? join(KIT_ROOT, "../three-js-path-editor"));
const dist = join(pkg, "dist");
if (!existsSync(join(dist, "editor.js"))) {
    console.error(`no built dist in ${pkg} — run npm run build there first`);
    process.exit(1);
}

const runtimeDir = join(KIT_ROOT, "editor/files/src/vendor/three-path-editor");
const editorDir = join(KIT_ROOT, "editor/files/dev/vendor/three-path-editor");
const RUNTIME_FROM_EDITOR = "../../../src/vendor/three-path-editor/dist/";

rmSync(join(runtimeDir, "dist"), { recursive: true, force: true });
mkdirSync(join(runtimeDir, "dist"), { recursive: true });
mkdirSync(editorDir, { recursive: true });

for (const name of readdirSync(dist)) {
    if (name.endsWith(".map")) continue;
    if (name.startsWith("editor.")) {
        const text = readFileSync(join(dist, name), "utf8").replace(/from (['"])\.\//g, `from $1${RUNTIME_FROM_EDITOR}`);
        writeFileSync(join(editorDir, name), text);
    } else if (name.startsWith("vite.")) {
        continue; // the kit has its own save endpoint
    } else {
        copyFileSync(join(dist, name), join(runtimeDir, "dist", name));
    }
}
copyFileSync(join(pkg, "LICENSE"), join(runtimeDir, "LICENSE"));
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
writeFileSync(join(runtimeDir, "package.json"), `${JSON.stringify({ name: "three-path-editor", version, license: "MIT", private: true }, null, 4)}\n`);
console.log(`vendored three-path-editor ${version} — update the version in both vendor READMEs and CHANGELOG.md`);
