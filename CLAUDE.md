# playable-kit — working on the kit itself

The kit is copied into playables as files (no packages). Everything here is written for that.

## Invariants

- `editor/files/**` mirrors a playable's root and is copied verbatim by `scripts/kit.mjs`. Nothing
  in it may name a specific game's classes (`ThreeC`, `TimeC`, `MapC`…). A game is reached only
  through `dev/editor.config.ts` (`EditorConfig`, `dev/kit/config.ts`) and `setKitHost`
  (`src/kit/host.ts`). Need something from the game? Add a hook to one of those two.
- `editor/files/src/**` ships in builds: keep it tiny, import only `three` and other `src/kit/`
  files. `routes.ts` is the only file allowed to import the vendored path-editor runtime.
- `editor/files/dev/**` never ships; it may import `src/` (relative), never the reverse.
- `editor/templates/**` are scaffolded once and then belong to the playable — never tracked.
- Vendored three-path-editor is updated only with `scripts/vendor-path-editor.mjs`, never edited.
  Package problems go to github.com/ka2nq1/three-js-path-editor.
- A change that requires playables to change something is **breaking**: say exactly what in
  `CHANGELOG.md`, and update `editor/INTEGRATION.md`.
- Skills in `skills/` are linked into `~/.claude/skills` by `scripts/link.sh`; keep them short,
  procedural, and in step with INTEGRATION.md / ADAPTER.md.

## Conventions

4-space indent, double quotes, TypeScript strict. Comments explain *why*; density like
`dev/kit/EditorMode.ts`. Same panel (`ControlPanel`) as vfx-lab — keep the two compatible.

## Verifying

The kit has no build of its own. Changes are verified in a playable (`npm start`, V), and only when
the user asks.
