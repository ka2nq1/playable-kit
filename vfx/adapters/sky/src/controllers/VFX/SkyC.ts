import { SkyVfx } from "../../vfx/effects/sky";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Sky from vfx-lab: one instance per marker claiming `sky`, settings in the marker. */
export default defineMapVfx({
    id: "sky",
    create: (raw) => new SkyVfx(raw),
    anchor: { offset: [0, 0, 0] },
    singleton: true,
});
