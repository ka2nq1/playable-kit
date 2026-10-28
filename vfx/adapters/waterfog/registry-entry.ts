// Merged into the playable's dev/vfx/registry.ts by /vfx-new — not copied as a file.

import { entry } from "../kit/registry";
import { markerSpot } from "../../src/kit/anchor";
import WaterFogC, { type WaterFogInstance } from "../../src/controllers/VFX/WaterFogC";
import { buildWaterFogPanel } from "./panels/waterFogPanel";

export const WATERFOG_ENTRY = entry<WaterFogInstance>({
    id: WaterFogC.ID,
    label: "Water fog",
    instances: () => WaterFogC.all,
    spot: () => markerSpot(WaterFogC.all[0]?.vfx.object3d, WaterFogC.all[0]?.anchor),
    exportConfig: (instance) => WaterFogC.exportConfig(instance),
    build: (panel, instance, ctx) => buildWaterFogPanel(panel, instance, ctx),
    tick: (dt) => WaterFogC.tick(dt),
});
