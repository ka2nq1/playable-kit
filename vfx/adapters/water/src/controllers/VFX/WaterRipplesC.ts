import { WaterVfx } from "../../vfx/effects/water";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Water ripples from vfx-lab: one instance per marker claiming `water`, settings in the marker. */
export default defineMapVfx({
    id: "water",
    create: (raw) => new WaterVfx(raw),
    anchor: { offset: [0, 0.08, 0] },
    // Fired by gameplay (`WaterRipplesC.burstAt(position)`), not running on its own.
    event: true,
});
