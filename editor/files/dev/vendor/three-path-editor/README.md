# three-path-editor 0.5.0 — editor half (vendored by playable-kit)

`editor.js` / `editor.d.ts` from three-path-editor's `dist/`, with their chunk imports rewritten to
`../../../src/vendor/three-path-editor/dist/` so the editor and the game share one copy of `Path`
and `PathFollower`. Dev-only: nothing under `src/` may import it. Updated with
`playable-kit/scripts/vendor-path-editor.mjs`.
