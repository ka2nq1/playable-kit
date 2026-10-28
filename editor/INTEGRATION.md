# Installing the editor into a playable

See it first: the [live demo](https://ka2nq1.github.io/playable-kit/) is a playable built from these exact
files (`demo/` in this repo) — press V.

For a 3D playable on `@hitplay/playable_template` (three.js). 2D playables are out of scope.
`/kit-install-editor` follows this file step by step; when a step does not fit the project it stops
and offers the options listed under that step.

## What lands where

| Path in the playable | Owner | Ships? | What |
| --- | --- | --- | --- |
| `dev/boot.ts`, `dev/kit/**` | kit (tracked) | no | the editor |
| `dev/vendor/three-path-editor/` | kit (tracked) | no | path editor, editing half |
| `src/kit/**` | kit (tracked) | yes, tiny | markers, map-effect instances, anchor, routes |
| `src/vendor/three-path-editor/` | kit (tracked) | only if `src/kit/routes.ts` is imported | path editor runtime |
| `templateLibs/kitEditorPlugin.mjs` | kit (tracked) | no | dev-server injection + save endpoint |
| `dev/editor.config.ts` | playable | no | this game's half of the editor |
| `dev/vfx/registry.ts` | playable | no | the list of map effects (one tile each) |
| `dev/vfx/entries/`, `dev/vfx/panels/`, `src/controllers/VFX/` | kit adapters (tracked) | controllers yes | per effect — `vfx/ADAPTER.md` |
| `src/resources/editor/placements.json` | playable | yes | every marker and route |
| `src/resources/editor/defaults/` | playable | no | starting settings for new effect instances |
| `.kit.json` | playable | no | what was copied from where (see `scripts/kit.mjs`) |

Kit-owned files are never edited in the playable for project needs. A real bug fix there is fine —
`/kit-push` takes it back to the kit. Everything game-specific goes into `dev/editor.config.ts`.

## Steps

### 1. Copy

```
node ~/projects/playable-kit/scripts/kit.mjs install-editor <playable> --dry-run
node ~/projects/playable-kit/scripts/kit.mjs install-editor <playable>
```

Never overwrites. A file reported as *skipped* already exists with other content:
- a previous kit install → `kit.mjs status` / `/kit-pull`;
- the project's own file at the same path → rename one of them, or keep the project's and mark it
  `diverge` with the reason.

### 2. tsconfig and Vite root

The Vite root must be `src/` (the template's `rootDev`): `dev/kit/defaults.ts` globs
`/resources/editor/defaults/*.json` root-relative.


`dev/` must be type-checked with the game: `"include": ["src/**/*", "dev/**/*"]`.
If the project's tsconfig sets `rootDir: "src"`, drop it or widen it to `.`.

### 3. vite.config.js (project root)

```js
import { kitEditorPlugin } from "./templateLibs/kitEditorPlugin.mjs";
// ...
plugins: [...template.plugins, kitEditorPlugin()],
```

Options: `allow` — extra folders saves may write into (tunables outside `src/resources/editor`);
`reloadOnSave: true` — let a save reload the page (default: swallowed, the editor stays open).

The plugin is `apply: "serve"`; `@hitplay/ads_common` exports with `vite.build({ root: "src" })`,
which never loads the root config, so nothing here reaches an export.

### 4. Kit host — in the game, before any map effect initialises

Usually the top of `src/templateConfig/afterResourcesLoadedCb.ts`:

```ts
import { setKitHost } from "../kit/host";
import { findByName } from "../kit/findByName";
import placements from "../resources/editor/placements.json";

setKitHost({
    scene: ThreeC.scene,
    onUpdate: (cb) => TimeC.Instance.onUpdate.addDelegate(cb),   // the game's scaled delta
    findObject: (name) => findByName([MapC.container], name),
    placements: () => placements,
});
```

Several levels/maps with their own placements: return the current level's file from
`placements()` (an `import.meta.glob` over `src/resources/editor/<level>/placements.json`, as
Basketball does per map) and make `placementsPath()` in the config match.

### 5. `dev/editor.config.ts`

Scaffolded with `TODO(kit)` markers. Fill from the project:

| Field | Basketball | Sniper |
| --- | --- | --- |
| `scene` / `renderer` | `ThreeC.scene`, `ThreeC_internal.renderer` | `ThreeC.scene`, `ThreeC.renderer` |
| `camera()` | debug camera if active, else `CameraC.camera` | `CameraC.camera` |
| `onFrame` | `UpdateController.Instance.onUpdate.addListener(new Delegate(cb))` | `UpdateController.Instance.onUpdate.addDelegate(cb)` |
| `setPaused` | `DebugMode.setPaused(p)` | `TimeC.paused = p` + `PlayerC.setInputEnabled(!p)` |
| `onEnable/onDisable` | — | `hideChildren(CameraC.camera)`, `setFov(camera, 55)`, `CameraC.setEditorControl(on)` |
| `keepWaypointNames` | — | `true` (cinematics look points up by name) |
| `pathEditor` | — | `render.labelFormatter`, `canEdit` protecting mission routes |

`onFrame` must keep firing while the game is paused — it is the template's `UpdateController`,
never the game's `TimeC`.

### 6. Toggle key

`dev/boot.ts` uses **V**. If the game already binds V, change `TOGGLE_CODE` there and mark the file
`diverge` ("toggle key is X: V is taken").

### 7. Moving an existing editor over

A project with its own editor (Basketball's `dev/VfxDevMode.ts`, Sniper's `src/dev/PathEditorC.ts`):
- the old toggle and the kit's must not both be live — remove the old boot/import first;
- routes/markers files move into `src/resources/editor/placements.json`, or `placements()` returns
  the existing file and `placementsPath()` points at it;
- per-effect panels port mechanically: `VfxPanelContext` and `ControlPanel` are the same shapes,
  imports change to `dev/kit/...` and controllers to `src/kit/MapVfxInstances`.

Offer this as a separate step; never rip out a working editor silently.

## Using it

**V** toggles it. It opens in its own browser window (the first time the browser may ask to allow
pop-ups); **⇲ Dock** puts it beside the game instead, as a column you can drag wider. In the game
view: left drag orbits, right drag pans, wheel zooms. The game is paused while the editor is open;
effects keep animating off a wall clock. Keep the editor window beside the game, not over it: a
fully covered window is throttled by the browser.

The menu bar:
- **Scene** — every marker and route (three-path-editor). G gizmos, R rotate (yaw), Delete, Ctrl+Z; Save
  writes the placements file.
- **VFX** — a grid of every registered effect with a live preview (hover plays it) and how many are
  placed. A click opens the effect: its points as chips, Place / Duplicate / Delete / Fire, **Save
  point** (writes the settings into that marker), Save as default, Copy JSON, and all its controls.
- **Tune** — `tunables`: live JSON objects with a Save each.
- the project's own sections (`tabs`).

A save no longer reloads the page (the plugin swallows its own write), so the editor, camera and
round survive it.
