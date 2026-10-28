#!/usr/bin/env node
/**
 * Keeps a playable's copied files in step with their sources — playable-kit and vfx-lab.
 *
 * Nothing is installed as a package: files are copied, and `.kit.json` in the playable remembers,
 * for every copied file, where it came from and the hash it had when copied (the *base*). That makes
 * every file a three-way question — base, the playable's copy (local), the source today (upstream):
 *
 *   clean      local = base = upstream
 *   local      only the playable changed it        → candidate for `push`
 *   upstream   only the source changed it          → `pull` applies it
 *   conflict   both changed it, differently        → merge by hand, then `resolve`
 *   divergent  marked as a deliberate local difference; never pulled, never pushed
 *
 *   node scripts/kit.mjs install-editor <playable> [--dry-run]
 *   node scripts/kit.mjs copy <playable> <kit|vfx-lab>:<from> <to> [--dry-run]
 *   node scripts/kit.mjs status <playable> [--all]
 *   node scripts/kit.mjs pull <playable> [file...] [--dry-run]
 *   node scripts/kit.mjs push <playable> <file...>
 *   node scripts/kit.mjs resolve <playable> <file...>
 *   node scripts/kit.mjs diverge <playable> <file> <reason...>
 *   node scripts/kit.mjs undiverge <playable> <file>
 *
 * Paths given for files are playable-relative. Never deletes anything; never overwrites a file it
 * does not track, and never overwrites a local change.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = {
    kit: KIT_ROOT,
    "vfx-lab": process.env.VFX_LAB ?? resolve(KIT_ROOT, "../vfx-lab"),
};
const MANIFEST = ".kit.json";
const EDITOR_FILES = "editor/files";
const EDITOR_TEMPLATES = "editor/templates";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const args = argv.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");

const posix = (p) => p.split(sep).join("/");
const hashOf = (file) => (existsSync(file) ? createHash("sha1").update(readFileSync(file)).digest("hex") : null);

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === ".DS_Store") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

function commitOf(root) {
    try {
        return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
        return "uncommitted";
    }
}

function loadManifest(playable) {
    const file = join(playable, MANIFEST);
    if (!existsSync(file)) return { sources: {}, files: {} };
    return JSON.parse(readFileSync(file, "utf8"));
}

function saveManifest(playable, manifest) {
    if (dryRun) return;
    const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(playable, MANIFEST), `${JSON.stringify({ ...manifest, files: sorted }, null, 4)}\n`);
}

function copy(from, to) {
    if (dryRun) return;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
}

function stamp(manifest, source) {
    manifest.sources[source] = { path: SOURCES[source], commit: commitOf(SOURCES[source]) };
}

function upstreamPath(entry) {
    return join(SOURCES[entry.source], entry.from);
}

function stateOf(playable, file, entry) {
    if (entry.divergent) return "divergent";
    const local = hashOf(join(playable, file));
    const upstream = hashOf(upstreamPath(entry));
    if (local === null) return "missing";
    if (upstream === null) return "gone-upstream";
    if (local === upstream) return local === entry.hash ? "clean" : "in-sync";
    if (local === entry.hash) return "upstream";
    if (upstream === entry.hash) return "local";
    return "conflict";
}

/** Copies one tracked file from a source into the playable, refusing to clobber anything. */
function track(playable, manifest, source, from, to, report) {
    const src = join(SOURCES[source], from);
    const dest = join(playable, to);
    const existing = manifest.files[to];
    const srcHash = hashOf(src);
    const destHash = hashOf(dest);

    if (destHash !== null && destHash !== srcHash && !(existing && destHash === existing.hash)) {
        report.skipped.push(`${to} (exists with different content — not overwritten)`);
        if (!existing) manifest.files[to] = { source, from, hash: destHash, note: "pre-existing, differs from source" };
        return;
    }
    if (destHash !== srcHash) copy(src, dest);
    manifest.files[to] = { ...(existing ?? {}), source, from, hash: srcHash };
    report.copied.push(to);
}

function cmdInstallEditor(playable) {
    const manifest = loadManifest(playable);
    const report = { copied: [], skipped: [], scaffolded: [] };
    const root = join(KIT_ROOT, EDITOR_FILES);
    for (const file of walk(root)) {
        const rel = posix(relative(root, file));
        track(playable, manifest, "kit", `${EDITOR_FILES}/${rel}`, rel, report);
    }
    // Templates are the playable's own from the first copy on: scaffolded once, never tracked.
    const templates = join(KIT_ROOT, EDITOR_TEMPLATES);
    for (const file of walk(templates)) {
        const rel = posix(relative(templates, file));
        if (existsSync(join(playable, rel))) continue;
        copy(file, join(playable, rel));
        report.scaffolded.push(rel);
    }
    stamp(manifest, "kit");
    saveManifest(playable, manifest);
    print(report);
}

function cmdCopy(playable, spec, to) {
    const [source, from] = spec.split(/:(.+)/);
    if (!SOURCES[source] || !from || !to) throw new Error("usage: copy <playable> <kit|vfx-lab>:<from> <to>");
    const manifest = loadManifest(playable);
    const report = { copied: [], skipped: [] };
    const src = join(SOURCES[source], from);
    if (!existsSync(src)) throw new Error(`no such file in ${source}: ${from}`);
    if (statSync(src).isDirectory()) {
        for (const file of walk(src)) {
            const rel = posix(relative(src, file));
            track(playable, manifest, source, `${from.replace(/\/$/, "")}/${rel}`, `${to.replace(/\/$/, "")}/${rel}`, report);
        }
    } else {
        track(playable, manifest, source, from, to, report);
    }
    stamp(manifest, source);
    saveManifest(playable, manifest);
    print(report);
}

function cmdStatus(playable) {
    const manifest = loadManifest(playable);
    const groups = {};
    for (const [file, entry] of Object.entries(manifest.files)) {
        const state = stateOf(playable, file, entry);
        (groups[state] ??= []).push(entry.divergent ? `${file} — ${entry.divergent}` : `${file}  [${entry.source}]`);
    }
    const order = ["conflict", "local", "upstream", "in-sync", "missing", "gone-upstream", "divergent", "clean"];
    for (const state of order) {
        const files = groups[state];
        if (!files) continue;
        if (state === "clean" && !flags.has("--all")) {
            console.log(`clean: ${files.length} file(s)`);
            continue;
        }
        console.log(`${state}:`);
        for (const f of files) console.log(`  ${f}`);
    }
    if (!Object.keys(manifest.files).length) console.log("nothing tracked — run install-editor or copy first");
}

function cmdPull(playable, only) {
    const manifest = loadManifest(playable);
    const report = { copied: [], skipped: [] };
    for (const [file, entry] of Object.entries(manifest.files)) {
        if (only.length && !only.includes(file)) continue;
        const state = stateOf(playable, file, entry);
        if (state === "upstream" || state === "missing") {
            copy(upstreamPath(entry), join(playable, file));
            entry.hash = hashOf(upstreamPath(entry));
            report.copied.push(file);
        } else if (state === "in-sync") {
            entry.hash = hashOf(upstreamPath(entry));
        } else if (state === "conflict" || state === "local") {
            report.skipped.push(`${file} (${state} — merge by hand, then resolve)`);
        }
    }
    // A kit file the playable has never had: new in the kit since the install.
    const root = join(KIT_ROOT, EDITOR_FILES);
    if (!only.length && Object.values(manifest.files).some((e) => e.source === "kit" && e.from.startsWith(EDITOR_FILES))) {
        for (const file of walk(root)) {
            const rel = posix(relative(root, file));
            if (!manifest.files[rel]) track(playable, manifest, "kit", `${EDITOR_FILES}/${rel}`, rel, report);
        }
    }
    for (const source of new Set(Object.values(manifest.files).map((e) => e.source))) stamp(manifest, source);
    saveManifest(playable, manifest);
    print(report);
}

function cmdPush(playable, files) {
    const manifest = loadManifest(playable);
    for (const file of files) {
        const entry = manifest.files[file];
        if (!entry) throw new Error(`${file} is not tracked`);
        if (entry.divergent) throw new Error(`${file} is marked divergent: ${entry.divergent}`);
        const state = stateOf(playable, file, entry);
        if (state !== "local") throw new Error(`${file} is ${state}; only a local-only change can be pushed`);
        copy(join(playable, file), upstreamPath(entry));
        entry.hash = hashOf(join(playable, file));
        console.log(`pushed ${file} → ${entry.source}:${entry.from}`);
    }
    saveManifest(playable, manifest);
}

function cmdResolve(playable, files) {
    const manifest = loadManifest(playable);
    for (const file of files) {
        const entry = manifest.files[file];
        if (!entry) throw new Error(`${file} is not tracked`);
        // The playable's copy now contains upstream's changes; what is left over is its own.
        entry.hash = hashOf(upstreamPath(entry));
        console.log(`resolved ${file}`);
    }
    saveManifest(playable, manifest);
}

function cmdDiverge(playable, file, reason, on) {
    const manifest = loadManifest(playable);
    const entry = manifest.files[file];
    if (!entry) throw new Error(`${file} is not tracked`);
    if (on) entry.divergent = reason || "deliberate local difference";
    else delete entry.divergent;
    saveManifest(playable, manifest);
    console.log(`${file}: ${on ? `divergent — ${entry.divergent}` : "tracked normally again"}`);
}

function print(report) {
    for (const [key, list] of Object.entries(report)) {
        if (!list.length) continue;
        console.log(`${key}${dryRun ? " (dry run)" : ""}: ${list.length}`);
        for (const item of list) console.log(`  ${item}`);
    }
}

const [command, playableArg, ...rest] = args;
try {
    if (!command || !playableArg) throw new Error("usage: see the header of scripts/kit.mjs");
    const playable = resolve(playableArg);
    if (!existsSync(join(playable, "package.json"))) throw new Error(`${playable} is not a project (no package.json)`);
    switch (command) {
        case "install-editor": cmdInstallEditor(playable); break;
        case "copy": cmdCopy(playable, rest[0], rest[1]); break;
        case "status": cmdStatus(playable); break;
        case "pull": cmdPull(playable, rest); break;
        case "push": cmdPush(playable, rest); break;
        case "resolve": cmdResolve(playable, rest); break;
        case "diverge": cmdDiverge(playable, rest[0], rest.slice(1).join(" "), true); break;
        case "undiverge": cmdDiverge(playable, rest[0], "", false); break;
        default: throw new Error(`unknown command ${command}`);
    }
} catch (err) {
    console.error(`kit: ${err.message}`);
    process.exit(1);
}
