import type { ControlPanel } from "../../kit/ui/ControlPanel";
import type { VfxPanelContext } from "../../kit/registry";
import type { MapVfxInstance } from "../../../src/kit/defineMapVfx";
import type { WaterFogVfx } from "../../../src/vfx/effects/waterfog";

/**
 * A curated panel, as an example of replacing the generated one (`controls` in `vfxEntry`): fewer
 * controls than the config has, grouped by what you are judging, with notes on cost. Save, Copy,
 * the point picker and the Anchor folder come from the editor around it.
 *
 * Judge fog from the game camera: it is a grazing-angle effect.
 */
export function buildWaterFogPanel(panel: ControlPanel, instance: MapVfxInstance<WaterFogVfx>, _ctx: VfxPanelContext): void {
    const fog = instance.vfx;
    const cfg = fog.config;
    const apply = () => fog.applyConfig();

    const look = panel.folder("Look");
    look.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
        cfg.opacity = v;
        apply();
    });
    look.slider("Density", { min: 0, max: 1, step: 0.01 }, () => cfg.density, (v) => {
        cfg.density = v;
        apply();
    });
    look.color("Fog colour", () => cfg.fogColor, (v) => {
        cfg.fogColor = v;
        apply();
    });

    const layout = panel.folder("Layout");
    layout.slider("Area size", { min: 4, max: 200, step: 0.5 }, () => cfg.areaSize, (v) => {
        cfg.areaSize = v;
        apply();
    });
    layout.slider("Height offset", { min: -0.5, max: 3, step: 0.01 }, () => cfg.heightOffset, (v) => {
        cfg.heightOffset = v;
        apply();
    });
    layout.slider("Layer count", { min: 1, max: 6, step: 1 }, () => cfg.layerCount, (v) => {
        cfg.layerCount = v;
        apply();
    });
    layout.slider("Layer spacing", { min: 0, max: 1, step: 0.01 }, () => cfg.layerSpacing, (v) => {
        cfg.layerSpacing = v;
        apply();
    });
    layout.readout("Layers drawn", () => `${fog.activeCount}`);
    layout.note("Layers are the fill-rate cost: each one is another transparent pass. 2–3 ships.");

    const motion = panel.folder("Motion");
    motion.slider("Drift speed", { min: 0, max: 0.6, step: 0.005 }, () => cfg.driftSpeed, (v) => {
        cfg.driftSpeed = v;
        apply();
    });
    motion.slider("Drift direction", { min: 0, max: 360, step: 1 }, () => cfg.driftDirection, (v) => {
        cfg.driftDirection = v;
        apply();
    });

    const shape = panel.folder("Shape");
    shape.slider("Noise scale", { min: 0.02, max: 0.8, step: 0.005 }, () => cfg.noiseScale, (v) => {
        cfg.noiseScale = v;
        apply();
    });
    shape.slider("Detail scale", { min: 0.05, max: 4, step: 0.01 }, () => cfg.detailScale, (v) => {
        cfg.detailScale = v;
        apply();
    });
    shape.note("Detail scale carves the wisps. Keep it well above noise scale or the two beat.");
}
