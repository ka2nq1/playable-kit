import { GlowingCracksVfx } from "../../vfx/effects/glowingcracks";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Glowing cracks from vfx-lab: one instance per marker claiming `glowingcracks`, settings in the marker. */
export default defineMapVfx({
    id: "glowingcracks",
    create: (raw) => new GlowingCracksVfx(raw),
    anchor: { offset: [0, 0.03, 0] },
    fitSize: (vfx, size) => {
        vfx.config.surfaceSize = size;
    },
});
