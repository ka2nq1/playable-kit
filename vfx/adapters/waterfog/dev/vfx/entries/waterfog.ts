import { vfxEntry } from "../../kit/vfxEntry";
import WaterFogC from "../../../src/controllers/VFX/WaterFogC";
import labConfig from "../../../src/vfx/effects/waterfog/waterfog-vfx.json";
import { buildWaterFogPanel } from "../panels/waterFogPanel";

export default vfxEntry(WaterFogC, {
    label: "Water fog",
    group: "Water & ice",
    hint: "low drifting mist",
    defaults: labConfig,
    // A curated panel instead of the generated one — see panels/waterFogPanel.ts.
    controls: buildWaterFogPanel,
    preview: { camera: { position: [0, 1.4, 6.5], target: [0, 0.2, 0] } },
});
