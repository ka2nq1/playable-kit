import type { ControlPanel } from "../../kit/ui/ControlPanel";
import type { VfxPanelContext } from "../../kit/registry";
import { buildAnchorFolder } from "../../kit/panels/anchorFolder";
import WaterFogC, { type WaterFogInstance } from "../../../src/controllers/VFX/WaterFogC";

/**
 * The mist's controls, ported from vfx-lab's `waterFogLabEffect` — same bindings, with the lab's
 * download buttons replaced by Save (into this instance's point) and an Anchor folder.
 *
 * Judge it from the game camera: fog is a grazing-angle effect.
 */
export function buildWaterFogPanel(panel: ControlPanel, instance: WaterFogInstance, ctx: VfxPanelContext): void {
    const fog = instance.vfx;
    const cfg = fog.config;
    const apply = () => fog.applyConfig();

    const main = panel.folder("Water fog");
    main.toggle("Enabled", () => fog.enabled, (v) => (fog.enabled = v));
    main.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
        cfg.opacity = v;
        apply();
    });
    main.slider("Density", { min: 0, max: 1, step: 0.01 }, () => cfg.density, (v) => {
        cfg.density = v;
        apply();
    });
    main.color("Fog colour", () => cfg.fogColor, (v) => {
        cfg.fogColor = v;
        apply();
    });
    main.buttons({ label: "Save point", onClick: () => ctx.save(), primary: true }, { label: "Save as default", onClick: () => ctx.saveAsDefault() });
    main.buttons(
        { label: "Start", onClick: () => fog.start() },
        { label: "Stop", onClick: () => fog.stop() },
        { label: "Reset", onClick: () => fog.reset() },
    );

    buildAnchorFolder(panel, {
        markerId: instance.markerId,
        anchor: instance.anchor,
        object3d: fog.object3d,
        refit: () => WaterFogC.fit(instance),
        fitSizeNote: "spans the layers across the mesh's width",
    });

    const layout = panel.folder("Layout", false);
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

    const motion = panel.folder("Motion", false);
    motion.slider("Drift speed", { min: 0, max: 0.6, step: 0.005 }, () => cfg.driftSpeed, (v) => {
        cfg.driftSpeed = v;
        apply();
    });
    motion.slider("Drift direction", { min: 0, max: 360, step: 1 }, () => cfg.driftDirection, (v) => {
        cfg.driftDirection = v;
        apply();
    });

    const shape = panel.folder("Shape", false);
    shape.slider("Noise scale", { min: 0.02, max: 0.8, step: 0.005 }, () => cfg.noiseScale, (v) => {
        cfg.noiseScale = v;
        apply();
    });
    shape.slider("Detail scale", { min: 0.05, max: 4, step: 0.01 }, () => cfg.detailScale, (v) => {
        cfg.detailScale = v;
        apply();
    });
    shape.note("Detail scale carves the wisps. Keep it well above noise scale or the two beat.");

    panel.folder("Config", false).buttons({ label: "Copy JSON", onClick: () => ctx.copy() });
}
