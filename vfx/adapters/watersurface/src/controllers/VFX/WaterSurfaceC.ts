import { WaterSurfaceVfx } from "../../vfx/effects/watersurface";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Water surface from vfx-lab: one instance per marker claiming `watersurface`, settings in the marker. */
export default defineMapVfx({
    id: "watersurface",
    create: (raw) => new WaterSurfaceVfx(raw),
    anchor: { offset: [0, 0.05, 0] },
    fitSize: (vfx, size) => {
        vfx.config.surfaceSize = size;
    },
});
