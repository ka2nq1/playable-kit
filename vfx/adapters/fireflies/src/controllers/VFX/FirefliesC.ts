import { FirefliesVfx } from "../../vfx/effects/fireflies";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Fireflies from vfx-lab: one instance per marker claiming `fireflies`, settings in the marker. */
export default defineMapVfx({
    id: "fireflies",
    create: (raw) => new FirefliesVfx(raw),
    anchor: { offset: [0, 1.5, 0] },
    fitSize: (vfx, size) => {
        vfx.config.areaSize[0] = size;
        vfx.config.areaSize[2] = size;
    },
});
