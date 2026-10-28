/**
 * The catalogue of effects the lab can preview.
 *
 * Adding a new effect is two steps: write a handle like `createFirePitLabEffect` that wraps your
 * effect and declares its controls, then add one entry here. Nothing else in the lab needs to
 * know the effect exists — the picker, the panel and the stats line all come from this list.
 */

import type { Object3D } from "three";
import type { Environment } from "./Environment";
import type { LabApp } from "./LabApp";
import type { ControlPanel } from "./ui/ControlPanel";
import { createFirePitLabEffect } from "./effects/firePitLabEffect";
import { createFirefliesLabEffect } from "./effects/firefliesLabEffect";
import { createWaterLabEffect } from "./effects/waterLabEffect";
import { createWaterFogLabEffect } from "./effects/waterFogLabEffect";
import { createWaterSurfaceLabEffect } from "./effects/waterSurfaceLabEffect";
import { createSwampBubblesLabEffect } from "./effects/swampBubblesLabEffect";
import { createWaterSplashLabEffect } from "./effects/waterSplashLabEffect";
import { createLavaSurfaceLabEffect } from "./effects/lavaSurfaceLabEffect";
import { createLavaImpactLabEffect } from "./effects/lavaImpactLabEffect";
import { createGlowingCracksLabEffect } from "./effects/glowingCracksLabEffect";
import { createRisingEmbersLabEffect } from "./effects/risingEmbersLabEffect";
import { createSmokeWispsLabEffect } from "./effects/smokeWispsLabEffect";
import { createHeatDistortionLabEffect } from "./effects/heatDistortionLabEffect";
import { createIceSurfaceLabEffect } from "./effects/iceSurfaceLabEffect";
import { createSnowstormLabEffect } from "./effects/snowstormLabEffect";
import { createSkyLabEffect } from "./effects/skyLabEffect";

/**
 * What the lab hands an effect at creation.
 *
 * Most effects need nothing from it. The ones that do — a different set dressing, a click-to-emit
 * control — need the host rather than a second copy of it, so they get the real objects and are
 * expected to put back anything they changed in `dispose`.
 */
export interface LabEffectContext {
    readonly app: LabApp;
    readonly environment: Environment;
    /**
     * Rebuilds the whole panel from scratch.
     *
     * Controls are getter/setter bound, so `panel.refresh()` covers a changed *value*. This is for
     * the rarer case of a changed *option list* — saving or deleting a custom preset adds or
     * removes an entry from a `select`, and a select builds its options once. Call it from an
     * event handler, never from `buildControls`.
     */
    rebuildPanel(): void;
}

export interface LabEffectHandle {
    /** Added to the scene by the lab and removed on teardown. */
    readonly object3d: Object3D;
    /** Advanced from the lab's single loop. */
    update(dt: number): void;
    /** Appends this effect's folders to the (already cleared) panel. */
    buildControls(panel: ControlPanel): void;
    /** One short line for the stats overlay, e.g. live particle counts. */
    statsLine(): string;
    /** Whatever is worth poking at from the console via `__vfxLab.effect.debug`. */
    readonly debug?: Record<string, unknown>;
    dispose(): void;
}

export interface LabEffectEntry {
    id: string;
    /** The name shown in the picker. Short — it is what you scan the list for. */
    label: string;
    /** The second line under the label: what the effect actually is. */
    hint: string;
    /**
     * Heading the entry is listed under. Entries sharing a group must stay adjacent here — the
     * picker emits a heading whenever the group changes, so a split group prints twice.
     */
    group: string;
    create(ctx: LabEffectContext): LabEffectHandle;
}

export const EFFECTS: readonly LabEffectEntry[] = [
    {
        id: "firepit",
        label: "Fire pit",
        hint: "sparks / embers / smoke",
        group: "Fire & lava",
        create: createFirePitLabEffect,
    },
    {
        id: "lavasurface",
        label: "Lava surface",
        hint: "animated shader",
        group: "Fire & lava",
        create: createLavaSurfaceLabEffect,
    },
    {
        id: "lavaimpact",
        label: "Lava impact",
        hint: "molten burst",
        group: "Fire & lava",
        create: createLavaImpactLabEffect,
    },
    {
        id: "heatdistortion",
        label: "Heat distortion",
        hint: "refracting hot air",
        group: "Fire & lava",
        create: createHeatDistortionLabEffect,
    },
    {
        id: "glowingcracks",
        label: "Glowing cracks",
        hint: "procedural fracture shader",
        group: "Fire & lava",
        create: createGlowingCracksLabEffect,
    },
    {
        id: "water",
        label: "Water ripples",
        hint: "expanding rings on the surface",
        group: "Water",
        create: createWaterLabEffect,
    },
    {
        id: "watersurface",
        label: "Water surface",
        hint: "animated shader",
        group: "Water",
        create: createWaterSurfaceLabEffect,
    },
    {
        id: "watersplash",
        label: "Water splash",
        hint: "impact burst",
        group: "Water",
        create: createWaterSplashLabEffect,
    },
    {
        id: "waterfog",
        label: "Water fog",
        hint: "drifting surface mist",
        group: "Water",
        create: createWaterFogLabEffect,
    },
    {
        id: "swampbubbles",
        label: "Swamp bubbles",
        hint: "surface gas",
        group: "Water",
        create: createSwampBubblesLabEffect,
    },
    {
        id: "icesurface",
        label: "Ice surface",
        hint: "transparency, refraction, frost",
        group: "Ice",
        create: createIceSurfaceLabEffect,
    },
    {
        id: "snowstorm",
        label: "Snowstorm",
        hint: "localized drifting blizzard",
        group: "Ice",
        create: createSnowstormLabEffect,
    },
    {
        id: "risingembers",
        label: "Rising embers",
        hint: "ambient heat column",
        group: "Ambient",
        create: createRisingEmbersLabEffect,
    },
    {
        id: "smokewisps",
        label: "Smoke wisps",
        hint: "rising strands",
        group: "Ambient",
        create: createSmokeWispsLabEffect,
    },
    {
        id: "fireflies",
        label: "Fireflies",
        hint: "ambient drifting lights",
        group: "Ambient",
        create: createFirefliesLabEffect,
    },
    {
        id: "sky",
        label: "Sky & atmosphere",
        hint: "procedural sky, weather, day/night",
        group: "Sky",
        create: createSkyLabEffect,
    },
];
