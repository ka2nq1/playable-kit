import { vfxEntry } from "../../kit/vfxEntry";
import LavaSurfaceC from "../../../src/controllers/VFX/LavaSurfaceC";
import labConfig from "../../../src/vfx/effects/lavasurface/lavasurface-vfx.json";

export default vfxEntry(LavaSurfaceC, {
    label: "Lava surface",
    group: "Fire & lava",
    hint: "animated molten crust",
    defaults: labConfig,
    preview: { camera: { position: [0, 4.5, 5.5], target: [0, 0, 0] } },
});
