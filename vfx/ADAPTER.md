# From a vfx-lab effect to a placeable, tunable map effect

The kit's `vfx-lab/` is the source of every effect (`npm run lab` from the kit root to preview).
`vfx-lab/src/vfx/` imports only `three`, which is what lets an effect copy into a playable as files.

Every lab effect already has an adapter in `vfx/adapters/<id>/`, laid out like a playable:

| File | Path in the playable | What |
| --- | --- | --- |
| `src/controllers/VFX/<Name>C.ts` | same | `defineMapVfx({ id, create, anchor, event?, singleton?, fitSize? })` — runtime, one instance per marker |
| `dev/vfx/entries/<id>.ts` | same | `vfxEntry(controller, { label, group, hint, defaults, schema?, controls?, preview? })` — its tile and editor |
| `dev/vfx/panels/*` (optional) | same | a curated panel passed as `controls` (see `waterfog`) |

The demo (`demo/`) uses exactly these files, so an adapter that works there works in a playable.

## Adding an effect to a playable

```
KIT=~/projects/playable-kit
node $KIT/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/core src/vfx/core               # once
node $KIT/scripts/kit.mjs copy <playable> vfx-lab/src/vfx/effects/<id> src/vfx/effects/<id>
node $KIT/scripts/kit.mjs copy <playable> vfx/adapters/<id>/src src
node $KIT/scripts/kit.mjs copy <playable> vfx/adapters/<id>/dev dev
```

Then two lines in the playable: `import x from "./entries/<id>"` into `VFX_ENTRIES` in
`dev/vfx/registry.ts`, and `<Name>C.init()` in the game after `setKitHost` (next to the other map
effects). Event effects (`event: true` — splash, impact, ripples) are fired by gameplay with
`<Name>C.burstAt(worldPosition)`.

## The editor side, without writing a panel

`vfxEntry` builds the effect's editor from its live config: every field the lab's normalizer
produces becomes a control (`[min, max]` pairs → range, `#hex` → colour, nested objects → folders),
and a change calls `applyConfig()`. A field added in the lab appears in the editor with no work.

- `schema` — fixes what the guess gets wrong: `{ "smoke.opacity": { min: 0, max: 1, step: 0.01 }, "mode": { options: ["low", "high"] }, "seed": { hidden: true } }`.
- `controls` — replaces the generated settings with a hand-written panel (the Effect and Anchor
  folders stay). Worth it for an effect people tune a lot; `waterfog` is the example.
- `preview.camera` — framing of the grid tile; `defaults` — the lab JSON a new instance starts from.

## Writing a new adapter

Copy the closest one. `create` is the lab constructor; `anchor.offset` is the usual lift off the
marker; `fitSize(vfx, size)` writes the anchor mesh's width into whichever config field means size
for this effect (`areaSize`, `surfaceSize`, …). Hand-write a controller only when the effect needs
more than one object per marker or its own scheduler — then keep the `MapVfxController` shape so
`vfxEntry` still works.

## Checklist

- `<Name>C.init()` is called in the game after `setKitHost`, otherwise markers place nothing.
- `src/vfx/core` copied once, not per effect.
- Transparent double-sided materials and the other traps: `vfx-lab/CLAUDE.md`.
- Every effect costs bundle size: note the export's HTML size before/after.
