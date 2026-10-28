---
name: vfx-new
description: Create a new VFX from a prompt (or bring an existing vfx-lab effect) — author it in ~/projects/vfx-lab, then add it to the current playable as a placeable, tunable map effect in the kit editor. Use when the user asks for a new effect / vfx / particles / shader effect, or to add a lab effect to the playable.
---

# New VFX → vfx-lab → current playable

Sources: vfx-lab `~/projects/vfx-lab` (read its `CLAUDE.md` and `README.md` first — its rules are
binding for anything under `src/vfx/`); kit `~/projects/playable-kit/vfx/ADAPTER.md` (how an effect
becomes a map effect; `vfx/adapters/waterfog/` is the reference).

## 0. Reuse before building (cheap)

Delegate to the `scout` agent: "list vfx-lab effects (`src/lab/registry.ts` ids + hints, each
effect's config keys) that could produce: <prompt>". If one is close, ask the user (AskUserQuestion):
*use <effect> with new settings* / *extend <effect> with a new option* / *new effect*. A new preset
of an existing effect is a defaults JSON, not a new effect.

## 1. Clarify only what changes the build

At most one round of questions, and only those whose answer changes the implementation: one-shot
or continuous; event-driven (who triggers it); screen size at playable framing; any reference image.
Defaults for the rest — say which you assumed.

## 2. Author it in vfx-lab

Follow vfx-lab's conventions exactly: `src/vfx/effects/<id>/` with `<Name>Vfx.ts`, `config.ts`
(validated through `src/vfx/core/config.ts`), `index.ts`, `<id>-vfx.json`; a lab handle in
`src/lab/effects/<name>LabEffect.ts` with `buildControls`; one entry in `src/lab/registry.ts`;
a row in README's table. Imports `three` only. No per-frame allocations.

This is the hard part — do it yourself on the main model, never delegate shaders/visual logic.

## 3. Bring it into the playable

```
node ~/projects/playable-kit/scripts/kit.mjs copy <playable> vfx-lab:src/vfx/core src/vfx/core     # if not there yet
node ~/projects/playable-kit/scripts/kit.mjs copy <playable> vfx-lab:src/vfx/effects/<id> src/vfx/effects/<id>
```

Then per ADAPTER.md: controller `src/controllers/VFX/<Name>C.ts`, panel `dev/vfx/panels/<name>Panel.ts`
(port `buildControls`), entry in `dev/vfx/registry.ts`, `src/resources/editor/defaults/<id>.json`,
and `<Name>C.init()` in the game next to the other map effects. If the editor is not installed in
this playable, stop and offer `/kit-install-editor` first.

Do **not** place the effect by writing coordinates into `placements.json` — the user places it with
V → Place → "+ Place it". Event effects: wire the gameplay trigger only if the user named one.

## 4. Report

Files in vfx-lab, files in the playable, how to see it (lab: `npm start` in vfx-lab → picker;
playable: V → Place), what is unverified, and the size cost is unknown until an export. Offer, in
one line, to commit vfx-lab.
