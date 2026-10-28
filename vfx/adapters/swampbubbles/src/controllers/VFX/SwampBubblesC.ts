import { SwampBubblesVfx } from "../../vfx/effects/swampbubbles";
import { defineMapVfx } from "../../kit/defineMapVfx";

/** Swamp bubbles from vfx-lab: one instance per marker claiming `swampbubbles`, settings in the marker. */
export default defineMapVfx({
    id: "swampbubbles",
    create: (raw) => new SwampBubblesVfx(raw),
    anchor: { offset: [0, 0.08, 0] },
    fitSize: (vfx, size) => {
        vfx.config.spawnAreaSize = size;
    },
});
