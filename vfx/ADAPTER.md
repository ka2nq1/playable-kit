# From a vfx-lab effect to a placeable, tunable map effect

The kit's `vfx-lab/` is the source of every effect (`npm run lab` from the kit root to preview).
`vfx-lab/src/vfx/` imports only `three`; that rule is what lets an effect copy into a playable as
files. A playable gets an effect in four pieces:

| Piece | Path in the playable | Copied from |
| --- | --- | --- |
| core (once) | `src/vfx/core/` | `vfx-lab/src/vfx/core/` (tracked) |
| effect | `src/vfx/effects/<id>/*.ts` | `vfx-lab/src/vfx/effects/<id>/` (tracked) |
| controller | `src/controllers/VFX/<Name>C.ts` | written per effect — `adapters/waterfog/` is the reference |
| panel + entry | `dev/vfx/panels/<name>Panel.ts` + an entry in `dev/vfx/registry.ts` | ported from `vfx-lab/src/lab/effects/<name>LabEffect.ts` `buildControls` |

plus `src/resources/editor/defaults/<id>.json` — the lab's `*-vfx.json` with an `anchor` section,
or the matching file from `vfx/defaults/` (Basketball's tuned starting points; their `anchor.mesh`
names Basketball meshes — clear it).

Copy with tracking so `/kit-pull` sees later lab fixes:

```
node ~/projects/playable-kit/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/core src/vfx/core
node ~/projects/playable-kit/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/effects/waterfog src/vfx/effects/waterfog
```

The copied `*-vfx.json` is the lab's example config; the game never imports it, so it costs nothing.

## The controller

`adapters/waterfog/src/controllers/VFX/WaterFogC.ts`. The shape never changes:

- `static readonly ID` — what `metadata.mapVfx` says.
- `MapVfxInstances` with `create` (effect from `markerConfig(marker)`, add to `kitHost().scene`,
  `normalizeAnchor`), `fit`, `update`, `dispose`.
- `fit()` — `fitToAnchor(anchor, marker)` → position, yaw, optional `fitSize`. Called on every drag.
- `exportConfig()` — `{ anchor: exportAnchor(...), ...vfx.config }`.
- `init()` called once from the game after `setKitHost`; `tick(dt)` for the editor.
- Event effects (splashes, impacts) add a public `playAt(position)` that picks
  `instances.nearest(...)`; gameplay calls that, never the vfx class directly.
- `singleton: true` for what is the whole scene (a sky).

## The panel

Port the lab's `buildControls` 1:1 — the kit's `ControlPanel` is the lab's plus `rangeRows` and
focus handling, so bindings copy across. Then:
- replace the lab's download/preset-file buttons with `ctx.save()` / `ctx.saveAsDefault()` / `ctx.copy()`;
- add `buildAnchorFolder(...)` after the first folder;
- drop lab-only folders (preview water, environment).

## The registry entry

`adapters/waterfog/registry-entry.ts` — add to `VFX_ENTRIES` in `dev/vfx/registry.ts`.
`tick` must be the controller's `tick`, or the effect freezes while the editor is open.

## Checklist that catches the usual misses

- `<Name>C.init()` is called in the game (after `setKitHost`), otherwise markers place nothing.
- `src/vfx/core` copied once, not per effect; the effect imports `../../core/...`.
- Transparent double-sided materials: see `vfx-lab/CLAUDE.md` "Traps already paid for".
- A generic adapter goes back to `vfx/adapters/<id>/` so the next playable reuses it.
- Every effect added costs bundle size: note the export's HTML size before/after (`/size-audit`).
