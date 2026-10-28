import { vfxEntry } from "../../kit/vfxEntry";
import WaterSplashC from "../../../src/controllers/VFX/WaterSplashC";
import labConfig from "../../../src/vfx/effects/watersplash/watersplash-vfx.json";

export default vfxEntry(WaterSplashC, {
    label: "Water splash",
    group: "Water & ice",
    hint: "impact crown · fired by gameplay",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.8, 4.5], target: [0, 0.6, 0] } },
});
