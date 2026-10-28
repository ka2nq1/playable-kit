import { IceSurfaceVfx } from "../../vfx/effects/icesurface";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Ice surface from vfx-lab: one instance per marker claiming `icesurface`, settings in the marker. */
export default defineMapVfx({
    id: "icesurface",
    create: (raw) => new IceSurfaceVfx(raw),
    anchor: { offset: [0, 0.02, 0] },
});
