/**
 * This playable's half of the editor. Everything game-specific lives here; `dev/kit/` is copied
 * from playable-kit unchanged and must not be edited in the playable (report kit problems with
 * /kit-note instead).
 *
 * Scaffolded by /kit-install-editor. Every `TODO(kit)` is a place the skill fills in from this
 * project's own controllers — the names below are the usual @hitplay/playable_template ones.
 */

import { Vector3 } from "three";
import { UpdateController } from "@hitplay/playable_template";
import { EditorMode } from "./kit/EditorMode";
import { VFX_ENTRIES } from "./vfx/registry";
import { ThreeC } from "../src/controllers/ThreeC"; // TODO(kit): this project's scene/renderer owner
import { CameraC } from "../src/controllers/CameraC"; // TODO(kit): this project's camera owner

const PLACEMENTS_PATH = "src/resources/editor/placements.json";

export default new EditorMode({
    title: "Editor", // TODO(kit): "<Playable> · <level>"
    scene: ThreeC.scene,
    renderer: ThreeC.renderer, // TODO(kit): some projects expose it as ThreeC_internal.renderer
    camera: () => CameraC.camera,
    // TODO(kit): `addDelegate(cb)` on newer templates, `addListener(new Delegate(cb))` on older ones.
    onFrame: (callback) => UpdateController.Instance.onUpdate.addDelegate(() => callback()),
    orbitTarget: () => new Vector3(0, 0, 0), // TODO(kit): what the scene is arranged around
    setPaused: (paused) => {
        // TODO(kit): the project's own pause (TimeC.paused / DebugMode.setPaused), plus input off.
        void paused;
    },
    placementsPath: () => PLACEMENTS_PATH,
    vfx: VFX_ENTRIES,
});
