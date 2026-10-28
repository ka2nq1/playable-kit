import { WaterFogVfx } from "../../vfx/effects/waterfog";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Water fog from vfx-lab: one instance per marker claiming `waterfog`, settings in the marker. */
export default defineMapVfx({
    id: "waterfog",
    create: (raw) => new WaterFogVfx(raw),
    anchor: { offset: [0, 0.08, 0] },
    fitSize: (vfx, size) => {
        // Under 1: the shader fades the fog well inside its area, and a stack cut at the rim shows an edge.
        vfx.config.areaSize = size * 0.96;
    },
});
