/**
 * Everything the editor needs to know about one playable.
 *
 * The playable writes this once, in `dev/editor.config.ts` (scaffolded by `/kit-install-editor`).
 * The editor itself — `dev/kit/` — is copied from playable-kit unchanged, so anything specific to a
 * game belongs here, never in a kit file.
 */

import type { Camera, Object3D, Vector3 } from "three";
import type { PathEditor, PathEditorOptions, PathEditorPanelOptions } from "../vendor/three-path-editor/editor.js";
import type { ControlPanel } from "./ui/ControlPanel";
import type { VfxDevEntry } from "./registry";
import type { Tunable } from "./panels/tuneTab";

/** What a project tab gets from the editor. */
export interface EditorContext {
    readonly editor: PathEditor;
    /** Writes `json` to a project-relative file through the dev server. */
    save(file: string, json: string): Promise<void>;
    /**
     * Merges `metadata` into path or marker `pathId` and saves the placements file — how a thing
     * that lives on a route (a character, an animal) keeps its settings in its own route.
     */
    saveIntoPath(pathId: string, metadata: Record<string, unknown>): Promise<void>;
    /** Rebuilds every tab — after something changed which controls should exist. */
    rebuild(): void;
}

export interface EditorTab {
    label: string;
    build(panel: ControlPanel, ctx: EditorContext): void;
}

/** Fire-and-forget effects (quarks bursts, confetti) placed as markers with `metadata.vfx`. */
export interface OneShotEffects {
    ids: readonly string[];
    play(id: string, position: Vector3, yawDegrees: number): void;
}

export interface EditorConfig {
    /** Window title and menu-bar name, e.g. "Basketball · Swamp". */
    title: string;
    /**
     * Turns every Save into a no-op and shows this text beside the Save buttons. Only for the public
     * demo — a real playable saves through the dev server.
     */
    saveDisabled?: string;
    /** The game's scene: the editor draws its helpers here. */
    scene: Object3D;
    renderer: { domElement: HTMLElement };
    /** The camera being rendered right now. Asked every frame, so a debug camera can take over. */
    camera(): Camera;
    /**
     * Subscribes a callback to every rendered frame, *including while the game is paused* — the
     * template's `UpdateController`, not a gameplay clock that stops.
     */
    onFrame(callback: () => void): void;
    /** Where the orbit pivot starts when the editor opens. */
    orbitTarget(): Vector3;
    /**
     * Freezes and releases gameplay. The game's pointer input usually listens on `document`, so
     * without a pause every gizmo drag also plays the game.
     */
    setPaused(paused: boolean): void;
    /** Extra work on open/close: suspend input, swap FOV, hide camera children (see `helpers.ts`). */
    onEnable?(): void;
    onDisable?(): void;
    /** Project-relative path the placements are saved to, e.g. `src/resources/editor/placements.json`. */
    placementsPath(): string;
    /** Map effects, from `dev/vfx/registry.ts`. */
    vfx: readonly VfxDevEntry[];
    oneShots?: OneShotEffects;
    /** JSON configs edited in the Tune tab (gameplay numbers, timings, colours). */
    tunables?: readonly Tunable[];
    /** Project sections, appended to the menu bar after the kit's own. */
    tabs?: readonly EditorTab[];
    /**
     * Named waypoints (`metadata.name`) survive deletion by handing their name to a neighbour —
     * for games that look route points up by name.
     */
    keepWaypointNames?: boolean;
    /** Passed through to `PathEditor` over the kit's defaults (labels, `canEdit`, rigs, placement…). */
    pathEditor?: Partial<PathEditorOptions>;
    /** Passed through to `PathEditorPanel` (e.g. `visuals` for the characters' mesh sets). */
    panel?: Partial<PathEditorPanelOptions>;
}
