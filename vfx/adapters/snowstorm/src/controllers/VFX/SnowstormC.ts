import { SnowstormVfx } from "../../vfx/effects/snowstorm";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Snowstorm from vfx-lab: one instance per marker claiming `snowstorm`, settings in the marker. */
export default defineMapVfx({
    id: "snowstorm",
    create: (raw) => new SnowstormVfx(raw),
    anchor: { offset: [0, 0, 0] },
});
