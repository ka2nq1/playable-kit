import { vfxEntry } from "../../kit/vfxEntry";
import WaterRipplesC from "../../../src/controllers/VFX/WaterRipplesC";
import labConfig from "../../../src/vfx/effects/water/water-vfx.json";

export default vfxEntry(WaterRipplesC, {
    label: "Water ripples",
    group: "Water & ice",
    hint: "rings and spray · fired by gameplay",
    defaults: labConfig,
    preview: { camera: { position: [0, 3, 4.5], target: [0, 0, 0] } },
});
