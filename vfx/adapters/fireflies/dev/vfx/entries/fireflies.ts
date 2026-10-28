import { vfxEntry } from "../../kit/vfxEntry";
import FirefliesC from "../../../src/controllers/VFX/FirefliesC";
import labConfig from "../../../src/vfx/effects/fireflies/fireflies-vfx.json";

export default vfxEntry(FirefliesC, {
    label: "Fireflies",
    group: "Weather & air",
    hint: "ambient drifting lights",
    defaults: labConfig,
    preview: { camera: { position: [0, 0.5, 9], target: [0, 0, 0] } },
});
