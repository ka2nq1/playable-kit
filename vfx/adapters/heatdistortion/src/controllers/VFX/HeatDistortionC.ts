import { HeatDistortionVfx } from "../../vfx/effects/heatdistortion";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Heat haze from vfx-lab: one instance per marker claiming `heatdistortion`, settings in the marker. */
export default defineMapVfx({
    id: "heatdistortion",
    create: (raw) => new HeatDistortionVfx(raw),
    anchor: { offset: [0, 0, 0] },
    fitSize: (vfx, size) => {
        vfx.config.width = size;
        vfx.config.depth = size;
    },
});
