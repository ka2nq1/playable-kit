# playable-kit — working on the kit itself

One repository for everything a playable takes from us, copied into playables as files (no packages):

| Folder | What | Own rules |
| --- | --- | --- |
| `editor/` | the in-game editor, copied by `scripts/kit.mjs` | below |
| `vfx-lab/` | effects workbench; `vfx-lab/src/vfx/` is what playables copy | `vfx-lab/CLAUDE.md` |
| `path-editor/` | three-path-editor source (tests, demo, build) | `path-editor/CLAUDE.md` |
| `vfx/` | adapters that make lab effects editor map effects | `vfx/ADAPTER.md` |
| `skills/`, `agents/`, `rules/` | Claude Code side | — |

Work inside `vfx-lab/` or `path-editor/` follows that folder's CLAUDE.md as well. Each has its own
`package.json` and `node_modules` (`npm run setup` at the root installs both); there is no workspace.

## Invariants

- `editor/files/**` mirrors a playable's root and is copied verbatim by `scripts/kit.mjs`. Nothing
  in it may name a specific game's classes (`ThreeC`, `TimeC`, `MapC`…). A game is reached only
  through `dev/editor.config.ts` (`EditorConfig`, `dev/kit/config.ts`) and `setKitHost`
  (`src/kit/host.ts`). Need something from the game? Add a hook to one of those two.
- `editor/files/src/**` ships in builds: keep it tiny, import only `three` and other `src/kit/`
  files. `routes.ts` is the only file allowed to import the vendored path-editor runtime.
- `editor/files/dev/**` never ships; it may import `src/` (relative), never the reverse.
- `editor/templates/**` are scaffolded once and then belong to the playable — never tracked.
- The editor's vendored path editor (`editor/files/*/vendor/three-path-editor/`) is generated: change
  `path-editor/src`, then `npm run vendor`. Never edit the vendored copy.
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
