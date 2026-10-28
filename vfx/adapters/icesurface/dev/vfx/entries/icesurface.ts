import { vfxEntry } from "../../kit/vfxEntry";
import IceSurfaceC from "../../../src/controllers/VFX/IceSurfaceC";
import labConfig from "../../../src/vfx/effects/icesurface/icesurface-vfx.json";

export default vfxEntry(IceSurfaceC, {
    label: "Ice surface",
    group: "Water & ice",
    hint: "refraction, fractures, frost",
    defaults: labConfig,
    preview: { camera: { position: [0, 4, 5], target: [0, 0, 0] } },
});
