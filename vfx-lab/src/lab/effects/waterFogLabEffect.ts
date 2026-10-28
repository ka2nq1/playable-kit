/**
 * Lab wrapper for {@link WaterFogVfx}: the preview water to float the mist on, and the live knobs.
 *
 * The tuning loop is the simplest in the lab — every control is a uniform, so there is no spawn to
 * wait for and no rebuild to trigger: drag a slider and the frame you are looking at changes. The
 * one thing worth being deliberate about is where you judge it from. Fog is a grazing-angle effect,
 * so what reads as a perfect bank of mist at `close` is often a flat haze at `playable`.
 *
 * "Copy JSON" exports the config in the same shape as `waterfog-vfx.json`.
 */

import { Group } from "three";
import { WaterFogVfx } from "../../vfx/effects/waterfog";
import rawWaterFogConfig from "../../vfx/effects/waterfog/waterfog-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";
import { WaterSurface } from "../WaterSurface";

export function createWaterFogLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const surface = new WaterSurface();
    const fog = new WaterFogVfx(rawWaterFogConfig);
    fog.object3d.position.y = surface.level;

    // Siblings, not parent and child: the surface mesh already sits at the water level, and
    // parenting it under the effect would stack the two offsets and lift the mist off the water.
    const group = new Group();
    group.name = "lab:waterfog";
    group.add(surface.mesh, fog.object3d);

    // The volcanic set is the wrong light for a cold mist. Dim it rather than replace it, and hand
    // the lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.08;

    const cfg = fog.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => fog.applyConfig();

    return {
        object3d: group,
        debug: { fog, surface, config: cfg },

        update(dt: number) {
            surface.update(dt);
            fog.update(dt);
        },

        statsLine() {
            return `<span>fog layers</span> ${fog.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.glow = restoreGlow;
            fog.dispose();
            surface.dispose();
            group.removeFromParent();
            group.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Fog -----------------------------------------------------------------------
            const main = panel.folder("Water fog");
            main.toggle(
                "Enabled",
                () => fog.enabled,
                (v) => (fog.enabled = v),
            );
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
            main.buttons(
                { label: "Start", onClick: () => fog.start() },
                { label: "Stop", onClick: () => fog.stop() },
                { label: "Reset", onClick: () => fog.reset() },
            );
            main.note("Stop freezes the drift; Enabled is what hides the mist.");

            // ---- Layout ----------------------------------------------------------------------
            const layout = panel.folder("Layout", false);
            layout.slider("Area size", { min: 4, max: 120, step: 0.5 }, () => cfg.areaSize, (v) => {
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
            layout.note("Layers are the fill-rate cost: each one is another transparent pass. 2–3 ships.");

            // ---- Motion ----------------------------------------------------------------------
            const motion = panel.folder("Motion", false);
            motion.slider("Drift speed", { min: 0, max: 0.6, step: 0.005 }, () => cfg.driftSpeed, (v) => {
                cfg.driftSpeed = v;
                apply();
            });
            motion.slider("Drift direction", { min: 0, max: 360, step: 1 }, () => cfg.driftDirection, (v) => {
                cfg.driftDirection = v;
                apply();
            });
            motion.note("Speed is world units per second. Past ~0.25 the mist reads as wind, not calm.");

            // ---- Shape -----------------------------------------------------------------------
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

            // ---- Scene -----------------------------------------------------------------------
            const scene = panel.folder("Scene", false);
            scene.slider("Water glint", { min: 0, max: 1.5, step: 0.01 }, () => surface.glint, (v) => (surface.glint = v));
            scene.note("Preview water only — not part of the effect.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/waterfog/waterfog-vfx.json to keep a tuning session.");
        },
    };
}

function serialize(cfg: unknown): string {
    return JSON.stringify(cfg, null, 4);
}

async function copyConfig(cfg: unknown): Promise<void> {
    const text = serialize(cfg);
    try {
        await navigator.clipboard.writeText(text);
        console.info("[vfx-lab] config copied to clipboard");
    } catch {
        console.warn("[vfx-lab] clipboard unavailable — config printed below instead");
        console.log(text);
    }
}

function downloadConfig(cfg: unknown): void {
    const blob = new Blob([serialize(cfg)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "waterfog-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
