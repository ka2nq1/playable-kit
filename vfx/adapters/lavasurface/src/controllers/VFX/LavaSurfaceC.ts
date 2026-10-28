import { LavaSurfaceVfx } from "../../vfx/effects/lavasurface";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Lava surface from vfx-lab: one instance per marker claiming `lavasurface`, settings in the marker. */
export default defineMapVfx({
    id: "lavasurface",
    create: (raw) => new LavaSurfaceVfx(raw),
    anchor: { offset: [0, 0, 0] },
});
