import { vfxEntry } from "../../kit/vfxEntry";
import WaterSurfaceC from "../../../src/controllers/VFX/WaterSurfaceC";
import labConfig from "../../../src/vfx/effects/watersurface/watersurface-vfx.json";

export default vfxEntry(WaterSurfaceC, {
    label: "Water surface",
    group: "Water & ice",
    hint: "animated pond surface",
    defaults: labConfig,
    preview: { camera: { position: [0, 4.5, 6], target: [0, 0, 0] } },
});
