import { vfxEntry } from "../../kit/vfxEntry";
import HeatDistortionC from "../../../src/controllers/VFX/HeatDistortionC";
import labConfig from "../../../src/vfx/effects/heatdistortion/heatdistortion-vfx.json";

export default vfxEntry(HeatDistortionC, {
    label: "Heat haze",
    group: "Fire & lava",
    hint: "refracting hot air",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.4, 4], target: [0, 0.9, 0] } },
});
