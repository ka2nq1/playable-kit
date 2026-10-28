# Changelog

## Unreleased

- **One repository.** three-js-path-editor is now `path-editor/` and vfx-lab is `vfx-lab/` (merged with history). `kit.mjs copy` takes a kit path (`vfx-lab/src/vfx/effects/<id>`) instead of `vfx-lab:<path>`; `.kit.json` records `kit.commit` and kit-relative `from`. Root `package.json`: `setup`, `lab`, `path-editor:*`, `vendor`. Skills updated.

- Skill `daily-report` moved into the kit (was a local skill on one machine).

## 0.1.0 — 2026-10-28

- Editor merged from Basketball Stars 1v1 (V mode: marker = effect, per-instance settings, Place tab, panel tabs as a dropdown, dev/ outside the Vite root, serve-only plugin) and Pure Sniper Choice-Driven (named waypoints kept on delete, camera FOV / camera-children helpers, project tabs), on three-path-editor 0.5.0 (isolateUi, pivotUnderPointer, yaw gizmo, Visuals tab, camera rigs).
- Game-specific parts moved behind `dev/editor.config.ts` (`EditorConfig`) and `setKitHost`.
- New: pop-out panel window; Tune tab (auto-built controls for live JSON configs); saves no longer reload the page; `src/kit/routes.ts` with live route editing.
- `scripts/kit.mjs` — tracked copying between kit / vfx-lab and playables.
- Skills: kit-install-editor, vfx-new, kit-note, kit-push, kit-pull, kit-review. Agents: scout, coder.
