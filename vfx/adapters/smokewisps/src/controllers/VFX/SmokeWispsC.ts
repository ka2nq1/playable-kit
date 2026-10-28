import { SmokeWispsVfx } from "../../vfx/effects/smokewisps";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Smoke wisps from vfx-lab: one instance per marker claiming `smokewisps`, settings in the marker. */
export default defineMapVfx({
    id: "smokewisps",
    create: (raw) => new SmokeWispsVfx(raw),
    anchor: { offset: [0, 0.04, 0] },
});
