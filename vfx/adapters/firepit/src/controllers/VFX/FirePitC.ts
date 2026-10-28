import { FirePitVfx } from "../../vfx/effects/firepit";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Fire pit from vfx-lab: one instance per marker claiming `firepit`, settings in the marker. */
export default defineMapVfx({
    id: "firepit",
    create: (raw) => new FirePitVfx(raw),
    anchor: { offset: [0, 0, 0] },
});
