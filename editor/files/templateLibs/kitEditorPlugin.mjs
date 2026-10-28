/**
 * The editor's whole presence in the dev server, and nothing in a build (`apply: "serve"`).
 *
 * 1. Injects `dev/boot.ts` into the served page. `dev/` sits outside the Vite root (`src/`), so no
 *    game module references the editor, not even a dead one behind a flag. The tag points at
 *    `/@fs/<abs>/dev/boot.ts`; `boot.ts` imports `../src/...` by relative path and Vite rewrites
 *    those to the same URLs the game uses, so the editor talks to the game's own singletons.
 *
 * 2. Serves `POST /__kit/save` `{ file, json }`, which overwrites a JSON file in the project. Only
 *    JSON under the allowed folders, parsed before it is written, so a save either lands a valid
 *    file or says why not. The endpoint is open to anything that can reach the dev server, so it
 *    refuses to be a general-purpose file writer.
 *
 * 3. Swallows the hot update a save would trigger. The browser already holds exactly what was
 *    written — it is where the values came from — so reloading the page would only throw away the
 *    editor, the camera pose and the round. A file changed by anything else still reloads as usual.
 *
 * Note: `@hitplay/ads_common` builds with `vite.build({ root: <project>/src })`, which never loads
 * the project-root `vite.config.js`, so this plugin cannot reach an export even by mistake.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Must match `SAVE_ENDPOINT` in `dev/kit/devSave.ts`. */
export const SAVE_ENDPOINT = "/__kit/save";

const DEFAULT_ALLOW = ["src/resources/editor"];
const MAX_BYTES = 4 * 1024 * 1024;
/** How long after a save its own file-change event is still ours to swallow. */
const OWN_WRITE_WINDOW_MS = 3000;

function readBody(req) {
    return new Promise((done, fail) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BYTES) {
                fail(new Error("payload too large"));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
        req.on("error", fail);
    });
}

/**
 * @param {{ allow?: string[], reloadOnSave?: boolean }} [options]
 *   `allow` — project-relative folders saves may write into (default `src/resources/editor`).
 *   `reloadOnSave` — let Vite reload the page after a save, as it would for any edit (default false).
 */
export function kitEditorPlugin(options = {}) {
    const allow = (options.allow ?? DEFAULT_ALLOW).map((dir) => dir.replace(/\/+$/, ""));
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const bootEntry = resolve(projectRoot, "dev/boot.ts");
    /** Absolute path → time of our own write. */
    const ownWrites = new Map();

    const isAllowed = (file) => {
        const target = resolve(projectRoot, file);
        const rel = relative(projectRoot, target).split(sep).join("/");
        if (rel.startsWith("..") || !rel.endsWith(".json")) return false;
        return allow.some((dir) => rel.startsWith(`${dir}/`));
    };

    return {
        name: "playable-kit-editor",
        apply: "serve",

        transformIndexHtml() {
            return [{ tag: "script", attrs: { type: "module", src: `/@fs${bootEntry}` }, injectTo: "body" }];
        },

        handleHotUpdate(ctx) {
            if (options.reloadOnSave) return;
            const at = ownWrites.get(resolve(ctx.file));
            if (at === undefined) return;
            ownWrites.delete(resolve(ctx.file));
            if (Date.now() - at <= OWN_WRITE_WINDOW_MS) return [];
        },

        configureServer(server) {
            server.middlewares.use(SAVE_ENDPOINT, (req, res, next) => {
                if (req.method !== "POST") {
                    next();
                    return;
                }
                const reply = (code, message) => {
                    res.statusCode = code;
                    res.setHeader("Content-Type", "text/plain");
                    res.end(message);
                };

                readBody(req)
                    .then(async (body) => {
                        const { file, json } = JSON.parse(body);
                        if (typeof file !== "string" || typeof json !== "string") {
                            reply(400, "expected { file, json }");
                            return;
                        }
                        if (!isAllowed(file)) {
                            reply(403, `refusing to write outside ${allow.join(", ")}: ${file}`);
                            return;
                        }
                        JSON.parse(json);

                        const target = resolve(projectRoot, file);
                        await mkdir(dirname(target), { recursive: true });
                        ownWrites.set(target, Date.now());
                        await writeFile(target, json.endsWith("\n") ? json : `${json}\n`, "utf8");
                        console.log(`[kit-editor] wrote ${file}`);
                        reply(200, "ok");
                    })
                    .catch((err) => reply(400, String(err?.message ?? err)));
            });
        },
    };
}
