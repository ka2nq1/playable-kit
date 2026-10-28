import { RisingEmbersVfx } from "../../vfx/effects/risingembers";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Rising embers from vfx-lab: one instance per marker claiming `risingembers`, settings in the marker. */
export default defineMapVfx({
    id: "risingembers",
    create: (raw) => new RisingEmbersVfx(raw),
    anchor: { offset: [0, 0.05, 0] },
    fitSize: (vfx, size) => {
        vfx.config.emissionWidth = size;
        vfx.config.emissionDepth = size;
    },
});
