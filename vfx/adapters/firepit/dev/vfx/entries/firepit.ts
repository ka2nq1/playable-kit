import { vfxEntry } from "../../kit/vfxEntry";
import FirePitC from "../../../src/controllers/VFX/FirePitC";
import labConfig from "../../../src/vfx/effects/firepit/firepit-vfx.json";

export default vfxEntry(FirePitC, {
    label: "Fire pit",
    group: "Fire & lava",
    hint: "sparks · embers · smoke",
    defaults: labConfig,
    preview: { camera: { position: [0, 1.5, 4.2], target: [0, 0.8, 0] } },
});
