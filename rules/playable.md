# Rules for every playable built with the kit

A playable's `CLAUDE.md` points here and adds only what is specific to that game.
Grown from Pure Sniper Choice-Driven, Basketball Stars and vfx-lab; extended by `/kit-review`.

## Budget

- Ship target: the `npm run export` HTML ≤ **4.6 MB** (hard limit 5 MB). Every new asset, effect or
  library is a size question first; say the expected cost when adding one.
- Runs in old WebKit / WKWebView: no `ctx.filter`, no exotic composite modes; feature-detect with a
  full fallback.

## Code

1. No duplication — extract shared code. Reuse before building: check the project, sibling
   playables and vfx-lab first.
2. No magic values in logic: timings, speeds, colours, copy go into named config — preferably a
   JSON the editor's Tune tab can edit live.
3. Positions never live in code: they are markers or routes in `placements.json`, looked up by id
   or metadata, never by index.
4. Events over per-frame polling; sequence by awaiting completion, not `wait(duration * ratio)`.
5. Animations: one-shot = a tween with a single owner per property; looping motion is driven
   deterministically from time — never `.yoyo().repeat(Infinity)`.
6. Per-frame paths allocate nothing (scratch `Vector3`/`Quaternion` as fields), traverse nothing,
   tick nothing that is not active.
7. Match the orientation convention of what you replace (flips, `flipY`, model forward axis).
   Canvas textures: opposite `flipY`, `SRGBColorSpace`.
8. One `UpdateController` loop — never a `requestAnimationFrame` of your own.
9. Bug fixes address the root cause.
10. Comments only for the non-obvious (a trade-off, a workaround, an ordering requirement).

## The editor

- Anything a designer would want to move or tune must be reachable from the editor: a marker, a
  route, a map-effect config or a tunable. If it isn't, that is a kit gap → `/kit-note`.
- Kit-owned files are not edited for project needs; project specifics go in `dev/editor.config.ts`.

## VFX

- Effects come from vfx-lab (`/vfx-new`). vfx-lab's "Traps already paid for" apply here too:
  quad winding, double-sided transparent materials drawing twice, `smoothstep` edge order,
  sub-pixel particles, `#include <colorspace_fragment>`, linear vs sRGB constants.

## Working agreement

- Planning, root-cause analysis, shaders, physics, camera and anything visual stay on the main model.
  Lookups go to `scout`, fully specified mechanical edits to `coder`.
- No dev server, builds, screenshots or browser checks unless the user asks; finish with what is
  unverified and offer the check in one line.
- Problems with the kit itself: workaround minimal, then `/kit-note`.
