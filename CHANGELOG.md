# Changelog

## Unreleased

- **Editor redesign** (breaking for anything built on 0.1): its own window by default (dock as fallback), a menu bar of sections — Scene, VFX, Tune, project tabs — and a status line. VFX is a grid of tiles with live previews rendered from the effects themselves; a tile opens the effect's editor (points as chips, actions, controls in columns). `placeTab`/`tabSelect`/`embed.css` removed; `VfxDevEntry` gains `group`, `hint`, `preview`, `burst`, `defaultConfig`.
- `defineMapVfx()` (runtime) + `vfxEntry()` (editor): a map effect in two small files, with controls generated from the effect's config. Adapters for all 16 lab effects in `vfx/adapters/`.
- `EditorConfig.saveDisabled` — Save becomes a no-op with a note beside every Save button (the public demo).
- `defaults.ts` globs root-relative (`/resources/editor/defaults/`): the playable's Vite root must be `src/`.
- `demo/`: Campfire Night, a playable built straight from the kit's files, deployed to GitHub Pages on every push.

- **One repository.** three-js-path-editor is now `path-editor/` and vfx-lab is `vfx-lab/` (merged with history). `kit.mjs copy` takes a kit path (`vfx-lab/src/vfx/effects/<id>`) instead of `vfx-lab:<path>`; `.kit.json` records `kit.commit` and kit-relative `from`. Root `package.json`: `setup`, `lab`, `path-editor:*`, `vendor`. Skills updated.

- Skill `daily-report` moved into the kit (was a local skill on one machine).

## 0.1.0 — 2026-10-28

- Editor merged from Basketball Stars 1v1 (V mode: marker = effect, per-instance settings, Place tab, panel tabs as a dropdown, dev/ outside the Vite root, serve-only plugin) and Pure Sniper Choice-Driven (named waypoints kept on delete, camera FOV / camera-children helpers, project tabs), on three-path-editor 0.5.0 (isolateUi, pivotUnderPointer, yaw gizmo, Visuals tab, camera rigs).
- Game-specific parts moved behind `dev/editor.config.ts` (`EditorConfig`) and `setKitHost`.
- New: pop-out panel window; Tune tab (auto-built controls for live JSON configs); saves no longer reload the page; `src/kit/routes.ts` with live route editing.
- `scripts/kit.mjs` — tracked copying between kit / vfx-lab and playables.
- Skills: kit-install-editor, vfx-new, kit-note, kit-push, kit-pull, kit-review. Agents: scout, coder.
