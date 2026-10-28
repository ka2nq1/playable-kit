/**
 * The demo's half of the editor — the file every playable writes for itself (see
 * playable-kit/editor/INTEGRATION.md). Everything else the editor runs is the kit's own code.
 */

import { Vector3 } from "three";
import { EditorMode } from "./kit/EditorMode";
import { VFX_ENTRIES } from "./vfx/registry";
import { app } from "../src/game/app";
import gameTune from "../src/resources/editor/tune/game.json";

export default new EditorMode({
    title: "Campfire Night",
    // The only line a real playable does not have.
    saveDisabled: "Public demo: Save buttons show the flow but write nothing. In a real playable under npm start they save into the project.",
    scene: app.world.scene,
    renderer: app.world.renderer,
    camera: () => app.world.camera,
    onFrame: (callback) => app.loop.onFrame(() => callback()),
    orbitTarget: () => new Vector3(1.6, 0.4, -0.6),
    setPaused: (paused) => {
        app.loop.paused = paused;
    },
    placementsPath: () => "src/resources/editor/placements.json",
    vfx: VFX_ENTRIES,
    tunables: [
        {
            label: "Game",
            file: "src/resources/editor/tune/game.json",
            value: gameTune,
            schema: {
                heroSpeed: { min: 0, max: 5, step: 0.05, label: "Hero speed (m/s)" },
                cameraSway: { min: 0, max: 2, step: 0.01, label: "Camera sway" },
                cameraHeight: { min: 1, max: 12, step: 0.05, label: "Camera height" },
                fireLight: { min: 0, max: 6, step: 0.05, label: "Fire light" },
                fireFlicker: { min: 0, max: 0.6, step: 0.01, label: "Fire flicker" },
                fogColor: { label: "Night colour" },
            },
        },
    ],
});
