import { vfxEntry } from "../../kit/vfxEntry";
import SmokeWispsC from "../../../src/controllers/VFX/SmokeWispsC";
import labConfig from "../../../src/vfx/effects/smokewisps/smokewisps-vfx.json";

export default vfxEntry(SmokeWispsC, {
    label: "Smoke wisps",
    group: "Fire & lava",
    hint: "thin rising strands",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.6, 4.5], target: [0, 1.1, 0] } },
});
