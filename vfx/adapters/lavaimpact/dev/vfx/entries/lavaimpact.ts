import { vfxEntry } from "../../kit/vfxEntry";
import LavaImpactC from "../../../src/controllers/VFX/LavaImpactC";
import labConfig from "../../../src/vfx/effects/lavaimpact/lavaimpact-vfx.json";

export default vfxEntry(LavaImpactC, {
    label: "Lava impact",
    group: "Fire & lava",
    hint: "molten burst · fired by gameplay",
    defaults: labConfig,
    preview: { camera: { position: [0, 2.2, 5.5], target: [0, 0.8, 0] } },
});
