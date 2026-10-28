import type { Vector3 } from "three";
import { markerSpot } from "../../src/kit/anchor";
import type { MapVfxController, MapVfxEffect, MapVfxInstance } from "../../src/kit/defineMapVfx";
import { entry, type PreviewSpec, type VfxDevEntry, type VfxPanelContext } from "./registry";
import type { ControlPanel } from "./ui/ControlPanel";
import { buildAutoPanel, type AutoSchema } from "./ui/autoPanel";
import { buildAnchorFolder } from "./panels/anchorFolder";
import { defaultsFor } from "./defaults";

/**
 * The editor side of a `defineMapVfx()` controller, in one call.
 *
 * Without `controls`, the panel is built from the effect's own config: every field the lab's
 * normalizer produces becomes a control (`ui/autoPanel.ts`), and a change calls `applyConfig()`.
 * A field added to the effect in vfx-lab shows up here with no editor work. `schema` corrects what
 * the guess gets wrong (ranges, options, labels); a hand-written `controls` replaces it entirely when
 * an effect deserves a curated panel (see `vfx/adapters/waterfog`).
 */

export interface VfxEntryOptions<V extends MapVfxEffect> {
    label: string;
    group?: string;
    hint?: string;
    schema?: AutoSchema;
    /** Replaces the generated controls (the Effect and Anchor folders stay). */
    controls?(panel: ControlPanel, instance: MapVfxInstance<V>, ctx: VfxPanelContext): void;
    /** What `fitSize` means for this effect; empty hides the toggle. */
    fitSizeNote?: string;
    /** Where a new point goes; default: next to the first instance, else the middle of the view. */
    spot?(): Vector3 | null;
    /** Starting settings when the playable has saved none — pass the lab's `<id>-vfx.json`. */
    defaults?: unknown;
    preview?: Omit<PreviewSpec, "create" | "event">;
}

export function vfxEntry<V extends MapVfxEffect>(controller: MapVfxController<V>, options: VfxEntryOptions<V>): VfxDevEntry {
    const { definition } = controller;
    const apply = (vfx: V) => vfx.applyConfig?.();

    return entry<MapVfxInstance<V>>({
        id: controller.ID,
        label: options.label,
        group: options.group,
        hint: options.hint,
        singleton: definition.singleton,
        instances: () => controller.all,
        spot: options.spot ?? (() => markerSpot(controller.all[0]?.vfx.object3d, controller.all[0]?.anchor)),
        exportConfig: (instance) => controller.exportConfig(instance),
        defaultConfig: () => structuredClone(options.defaults ?? {}),
        tick: (dt) => controller.tick(dt),
        burst: (instance) => instance.vfx.burst(null),
        preview: {
            create: () => {
                const saved = defaultsFor(controller.ID) as object;
                const vfx = definition.create(Object.keys(saved).length ? saved : structuredClone(options.defaults ?? {}));
                if (!definition.event) vfx.start();
                return vfx;
            },
            camera: options.preview?.camera,
            warmup: options.preview?.warmup,
            event: definition.event,
        },
        build: (panel, instance, ctx) => {
            const vfx = instance.vfx;

            const main = panel.folder(options.label);
            main.toggle("Enabled", () => vfx.enabled, (v) => (vfx.enabled = v));
            main.buttons(
                { label: definition.event ? "Fire" : "Burst", primary: !!definition.event, onClick: () => vfx.burst(null) },
                { label: "Start", onClick: () => vfx.start() },
                { label: "Stop", onClick: () => vfx.stop() },
                { label: "Reset", onClick: () => vfx.reset() },
            );
            if (definition.event) main.note("Fired by gameplay through the controller's burstAt(position); Fire plays it here.");

            buildAnchorFolder(panel, {
                markerId: instance.markerId,
                anchor: instance.anchor,
                object3d: vfx.object3d,
                refit: () => controller.fit(instance),
                fitSizeNote: definition.fitSize ? (options.fitSizeNote ?? "takes its size from the mesh") : "",
            });

            if (options.controls) {
                options.controls(panel, instance, ctx);
                return;
            }
            buildAutoPanel(panel, "Settings", vfx.config as Record<string, unknown>, {
                schema: { enabled: { hidden: true }, ...options.schema },
                onChange: () => apply(vfx),
            });
        },
    });
}
