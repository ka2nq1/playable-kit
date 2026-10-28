import { vfxEntry } from "../../kit/vfxEntry";
import SkyC from "../../../src/controllers/VFX/SkyC";
import labConfig from "../../../src/vfx/effects/sky/sky-vfx.json";

export default vfxEntry(SkyC, {
    label: "Sky",
    group: "Weather & air",
    hint: "procedural sky, weather, day/night",
    defaults: labConfig,
    preview: { camera: { position: [0, 1, 0], target: [0, 1.6, -5] } },
});
