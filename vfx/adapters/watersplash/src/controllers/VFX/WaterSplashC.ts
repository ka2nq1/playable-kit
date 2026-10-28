import { WaterSplashVfx } from "../../vfx/effects/watersplash";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Water splash from vfx-lab: one instance per marker claiming `watersplash`, settings in the marker. */
export default defineMapVfx({
    id: "watersplash",
    create: (raw) => new WaterSplashVfx(raw),
    anchor: { offset: [0, 0.08, 0] },
    // Fired by gameplay (`WaterSplashC.burstAt(position)`), not running on its own.
    event: true,
});
