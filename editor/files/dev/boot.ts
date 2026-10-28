/**
 * The editor's entry point, and the only thing that reaches into `dev/`.
 *
 * Nothing under `src/` imports this file or anything beside it. The dev server injects a script tag
 * for it into the served page (`kitEditorPlugin` in `templateLibs/kitEditorPlugin.mjs`,
 * `apply: "serve"`), so the editor attaches itself to a game that has no idea it exists, and a build
 * cannot ship what it never hears about. What a build does carry is the *result*: the JSON the
 * editor writes under `src/resources/editor/`, and the small readers in `src/kit/`.
 */

/** Toggles the editor. Change it here if the game already uses the key. */
const TOGGLE_CODE = "KeyV";

let loading = false;

document.addEventListener("keydown", (event) => {
    if (event.repeat || event.code !== TOGGLE_CODE || loading) return;
    const tag = (event.target as Element | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    loading = true;
    import("./editor.config")
        .then((m) => m.default.toggle())
        .catch((err) => console.warn("[editor] failed to load", err))
        .finally(() => {
            loading = false;
        });
});

console.info("[editor] available — press V");
