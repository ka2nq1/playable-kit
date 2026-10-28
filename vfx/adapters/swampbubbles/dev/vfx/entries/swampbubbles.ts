import { vfxEntry } from "../../kit/vfxEntry";
import SwampBubblesC from "../../../src/controllers/VFX/SwampBubblesC";
import labConfig from "../../../src/vfx/effects/swampbubbles/swampbubbles-vfx.json";

export default vfxEntry(SwampBubblesC, {
    label: "Swamp bubbles",
    group: "Water & ice",
    hint: "gas breaking the surface",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.8, 3.6], target: [0, 0, 0] } },
});
