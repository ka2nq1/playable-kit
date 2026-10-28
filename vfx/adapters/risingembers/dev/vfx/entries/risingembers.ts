import { vfxEntry } from "../../kit/vfxEntry";
import RisingEmbersC from "../../../src/controllers/VFX/RisingEmbersC";
import labConfig from "../../../src/vfx/effects/risingembers/risingembers-vfx.json";

export default vfxEntry(RisingEmbersC, {
    label: "Rising embers",
    group: "Fire & lava",
    hint: "glowing motes off hot ground",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.8, 5], target: [0, 1.2, 0] } },
});
