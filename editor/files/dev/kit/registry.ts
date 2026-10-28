/**
 * The contract between the editor and one map effect.
 *
 * The playable lists its effects in `dev/vfx/registry.ts`. Each entry is a tile in the VFX grid and,
 * clicked, a full editor for its instances. Most entries come from `vfxEntry()` (`vfxEntry.ts`) over
 * a `defineMapVfx()` controller; see `playable-kit/vfx/ADAPTER.md`.
 */

import type { Object3D, Vector3 } from "three";
import type { ControlPanel } from "./ui/ControlPanel";
import type { MapVfxInstanceBase } from "../../src/kit/MapVfxInstances";

/** What a control panel can ask the editor to do on its instance's behalf. */
export interface VfxPanelContext {
    /** Writes the instance's settings into its point and saves the placements file. */
    save(): void;
    /** Puts the same text on the clipboard. */
    copy(): void;
    /** Saves the instance's settings as the starting point for new instances of this effect. */
    saveAsDefault(): void;
    /** The point's id, for labels and readouts. */
    instanceId: string;
    /**
     * Moves this instance's point — for controls that are really about *where* something is but
     * read better as a number than as a drag (a sun's angles).
     */
    moveTo(position: Vector3): void;
}

/** A standalone copy of the effect for the grid's tile, outside the game scene. */
export interface PreviewSubject {
    object3d: Object3D;
    update(dt: number): void;
    dispose(): void;
    burst?(position?: Vector3 | null): void;
}

export interface PreviewSpec {
    create(): PreviewSubject;
    /** Camera for the tile. Default: a little above eye height, looking at the origin. */
    camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
    /** Fired, not continuous: the tile bursts it on a loop. */
    event?: boolean;
    /** Seconds simulated before the still is taken. Default 2.5. */
    warmup?: number;
}

export interface VfxDevEntry<T extends MapVfxInstanceBase = MapVfxInstanceBase> {
    /** The effect's `ID`: what a point's `mapVfx` says. */
    id: string;
    label: string;
    /** Grid section, e.g. "Fire & lava". */
    group?: string;
    /** One line under the label: what the effect is. */
    hint?: string;
    /** At most one per scene (a sky). */
    singleton?: boolean;
    preview?: PreviewSpec;
    /** The live instances, in file order. */
    instances(): readonly T[];
    /** Where a new point goes. Null drops it in the middle of the view. */
    spot(): Vector3 | null;
    /** The instance's settings, as they go back into its point. */
    exportConfig(instance: T): Record<string, unknown>;
    /**
     * What a new instance starts with when the playable has no saved default for it
     * (`src/resources/editor/defaults/<id>.json`) — usually the lab's `<id>-vfx.json`.
     */
    defaultConfig?(): unknown;
    /** Builds the controls for one instance. Save/Copy/Delete live in the editor's header. */
    build(panel: ControlPanel, instance: T, ctx: VfxPanelContext): void;
    /** Fires the instance once, for event effects. */
    burst?(instance: T): void;
    /** Advances every instance off the editor's wall clock while the game is paused. */
    tick(dt: number): void;
}

/** Keeps each entry typed against its own instance while the list stays uniform. */
export function entry<T extends MapVfxInstanceBase>(e: VfxDevEntry<T>): VfxDevEntry {
    return e as unknown as VfxDevEntry;
}
