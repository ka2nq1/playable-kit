/**
 * The contract between the editor and one map effect.
 *
 * The playable lists its effects in `dev/vfx/registry.ts`. Each entry becomes a tab and an option in
 * the Place tab; a tab shows the instances of its effect and edits the one you pick. Adding an
 * effect is one entry — see `playable-kit/vfx/ADAPTER.md`.
 */

import type { Vector3 } from "three";
import type { ControlPanel } from "./ui/ControlPanel";
import type { MapVfxInstanceBase } from "../../src/kit/MapVfxInstances";

/** What a tab can ask the editor to do on its instance's behalf. */
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
     * read better as a number than as a drag (a sun's angles). Without it they would be sliders the
     * next gizmo move silently undoes, because the point owns the position.
     */
    moveTo(position: Vector3): void;
}

export interface VfxDevEntry<T extends MapVfxInstanceBase = MapVfxInstanceBase> {
    /** The effect's `ID`: the tab's identity and what a point's `mapVfx` says. */
    id: string;
    label: string;
    /** At most one per map (a sky): the Place tab refuses a second. */
    singleton?: boolean;
    /** The live instances, in file order. */
    instances(): readonly T[];
    /** Where a new point goes. Null drops it in the middle of the view. */
    spot(): Vector3 | null;
    /** The instance's settings, as they go back into its point. */
    exportConfig(instance: T): Record<string, unknown>;
    /** Builds the controls for one instance. */
    build(panel: ControlPanel, instance: T, ctx: VfxPanelContext): void;
    /** Advances every instance off the editor's wall clock while the game is paused. */
    tick(dt: number): void;
}

/** Keeps each entry typed against its own instance while the list stays uniform. */
export function entry<T extends MapVfxInstanceBase>(e: VfxDevEntry<T>): VfxDevEntry {
    return e as unknown as VfxDevEntry;
}
