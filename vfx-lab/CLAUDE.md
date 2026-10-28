# VFX Lab — working notes

Authoring workbench for hand-written Three.js particle effects destined for playable ads.
Read `README.md` first; this file is the part that is easy to get wrong.

## The one rule

`src/vfx/` must stay importable into a playable on its own. It may import `three` and nothing
else — no lab modules, no UI, no asset paths, no `requestAnimationFrame`. `src/lab/` may import
from `src/vfx/`, never the reverse.

## Working agreement

- **Prioritize simple, maintainable, reusable, performant solutions.** The smallest implementation
  that meets the requirement wins.
- **Solve the requested problem only.** Do not expand scope without a clear reason; say what you
  left out instead of quietly adding more.
- **Do not overengineer.** No abstraction layer for a second case that does not exist yet.
- **Preserve existing behaviour.** Do not change gameplay, public APIs or the lifecycle contract of
  something you were not asked to touch.
- **Ask before running or looking.** Do not start the dev server, drive a browser, take screenshots
  or run `npm run shot` on your own initiative — ask first and wait. Implement, `npm run typecheck`,
  then state plainly which parts are unverified and offer to check them.

## Running and looking

```
npm start                 # vite on :5188
npm run typecheck
npm run shot -- --out shots/x.png --wait 6000     # needs `npm i -D playwright-core`
```

Do not claim an effect looks right without having looked — and do not look without being asked to.
Both commands above are **on request only**: propose the check, wait for a yes, then run it.
`npm run shot` drives the Chrome on the machine and writes a PNG; `--eval` runs arbitrary JS against
`__vfxLab` first (camera preset, disabling types, firing a burst), which is how you isolate one
particle type in a still.

`__vfxLab` exposes `app`, `environment`, `panel`, `effect` and `effect.debug` (`firePit`, or
`water` plus `debug.emit(preset, x, z)` for the ripples).

## Traps already paid for

- **Quad winding.** A billboard built from a velocity-derived basis flips triangle orientation if
  the perpendicular is rotated the wrong way, and back-face culling then eats the entire effect
  silently — correct attribute data, correct draw call, zero pixels. `StreakRenderer` uses
  `perp = vec2(dir.y, -dir.x)` and `side: DoubleSide`. If a new renderer builds its own basis,
  check winding before debugging anything else.
- **A `transparent` material with `side: DoubleSide` is drawn twice.** Three renders back faces
  then front faces unless `forceSinglePass: true`, which doubles the fill cost and makes any
  blend that is not idempotent land twice — `HeatDistortionVfx` would blend its refraction over
  itself. Set `forceSinglePass` on any double-sided transparent material whose shader is not
  cheap. Every other renderer in the package is currently taking the two-pass path — changing that
  would change how they look, so it is a deliberate decision, not a cleanup.
- **`smoothstep(edge0, edge1, x)` is undefined when `edge0 >= edge1`.** Write
  `1.0 - smoothstep(a, b, x)` rather than reversing the edges.
- **Sub-pixel particles vanish.** A spark sized correctly in world units covers less than a pixel
  at playable framing. `StreakRenderer` clamps width in screen space via `uMinWidth`; anything
  thin needs the same treatment.
- **Custom `ShaderMaterial` does not get the output transform for free.** Every fragment shader
  here ends with `#include <colorspace_fragment>`, and canvas textures are tagged
  `SRGBColorSpace`.
- **Linear vs sRGB in shader constants.** A colour written as a literal in a shader is linear.
  `Environment.ts` fades the ground to `vec3(0.0022, 0.0013, 0.0031)` — the linear form of the
  `0x08060a` background. Using the sRGB-looking value there produces a bright horizon band.

## Conventions

- 4-space indent, double quotes, TypeScript `strict`.
- Comments explain *why*, not what. The density in `src/vfx/core/` is the target.
- Per-frame code allocates nothing: scratch `Vector3`/`Color` live as instance fields, colours go
  through `resolveColor`, particles live in typed arrays in `ParticleBuffer`.
- Particle indices are **not** stable across frames — `ParticleBuffer.kill` swap-removes. Never
  hold an index past the loop that produced it.
- Config is JSON, validated through `src/vfx/core/config.ts` into a typed object. Never read raw
  JSON downstream, and never put a function in the JSON.

## Scope

Do not build out a full environment in `src/lab/Environment.ts`. It is set dressing so particles
can be judged in context; it stays at a few draw calls.
