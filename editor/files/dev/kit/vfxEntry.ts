import type { Vector3 } from "three";
import { markerSpot } from "../../src/kit/anchor";
import type { MapVfxController, MapVfxEffect, MapVfxInstance } from "../../src/kit/defineMapVfx";
import { entry, type PreviewSpec, type VfxDevEntry, type VfxPanelContext } from "./registry";
import type { ControlPanel } from "./ui/ControlPanel";
import { buildAutoPanel, type AutoSchema, type FieldSchema } from "./ui/autoPanel";
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

/** Set by vfx-lab's `oneOf` while a config is normalized — see `src/vfx/core/config.ts`. */
const ENUM_RECORDER = "__vfxConfigEnums";

/**
 * Which string fields of an effect's config are enums, and their options.
 *
 * A value alone cannot say whether `"infinite"` is a free string or one of three modes, so the
 * effect is built once with the recorder set and every `oneOf` reports its options. Normalizers
 * build the config in property order, so a depth-first walk meets each enum field in the order its
 * `oneOf` ran; matching by key and by the value being one of the options settles the rest.
 */
function discoverEnums(create: () => MapVfxEffect): AutoSchema {
    const calls: Array<{ key: string; options: readonly string[] }> = [];
    const global = globalThis as Record<string, unknown>;
    global[ENUM_RECORDER] = (key: string, options: readonly string[]) => calls.push({ key, options });
    let vfx: MapVfxEffect;
    try {
        vfx = create();
    } finally {
        delete global[ENUM_RECORDER];
    }

    const schema: Record<string, FieldSchema> = {};
    const walk = (object: Record<string, unknown>, prefix: string) => {
        for (const [key, value] of Object.entries(object)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (typeof value === "string") {
                const i = calls.findIndex((c) => c.key === key && c.options.includes(value));
                if (i < 0) continue;
                schema[path] = { options: calls[i].options };
                calls.splice(i, 1);
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                walk(value as Record<string, unknown>, path);
            }
        }
    };
    walk(vfx.config as Record<string, unknown>, "");
    vfx.dispose();
    return schema;
}

/** Field by field, later wins — so a hand-written label keeps the discovered options. */
function mergeSchemas(...schemas: Array<AutoSchema | undefined>): AutoSchema {
    const merged: Record<string, FieldSchema> = {};
    for (const schema of schemas) for (const [path, field] of Object.entries(schema ?? {})) merged[path] = { ...merged[path], ...field };
    return merged;
}

export function vfxEntry<V extends MapVfxEffect>(controller: MapVfxController<V>, options: VfxEntryOptions<V>): VfxDevEntry {
    const { definition } = controller;
    const apply = (vfx: V) => vfx.applyConfig?.();
    let enums: AutoSchema | null = null;

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
            enums ??= discoverEnums(() => definition.create(structuredClone(options.defaults ?? {})));
            buildAutoPanel(panel, "Settings", vfx.config as Record<string, unknown>, {
                schema: mergeSchemas({ enabled: { hidden: true } }, enums, options.schema),
                onChange: () => apply(vfx),
            });
        },
    });
}
