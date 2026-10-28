import { Vector3, type Object3D } from "three";
import { kitHost } from "./host";
import { exportAnchor, fitToAnchor, normalizeAnchor, type AnchorDefaults, type VfxAnchorConfig } from "./anchor";
import { MapVfxInstances, type MapVfxInstanceBase } from "./MapVfxInstances";
import { markerConfig } from "./markers";

/**
 * A map effect in one call: everything a vfx-lab effect needs to become "one instance per marker,
 * settings in the marker, re-seated on every drag".
 *
 * Every lab effect has the same surface (`object3d`, `config`, `update`, `burst`, `dispose`, and
 * usually `applyConfig`), so the controller around it is the same too — only the constructor, the
 * anchor defaults and what `fitSize` means differ. Hand-write a controller only when an effect
 * needs more than that (a scheduler, an ambient event loop, a second object to manage).
 */

/** What every vfx-lab effect provides. */
export interface MapVfxEffect {
    readonly object3d: Object3D;
    readonly config: object;
    enabled: boolean;
    start(): void;
    stop(): void;
    reset(): void;
    burst(position?: Vector3 | null): void;
    update(dt: number): void;
    dispose(): void;
    applyConfig?(): void;
}

export interface MapVfxInstance<V extends MapVfxEffect> extends MapVfxInstanceBase {
    readonly vfx: V;
    anchor: VfxAnchorConfig;
}

export interface MapVfxDefinition<V extends MapVfxEffect> {
    /** What a marker's `mapVfx` says, e.g. `"fireflies"`. */
    id: string;
    /** Builds the effect from the marker's config (the lab constructor). */
    create(rawConfig: unknown): V;
    anchor?: AnchorDefaults;
    /** One per scene (a sky). */
    singleton?: boolean;
    /** Fired by gameplay (a splash) rather than running on its own: not started on creation. */
    event?: boolean;
    /** Applies the anchor mesh's footprint as this effect's size, when `fitSize` is on. */
    fitSize?(vfx: V, size: number): void;
}

export interface MapVfxController<V extends MapVfxEffect> {
    readonly ID: string;
    readonly definition: MapVfxDefinition<V>;
    readonly all: readonly MapVfxInstance<V>[];
    /** Follow the markers. Call once from the game, after `setKitHost`. */
    init(): void;
    tick(dt: number): void;
    fit(instance: MapVfxInstance<V>): boolean;
    exportConfig(instance: MapVfxInstance<V>): Record<string, unknown>;
    /** Fires the instance nearest to `position`, at that position — how gameplay triggers an event effect. */
    burstAt(position: Vector3): void;
}

const _local = new Vector3();

export function defineMapVfx<V extends MapVfxEffect>(definition: MapVfxDefinition<V>): MapVfxController<V> {
    const fit = (instance: MapVfxInstance<V>): boolean => {
        const at = fitToAnchor(instance.anchor, instance.marker);
        instance.vfx.object3d.position.copy(at.position);
        instance.vfx.object3d.rotation.y = (at.yaw * Math.PI) / 180;
        if (instance.anchor.fitSize && at.size > 0 && definition.fitSize) definition.fitSize(instance.vfx, at.size);
        instance.vfx.applyConfig?.();
        return true;
    };

    const instances = new MapVfxInstances<MapVfxInstance<V>>({
        id: definition.id,
        singleton: definition.singleton,
        create: (marker) => {
            const raw = markerConfig(marker);
            const vfx = definition.create(raw);
            if (!definition.event) vfx.start();
            kitHost().scene.add(vfx.object3d);
            return {
                markerId: marker.id,
                marker,
                vfx,
                anchor: normalizeAnchor((raw as { anchor?: unknown }).anchor, definition.id, definition.anchor),
            };
        },
        fit,
        update: (instance, dt) => instance.vfx.update(dt),
        dispose: (instance) => {
            instance.vfx.object3d.removeFromParent();
            instance.vfx.dispose();
        },
    });

    return {
        ID: definition.id,
        definition,
        get all() {
            return instances.all;
        },
        init: () => instances.init(),
        tick: (dt) => instances.tick(dt),
        fit,
        exportConfig: (instance) => ({ anchor: exportAnchor(instance.anchor), ...structuredClone(instance.vfx.config) }),
        burstAt: (position) => {
            const nearest = instances.nearest(position, (i) => i.vfx.object3d.position);
            if (!nearest) return;
            // Effects emit in their own object's local space.
            const object = nearest.vfx.object3d;
            object.updateWorldMatrix(true, false);
            nearest.vfx.burst(object.worldToLocal(_local.copy(position)));
        },
    };
}
