# VFX Lab

A workbench for hand-written Three.js particle effects: build an effect once, tune it live in the
browser, then drop the same files into a playable.

The lab exists because playable ads cannot afford a general-purpose particle engine. Every effect
here is plain Three.js — one `Object3D`, one `update(dt)` — with no runtime dependency beyond
`three` itself, so taking an effect to production is a copy of one folder, not an integration.

```
npm install
npm start          # http://localhost:5188
```

---

## What is in the box

| Path | What it is |
| --- | --- |
| `src/vfx/core/` | Reusable particle machinery: pooling, instanced renderers, procedural textures, curves, config validation, the shared scene-colour grab. |
| `src/vfx/effects/firepit/` | The first effect — a fire pit: sparks, embers and smoke, plus its JSON config. |
| `src/vfx/effects/lavasurface/` | An animated lava surface: one subdivided plane, a procedural crust-and-crack shader, plus its JSON config. |
| `src/vfx/effects/lavaimpact/` | A lava impact burst: the flash, the molten tongues it throws, the droplets they shed and the glow left cooling, plus its JSON config. |
| `src/vfx/effects/heatdistortion/` | Refracting hot air above a heat source: one camera-facing quad reading a shared framebuffer grab, plus a sampling-free low mode and its JSON config. |
| `src/vfx/effects/icesurface/` | A procedural ice surface: one transparent plane that shows the scene through itself, with screen-space refraction, fractures, trapped bubbles and frost, eight presets, plus its JSON config. |
| `src/vfx/effects/glowingcracks/` | A procedural glowing crack network: one quad, a shader with separate base / core / glow layers, plus its JSON config. |
| `src/vfx/effects/water/` | Event-driven surface ripples: expanding rings, spray droplets, three presets, plus its JSON config. |
| `src/vfx/effects/watersplash/` | A water impact: the crown that leaps out of the surface, the droplets it throws and the rings it leaves, plus its JSON config. |
| `src/vfx/effects/fireflies/` | Ambient drifting lights, animated entirely in the vertex shader, plus its JSON config. |
| `src/vfx/effects/watersurface/` | An animated water surface: one subdivided plane shaded procedurally, plus its JSON config. |
| `src/vfx/effects/waterfog/` | Drifting mist over a water surface: one instanced draw of noise-shaded planes, plus its JSON config. |
| `src/vfx/effects/swampbubbles/` | Gas bubbles breaking a stagnant surface: shaded domes, pop rings and the odd droplet, plus its JSON config. |
| `src/vfx/effects/risingembers/` | Glowing embers rising off a hot surface: one instanced draw animated entirely in the vertex shader, plus its JSON config. |
| `src/vfx/effects/smokewisps/` | Thin strands of smoke rising off a smouldering surface: one instanced draw of curling ribbons, plus its JSON config. |
| `src/vfx/effects/snowstorm/` | A localized moving blizzard: a dense volume of camera-facing impostors with wind-driven snow streaming through it, drifting across the background on its own transform, with optional lightning buried inside it, plus its JSON config. |
| `src/vfx/effects/sky/` | The sky and atmosphere system: a one-draw-call procedural sky with sun, moon, stars and clouds, GPU-driven weather particles, lightning, optional fog and lighting synchronisation, a day/night cycle and 24 built-in presets, plus its JSON config. |
| `src/lab/` | The preview harness: renderer, loop, set dressing (volcanic ground, preview water, the under-ice lake and its fish), control panel. **Never shipped.** |
| `scripts/shot.mjs` | Headless screenshot of the running lab, for before/after comparisons. |

The split matters: `src/vfx/` has no idea the lab exists. It imports `three` and nothing else.

---

## The fire pit effect

Three visually distinct types sharing one pit:

- **Sparks** — short velocity-aligned streaks, fast, gravity-bound, white-hot head cooling to
  red. Emitted as a continuous trickle plus irregular bursts.
- **Embers** — slow glowing motes that rise, sway on a per-particle sine, and pulse. Additive, so
  overlapping embers build brightness.
- **Smoke** — soft warm-grey puffs that rise, swell and dissolve. Alpha-blended, deliberately
  faint, each with its own rotation so the texture never repeats visibly.

### Using it in a game

```ts
import { FirePitVfx } from "./vfx/effects/firepit";
import firePitConfig from "./vfx/effects/firepit/firepit-vfx.json";

const firePit = new FirePitVfx(firePitConfig);
firePit.object3d.position.set(0, 0, -4);
scene.add(firePit.object3d);
firePit.start();

// inside the game loop you already have:
firePit.update(deltaSeconds);

// on teardown:
firePit.dispose();
```

There is no `requestAnimationFrame` anywhere in `src/vfx/`. The effect advances only when your
loop hands it a delta, so it inherits your pause, your time scale and your frame pacing.

### Lifecycle

| Call | Effect |
| --- | --- |
| `start()` | Begins continuous emission. Idempotent. |
| `stop()` | Stops emitting; particles already alive finish their lifetime. |
| `burst(position?, { count?, speedScale? })` | Emits one burst immediately, running or not. `firePit.sparks.burst()` hits one type only. |
| `update(dt)` | Advances the simulation. Call once per frame. |
| `reset()` | Clears live particles and emission state instantly. |
| `dispose()` | Releases the geometries, materials and textures the effect created. |
| `setQuality("low" \| "high")` | Scales particle caps and emission rates. No reallocation. |

`position` is read in the effect's own local space, so moving `firePit.object3d` moves the pit and
everything in flight with it.

### Replacing the procedural textures with artist art

Every texture is generated on a canvas at startup and handed out by `TextureProvider` behind an
id (`"ember"`, `"smoke"`, `"glow"`). To use painted sprites instead:

```ts
const textures = new TextureProvider({ smoke: myLoadedSmokeTexture });
const firePit = new FirePitVfx(firePitConfig, { textures });
```

Textures you inject stay yours — `dispose()` only tears down what the provider built. No asset
path is hardcoded anywhere. `QuadParticleRenderer` already carries a per-instance `aFrame`
attribute and a `frameGrid` option, so a flipbook atlas needs a frame counter in the effect, not
a new renderer.

---

## The water ripple effect

Expanding rings on a water surface, triggered by events rather than emitted continuously. The game
says *what happened and where*; a preset decides what that looks like. Nothing in the package knows
about objects, creatures or assets — the entire coupling is a world position and a preset name.

Two systems behind one object:

- **Ripples** — concentric rings, each one its own slot with its own delay, radius, width and
  duration, so an event is a small wave train rather than one circle scaled up. The crest is
  evaluated analytically in the fragment shader: a thin, soft leading edge, a weaker ring trailing
  behind it, and a **dark trough just ahead of the crest**. That trough is what makes the ring read
  as displaced water instead of a painted outline, and it is why the material alpha-blends rather
  than adds — a trough has to be able to darken what is behind it. No bloom required, and two low
  harmonics wobble the crest off a perfect circle so it never reads as UI.
- **Spray** — a short ballistic burst of droplets, burst-only, dying the moment they fall back to
  the surface. It exists to sell the first fifth of a second, which the ring alone cannot.

### Using it in a game

```ts
import { WaterVfx } from "./vfx/effects/water";
import waterConfig from "./vfx/effects/water/water-vfx.json";

const water = new WaterVfx(waterConfig);
water.object3d.position.y = WATER_LEVEL;   // the surface the ripples live on
scene.add(water.object3d);

// wherever those events already happen in your code:
water.emit("impact", ball.position);                      // something fell in
water.emit("emergence", creature.position, { scale: 1.4 });// something rose through the surface
water.emit("ambient", somewhereInTheDistance);            // scripted background stir

water.update(deltaSeconds);   // inside the loop you already have
water.dispose();              // on teardown
```

`emit` takes a **world-space** position and uses only its horizontal part: the rings and droplets
are placed on the surface plane the effect sits on, so an object entering the water from 2m up and
a creature surfacing from below both ripple in the right place with no conversion at the call site.
It returns the number of rings actually started — 0 means the effect is stopped, disabled, or the
pool is saturated with more important events.

### Wiring it to future events

| Event | Call |
| --- | --- |
| Object hits the water | `water.emit("impact", hitPosition)` |
| Creature surfaces | `water.emit("emergence", position)`, `{ scale: 0.6 }` for a subtle rise, `{ scale: 1.45 }` for a dramatic one |
| Scripted background stir | `water.emit("ambient", position)` |
| A new kind of event | add a key to `presets` in the JSON and call it by that name — no code change |

Any option can be overridden per event: `water.emit("impact", p, { rings: 5, speed: 1.8, color: "#bfe9ff" })`.

### Lifecycle

| Call | Effect |
| --- | --- |
| `emit(preset, worldPosition, overrides?)` | Plays one event. The real entry point. |
| `update(dt)` | Advances rings and droplets. Call once per frame. |
| `clear()` / `reset()` | Drops everything live instantly. |
| `stop()` / `start()` | Ignores new events / accepts them again. Live ripples always finish. |
| `enabled = false` | Turns the whole effect off, including what is already on screen. |
| `setQuality("low" \| "high")` | Scales the pool and the ring count per event. No reallocation. |
| `dispose()` | Releases the geometries, materials and textures the effect created. |

`water.ripples` and `water.spray` are public, so a game that wants rings without droplets sets
`water.spray.enabled = false` rather than taking the effect apart. `WaterRippleSystem` is usable on
its own (`emit`, `update`, `clear`, `dispose`) if the spray is not wanted at all.

### Presets

`impact`, `emergence` and `ambient` ship in the JSON; every key under `presets` becomes a usable
name. A preset only lists what it overrides and inherits the rest from `ripples.defaults`, which is
why a new event type is a config edit rather than a code change.

| Preset | Reads as |
| --- | --- |
| `impact` | Tight and bright: three quick rings to 1.5m plus ten droplets. |
| `emergence` | Starts 0.45m wide, four rings out to 3.4m over ~3s with a heavier spray; the outer rings keep expanding long after the object is clear of the water. |
| `ambient` | Faint, small, and lowest priority — the first thing recycled when the pool fills, so a background stir can never cost a splash the player is watching. |

### What each knob does

| Key | Meaning |
| --- | --- |
| `ripples.maxRipples` | Pool size in **rings**, not events: a 3-ring impact occupies three slots. |
| `ripples.surfaceOffset` | Height above the effect's own origin. Lifts the rings off the water so they do not z-fight with it. |
| `ripples.troughColor` | Colour the water is pushed toward in the trough. Keep it near the water's own darkest value. |
| `rings` / `ringDelay` | Rings per event and the gap between them. Later rings start wider, travel further and fade sooner. |
| `startRadius` / `maxRadius` | Where the crest begins and ends. |
| `duration` | Seconds across that span. `emit`'s `speed` option states the same thing in units/second. |
| `width` / `widthGrowth` | Crest thickness, and how much it thickens over its life. |
| `intensity` | Peak alpha of the first ring; each ring after it carries 74% of the one before. |
| `wobble` | How far the crest wanders off a perfect circle. Past ~0.15 it reads as a puddle, not a ripple. |
| `jitter` | Per-ring randomisation of delay, radius, width and duration. **0 makes every ring identical**, which is exactly what a ripple must not look like. |
| `scale` | Multiplies every radius and width — one knob for "same event, bigger". |
| `priority` | Rings with a lower priority are the ones recycled when the pool overflows. |
| `spray.count` / `spray.speedScale` | Droplets per event, and how hard they are thrown. `count: 0` turns spray off for that preset. |

### Integrating it into a real water material

The rings are a standalone transparent overlay on purpose: there is no water shader in this repo to
extend, and the swamp's final material does not exist yet. When it does, the same ring profile can
move into it — the system already hands the GPU everything that would be needed as a mask (centre,
radius, width, alpha per ring). Until then, drop `WaterVfx` on top of whatever material ships and
it will read correctly, because it darkens as well as brightens.

---

## The fireflies effect

A field of small warm lights that drift, bob and blink around the edges of a scene. It is ambient
set dressing, not an event: there is no emitter, no lifetime and nothing to trigger — the field
exists from construction and is simply there.

```ts
import { FirefliesVfx } from "./vfx/effects/fireflies";
import firefliesConfig from "./vfx/effects/fireflies/fireflies-vfx.json";

const fireflies = new FirefliesVfx(firefliesConfig);
fireflies.object3d.position.set(0, 2.4, 0);   // the centre of the volume
scene.add(fireflies.object3d);

// inside the game loop you already have:
fireflies.update(deltaSeconds);

fireflies.enabled = false;   // off, without tearing anything down
fireflies.dispose();         // on teardown
```

### Why it is built differently

Every other effect here simulates on the CPU and uploads the result each frame. Fireflies do not
die, so their whole motion can be written as a sum of sines around a fixed home position and
evaluated in the vertex shader from one `uTime` uniform. That buys three things:

- **No per-frame CPU cost at all.** `update(dt)` advances a single float. Sixty fireflies and six
  hundred cost the same on the main thread, and nothing is re-uploaded after construction.
- **No teleporting.** A sum of sines is bounded by construction, so a firefly physically cannot
  leave its volume — there is no wrap, no respawn and therefore no pop to hide.
- **Nothing in lockstep.** Each firefly carries its own frequencies, phases, size, brightness and
  colour, so the field never sways or blinks together.

Rendering is one draw call of instanced camera-facing quads, the same technique as the embers and
for the same reason: `gl_PointSize` is driver-capped, and a point sprite vanishes the moment its
centre crosses the frustum edge — which on lights drifting past the screen border is exactly where
it would be noticed. The glow is two gaussians evaluated in the fragment shader, so there is no
texture to load or dispose and no bloom pass.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the field. Call once per frame. |
| `enabled = false` | Hides the field. Costs nothing while off. |
| `stop()` / `start()` | Freezes the drift where it is / resumes it. The fireflies stay lit. |
| `applyConfig()` | Re-reads `config` after an edit. Uniforms land immediately; anything baked into attributes lays the field out again, reproducibly, from the same seed. |
| `reset()` | Rebuilds the field and puts the clock back to zero. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — an ambient field has nothing to burst. |

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the field renders. |
| `count` | How many fireflies. They never die, so this is a live count, not a pool ceiling. 40–80 is the useful band. |
| `areaSize` | `[x, y, z]` full extents of the volume, centred on `object3d`. The horizontal footprint is an ellipse inscribed in it. |
| `clearRadius` | Horizontal radius kept empty at the centre, so the volume is a ring around wherever the game happens. |
| `minSize` / `maxSize` | World size at birth. Each firefly picks its own point between them. |
| `minSpeed` / `maxSpeed` | Drift speed in units per second. This sets how fast a firefly *reads*; how far it strays follows from `areaSize`. |
| `glowIntensity` | Master brightness. Above ~1.5 the halos merge into a haze. |
| `pulseSpeed` | Base blink rate; each firefly scatters around it and carries its own phase. |
| `pulseAmount` | Depth of the blink. 0 is a steady light, 1 goes fully dark at the bottom of the cycle. |
| `verticalAmplitude` | Peak vertical bob in world units. |
| `colors` | Palette. Each firefly takes one entry whole, so every colour listed stays recognisable. |
| `opacity` | Master alpha on top of the per-firefly brightness. |
| `minScreenSize` | Floor on on-screen size, as a fraction of viewport height. Without it the far end of the volume goes sub-pixel and scintillates instead of glowing. |

---

## The water surface fog effect

A low bank of mist drifting over calm water. Like the fireflies it is ambient — nothing triggers
it and nothing dies — but it is not made of particles at all: a few hundred soft billboards would
buy nothing a noise field does not already give, because mist has no individuals to track.

```ts
import { WaterFogVfx } from "./vfx/effects/waterfog";
import fogConfig from "./vfx/effects/waterfog/waterfog-vfx.json";

const fog = new WaterFogVfx(fogConfig);
fog.object3d.position.y = WATER_LEVEL;   // the surface the mist floats on
scene.add(fog.object3d);

// inside the game loop you already have:
fog.update(deltaSeconds);

fog.enabled = false;   // off, without tearing anything down
fog.dispose();         // on teardown
```

### How it is built

A stack of horizontal quads — two to four — with the density evaluated per pixel from four octaves
of simplex noise, cut at one soft threshold. Three things follow from that:

- **One draw call for the whole stack.** The layers are instances of a single unit quad and the
  layer index is an attribute, so `layerCount` is an `instanceCount` write: changing it allocates
  nothing and reveals the same layers every time rather than reshuffling the mist you were watching.
- **No per-frame CPU cost.** `update(dt)` advances one float; everything else is `uTime` in the
  shader. **Every knob is a uniform**, so there is no baked state, and a slider lands on the frame
  it is dragged.
- **The layers are flat, not camera-facing.** The fog belongs to the surface, not to the viewer.
  From the low camera a playable ships with, a horizontal slab is crossed nearly edge-on, and the
  `1/|dir.y|` path-length term in the shader is what piles the mist up toward the horizon while
  leaving the water in front of the camera readable. That term is the main reason three planes read
  as a volume instead of as three planes.

Each octave drifts at its own speed, and the third one travels across the other two, so the shapes
genuinely re-form rather than sliding past as fixed blobs — there is no loop to spot. The fine
octave is weighted into the same field rather than multiplied over it, so it ragged the patch edges
into wisps instead of punching holes in the middle. The alpha fades on a circle well inside the
quad, so the straight edge of the plane can never be the thing that ends the fog, and each layer
drifts a little faster and off the heading of the one below it, which is what stops a stack of
sheets reading as one thick sheet.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the drift. Call once per frame. |
| `enabled = false` | Hides the mist. Costs nothing while off. |
| `stop()` / `start()` | Freezes the drift where it is / resumes it. The mist stays visible. |
| `applyConfig()` | Re-reads `config` after an edit. Everything lands on the next frame; no buffer is touched. |
| `reset()` | Puts the drift back to the start. The field is continuous, so nothing pops. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — ambient fog has nothing to burst. |

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the mist renders. |
| `opacity` | Master alpha over everything the shader works out per pixel. |
| `density` | How much of the surface is covered, 0–1. It moves the threshold the noise is cut at, so turning it up grows the patches outward instead of fading a flat sheet up. |
| `fogColor` | Tint. Keep it near the scene's own sky or key light; a pure white reads as an overlay. |
| `areaSize` | Width of the square the layers span, in world units. The fog fades to nothing on a circle well inside it, so this is roughly twice the visible radius. |
| `heightOffset` | Height of the lowest layer above the effect's origin — i.e. above the water. |
| `layerSpacing` | Vertical gap between layers. Small on purpose: the stack should hug the surface. |
| `layerCount` | Overlapping layers, 1–6. **This is the fill-rate knob** — each layer is another near-full-screen transparent pass. 2–3 ships. |
| `driftSpeed` | Horizontal drift in world units per second. Past ~0.25 it reads as wind rather than calm. |
| `driftDirection` | Heading in degrees, counter-clockwise from +X. |
| `noiseScale` | Scale of the broad patches; roughly 1 / feature size in metres. |
| `detailScale` | Scale of the fine wisps. Keep it several times `noiseScale`, or the two beat against each other. |
---

## The swamp bubbles effect

Gas breaking the surface of stagnant water: a dome swells out of the water, holds a moment, tears,
and leaves a ring spreading behind it. Ambient like the fireflies — nothing triggers it — but
unlike them every bubble is a short life with a beginning and an end.

```ts
import { SwampBubblesVfx } from "./vfx/effects/swampbubbles";
import bubblesConfig from "./vfx/effects/swampbubbles/swampbubbles-vfx.json";

const bubbles = new SwampBubblesVfx(bubblesConfig);
bubbles.object3d.position.y = WATER_LEVEL;   // the surface the bubbles break
scene.add(bubbles.object3d);

// inside the game loop you already have:
bubbles.update(deltaSeconds);

bubbles.enabled = false;   // off, without tearing anything down
bubbles.dispose();         // on teardown
```

Three draw calls for the whole effect — domes, rings, droplets — and nothing allocated per frame.

### How it is built

A bubble is not a particle with a velocity; it is a short scripted animation pinned to a point on
the water. So the simulation is a **phase machine** rather than an integrator: formation, swell, a
held moment at full size, then a rupture. Nothing integrates and nothing can drift, so the whole
per-bubble state is seven numbers in a `ParticleBuffer` and the per-frame cost is a loop over the
live ones.

The dome itself is a camera-facing quad shaded as a sphere — the normal is reconstructed from the
quad's own uv, so there is no geometry to tessellate, no texture and no normal map. Two things make
it read as water rather than as a ball:

- **The waterline is cut in the shader, in world height.** A billboarded sprite cannot be clipped
  on the CPU, so the fragment shader takes the normal it already has, measures it against the
  effect's own up axis, and discards everything below the surface. Doing it as a height rather than
  as a horizontal line across the sprite is what keeps the cut correct as the camera orbits or tips
  overhead — and the same number gives the dark meniscus at the contact line for free, which is
  what sits the bubble *in* the water instead of on top of it.
- **Thickness, not opacity.** Alpha comes from how much film the view passes through: near zero
  down the middle of the dome, high at the silhouette. The dark rim, the see-through centre and the
  refraction-like darkening all fall out of that one term, so there is nothing to keep in sync.

The pop is a rupture that opens from the middle of the dome and runs out to the rim, because a film
tears — it does not dissolve. It fires the ring and, for the occasional large bubble, a few drops.

### Why the timing is drawn the way it is

Marsh gas arrives at random, and a fixed interval with ±x% jitter still reads as a pulse because the
gaps never get *long*. `activityVariation` therefore blends the spawn interval toward an exponential
draw — Poisson arrivals — which produces real lulls and the occasional double without changing the
average rate. The same knob jitters every bubble's growth, hold and pop times, so two bubbles born
in the same frame never burst in the same frame.

Sizes are drawn through a bias exponent rather than uniformly, which is what keeps a large bubble an
event instead of every third bubble; and both the ring's strength and the chance of droplets are
scaled by how big the bubble actually was, so most pops are silent by construction.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances bubbles, rings and droplets. Call once per frame. |
| `start()` / `stop()` | Resumes spawning / stops it. Bubbles already up still swell and pop. |
| `burst(position?, { count? })` | Raises bubbles immediately at a local XZ position, running or not. |
| `enabled = false` | Turns the whole effect off, including what is already on screen. |
| `applyConfig()` | Re-reads `config` after an edit. Uniforms land immediately; sizes and timings reach the next bubble. |
| `clear()` / `reset()` | Drops every live bubble, ring and droplet instantly. |
| `dispose()` | Releases the geometries, materials and textures the effect created. |

`bubbles.ripples` and `bubbles.splash` are public, so a game that wants domes without rings sets
`bubbles.ripples.enabled = false` rather than taking the effect apart.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the effect runs and renders. |
| `bubbleCount` | Pool size. Allocated once at load — raising it in the lab only raises the cap up to that allocation. |
| `spawnRate` | Spawn **events** per second, not bubbles: a cluster is still one event. |
| `activityVariation` | 0–1. How irregular the effect is: spawn gaps and per-bubble timing both. **0 makes it tick like a metronome**, which is the one thing swamp gas never does. |
| `minBubbleSize` / `maxBubbleSize` | Dome radius in world units at full size. |
| `sizeBias` | Exponent biasing the size draw toward the small end. 1 is uniform; above 1 keeps big bubbles rare. |
| `growthSpeed` / `popSpeed` | Inverse seconds for the swell and the tear. A bigger bubble takes proportionally longer at both. |
| `minLifetime` / `maxLifetime` | Seconds held at full size, between the swell and the tear. |
| `spawnAreaSize` | Side of the square of water bubbles appear on, centred on `object3d`. |
| `surfaceOffset` | Height of the water plane above the effect's own origin. Everything is placed against it. |
| `clusterChance` / `clusterSize` | How often one event seeds several small staggered bubbles, and how many. |
| `bubbleColor` | The film's own murk, not a highlight. Keep it dark and olive — a bright tint reads as a soap bubble. |
| `bubbleOpacity` | Master alpha of the domes. Well under 1: a swamp bubble is mostly water. |
| `highlightIntensity` | Strength of the specular and the sheen — how wet the dome looks. |
| `emergence` | How far the dome stands clear of the water, 0–1. 0.5 is a hemisphere; above it the waterline cuts below the sphere's equator, which is how a surface bubble actually sits. |
| `rippleEnabled` | Whether a pop leaves a ring. |
| `rippleSpeed` | Ring expansion in world units per second. |
| `rippleOpacity` | Master alpha of the rings. |
| `rippleColor` | Ring tint. Pale, and close to the water's own hue. |
| `rippleRadiusScale` | Ring reach as a multiple of the bubble's radius, so a big bubble disturbs more water without a second knob. |
| `rippleWidth` | Crest thickness. Thin: this is a highlight on the water, not a painted disc. |
| `splashEnabled` | Whether large pops throw droplets. |
| `splashProbability` | Chance of droplets **at the top of the size band**. It is scaled down by how big the bubble was, so small bubbles always pop quietly. |
| `splashCount` / `splashSpeed` / `splashSize` | Droplets per pop, launch speed and world size. |
| `splashGravity` | Negative pulls down. Droplets die the moment they fall back through the surface. |
| `splashColor` | `[from, to]` pair each droplet picks a point between. |

---

## The water splash effect

Something hit the water. A crown of water leaps out of the surface, throws droplets, collapses, and
leaves a short train of rings behind it. Event-driven like the ripples — nothing happens until
`emit()` is called — but it is a whole impact rather than a disturbance.

```ts
import { WaterSplashVfx } from "./vfx/effects/watersplash";
import splashConfig from "./vfx/effects/watersplash/watersplash-vfx.json";

const splash = new WaterSplashVfx(splashConfig);
splash.object3d.position.y = WATER_LEVEL;   // the surface things fall into
scene.add(splash.object3d);

splash.emit(ball.position);                       // something fell in
splash.emit(creature.position, { scale: 1.8 });   // something much bigger did

splash.update(deltaSeconds);   // inside the loop you already have
splash.dispose();              // on teardown
```

`emit` takes a position in the effect's local space and uses only its horizontal part, so an object
entering from 2m up and a creature rising from below both splash in the right place with no
conversion at the call site. Three draw calls for the whole effect — sheets, droplets, rings — and
nothing allocated per frame or per impact.

### How it is built

The crown is the part that decides whether a splash is convincing, and it is the part a particle
system is worst at: water leaving a surface comes off as a few **sheets**, not as a cloud of
sprites. So the main splash is a handful of instanced quads whose outline is carved in the fragment
shader — `pow(1 - t, taper)` with a flared foot, a centreline that wanders on a per-instance sine,
and a frayed tip. One attribute slides the same shader between a narrow stream and a broad lobe,
which is where the irregularity of the crown comes from: no second material, no second mesh.

- **Cylindrical billboarding, not spherical.** A jet of water is vertical in the world; it may turn
  to face the camera but it must never lie down. Each sheet spins around the effect's own up axis
  only, so the crown stands whether the camera is at playable height or directly overhead.
- **Thickness, not opacity.** Alpha comes from how much water the view passes through: thin and
  see-through down the middle of a sheet, dense and bright at the silhouette, with foam at the foot
  and at the tip. The translucency and the bright edges are the same term, so there is nothing to
  keep in sync, and highlights push the tint toward *white* rather than adding a second colour —
  foam is water full of air and has no hue left.
- **A sheet is a scripted rise and collapse, not an integrated particle.** Up fast and easing into
  the peak, then down accelerating, with the width spreading on the way up and pulling in on the
  way down. Nothing drifts and nothing can end up where water could not be. Past the peak the
  shader tears the sheet from the top down rather than fading it uniformly — a collapsing crown
  loses its tips first.
- **Tall streams are narrow, short ones are broad lobes.** Correlating height with taper is what
  puts both shapes into one crown from one draw call, and `shapeVariation` then pushes every
  stream off the even ring it was laid out on. At 0 the crown really is symmetrical, which is
  there as a visible demonstration of what the knob buys.

The droplets *are* a particle system, because that is exactly what airborne water is. They leave
from a ring around the impact at varied heights so they read as water coming off the sheets rather
than from a point emitter underneath them, and the size draw is biased small with the heavy drops
launched slightly slower — a burst is spray with a few big drops arcing through it, which is what
gives a splash its sense of scale. A droplet dies the moment it falls back through the surface and
tells the effect where, which is where the optional secondary splashes come from. Only primary
droplets may splash back, so the effect always terminates.

### Lifecycle

| Call | Effect |
| --- | --- |
| `emit(position?, { scale?, intensity? })` | Plays one impact. The real entry point. |
| `burst(position?, { speedScale? })` | `VfxEffect` compatibility; `speedScale` is read as the impact size. |
| `update(dt)` | Advances sheets, droplets and rings. Call once per frame. |
| `stop()` / `start()` | Ignores new impacts / accepts them again. Splashes in the air always finish. |
| `enabled = false` | Turns the whole effect off, including what is already on screen. |
| `applyConfig()` | Re-reads `config` after an edit. Uniforms land immediately; sizes and timings reach the next impact. |
| `clear()` / `reset()` | Drops every live sheet, droplet and ring instantly. |
| `dispose()` | Releases the geometries, materials and textures the effect created. |

`splash.droplets` and `splash.ripples` are public, so a game that wants a crown without spray sets
`splash.droplets.enabled = false` rather than taking the effect apart.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the effect runs and renders. |
| `surfaceOffset` | Height of the water plane above the effect's own origin. Everything is placed against it. |
| `splashHeight` | Peak height of the tallest stream, in world units. |
| `splashWidth` | Horizontal reach of the crown: the footprint, and how far the streams lean out. |
| `splashIntensity` | Impact energy. It decides **how many streams the crown is made of** as well as scaling the droplets, the launch speed and the ring strength — one knob for "harder hit". |
| `splashDuration` | Seconds from the impact to the last stream collapsing. |
| `shapeVariation` | 0–1 irregularity of the silhouette: azimuth, height, width, taper, lean and timing. **0 gives an even, symmetrical crown**, which is the one thing a real splash never is. |
| `waterColor` | The body of the water. Highlights push it toward white, so keep it a real water hue. |
| `highlightIntensity` | Strength of the bright edges and the foam. Past ~1.5 the crown reads as white plastic. |
| `opacity` | Master alpha of the sheets. Well under 1: a sheet of water is see-through. |
| `dropletCount` | Droplets per impact, before `splashIntensity` scales it. The pool is allocated from this once at load. |
| `dropletSize` | World size at the middle of the band. |
| `dropletSizeVariation` | Spread around it, 0–1. The draw is biased small, so big drops stay occasional. |
| `spreadRadius` | Radius of the ring droplets leave from — the footprint of the impact itself. |
| `launchVelocity` | Launch speed in units/second, before per-droplet variation. |
| `gravity` | Negative pulls down. |
| `dropletLifetime` | Ceiling, not a typical life: most droplets die earlier, on falling back through the surface. |
| `dropletOpacity` | Master alpha of the spray. |
| `rippleEnabled` | Whether an impact leaves rings. |
| `rippleCount` | Rings per impact. Later rings start wider, weaker and a beat behind. |
| `rippleSpeed` | Expansion in units/second. With `rippleDuration` it sets how far a ring reaches. |
| `rippleWidth` | Crest thickness. Thin: this is a highlight on the water, not a painted disc. |
| `rippleOpacity` | Master alpha of the rings. They take their colour from `waterColor`, lifted toward white. |
| `rippleDuration` | Seconds a ring lives. Longer rings also travel further, since the speed is unchanged. |
| `secondarySplashEnabled` | Whether a droplet falling back in leaves a small splash of its own. |
| `secondarySplashIntensity` | 0–1. How often a returning droplet splashes, and how strongly. Weighted by how heavy the drop was, so the fine spray lands silently. |

In the lab: **Splash** fires one at the origin, clicking the water fires one there, **Auto repeat**
fires them on an interval, and **Impact scale** is the effect's own `scale` option on a slider — the
honest way to check that one config covers a pebble and a boulder. The whole event lasts under two
seconds, so the Lab folder's time scale and frame step are how the collapse is actually judged.

---

## The animated water surface effect

A whole body of water as one subdivided plane, one `ShaderMaterial` and one draw call. It is
ambient like the fog and the fireflies — nothing triggers it and nothing dies — but it is not made
of anything: the swell, the colour variation, the moving highlights and the fine ripples are all a
handful of sines and three noise samples evaluated per pixel from a single `uTime`.

```ts
import { WaterSurfaceVfx } from "./vfx/effects/watersurface";
import waterConfig from "./vfx/effects/watersurface/watersurface-vfx.json";

const water = new WaterSurfaceVfx(waterConfig);
water.object3d.position.y = WATER_LEVEL;
scene.add(water.object3d);

// inside the game loop you already have:
water.update(deltaSeconds);

water.enabled = false;   // off, without tearing anything down
water.dispose();         // on teardown
```

It is the surface the ripple effect has been waiting for: drop `WaterVfx` on top of it and the
rings read correctly, because both darken as well as brighten.

### How it is built

- **Every knob is a uniform, `surfaceSize` included.** The geometry is a unit plane laid into XZ
  once at construction and scaled in the vertex shader, so there is no slider in the panel that
  can allocate, rebuild a buffer or drop a frame. `update(dt)` advances one float.
- **No render target, no probe, no texture.** A playable cannot pay for a second pass over the
  screen, and a procedural surface has no asset to load, no path to hardcode and nothing to
  dispose but its own geometry and material.
- **Three wave layers at 1 : 1.63 : 2.71 frequency and 1 : 1.17 : 0.83 speed.** A sum of sines
  always repeats; the only question is whether the common period is long enough that nobody sees
  it. Non-harmonic ratios are what buy that, and they cost nothing.
- **The vertex normal is analytic.** The same three phases give the height and its gradient, so
  the normal is exact at any amplitude and cannot go stale when a slider moves mid-frame — no
  finite differences, no second sample of anything.
- **The highlights come from the surface, not from a light.** A specular lobe against a baked sun
  direction looks correct for exactly one camera, and the camera is the thing a playable changes.
  Crest height, which face a crest is showing and the ripples crossing it drive the highlight
  instead, and the one view-dependent term is fresnel, which is also the cheap one.
- **Fine detail fades out with distance on its own.** One `fwidth` gives the world size of a pixel,
  which is what retires the ripples and the fine pattern toward the horizon. Detail smaller than a
  pixel is not detail, it is shimmer, and it is the first thing that gives a water shader away.
- **The water ends on a circle well inside the plane**, so the straight edge of the geometry is
  never what the eye finds.

The lab panel carries four appearance presets — **Calm**, **Swamp**, **Clear** and **Stylised** —
as plain config patches. They are not a preset system; they are there because the only honest proof
that a parameter set is wide enough is four buttons that land in four different places.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the surface. Call once per frame. |
| `enabled = false` | Hides the water. Costs nothing while off. |
| `stop()` / `start()` | Freezes the surface where it is / resumes it. It stays visible. |
| `applyConfig()` | Re-reads `config` after an edit. Every key is a uniform, so everything lands on the next frame and no buffer is touched. |
| `reset()` | Puts the motion back to the start. The surface is continuous, so nothing pops. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — standing water has nothing to burst. |

`new WaterSurfaceVfx(config, { segments })` is the one thing that is not a uniform: it decides how
finely the vertex displacement can be sampled. 96 is the default and is enough for the amplitudes
this effect is meant for; raise it only if you also raise `waveAmplitude` well past its slider.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the water renders. |
| `surfaceSize` | Width of the square the plane spans, in world units. The water fades out on a circle inside it, so this is roughly 1.5× the visible radius. |
| `opacity` | Master alpha. At 1 the water writes depth and behaves as ground; below that it stops writing depth so it cannot punch a hole in what is behind it. |
| `baseColor` | Primary water colour — what the surface reads as on average. |
| `deepColor` | The darker colour the pattern drops toward. Keep it a deeper, less saturated base, not a different hue. |
| `highlightColor` | Colour of the moving highlights, and of the fresnel brightening at grazing angles. |
| `colorVariation` | How far the pattern is allowed to pull toward `deepColor`. 0 is a flat base colour. |
| `highlightIntensity` | Strength of the highlights. Past ~1 the water reads as glitter rather than as water. |
| `highlightThreshold` | Selectivity: low lights most of the surface, high only the crests. |
| `fresnelIntensity` | View-dependent brightening toward the horizon — the cheap stand-in for a sky reflection. |
| `waveAmplitude` | Geometric wave height in world units. **The only knob that moves vertices.** Past ~0.3 the mesh starts to show at 96 segments. |
| `waveFrequency` | Wavenumber of the broad waves: roughly 2π / wavelength in metres. It sets the scale of the fragment pattern too, so the colour and the geometry stay the same water. |
| `waveSpeed` | Travel speed in world units per second, the same for every layer. 0 freezes the pattern as well as the waves. |
| `waveDirection` | Heading of the main wave train, in degrees counter-clockwise from +X. |
| `secondaryWaveIntensity` | Weight of the two cross-running layers. 0 leaves one plain sine train, which is exactly what water must not look like. |
| `detailScale` | Scale of the fine pattern: roughly 1 / feature size in metres. The ripples are keyed off it, so one knob moves both. |
| `detailIntensity` | Strength of that pattern in the colour. It does not tilt the surface — the ripples do. |
| `rippleIntensity` | Strength of the small analytic ripples that break the highlights up. |
| `rippleSpeed` | Ripple travel speed, independent of `waveSpeed` so the fine motion can be tuned on its own. |

---

## The animated lava surface effect

A volcanic floor as one subdivided plane, one `ShaderMaterial` and one draw call. Dark crust
plates, glowing channels between them, and molten that flows through the channels while the plates
stay put — all of it from five noise samples and one 3x3 cell search per pixel. No textures, no
render target, no bloom pass, no second light.

```ts
import { LavaSurfaceVfx } from "./vfx/effects/lavasurface";
import lavaConfig from "./vfx/effects/lavasurface/lavasurface-vfx.json";

const lava = new LavaSurfaceVfx(lavaConfig);
scene.add(lava.object3d);

// inside the game loop you already have:
lava.update(deltaSeconds);

lava.enabled = false;   // off, without tearing anything down
lava.dispose();         // on teardown
```

It is the floor the fire pit has been standing on: put the particle effect on top and the sparks
and embers have somewhere to have come from.

### How it is built

- **The crust is the subject, not the cracks.** Channels are about a sixth of the surface and the
  hottest cores about two percent of it, at the defaults. The failure mode of a lava shader is a
  uniformly orange floor, and every term in this one is written to protect that contrast — which
  is also why the crust is lit by its own cracks only in a narrow bleed either side of each one.
- **A warped Voronoi, not a noise threshold.** `F2 - F1` over the 3x3 neighbourhood gives the plate
  boundaries; a domain warp from two noise samples is what stops them reading as a cell grid, and
  the way `F2 - F1` thickens at cell junctions is what makes the channels look like they branch.
  A second, finer set of hairline cracks comes from the zero set of the detail field, faded out
  away from the boundaries so they spread off the channels instead of scratching every plate.
- **The plate network is stable; only its boundaries and the molten in them move.** Cell centres
  never move at all, the warp that bends them creeps, and the temperature field is advected *and*
  churned against that warp on top. Nothing in the frame scrolls as one sheet, which is the thing
  that gives a procedural surface away.
- **Channel width varies from two fields, one still and one moving.** The first makes some channels
  broad and others hairline; the second lets a broad one swell into an exposed molten pool and
  settle again, which is where the non-crack molten area comes from.
- **The sub-pixel floor is energy-preserving.** Widening a channel thinner than a pixel is what
  stops it aliasing, but on its own it *adds* molten area with distance and turns the horizon
  orange. Dimming by exactly the factor the width was inflated by keeps the heat the channel
  contributes constant, so far cracks go faint rather than fat.
- **It reads without post-processing.** The emission sits just under clipping at the default glow,
  so the channels are bright on a renderer with no bloom and no tone mapping — about 3% of pixels
  clip, and they are the hot cores that should.
- **The pattern is driven by `uv`, not by vertex position.** `lava.material` therefore drops
  straight onto any mesh with sensible UVs; `surfaceSize` is then simply the world span the UV
  range covers. Vertex displacement is along the mesh normal for the same reason.
- **Displacement is tinted, not lit.** There is no lighting term in the shader, so a heaving crust
  would be invisible except on the silhouette. Brightness tracks height instead, which costs one
  varying and vanishes on its own at `displacementIntensity` 0.

The lab panel carries four appearance presets — **Volcanic**, **Cooled**, **Molten** and
**Stylised** — as plain config patches, for the same reason the water surface has four.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the lava. Call once per frame. |
| `enabled = false` | Hides the surface. Costs nothing while off. |
| `stop()` / `start()` | Freezes the surface where it is / resumes it. It stays visible. |
| `applyConfig()` | Re-reads `config` after an edit. Every key is a uniform bar `surfaceSize`, which is a mesh scale, so everything lands on the next frame, no buffer is touched and no shader is recompiled. |
| `reset()` | Puts the motion back to the start. Every term is continuous in time, so nothing pops. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — a lava field has nothing to burst. Throw particle sparks at it instead. |
| `material` | The `ShaderMaterial` itself, for reusing the look on your own mesh. |

`new LavaSurfaceVfx(config, { segments })` is the one thing that is not a uniform: it decides how
finely the crust heave can be sampled. 64 is the default and is plenty for a displacement this
subtle; 1 is legal if you have turned `displacementIntensity` off and want the cheapest quad.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the surface renders. |
| `crustColor` | Primary crust colour. Keep it genuinely dark — the contrast against the channels is the whole effect. |
| `secondaryCrustColor` | The second crust colour the fine field mottles toward. A nearby brown or grey, not a new hue. |
| `moltenColor` | Main lava colour. The dark red at the cool edge of a channel is derived from it by a multiply, so there is no fifth picker to keep in sync — darken this, not something else. |
| `hotColor` | Colour of the hottest cores. Pale orange or yellow; it only ever reaches a few percent of pixels. |
| `glowIntensity` | Emission multiplier on the molten. Past ~2 the channels clip to white and the gradient inside them is lost. |
| `colorVariation` | How far the temperature gradient is allowed to swing. 0 leaves the molten one flat colour. |
| `crustVariation` | How far the crust mottles toward `secondaryCrustColor`. 0 is a single crust colour. |
| `patternScale` | Rough width of one plate, **in world units**. Everything else in the pattern is keyed off it, so this is the one scale knob. |
| `crackWidth` | Channel width as a fraction of a plate, so it stays in proportion when `patternScale` moves. |
| `crackVariation` | How much that width varies from place to place. High values open exposed molten pools; it is also what keeps the channels from reading as drawn lines. |
| `patternDistortion` | Domain warp on the plate network. 0 is a bare Voronoi and looks like one; the default is torn and organic. |
| `detailScale` | Frequency of the fine field relative to the plates: 3 means detail three times finer. It drives the crust mottle, the hairline branches and the width variation at once. |
| `flowSpeed` | Molten travel speed in world units per second. Lava is viscous — past ~0.4 it starts to read as water. |
| `flowDirection` | Heading of the flow, in degrees counter-clockwise from +X. |
| `flowIntensity` | How much the molten churns as it travels rather than sliding as one sheet. 0 is a pure translation. |
| `heatPulseSpeed` | Heat pulse rate in cycles per second. The phase varies with the molten field and with which plate you are on, so the surface breathes in patches rather than flashing. |
| `heatPulseIntensity` | Depth of that pulse as a fraction of the emission. 0 is a perfectly steady glow. |
| `surfaceSize` | Width of the square the surface spans, in world units, and the world span the UV range covers. Raising it adds plates — it does not stretch them. |
| `displacementIntensity` | Vertical heave of the crust, in world units. 0 leaves the plane flat, and the brightness tint that makes it readable goes with it. |
| `edgeFade` | Darkens the outer rim to nothing so the straight edge of the mesh never ends the lava. Set it to 0 when the material is on a mesh that already ends where it should. |

---

## The lava impact burst effect

Something hit the lava. A flash goes off at the point of contact, molten tongues erupt out of the
surface, droplets leave on ballistic arcs and cool on the way down, and a glowing patch fades back
to the surface behind them. Event-driven like the water splash — nothing happens until `emit()` is
called — and every trigger is a fresh one-shot burst.

```ts
import { LavaImpactVfx } from "./vfx/effects/lavaimpact";
import impactConfig from "./vfx/effects/lavaimpact/lavaimpact-vfx.json";

const impact = new LavaImpactVfx(impactConfig);
impact.object3d.position.y = LAVA_LEVEL;   // the surface things land on
scene.add(impact.object3d);

impact.emit(rock.position);                      // something hit the lava
impact.emit(boss.position, { scale: 1.8 });      // something much bigger did

impact.update(deltaSeconds);   // inside the loop you already have
impact.dispose();              // on teardown
```

`emit` takes a position in the effect's local space and uses only its horizontal part, so a rock
arriving from 3m up and a creature punching through from below both burst in the right place with
no conversion at the call site. Three draw calls for the whole effect — surface glow, tongues,
droplets — no textures at all, and nothing allocated per frame or per impact.

### How it is built

Four stages share one origin and one set of timings, which is the only reason they read as one
event rather than four effects that happened to fire together.

- **The flash and the residual glow are one system.** Both are flat patches on the surface with the
  falloff evaluated analytically in the fragment shader; the flash is bright, wide and gone in a
  tenth of a second, the patch is dim, tight and takes a second to cool. Starting the patch a beat
  *into* the flash is what makes the two read as one event cooling down instead of one light
  switching off and another switching on. Two angular harmonics push the outline off a perfect
  circle — a clean disc of light reads as UI.
- **The splash is tongues, not particles.** Lava leaving a surface comes off as a few thick
  ribbons, so each tongue is one instanced quad whose silhouette is carved in the shader:
  `pow(1 - t, taper)` with a flared foot, a wandering centreline and lumps along the edge. One
  attribute slides the same shader between a broad lobe and a narrow ribbon, and `splashCurvature`
  is the *exponent* the outward lean is applied with, so a tongue's foot stays planted on the
  surface however hard it arcs over.
- **Hot in the middle, cool at the edge.** This is the opposite of the water sheet next door, where
  the rim is the bright part. Molten rock is a volume of light with a crust forming on its surface,
  so the core is the hot part and the silhouette is where the colour has already fallen toward red.
  One heat scalar drives colour and brightness together everywhere — tongues and droplets both — so
  nothing can end up dim and yellow or bright and red.
- **The splash fragments rather than fades.** Past the peak a band pattern eats each tongue apart
  along its length, so the splash visibly comes to pieces and hands over to the droplets. A uniform
  fade is what makes an effect read as a decal.
- **The droplets are a particle system**, because that is exactly what airborne lava is. They leave
  from a ring around the impact at varied heights so they look like material coming off the
  tongues, the size draw is biased toward the minimum so a burst is fine spatter with a few heavy
  blobs arcing through it, and each one carries its own cooling rate so the burst dims raggedly.
  They draw through the shared `StreakRenderer`: at `length ≈ thickness` its capsule is a round
  blob, and stretching it along the velocity turns the fast ones into streaks — one draw call for
  both, and its screen-space width floor is what stops a correctly-sized droplet going sub-pixel.

Nothing depends on bloom. If the game has one the burst only gets hotter.

### Lifecycle

| Call | Effect |
| --- | --- |
| `emit(position?, { scale?, intensity? })` | Plays one impact. The real entry point. |
| `burst(position?, { speedScale? })` | `VfxEffect` compatibility; `speedScale` is read as the impact size. |
| `update(dt)` | Advances tongues, droplets and glow. Call once per frame. |
| `stop()` / `start()` | Ignores new impacts / accepts them again. Bursts in the air always finish. |
| `enabled = false` | Turns the whole effect off, including what is already on screen. |
| `applyConfig()` | Re-reads `config` after an edit. Uniforms land immediately; sizes and timings reach the next impact. |
| `clear()` / `reset()` | Drops every live tongue, droplet and patch instantly, and cancels any pending secondary beat. |
| `dispose()` | Releases the geometries and materials the effect created. |

`impact.droplets` and `impact.glow` are public, so a game that wants the splash without spatter
sets `impact.droplets.enabled = false` rather than taking the effect apart. Retriggering is free:
the pools are sized at construction for three concurrent impacts and recycle the element closest to
finishing, so nothing allocates and nothing in flight is corrupted.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the effect runs and renders. |
| `surfaceOffset` | Height of the lava plane above the effect's own origin. Everything is placed against it. |
| `impactScale` | Master size: multiplies every radius, height, speed and droplet size at impact time. |
| `impactIntensity` | Master energy. It decides **how many tongues and droplets the burst is made of** as well as scaling the flash and the glow — one knob for "harder hit". |
| `impactFlashIntensity` / `impactFlashDuration` | Brightness and length of the flash. Keep it under ~0.2s: it exists to hand over to the splash. |
| `impactRadius` | Footprint of the impact. The flash, the glow and the tongue feet are all placed from it. |
| `surfaceGlowIntensity` / `surfaceGlowDuration` | Brightness of the molten patch left behind, and how long it takes to cool. |
| `splashHeight` | Peak height of the tallest tongue. |
| `splashWidth` | Thickness of one ribbon, not the spread of the splash. |
| `splashSpread` | How far the tongues lean out as they rise — the horizontal reach. |
| `splashDuration` | Seconds from the impact to the last tongue coming apart. |
| `splashTongueCount` | Tongues per impact, before `impactIntensity` scales it. One broad mass is always added at the centre. |
| `splashShapeVariation` | 0–1 irregularity *inside* one burst: azimuth, height, width, taper, lean and timing. **0 gives an even starburst**, the one shape thrown lava never makes. |
| `splashTaper` | How sharply a tongue narrows toward its tip. Low is a broad lobe, high is a thin ribbon. |
| `splashCurvature` | How early a tongue starts arcing over. At 1 the tip is already falling while the foot is still rising. |
| `dropletCount` | Droplets per impact, before `impactIntensity` scales it. The pool is allocated from this once at load. |
| `dropletSizeMin` / `dropletSizeMax` | The band droplets are drawn from. The draw is biased toward the minimum, so big blobs stay occasional. |
| `dropletSpeed` / `dropletSpeedVariation` | Launch speed and the spread around it. |
| `dropletSpread` | 0–1 how flat the trajectories are allowed to be: 0 is a column, 1 a wide fan. |
| `dropletUpwardForce` | Extra upward speed on top of `dropletSpeed`. |
| `gravity` | Negative pulls down. |
| `dropletLifetime` / `dropletLifetimeVariation` | Ceiling, not a typical life: most droplets die earlier, on falling back into the lava. |
| `dropletStreakAmount` | 0–1 how far a fast droplet stretches into a streak. 0 leaves every droplet round. |
| `hotColor` / `lavaColor` / `coolColor` | The core, the body, and what everything fades through on the way out. |
| `emissiveIntensity` | Perceived brightness of the molten elements. Above 1 the core burns toward white. |
| `dropletGlowIntensity` | Glow around the droplets. They are additive, so above 1 is a hot core. |
| `splashOpacity` / `dropletOpacity` | Master alphas. Lava is opaque; keep the splash high. |
| `coolingIntensity` | How far colour and brightness fall over a lifetime. **0 means nothing ever goes dark**, and the burst reads as plastic. |
| `edgeVariation` | Irregularity of the silhouettes: tongue edges, lumps and the glow outline. |
| `randomness` | How far one trigger differs from the next in size, energy and timing. This is what stops a retriggered effect reading as a looping animation. |
| `secondaryDropletCount` / `secondaryBurstDelay` | The second beat: small droplets peeling off the tongues as they come apart. Subordinate on purpose; `0` turns it off. |

In the lab: **Impact** fires one at the origin, clicking the lava fires one there, and **Auto
trigger** fires them on an interval. Scheduling lives in the lab, not in the effect — the game
decides when an impact happens, so there is no timer anywhere in `src/vfx/`. The preview ground is
the lava surface effect, because the failure mode of a molten burst is looking right over black and
disappearing over lava; **Scene → Lava glow** is there to check it against a colder floor. The whole
event lasts under two seconds, so the Lab folder's time scale and frame step are how the break-up is
actually judged.

---

## The heat distortion effect

Hot air above lava, a fire pit or sun-beaten asphalt, bending whatever is behind it. One quad, one
draw call, and one framebuffer copy shared by every heat source in the scene.

```ts
import { HeatDistortionVfx } from "./vfx/effects/heatdistortion";
import heatConfig from "./vfx/effects/heatdistortion/heatdistortion-vfx.json";

const heat = new HeatDistortionVfx(heatConfig);
heat.object3d.position.set(0, 0, 0);    // the hot surface itself
scene.add(heat.object3d);

// inside the game loop you already have:
heat.update(deltaSeconds);

heat.config.qualityMode = "low";   // the cheap approximation
heat.applyConfig();

heat.stop();            // freeze the field where it is, still visible
heat.enabled = false;   // off, without tearing anything down
heat.dispose();         // on teardown
```

No post-processing pipeline is required and none is added. Nothing in `src/lab` is involved: the
effect gets the renderer and the camera from its own mesh's `onBeforeRender`, so a host that only
knows how to hand out a delta needs no extra plumbing.

### How it is built

**The background comes from a grab, not a second render.** Refraction needs the scene *without*
the refracting surface in it, and the textbook answer — render the scene again into a target — costs
a whole extra scene pass per refracting object. Instead the mesh's own `onBeforeRender` fires at the
moment the framebuffer already holds every opaque object and every transparent one sorted behind it,
so a single `copyTexSubImage2D` of the live framebuffer is *both* the background and a guarantee the
effect cannot sample itself. That copy lives in `src/vfx/core/SceneColorCapture.ts`, is reference
counted per renderer, and runs **at most once per frame however many heat sources ask for it**. Two
sources, one blit. Nothing is captured at all unless a heat source actually survived culling, and
`low` never retains the capture in the first place.

**The volume is a billboard, not a box.** A `width × depth × height` region of hot air is drawn as
one camera-facing quad whose width is the *projected* footprint, `|w·cos a| + |d·sin a|`. A long
narrow vent is therefore wide seen from the front and narrow seen from the end, out of one quad with
no per-frame geometry and no second plane of overdraw. Nothing about the quad is visible: the sides
fade inward, the top fades out, and a noise term eats the silhouette so what fades out at the
boundary is a column of rising air rather than a rectangle.

**Alpha is the fade, displacement is the look.** The fragment writes the *refracted sample* with the
volume mask as its alpha, so the boundary is a crossfade between the distorted and the undistorted
background. That is why there are no seams to hide — and why the effect is exactly invisible against
an empty background, since displacing a flat colour returns that colour. It also means the knobs
split cleanly: `distortionStrength` is how far light bends, `opacity` is how much of the pixel the
volume owns.

**The field is anchored in world space.** Noise is sampled from the fragment's world position, so
orbiting the camera samples a different slice of a field that is standing still — parallax, not
sliding. The screen UV comes from the interpolated clip position rather than from `gl_FragCoord` and
a resolution uniform, which is what keeps sampling correct at any viewport, any pixel ratio and any
camera. Displacement is measured as a fraction of the volume's *own* on-screen height, so the same
heat bends the same amount of itself at two metres and at twenty.

Two noise layers in two independent domains, animated upward with a climb that accelerates with
height and a lateral wander fed into the noise **domain** rather than added to the output — a sine
added to a displacement is a visible wave; a sine shearing a noise field is convection.

### HIGH and LOW

| | `high` | `low` |
| --- | --- | --- |
| Background | One shared framebuffer grab per frame | **Nothing is sampled** |
| Look | True refraction of what is behind the volume | Thin additive filaments of light |
| Per pixel | 4 value-noise lookups (32 hashes), 1 texture sample | 2 lookups, no sample |
| Blending | Normal — crossfades a refracted copy over the original | Additive — only ever adds light |

`low` is an approximation of hot air, not refraction, and it is labelled that way in the panel. A
straight edge behind it stays straight; that is correct behaviour, not a bug. It exists so the same
placement and the same lifecycle work on a device where a full-viewport blit per frame is not worth
it, and it is one flag away from the real thing.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the field by `dt × animationSpeed`. Call once per frame. |
| `start()` / `stop()` | Resumes the motion / freezes it where it is. The volume stays visible either way. Both idempotent. |
| `enabled = false` | Hides the volume **and releases its share of the scene grab**, so toggling it costs nothing while off. |
| `applyConfig()` | Re-reads `config` after an edit. Every knob is a uniform except `qualityMode`, which picks between two shaders and rebuilds the material. |
| `reset()` | Puts the clock back to zero. Every term is continuous in time, so nothing pops. |
| `dispose()` | Releases the geometry and material and drops the capture reference. The last source to go frees the texture. |
| `burst()` | A documented no-op — hot air has nothing to burst. |

World position is `object3d.position`, like every other effect here, not a key in the config.

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the volume renders. |
| `qualityMode` | `high` refracts the real background; `low` samples nothing. |
| `intensity` | Master on the displacement, and on the `low` shimmer. The one to animate when a heat source flares or dies. |
| `opacity` | How fully the refracted sample replaces the pixel under it. At 1 the body of the column is a pure refraction; lower leaves a ghost of the original showing through. |
| `width` / `depth` | Footprint of the heat source in world units. The quad shows whichever of them the camera is looking across. |
| `height` | How far the hot air reaches above the source. |
| `heightOffset` | Lifts the bottom of the volume off the source. A little of this hides the ground contact. |
| `rotation` | Rotation of the footprint about Y, in degrees. Only matters when `width` and `depth` differ. |
| `edgeSoftness` | How far in from the sides the mask fades, as a fraction of the half-width. |
| `verticalFalloff` | Exponent on the fade with height. 1 is linear; higher keeps the shimmer near the source, which is what reads as heat rather than as fog. |
| `distortionStrength` | Peak screen displacement, as a fraction of the volume's own on-screen height — so it holds at any camera distance and any viewport. |
| `noiseScale` | Frequency of the broad convection cells, in cycles per world unit. |
| `detailNoiseScale` | Frequency of the secondary turbulence. Keep it several times `noiseScale` or the second layer only adds blur. |
| `turbulence` | How much of that second layer reaches the displacement. 0 is smooth, lazy heat. |
| `horizontalDistortion` / `verticalDistortion` | Relative weight of each axis. Vertical under horizontal reads as wind across the source; over it reads as boil. |
| `riseSpeed` | Upward speed of the noise field, in world units per second. The field moves, not the quad. |
| `driftSpeed` | Lateral speed of the field, same units. |
| `animationSpeed` | Multiplier on the clock. 0 freezes the field without hiding it. |
| `flowVariation` | How far the flow direction wanders with height and time, 0–1. The cure for a straight climb. |
| `pulsation` | Depth of the slow swell in overall strength, 0–1. |
| `maxDistance` | Distance at which the effect stops drawing. **0 disables the check.** |
| `fadeDistance` | How many units before `maxDistance` the fade starts. |
| `shimmerColor` | Tint of the `low` filaments. Ignored in `high`. |

There is no `resolutionScale`, deliberately: the background is a copy of a framebuffer that is
already being drawn, not a target this effect allocates, so there is no resolution to trade away.

### Rendering cost, and what it is not good at

- **One extra draw call per heat source**, plus **one full-viewport texture copy per frame** shared
  across all of them in `high`. The copy is a GPU-side blit — no readback, no stall — and it does
  not happen at all when nothing that needs it is on screen, or in `low`.
- **Fill, not simulation.** The CPU per frame is one billboard orientation and five uniform writes.
  The cost is the fragment shader over the quad's area, which is why `edgeSoftness`, `height` and a
  sane `width` are performance knobs as much as look knobs.
- **Two heat sources do not refract each other.** The grab is taken once, before the first of them
  draws, so the second samples a background that does not contain the first. Overlapping volumes
  lose a little of each other; the alternative is a copy per source, which is the thing this design
  exists to avoid.
- **It refracts what was already drawn.** Anything sorted *after* the volume — a transparent object
  in front of it, a later heat source — is not in the grab and is not bent.
- **Depth-tested, not depth-faded.** Geometry in front of the volume correctly occludes it, but the
  cut is hard, because there is no depth texture here to soften against. The short ramp at the
  bottom of the vertical profile exists to keep that cut off the ground line.

---

## The procedural ice effect

A frozen surface you can see through: one plane, one shader, and whatever is swimming underneath
still legible through it. The brief this was built to is deliberately blunt — *the moving object
beneath the ice must be clearly visible* — so every feature below is really a statement about how
much of that object it is allowed to take away.

```ts
import { IceSurfaceVfx } from "./vfx/effects/icesurface";
import iceConfig from "./vfx/effects/icesurface/icesurface-vfx.json";

const ice = new IceSurfaceVfx(iceConfig);
ice.object3d.position.y = WATER_LEVEL;
scene.add(ice.object3d);

ice.setPreset("deep-blue-ice");                 // one of eight built-in looks
ice.setConfig({ transparency: 0.95 });          // live, no rebuild
ice.update(deltaSeconds);                       // from the loop you already have
ice.dispose();

someMesh.material = ice.material;               // or reuse the material on your own geometry
```

The effect knows nothing about what is under it. The lab puts a fish there; a game can put a level,
a creature or nothing at all, and the material is identical.

### PERFORMANCE and ENHANCED

Two modes, one shader, one set of parameters. The difference is how the background gets through —
never whether it does.

| | PERFORMANCE | ENHANCED |
| --- | --- | --- |
| Background | alpha blending: the scene behind shows through where the ice is transparent | composited from the shared framebuffer grab, displaced by the surface normal |
| Refraction | none — straight lines stay straight | real screen-space displacement in world units |
| Absorption | approximated by blending the body toward `depthTint` | multiplicative filter on the sampled background, the way a filter actually works |
| Noise | two octaves per field | three octaves, plus the second micro-relief octave |
| Extras | — | chromatic split, bubble lensing, optional frost blur |
| Cost | one transparent draw, no texture sample | one transparent draw, one shared framebuffer copy, 1–7 samples |

PERFORMANCE is the mobile path and what a playable should ship unless it has the budget. The JSON
defaults to ENHANCED because the lab is where you are looking for the difference.

### How it is built

- **The background comes from a grab, not a second render.** The mesh's own `onBeforeRender` fires
  with the framebuffer already holding every opaque object, so one `copyTexSubImage2D` is both the
  background and a guarantee the ice cannot sample itself. That copy is `SceneColorCapture`, shared
  and reference counted per renderer with the heat distortion effect — two refracting surfaces in a
  scene cost one copy, not two render targets.
- **The displacement is world-sized and then projected.** The surface normal's tangential tilt
  times the slab thickness is a lateral offset in metres; pushing it through `projectionMatrix` and
  `1/w` turns it into the right number of pixels at any distance, aspect or field of view. Nothing
  swims when the camera moves, and there is no aspect uniform to keep in sync.
- **The slab has layers, and they parallax.** Cloud, fractures and bubbles are sampled at a plane
  coordinate pushed along the tangent-space view vector by their own depth — the exact offset a ray
  entering the ice would travel before reaching that layer. Orbiting slides them under the surface,
  which is most of what separates a slab of ice from a decal of ice.
- **The fracture network is a warped Voronoi that does not reach everywhere.** F2 − F1 gives the
  edge in one pass and thickens where three cells meet, which is how fractures branch; a domain
  warp bends the cells out of their grid; and a slow field gates whole regions out, so the spacing
  stops being the cell spacing and some plates stay unbroken.
- **Features that are off are compiled out.** The quality mode, the three feature toggles and the
  frost blur are `#define`s. They are the only knobs that cost a program build; every other one is
  a uniform and lands on the frame it is dragged.
- **Sub-pixel features are floored and dimmed.** A fracture or a bubble narrower than a pixel is
  widened to one and faded by exactly the factor the widening added, so distance makes them faint
  rather than fat — the same treatment `StreakRenderer` gives a spark.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the frost glints. Nothing else in the shader depends on time. |
| `setConfig(patch)` | Patches the config and uploads it in one call. |
| `setPreset(id)` | Loads one of the eight looks. `enabled`, `qualityMode` and `surfaceSize` are the host's and are carried across untouched. |
| `applyConfig()` | Re-reads the config object after a hand edit. |
| `start()` / `stop()` | Runs or freezes the glints. `enabled = false` is what hides the ice. |
| `reset()` | Puts the glints back to zero. |
| `dispose()` | Releases the geometry and the material, and lets go of its share of the scene grab. |
| `material` | The `ShaderMaterial`, for dropping the look onto geometry of your own. |

### Presets

`clear-frozen-lake`, `cracked-frozen-lake`, `deep-blue-ice`, `frosted-lake`, `glacier-ice`,
`crystal-clear-ice`, `fantasy-ice`, `dark-frozen-lake` — ordered by how much of the world below
survives them, from a window with a few fractures in it to a silhouette in dark grey-blue.

### What each knob does

| Key | Meaning |
| --- | --- |
| `transparency` / `clarity` | How much shows through clear ice, and how well clear ice resists its own milkiness. |
| `refractionStrength` / `refractionScale` / `refractionDetail` | How far the background is displaced, the size of the field that displaces it, and how much of the fine relief joins in. |
| `iceThickness` | The depth knob: it scales absorption, parallax and refraction together. |
| `depthAbsorption` / `depthTint` | Beer-Lambert through the slab, and what it leaves of the light. This is what turns a white fish blue. |
| `internalParallax` / `internalDepthIntensity` | How far the internal layers slide, and the strength of the deeper cloud layer under them. |
| `cloudiness` / `cloudScale` / `cloudContrast` | The milk *inside* the slab — as opposed to frost, which is the crust on top of it. |
| `crackDensity` / `crackIrregularity` | How much of the surface the network reaches, and how far it is bent out of its grid. At 0 irregularity it is a bare Voronoi. |
| `crackDepth` / `crackOpacity` / `crackHighlightIntensity` | How far under the surface a fracture sits, how much it hides, and how bright the lit sliver along one side of it is. |
| `bubbleMaxSize` | Also sets the spacing: the cell is sized off the largest bubble, so raising it spreads them out rather than merging them. |
| `bubbleDepth` / `bubbleDistortion` | The layer bubbles sit in, and the lens each one puts over the background (ENHANCED only). |
| `frostCoverage` | The one knob that can hide the object entirely. That is what it is for. |
| `frostNearCracks` | How much frost gathers along the fractures, which is where the vapour escapes. |
| `roughness` / `specularIntensity` / `fresnelIntensity` | The surface. Fresnel also feeds `viewAngleOpacity`, so grazing ice closes up. |
| `lightAzimuth` / `lightElevation` | The shader carries its own key light — it reads no scene lights at all. |
| `surfaceSize` / `edgeFade` | The world span the UV range covers, and the rim fade that keeps the mesh edge from being what ends the ice. |

### Rendering cost, and what it is not good at

- **One transparent draw call**, plus **one full-viewport texture copy per frame** in ENHANCED,
  shared with every other surface that reads it. PERFORMANCE copies and samples nothing.
- **The grab is the framebuffer's resolution, and that is the only resolution it has.** It is a
  blit of the drawing buffer, not a render target, so there is no cheaper half-res version of it to
  ask for — the renderer's pixel ratio is the lever.
- **It refracts what was already drawn.** Anything sorted after the ice — a transparent object in
  front of it, a second ice sheet — is not in the grab and is not bent.
- **Absorption is a filter, not a volume.** There is no ray marching here: path length is thickness
  over the view's facing term, lengthened where the ice is cloudy. Thick ice at a grazing angle is
  an approximation, not a simulation.
- **It is fill-bound.** The cost is the fragment shader over the surface's screen area, so
  `surfaceSize` and how much of the frame the ice covers are performance knobs as much as look
  knobs. Turning off cracks, bubbles or frost genuinely removes their instructions rather than
  branching past them.

---

## The rising embers effect

Glowing fragments lifting off a hot surface, drifting, cooling and going out. Ambient like the
fireflies — nothing triggers it — but unlike them every ember has a beginning and an end, and the
whole lifecycle still runs on the GPU.

```ts
import { RisingEmbersVfx } from "./vfx/effects/risingembers";
import embersConfig from "./vfx/effects/risingembers/risingembers-vfx.json";

const embers = new RisingEmbersVfx(embersConfig);
embers.object3d.position.set(0, LAVA_LEVEL, 0);   // the hot surface itself
scene.add(embers.object3d);

// inside the game loop you already have:
embers.update(deltaSeconds);

embers.stop();           // stop emitting; the live ones finish and the column drains
embers.enabled = false;  // off, without tearing anything down
embers.dispose();        // on teardown
```

One draw call, one float of per-frame CPU work, and no texture.

### How it is built

An ember's entire path — where it was born, how fast it climbs, how it wanders, when it dies — is a
pure function of time and one seed, so there is nothing to integrate. `update(dt)` advances a
single uniform; three hundred embers and three thousand cost the same on the main thread, and no
attribute is re-uploaded after construction. The per-particle state is **one float**.

A looping shader normally pays for that in a visible period: every ember would retrace the same
path every lifetime. So the per-ember draws are hashed against the **cycle index** as well as the
seed — recycling an ember re-rolls it, giving a new spawn point, speed, size, lifetime and heat.
There is no loop to find, and nothing to hide at the recycle because it happens at zero opacity
either way.

**Heat is the whole look, and heat is rare.** Each ember draws a heat value biased hard toward
zero, and heat is what makes it bigger, faster, longer-lived, brighter and white-centred. The three
colours are one temperature ramp — `coolColor` → `baseColor` → `hotColor` — that each ember is born
somewhere on and slides down as it ages. The result is a handful of yellow-hot sparks riding above
a field of dim red fragments, which is what a lava surface actually looks like; an even draw over
the same three colours reads as decorative dust.

Three separate horizontal terms, because they do three different jobs and collapsing them loses
the look: `driftSpeed` is one coherent wind every ember shares, `spread` is the cone the column
opens into with height, and `turbulence` is a per-ember wander that builds in after the source
rather than starting at full amplitude — gas leaves a vent laminar, and a sine at full strength
from frame one puts a visible kink at the spawn point. The climb itself eases out as buoyancy
bleeds away; a constant speed over a long life reads as a rocket, which is the usual way this
effect goes wrong.

Rendering is instanced camera-facing quads rather than `THREE.Points`, the same technique as the
embers in the fire pit and for the same reason: `gl_PointSize` is driver-capped, and a point sprite
vanishes the moment its centre crosses the frustum edge. The glow is two gaussians in the fragment
shader — a tight core and a weak wide halo standing in for the bloom a playable cannot afford — and
the quad stretches along travel while the ember is still fast, which is a streak renderer's worth
of look for one multiply.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the column. Call once per frame. |
| `start()` / `stop()` | Resumes emission / stops it. Embers already lit finish and fade, so the column **drains over one lifetime** rather than blinking out; `start()` refills it from the source, never into mid-air. Both idempotent. |
| `enabled = false` | Hides the column and freezes its clock. Costs nothing while off. |
| `applyConfig()` | Re-reads `config` after an edit. Every knob but `particleCount` is a uniform and lands on the next frame; `particleCount` only resizes the draw. |
| `reset()` | Puts the clock back to zero and refills the column. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — an ambient column has nothing to burst. |

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the column renders. |
| `particleCount` | Ceiling on live embers — the budget, not the density. |
| `emissionRate` | Embers per second. The live population settles at `emissionRate × average lifetime` and is capped by `particleCount`, so these two are not redundant: raise the rate for density, the count for headroom. |
| `emissionWidth` / `emissionDepth` | Full extents of the source area, in world units. |
| `emissionHeight` | Height of the source above the effect's own origin. |
| `emissionShape` | `box`, `disc` or `ring`. `ring` emits from the rim only — a vent whose middle has crusted over, and the shape that stops a wide source reading as a slab of embers. |
| `riseSpeed` | **Average** upward speed over a life, not the launch speed: the climb eases out as the ember cools. |
| `riseSpeedVariation` | Spread of that draw, 0–1. 0.45 means ±45%. |
| `driftSpeed` / `driftAngle` | A coherent wind, in units per second and degrees counter-clockwise from +X. The only horizontal motion with a direction. |
| `turbulence` | Amplitude of the per-ember sideways wander, in world units. Past ~0.4 the column stops reading as rising and starts reading as swirling. |
| `spread` | How far the column fans out by the end of a life, in world units. |
| `maxHeight` | Hard ceiling on vertical travel, so a long-lived ember cannot leave the shot. |
| `minSize` / `maxSize` | World size at birth. Every ember shrinks a little as it burns down. |
| `sizeVariation` | How far size may come loose from heat, 0–1. At 0 the hottest embers are the biggest; at 1 size is drawn independently. |
| `hotColor` / `baseColor` / `coolColor` | The top, middle and bottom of the one temperature ramp. Most embers live in its lower half. |
| `glowIntensity` | Master brightness. Above ~2 the halos merge into haze. |
| `opacity` | Master alpha over the per-ember brightness. |
| `minScreenSize` | Floor on on-screen size, as a fraction of viewport height. Without it the small embers go sub-pixel at playable framing and scintillate instead of glowing. |
| `minLifetime` / `maxLifetime` | Seconds. Hotter embers live toward the top of the range. |
| `fadeInDuration` | Seconds spent fading up at birth. Keep it short, or embers appear to ignite in mid-air. |
| `fadeOutDuration` | Seconds spent fading out. Long on purpose — an ember should go out, not switch off. |
| `flickerSpeed` / `flickerIntensity` | Rate and depth of the brightness wobble. Two incommensurate sines per ember, so there is no period to spot; past ~0.6 depth the field reads as noise rather than fire. |
| `coolingIntensity` | How hard age pushes an ember down the temperature ramp and into the dark. One knob for colour and brightness together. |

---

## The smoke wisps effect

Thin strands of smoke lifting off a smouldering surface, curling, widening and dissolving.
Ambient like the embers — nothing triggers it — and like them the whole lifecycle runs on the GPU.

```ts
import { SmokeWispsVfx } from "./vfx/effects/smokewisps";
import smokeConfig from "./vfx/effects/smokewisps/smokewisps-vfx.json";

const smoke = new SmokeWispsVfx(smokeConfig);
smoke.object3d.position.set(0, 0, 0);   // the smouldering surface itself
scene.add(smoke.object3d);

// inside the game loop you already have:
smoke.update(deltaSeconds);

smoke.stop();           // stop emitting; the strands in the air finish and the column drains
smoke.enabled = false;  // off, without tearing anything down
smoke.dispose();        // on teardown
```

One draw call, one float of per-frame CPU work, no texture and no bloom.

### How it is built

**A wisp is a streamline, not a card.** The vertex shader has one function — "where has the smoke
that left the source *t* seconds ago got to" — and a wisp is one thin triangle strip whose rows
sample that function at a spread of *t*. The top of a strand is smoke that left two seconds ago
and has been curling and drifting ever since; the bottom is still at the vent. So the silhouette
curls because the *flow* curled, and no two strands bend the same way. A camera-facing ribbon
built on a path costs the same as a billboard and avoids the thing that kills this effect when it
is built from puffs: a column of identical soft circles that reads as a string of beads.

That one idea decides the rest of the model:

- `minLength` / `maxLength` are world units applied as a **time lag** (`length / riseSpeed`), so
  two wisps of the same length really are the same length however fast they climb — and the lag
  opens from zero at birth, which is why a wisp grows out of the source instead of appearing whole.
- Width and opacity follow **the parcel's own age, not the wisp's**: the old end is the wide end,
  and alpha falls as `w0 / (w0 + expansion·t)` — the same smoke spread thinner. "Becomes more
  diffuse as it rises" is therefore `expansionRate` and not a second knob to keep in sync.
- Recycling **re-rolls everything**. The per-wisp draws are hashed against the cycle index as well
  as the seed, so a wisp coming round again is a new wisp — new source point, speed, width, length
  and lifetime. There is no loop to spot, and the swap happens at zero opacity either way.

The strand's silhouette is eroded per-pixel by two octaves of simplex noise that also distort the
across-strand coordinate, so the edge wanders instead of running straight down the side of a card,
and the interior has thin spots rather than a uniform core. The material alpha-blends with
`DoubleSide` — a strand that curls past edge-on flips its own winding partway along, and culling
would silently eat half of it.

### Lifecycle

| Call | Effect |
| --- | --- |
| `update(dt)` | Advances the column. Call once per frame. |
| `start()` / `stop()` | Resumes emission / stops it. Strands already in the air finish rising and dissolve, so the column **drains over one lifetime** rather than blinking out. Both idempotent. |
| `enabled = false` | Hides the column and freezes its clock. Costs nothing while off. |
| `applyConfig()` | Re-reads `config` after an edit. Every knob but `wispCount` is a uniform and lands on the next frame; `wispCount` only resizes the draw. |
| `reset()` | Puts the clock back to zero and starts the column again from an empty source. |
| `dispose()` | Releases the geometry and material. |
| `burst()` | A documented no-op — a smouldering source has nothing to burst. |

### What each knob does

| Key | Meaning |
| --- | --- |
| `enabled` | Whether the column renders. |
| `wispCount` | Ceiling on simultaneously visible wisps — the budget, not the density. |
| `emissionRate` | Wisps per second. The live population settles at `emissionRate × average lifetime` and is capped by `wispCount`, so these two are not redundant: raise the rate for density, the count for headroom. |
| `emissionWidth` / `emissionDepth` | Full extents of the source region, in world units. |
| `emissionHeight` | Height of the source above the effect's own origin. |
| `emissionShape` | `point`, `line` or `area`. `line` uses the width axis only — a seam or a row of embers rather than a patch. |
| `riseSpeed` | **Average** upward speed over a life, not the launch speed: the climb eases out as the smoke cools and mixes. |
| `riseSpeedVariation` | Spread of that draw, 0–1. 0.4 means ±40%. |
| `horizontalDrift` / `driftAngle` | A coherent wind, in units per second and degrees counter-clockwise from +X. The only horizontal motion with a direction. |
| `turbulence` | Amplitude of the curl written into the strand, in world units. Past ~0.4 the wisps stop rising and start corkscrewing. |
| `curlFrequency` | How many bends a strand carries per second of travel. Low is long and lazy, which is what reads as smoke rather than as a spring. |
| `spread` | How far a wisp fans from the source by the end of its life, in world units. |
| `expansionRate` | How fast smoke widens as it ages, in units/second — and thins in the same measure. |
| `maxHeight` | Hard ceiling on vertical travel, so a long-lived wisp cannot leave the shot. |
| `smokeColor` | Base colour. The interior sits a little under it, the edges a little over, which is what keeps overlapping strands readable against each other. |
| `colorVariation` | Per-wisp brightness and warm/cool jitter. Small on purpose: smoke varies between strands, it does not come in colours. |
| `baseOpacity` | Master alpha. Keep it low — density should come from more wisps, not more opaque ones. |
| `opacityVariation` | Per-wisp alpha jitter, 0–1. The main source of depth when strands overlap. |
| `minWidth` / `maxWidth` | Strand width at birth, in world units, before expansion. |
| `minLength` / `maxLength` | Strand length in world units, applied as a time lag. |
| `softness` | Cross-section falloff, 0–1: a defined core at 0, pure gradient at 1. |
| `noiseScale` / `detailScale` | The two octaves that erode the silhouette and break up the interior. |
| `noiseIntensity` | How hard they bite. Past ~0.8 the strands tear into separate pieces. |
| `minScreenWidth` | Floor on strand width in screen space, as a fraction of viewport height. Without it a correctly-sized wisp goes sub-pixel at playable framing. |
| `minLifetime` / `maxLifetime` | Seconds. |
| `fadeInDuration` | Seconds spent fading up at birth. Long enough that a wisp forms rather than appears. |
| `fadeOutDuration` | Seconds spent fading out. Long on purpose — smoke dissolves, it does not switch off. |
| `randomness` | Master on every per-wisp draw, 0–1. At 0 every wisp is the average of its ranges and the column marches in step; useful for reading one strand's shape clearly while tuning. |

---

## The sky and atmosphere effect

Everything above the horizon, from one shader: the gradient, the haze, the sun, the moon, the
stars and the cloud decks. Plus the things that belong with a sky but are not part of it —
precipitation, lightning, fog, and the lights the sky is supposed to be casting.

It is the only effect here that is a *backdrop* rather than a thing in the scene, so it works
slightly differently from the other thirteen: it is designed to be dropped into a playable that
already has a scene, and to leave that scene exactly as it found it if you switch its
synchronisation off.

### Using it in a game

```ts
import { SkyVfx } from "./vfx/effects/sky";
import skyConfig from "./vfx/effects/sky/sky-vfx.json";

const sky = new SkyVfx(skyConfig, {
    scene,                       // optional: lets it drive fog and background
    directionalLight: sunLight,  // optional: your key light, by reference
    ambientLight: fillLight,     // optional: AmbientLight or HemisphereLight
});
scene.add(sky.object3d);

sky.loadPreset("golden-hour");

// in your loop
sky.update(deltaSeconds);
```

Every option is optional. Construct it with none and it draws a sky and touches nothing else.

```ts
sky.setTimeOfDay(18.5);                                  // hours, 0..24
sky.startCycle(180);                                     // a full day every 180 real seconds
sky.transitionToPreset("dark-storm", { duration: 6 });   // eased, frame-rate independent
sky.setQuality("static");                                // one compile, nothing else rebuilt
sky.setWeather("snow", 0.8);
sky.burst();                                             // fire a lightning strike now
const json = sky.exportConfig();                         // plain data, ready to ship
sky.dispose();
```

`sky.object3d` is expected to stay at the origin. The cloud decks and the weather field are
anchored to the *camera* in world space, which is what makes them follow the player without
parallaxing wrongly — moving the group would double-transform them.

### How it is built

**One draw call for the sky.** A unit box drawn from the inside, with the camera's translation
stripped out of the view matrix in the vertex shader, so it is permanently centred on the camera
without anything ever writing its matrix. Object space is then exactly the view ray, and every
feature — gradient, haze, sun disc, sun glow, moon disc, moon phase, stars, cloud decks — is a
function of that one direction, evaluated per pixel.

**Two projections over that one shader.** `projection.mode` decides where the direction comes
from. `infinite` is the box above: a backdrop at infinity, no parallax, the horizon follows the
camera. `dome` swaps the box for a real ellipsoid standing over the map — object space there is a
unit sphere, so a vertex position is still a direction and the fragment shader is unchanged, but
the mesh has a position and a radius. It therefore parallaxes as the camera moves, its horizon
belongs to the map rather than to the viewer, and `heightScale` below 1 flattens it so the
gradient bunches toward the horizon, which is the hand-painted skydome look. The cloud decks are
intersected around the dome's centre instead of the camera's, so they are anchored to it too.
A dome has to clear the map — the sky draws last among the opaque objects, so anything standing
outside it is painted over — and should sit inside the camera's far plane; past it the dome is
pinned to the far plane rather than clipped away, which quietly degrades the look back to the
flat backdrop.

The vertex shader forces the output depth to the far plane and the material is **opaque** with
`depthWrite: false` and `renderOrder: 1000`. That combination is doing something specific: it
puts the sky last in three's *opaque* queue, so your scene's geometry has already written depth
and every covered pixel fails the test and costs nothing — while the transparent pass still draws
over the result, so your particles blend against the sky correctly. Making the material
`transparent: true` moves it into the transparent queue, after the particles, and because every
particle renderer in this repo uses `depthWrite: false` the sky then paints straight over them.
That failure looks like "my embers disappeared" and nothing about the sky looks wrong when you go
looking, which is why the comment in `SkyDome.ts` is as long as it is.

**Clouds are a ray-plane intersection, not a raymarch.** The view ray is intersected with a plane
at `cloudHeight` and a domain-warped fbm is sampled at the hit point. The perspective compression
toward the horizon comes free from the geometry, which is most of what stops a cloud deck reading
as scrolling noise; the rest is a second, much coarser coverage field drifting at a different
speed in a different direction, so the big shapes never come round on the same period as the
detail. Grazing rays drop fbm octaves as their pixel footprint grows — without that you get a
band of boiling static exactly where the deck meets the horizon. One extra sample toward the sun
gives the deck a lit edge and a shaded underside, which is the difference between a cloud and a
grey stain.

**Stars are cells on a cube face**, not a point cloud and not a texture. One hash per cell gives
position, size and brightness; cube-face parameterisation avoids the clustering and crawling that
latitude/longitude gives you at the zenith, which is exactly where you look when you are judging a
star field. The important part is the anti-shimmer: most stars are smaller than a pixel, so each
one's radius is floored in screen space **and dimmed by the square of how much it was floored**.
Clamping the radius alone makes every star the same size and the whole field strobes when the
pixel ratio or the field of view changes.

**Weather is one instanced draw with no CPU work.** Positions are computed entirely in the vertex
shader from a per-instance seed and three scalar phase uniforms, wrapped into a box anchored on
the camera. The seeds are written once at construction and never touched again — no simulation
loop, no attribute upload, no pooling. Rain, snow, dust and ash are uniform sets over that one
material; the only thing that is not a uniform is blending, because ash occludes and rain glows.
The phases are wrapped in JS doubles rather than multiplied by a shader `uTime`: after a long
session `velocity * time` exceeds what a 24-bit mantissa resolves, the quantised value feeds the
`floor()` in the wrap, and particles start teleporting across the box.

**Lightning** is a flash envelope — a few irregular pulses, not one ramp — that lifts the sky's
brightness and spikes the synced lights. The optional bolt is drawn through `StreakRenderer`,
because a bolt is a chain of tapering segments and that renderer already solves the two hard parts
(quad winding, and a screen-space width floor so a one-pixel bolt stays visible).

**The sky tone maps itself.** The renderer here uses `NoToneMapping`, so anything over 1.0 clips
and a bright sun becomes a disc-shaped hole with a hard contour where its glow crosses 1. The
shader applies a local shoulder instead: everything below 0.8 passes through untouched — the hex
you typed is the colour you get — and only the sun's core is compressed. Doing it in the sky
rather than on the renderer leaves every other material in your scene exactly as it was.

### Lifecycle

| Call | What it does |
| --- | --- |
| `update(dt)` | Advances the clock, any running transition, the cloud drift, the weather and the lightning, then pushes the config to the GPU. Clamped at 0.1 s so a backgrounded tab does not jump the time of day. |
| `start()` / `stop()` | Resumes / freezes all animation. The sky stays visible either way. |
| `enabled = false` | Hides it **and** restores the host's fog and lights, so a switched-off sky is not still lighting your scene. |
| `burst()` | Fires a lightning strike now, if lightning is enabled. The sky has nothing else to emit. |
| `reset()` | Clears the clock, the transition and the particle phases. |
| `setQuality(q)` | `"static"` / `"standard"` / `"enhanced"`. Costs exactly one shader compile; nothing else is rebuilt. |
| `loadPreset(id)` | Replaces the config immediately. |
| `transitionToPreset(id, {duration, easing})` | Eases there. Colours and intensities interpolate; weather type, cloud type and fog type hand over at the end. |
| `setTimeOfDay(h)` / `startCycle(s)` / `stopCycle()` | The clock. Sunrise 06:00, sunset 18:00. |
| `exportConfig()` | A plain, portable copy. No three.js objects, no runtime state. |
| `dispose()` | Releases what it created and puts the scene's fog, background and lights back. |

`sky.dome`, `sky.precipitation` and `sky.lightning` are public, so a game can switch parts off
without taking the system apart.

### Synchronisation, and what it promises

With `lighting.syncLighting` or `lighting.syncFog` on, the sky writes your directional light,
your ambient or hemisphere light, and `scene.fog`. It never creates a light and never replaces
one — it only writes the references you handed it.

Everything it touches is snapshotted the moment it is given the reference, and put back the
instant the toggle goes false, the sky is disabled, or `dispose()` runs. That is why `syncFog`
defaults to **on**: a host that set fog for a different mood produces a hard dark band exactly at
the horizon under a bright sky, and that reads as a bug in the sky shader rather than as the fog
it actually is.

Sun elevation drives the curve: warm and low at sunrise and sunset, neutral and bright at midday,
near-nothing at night with a little left over if there is a moon up, and dragged down and
desaturated by storm, rain and ash. The approach is exponential, so it is frame-rate independent
and never pops.

### The presets

24 built-ins, all of them the same renderer with different numbers:

| Daytime | Evening | Night | Weather | Special |
| --- | --- | --- | --- | --- |
| `clear-day` | `warm-sunset` | `clear-night` | `partly-cloudy` | `desert-heat` |
| `bright-sunny` | `dramatic-sunset` | `moonlit-night` | `overcast` | `sandstorm` |
| `soft-morning` | `pink-dusk` | `starry-night` | `dark-storm` | `volcanic-sky` |
| `midday-blue` | `twilight` | | `rainy-day` | `ash-filled` |
| `golden-hour` | | | `snowy-sky` | `fantasy-purple` |
| | | | `foggy-morning` | `fantasy-alien` |

A preset is a *partial* config. It states only what makes it different and is handed straight to
the same validator the JSON file goes through, which fills everything else from the schema
defaults — so a field added to the schema tomorrow appears in all 24 at its default without any of
them being edited. The flip side is that the validator ignores unknown *keys* (that is how
`$about` survives), so a misspelled section in a preset would do nothing, silently, forever;
`SkyVfx` walks every preset's keys against the schema at construction and warns about any that do
not exist.

The realistic presets set `time.timeOfDay` and leave the sun and moon angles to the clock, so you
can scrub time under any of them. The two fantasy skies turn `time.driveCelestials` off, place
their suns by hand and set `sky.dayNightBlend` to 0, because an alien sky has no business turning
navy at "night".

Custom presets save to `localStorage` from the lab panel — that is lab-side on purpose, because
nothing in `src/vfx` should assume a browser has storage.

### Quality modes

| | STATIC | STANDARD | ENHANCED |
| --- | --- | --- | --- |
| Cloud decks | 1, frozen | 2 | 3 |
| fbm octaves | 2 | 3 | 4 |
| Cloud sun lighting | off | on | on |
| Star cells sampled | 1 | 1 | 3x3 |
| Weather particles | none | 1x | 1.8x |
| Animation | none | full | full |

Switching costs one shader compile and nothing else: the config API is identical across all
three, the uniform values are carried across the swap so there is no flash, and the particle
budget is `instanceCount` rather than a `#define`, so it changes with no recompile at all. The sky
is one draw call in every mode.

### What each knob does

The panel groups follow the config sections, and every control is live.

- **Projection** — `infinite` (the backdrop at infinity) or `dome` (a finite ellipsoid over the
  scene), plus the dome's radius, vertical scale, centre height and tessellation. `Follow camera`
  trades the dome's parallax back for a horizon that cannot be walked out of.
- **Sky** — the four gradient stops (`zenith`, `upperSky`, `horizon`, `lowerHorizon`), where the
  horizon line sits and how soft the blends are, plus the night pair and `dayNightBlend`, which
  decides how much the clock is allowed to override the authored palette. `atmosphereIntensity`
  is the warmth the sun spreads into the sky around it and along the horizon; `exposure`,
  `skyBrightness`, `skySaturation` and `skyContrast` are a final grade.
- **Sun & moon** — position, angular size (degrees; the real sun is 0.27), disc intensity, and a
  separate glow lobe with its own radius and softness. Moon phase is an offset occluding disc:
  0 is new, 0.5 full, and it is deliberately independent of where the moon sits.
- **Stars** — `density` is cells per cube face and `coverage` the fraction holding a star, so the
  two together set both how many and how evenly spread. Twinkle is a per-star hashed frequency.
- **Clouds** — `type` is a set of multipliers over everything else, not a different renderer.
  `coverage` opens and closes the deck, `variation` is how much the coarse field modulates that,
  `softness` is edge hardness, `detail` scales the domain warp, and `lightInfluence` is how hard
  the sun is allowed to shade the underside and light the rim.
- **Weather** — `type`, then density, fall speed, wind and particle look. `storm` draws rain and
  additionally darkens the deck, drops sky brightness and enables lightning. `visibility` is the
  one knob that reaches everything: it washes the sky out, tightens the fog and dims the lights.
- **Atmosphere** — fog type, range and colour. Leave `fogFollowsSky` on unless you have a reason.
- **Lighting** — the synchronisation toggles and the values used when `driveFromSun` is off.
- **Animation** — the clock. `driveCelestials` off hands the sun and moon angles back to the
  sliders.

While `driveCelestials` is on, the derived sun and moon angles are written *back into the config*
every frame. That is deliberate: it keeps an export coherent with what is on screen, and makes the
azimuth and elevation sliders read as live values rather than as settings that silently do
nothing. Dragging one while the clock owns it will snap back.

---

## Tuning

Everything lives in `src/vfx/effects/firepit/firepit-vfx.json`, the water effect's in
`src/vfx/effects/water/water-vfx.json`, the fireflies' in
`src/vfx/effects/fireflies/fireflies-vfx.json`, the fog's in
`src/vfx/effects/waterfog/waterfog-vfx.json`, the bubbles' in
`src/vfx/effects/swampbubbles/swampbubbles-vfx.json`, the water surface's in
`src/vfx/effects/watersurface/watersurface-vfx.json` and the splash's in
`src/vfx/effects/watersplash/watersplash-vfx.json`, the embers' in
`src/vfx/effects/risingembers/risingembers-vfx.json` and the lava surface's in
`src/vfx/effects/lavasurface/lavasurface-vfx.json` and the lava impact's in
`src/vfx/effects/lavaimpact/lavaimpact-vfx.json` and the glowing cracks' in
`src/vfx/effects/glowingcracks/glowingcracks-vfx.json` and the smoke wisps' in
`src/vfx/effects/smokewisps/smokewisps-vfx.json`. Every one of them is data only — no functions, no paths. Unknown keys are ignored (that is how the `$about` notes stay in the file), and invalid
values fall back to the defaults in `config.ts` with a precise console warning rather than
breaking the effect.

### The loop that works

1. `npm start`, open the lab, drag sliders. Changes apply to the **next** particle spawned —
   particles in flight keep the values they were born with, exactly as in an engine.
2. When it looks right, **Config → Copy JSON** and paste over `firepit-vfx.json`.
3. Check it at the **playable** camera preset before you commit. Effects tuned at `close` almost
   always read as noise at shipping distance.

Curve keyframes (`opacityOverLife`, `scaleOverLife`) are not on sliders — edit them in the JSON
and reload, or call `firePit.rebuildCurves()` after changing them at runtime.

### What each knob does

**Shared across the three types**

| Key | Meaning |
| --- | --- |
| `enabled` | Turns one type off without touching the others. |
| `maxParticles` | Pool size. Allocated once at load — raising it in the lab only raises the cap up to that allocation; raise it in JSON and reload for more. |
| `emission.rate` | Particles per second. Fractions accumulate, so `0.2` really does fire once every five seconds. |
| `emission.burstCount` | `[min, max]` size of one `burst()`. |
| `lifetime` | `[min, max]` seconds. |
| `spawn.radius` / `spawn.height` | Disc the particle is born on, and the vertical jitter above it. |
| `spawn.offset` | `[x, y, z]` shift of that disc from the effect's origin. |
| `drag` | Exponential velocity damping per second; frame-rate independent. |
| `opacityOverLife` / `scaleOverLife` | `[[t, value], …]` with `t` in 0–1. Baked into a lookup table on load. |

**Sparks**

| Key | Meaning |
| --- | --- |
| `emission.autoBurstInterval` | `[min, max]` seconds between the extra bursts fired while emitting. `[0, 0]` leaves only the steady trickle. |
| `direction.upward` | 0 = launch straight outward along the ground, 1 = straight up. |
| `direction.spreadDeg` | Half-angle of the random cone around that axis. |
| `velocity.speed` | `[min, max]` launch speed in units/second. |
| `gravity` | Negative pulls down. |
| `streak.length` / `streak.lengthPerSpeed` | Base streak length plus extra length proportional to speed — the second one is what makes fast sparks read as fast. |
| `streak.thickness` | World-space width. |
| `streak.minWidth` | Floor on width in **screen space** (fraction of viewport height). Without it a correctly-sized spark goes sub-pixel at playable distance and disappears. |
| `color.start` / `color.end` | Hot colour pair at birth, cooled pair at death; each particle picks its own point between the two. |
| `color.coreWhiteness` | How far the head is pushed toward white. Past ~0.7 a burst reads as white needles. |
| `brightness` | Multiplies the colour. Additive blending, so above 1 is a hot core, not a clipped one. |
| `flicker.amount` / `flicker.speed` | Per-particle brightness wobble. |

**Embers**

| Key | Meaning |
| --- | --- |
| `velocity.rise` / `velocity.lateral` | Initial upward speed range, and sideways spread at birth. |
| `buoyancy` | Constant upward acceleration. |
| `drift.amplitude` / `drift.frequency` | Amplitude and rate of the per-particle sway. Each ember gets its own phase, so nothing moves in lockstep. |
| `size` | `[min, max]` world size. |
| `color.range` / `color.accent` / `color.accentChance` | Main colour pair, plus the rare yellow ember and how often it appears. |
| `brightness` | `[min, max]` multiplier; wide ranges give depth. |
| `pulse.amount` / `pulse.speed` | Gentle brightness throb. |

**Smoke**

| Key | Meaning |
| --- | --- |
| `size` | `[min, max]` size at birth. |
| `expansion` | Growth in world units per second — the main reason smoke reads as smoke. |
| `opacity` | `[min, max]` per-particle alpha ceiling. Keep it low: density should come from more puffs, not more opaque ones. |
| `rotation.startDeg` / `rotation.speedDeg` | Start angle and spin, so the one texture never shows twice in the same orientation. |
| `color.range` / `color.accent` / `color.accentChance` | Cool grey pair plus the warm, fire-lit variant. |

**Quality**

`quality.presets.low|high` carry `particles` and `emission` multipliers applied on top of every
type's own numbers. Pools are allocated at full size once, so switching presets mid-frame costs
nothing.

---

## The lab UI

| Control | |
| --- | --- |
| **Effect** | Which registered effect to preview. |
| **Camera** | `playable` (ship framing — judge here), `close`, `wide`, `top`. |
| **Time scale / Paused / Step frame** | Slow motion and frame stepping for inspecting a burst. |
| **Pixel ratio cap** | Drop to 1 to tell fill-rate problems from simulation cost. |
| **Scene glow** | Dims the set dressing, to check particles read without help from the environment. |
| **Spark burst / Burst all / Start / Stop / Reset** | The lifecycle, by hand. |
| **Water: click the surface** | Emits the selected preset where you clicked. A pointer-up that travelled more than a few pixels is an orbit drag, not a click. |
| **Water: Auto emit** | Scatters events at a configurable rate — the overlap behaviour a still frame cannot show you. |
| **Splash: Splash / click the surface / Auto repeat** | Fires an impact at the origin, where you clicked, or on an interval. **Impact scale** replays the same config at a different size. |
| **Lava impact: Impact / click the surface / Auto trigger** | Fires a burst at the origin, where you clicked, or on an interval. |
| **Bubbles: click the surface / Pop one** | Raises a bubble where you clicked, or in the middle, so you do not have to wait out a spawn interval to judge a pop. |
| **Copy JSON / Download** | The current config, in `firepit-vfx.json` shape. |

`H` hides the panel, `Space` pauses, `.` steps one frame. `__vfxLab` in the console reaches the
app, the panel and `__vfxLab.effect.debug.firePit` for anything the panel does not expose.

---

## Adding a new effect

1. Create `src/vfx/effects/<name>/` with your effect class. Extend `ParticleEffect` from
   `src/vfx/core/VfxEffect.ts` and implement `spawnOne`, `simulate` and `flush`; you get pooling,
   fractional emission, quality scaling and the lifecycle for free. Use `QuadParticleRenderer`
   for billboards or `StreakRenderer` for velocity-aligned streaks.
2. Put its tunables in `<name>.json` next to it, and a `config.ts` that validates them with the
   helpers in `src/vfx/core/config.ts`.
3. Add `src/lab/effects/<name>LabEffect.ts` returning a `LabEffectHandle` — the object3d, an
   `update`, the control bindings and a stats line.
4. Register it in `src/lab/registry.ts` with a `label`, a one-phrase `hint` and the `group` it
   is listed under — keep entries of one group adjacent. The picker, panel and stats pick it
   up from there.

---

## Verification

### Fire pit

Checked in headless Chrome (ANGLE / Metal, WebGL 2) against the running dev server, at 60 fps and
12 draw calls for the full scene:

- All three particle types render, and each is independently toggleable.
- `stop()` drains 78 live particles to 0 and emits nothing further; `burst()` still works while
  stopped and hits only the type it was called on; `reset()` clears instantly.
- Particle counts settle (131 → 112 over 12 s) far below the 870-particle cap — pooling recycles,
  nothing leaks.
- `setQuality("low")` holds 49 live particles against 109 at `high`.
- Config edits reach the GPU on the next spawn (ember size 0.087 → 0.359 after a live edit).
- `dispose()` releases 3 geometries and 2 textures, detaches from the scene and leaves the
  environment's own resources alone.
- A deliberately broken config (`maxParticles: "lots"`, reversed lifetime, `NaN` gravity, a
  non-hex colour, out-of-range opacity, unknown quality preset) produced 5 warnings and a fully
  working effect on defaults.
- No console errors or page errors throughout.

Not verified: behaviour on real mobile GPUs, and performance under a full game scene rather than
this preview.

### Water ripples

Checked by running the ripple system headlessly in Node (no GL context needed — the simulation is
plain typed-array maths) and asserting on the instance data it produces:

- The shipped config parses with zero warnings; the three presets come out visibly different
  (`ambient` 0.85m < `impact` 1.5m < `emergence` 3.4m max radius) and inherit everything they do
  not override.
- A deliberately broken config (`maxRipples: "lots"`, `surfaceOffset: NaN`, `troughColor: "teal"`,
  a reversed lifetime, `rings: 0`, a negative radius, a non-numeric spray count) produced 11
  warnings and a fully working effect on defaults, with every value finite and in range. An unknown
  key in `presets` became a usable preset.
- `emit` starts one ring per configured ring and places them on the surface plane, discarding the
  event's own height.
- Pool overflow behaves: 12 slots fill and stop growing; a higher-priority event recycles the ring
  closest to finishing; a lower-priority one is dropped rather than forced in; 400 repeated events
  never exceed the cap and every ring eventually expires.
- Expansion is eased, not linear (1.69 of a 2.0 max radius at half life), and frame-rate
  independent — 6×100ms and 60×10ms agree on the radius to 3e-7.
- `enabled = false` drops live rings and publishes an empty draw call; `dispose()` detaches the
  group and releases its geometry and material.

### Rising embers

Not verified visually. `npm run typecheck` passes and the effect is registered, but **no browser was
opened, by request** — the shader has never been compiled or rendered. The default balance between
the few hot embers and the many dull ones, the density at playable framing, the flicker depth and
the stretch along travel are all unjudged, and that balance is exactly the thing that needs one
tuning pass against a real frame.

### Heat distortion

Not verified visually. `npm run typecheck` and `npm run build` both pass and the effect is
registered, but **no browser was opened, by request** — neither shader has ever been compiled or
rendered. Unjudged: whether the grab-pass fires at the right moment against this renderer, the
default displacement strength at playable framing, how hard the silhouette reads against the
preview pillars, the balance between the broad and detail layers, and whether the `low` filaments
stay the right side of looking like smoke.

### Water splash

Not verified at all beyond `npm run typecheck`. The effect compiles and is registered, but **no
browser was opened, by request** — the sheet shader has never been compiled or rendered. The crown's
silhouette, the balance between the sheets and the spray, the ring strength against dark water and
every default in `watersplash-vfx.json` are unjudged, and a shader-carved silhouette is exactly the
kind of thing that needs one tuning pass against a real frame.

### Water ripples, continued

**Not verified: how any of it looks.** The shaders (`RingRenderer`, the preview water surface) have
never been compiled or rendered — no browser was opened, by request. Colours, crest thickness at
playable framing, the trough contrast against dark water and the three presets' relative weight are
all unjudged, and the ring profile is the kind of thing that always needs one tuning pass against a
real frame.

### Sky and atmosphere

**Not yet rendered in a browser.** Written, type-checked (`tsc --noEmit`, clean) and built
(`vite build`, clean), but neither the dev server nor `npm run shot` has been run against it, so
nothing below the TypeScript level has been confirmed:

- No shader in `SkyDome.ts` or `PrecipitationField.ts` has been compiled by a GPU driver. A sky
  shader of this size is the most likely place for a first-run error, and a compile failure
  produces a silent black mesh rather than an exception.
- The draw-order argument — opaque queue, `renderOrder: 1000`, depth at the far plane — is
  reasoned from three's `painterSortStable` and the r184 shader prefixes rather than observed.
  What needs checking is that the sky appears *behind* the rig's geometry and *behind* another
  effect's particles, not in front of either.
- None of the 24 presets has been looked at. They are coherent as data and all 24 parse, but
  whether `dramatic-sunset` actually looks dramatic is not something the type system knows.
- The star field's anti-shimmer and the cloud deck's horizon fade are the two things most likely
  to need numbers adjusting, and both only show up in motion.
- Resource behaviour across repeated preset loads and quality switches is reasoned, not measured.

The verification plan is in the implementation notes: step every preset, orbit under each,
cycle the clock 0→24, toggle every weather type and both sync switches, and watch
`renderer.info` across repeated quality switches.
