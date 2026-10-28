import { vfxEntry } from "../../kit/vfxEntry";
import GlowingCracksC from "../../../src/controllers/VFX/GlowingCracksC";
import labConfig from "../../../src/vfx/effects/glowingcracks/glowingcracks-vfx.json";

export default vfxEntry(GlowingCracksC, {
    label: "Glowing cracks",
    group: "Fire & lava",
    hint: "hot fractured ground",
    defaults: labConfig,
    preview: { camera: { position: [0, 4, 4], target: [0, 0, 0] } },
});
