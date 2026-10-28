---
name: vfx-new
description: Create a new VFX from a prompt (or bring an existing lab effect) — author it in playable-kit's vfx-lab, then add it to the current playable as a placeable, tunable map effect in the kit editor. Use when the user asks for a new effect / vfx / particles / shader effect, or to add a lab effect to the playable.
---

# New VFX → kit's vfx-lab → current playable

Everything is in one repo, `~/projects/playable-kit` (KIT below):
- `KIT/vfx-lab/` — the effects lab. Read `KIT/vfx-lab/CLAUDE.md` and its README first; its rules
  are binding for anything under `vfx-lab/src/vfx/`.
- `KIT/vfx/ADAPTER.md` — how an effect becomes a map effect; `KIT/vfx/adapters/waterfog/` is the reference.

## 0. Reuse before building (cheap)

Delegate to the `scout` agent: "list effects in KIT/vfx-lab (`src/lab/registry.ts` ids + hints,
each effect's config keys) and adapters in KIT/vfx/adapters that could produce: <prompt>". If one is
close, ask (AskUserQuestion): *use <effect> with new settings* / *extend <effect> with a new option* /
*new effect*. A new preset of an existing effect is a defaults JSON, not a new effect.

## 1. Clarify only what changes the build

At most one round, only questions whose answer changes the implementation: one-shot or continuous;
event-driven (who triggers it); size on screen at playable framing; reference image. Defaults for
the rest — say which you assumed.

## 2. Author it in KIT/vfx-lab

Lab conventions exactly: `vfx-lab/src/vfx/effects/<id>/` with `<Name>Vfx.ts`, `config.ts` (validated
through `src/vfx/core/config.ts`), `index.ts`, `<id>-vfx.json`; a handle in
`vfx-lab/src/lab/effects/<name>LabEffect.ts` with `buildControls`; one entry in
`vfx-lab/src/lab/registry.ts`; a row in its README table. Imports `three` only; no per-frame allocations.

The hard part — do it yourself on the main model, never delegate shaders or visual logic.

## 3. Bring it into the playable

```
node KIT/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/core src/vfx/core            # once per playable
node KIT/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/effects/<id> src/vfx/effects/<id>
```

A new effect also gets its adapter in the kit first — `KIT/vfx/adapters/<id>/` (copy the closest
one: `src/controllers/VFX/<Name>C.ts` with `defineMapVfx`, `dev/vfx/entries/<id>.ts` with `vfxEntry`;
the generated controls usually suffice, add a `schema` for bad ranges). Register it in the demo
(`KIT/demo/src/game/vfx.ts` and `KIT/demo/dev/vfx/registry.ts`) so it shows in the public demo's grid.

Then into the playable, per ADAPTER.md: `kit.mjs copy` of `vfx/adapters/<id>/src` → `src` and
`/dev` → `dev`, one import in `dev/vfx/registry.ts`, `<Name>C.init()` in the game next to the other
map effects. Editor not installed in this playable → stop and offer `/kit-install-editor` first.

Never place the effect by writing coordinates into `placements.json` — the user places it with
V → VFX → its tile → "+ Place". Event effects: wire a gameplay trigger only if the user named one.

## 4. Report

Files in the kit, files in the playable, how to see it (lab: `npm run lab` in KIT; demo: `npm run demo`
in KIT, or the public demo after the push; playable: V → VFX → its tile), what is unverified; the
size cost is unknown until an export. Offer in one line to commit and push the kit.
