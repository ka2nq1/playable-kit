import { vfxEntry } from "../../kit/vfxEntry";
import SnowstormC from "../../../src/controllers/VFX/SnowstormC";
import labConfig from "../../../src/vfx/effects/snowstorm/snowstorm-vfx.json";

export default vfxEntry(SnowstormC, {
    label: "Snowstorm",
    group: "Weather & air",
    hint: "drifting blizzard volume",
    defaults: labConfig,
    preview: { camera: { position: [0, 4, 20], target: [0, 4, 0] } },
});
