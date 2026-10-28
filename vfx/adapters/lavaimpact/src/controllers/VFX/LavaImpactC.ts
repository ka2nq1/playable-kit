import { LavaImpactVfx } from "../../vfx/effects/lavaimpact";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Lava impact from vfx-lab: one instance per marker claiming `lavaimpact`, settings in the marker. */
export default defineMapVfx({
    id: "lavaimpact",
    create: (raw) => new LavaImpactVfx(raw),
    anchor: { offset: [0, 0.05, 0] },
    // Fired by gameplay (`LavaImpactC.burstAt(position)`), not running on its own.
    event: true,
});
