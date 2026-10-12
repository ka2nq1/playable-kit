/**
 * Lab wrapper for {@link LavaSurfaceVfx}: the live knobs and four appearance presets.
 *
 * Every control is a uniform, so there is no spawn to wait for and no rebuild to trigger — drag a
 * slider and the frame you are looking at changes. Two things are worth being deliberate about:
 *
 *  - **Judge it from `playable`, not `top`.** From directly above, a Voronoi network always looks
 *    like a Voronoi network. The grazing three-quarter view is where crack width and pattern scale
 *    actually have to earn their defaults.
 *  - **Watch the contrast, not the glow.** The failure mode of a lava shader is a uniformly orange
 *    floor. Push `glowIntensity` down until the crust reads as nearly black, then bring it back.
 *
 * "Copy JSON" exports the config in the same shape as `lavasurface-vfx.json`.
 */

import { LavaSurfaceVfx } from "../../vfx/effects/lavasurface";
import type { LavaSurfaceConfig } from "../../vfx/effects/lavasurface";
import rawLavaSurfaceConfig from "../../vfx/effects/lavasurface/lavasurface-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/**
 * Four looks as plain config patches.
 *
 * This is not a preset system — the lab has none and does not need one. They are here because the
 * only honest proof that a parameter set is wide enough is four buttons that land in four different
 * places. `enabled` and `surfaceSize` are deliberately absent: a preset should change how the lava
 * looks, not whether it is on or how big the preview plane is.
 */
type Appearance = Omit<LavaSurfaceConfig, "enabled" | "surfaceSize">;

const PRESETS: Record<string, Appearance> = {
    Volcanic: {
        crustColor: "#14100f",
        secondaryCrustColor: "#36291f",
        moltenColor: "#ff5a0f",
        hotColor: "#ffd37a",
        glowIntensity: 1.15,
        colorVariation: 0.68,
        crustVariation: 0.55,
        patternScale: 2.1,
        crackWidth: 0.085,
        crackVariation: 0.8,
        patternDistortion: 0.42,
        detailScale: 3.2,
        flowSpeed: 0.11,
        flowDirection: 24,
        flowIntensity: 0.6,
        heatPulseSpeed: 0.3,
        heatPulseIntensity: 0.22,
        displacementIntensity: 0.06,
        edgeFade: 1,
    },
    Cooled: {
        crustColor: "#100d0d",
        secondaryCrustColor: "#2a2422",
        moltenColor: "#c8360a",
        hotColor: "#ff9d3c",
        glowIntensity: 0.7,
        colorVariation: 0.5,
        crustVariation: 0.7,
        patternScale: 3.0,
        crackWidth: 0.04,
        crackVariation: 0.55,
        patternDistortion: 0.5,
        detailScale: 4.2,
        flowSpeed: 0.05,
        flowDirection: 24,
        flowIntensity: 0.35,
        heatPulseSpeed: 0.18,
        heatPulseIntensity: 0.3,
        displacementIntensity: 0.09,
        edgeFade: 1,
    },
    Molten: {
        crustColor: "#1a1210",
        secondaryCrustColor: "#45301f",
        moltenColor: "#ff6a14",
        hotColor: "#ffe9a8",
        glowIntensity: 1.45,
        colorVariation: 0.78,
        crustVariation: 0.45,
        patternScale: 1.7,
        crackWidth: 0.16,
        crackVariation: 1.0,
        patternDistortion: 0.36,
        detailScale: 2.8,
        flowSpeed: 0.2,
        flowDirection: 24,
        flowIntensity: 0.9,
        heatPulseSpeed: 0.4,
        heatPulseIntensity: 0.25,
        displacementIntensity: 0.05,
        edgeFade: 1,
    },
    Stylised: {
        crustColor: "#1b1724",
        secondaryCrustColor: "#3b2b3a",
        moltenColor: "#ff3d2e",
        hotColor: "#ffe24a",
        glowIntensity: 1.6,
        colorVariation: 0.9,
        crustVariation: 0.8,
        patternScale: 2.6,
        crackWidth: 0.12,
        crackVariation: 0.6,
        patternDistortion: 0.28,
        detailScale: 2.2,
        flowSpeed: 0.16,
        flowDirection: 24,
        flowIntensity: 0.5,
        heatPulseSpeed: 0.5,
        heatPulseIntensity: 0.35,
        displacementIntensity: 0.04,
        edgeFade: 1,
    },
};

export function createLavaSurfaceLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const lava = new LavaSurfaceVfx(rawLavaSurfaceConfig);

    // The set's basalt disc sits at y=0 too, so leaving it on is a z-fight across the whole floor.
    // This effect *is* the ground — hide the set's and hand the lab back what it had.
    const restoreTerrain = ctx.environment.terrainVisible;
    ctx.environment.terrainVisible = false;

    const cfg = lava.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => lava.applyConfig();

    return {
        object3d: lava.object3d,
        debug: { lava, config: cfg, presets: PRESETS },

        update(dt: number) {
            lava.update(dt);
        },

        statsLine() {
            return `<span>lava planes</span> ${lava.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.terrainVisible = restoreTerrain;
            lava.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Lava surface ----------------------------------------------------------------
            const main = panel.folder("Lava surface");
            main.toggle(
                "Enabled",
                () => lava.enabled,
                (v) => (lava.enabled = v),
            );
            main.buttons(
                { label: "Start", onClick: () => lava.start() },
                { label: "Stop", onClick: () => lava.stop() },
                { label: "Reset", onClick: () => lava.reset() },
            );
            main.note("Stop freezes the surface; Enabled is what hides it. Nothing here rebuilds.");

            // ---- Appearance ------------------------------------------------------------------
            const look = panel.folder("Appearance");
            look.color("Crust colour", () => cfg.crustColor, (v) => {
                cfg.crustColor = v;
                apply();
            });
            look.color("Crust variation colour", () => cfg.secondaryCrustColor, (v) => {
                cfg.secondaryCrustColor = v;
                apply();
            });
            look.color("Molten colour", () => cfg.moltenColor, (v) => {
                cfg.moltenColor = v;
                apply();
            });
            look.color("Hot colour", () => cfg.hotColor, (v) => {
                cfg.hotColor = v;
                apply();
            });
            look.slider("Glow intensity", { min: 0, max: 3, step: 0.01 }, () => cfg.glowIntensity, (v) => {
                cfg.glowIntensity = v;
                apply();
            });
            look.slider("Colour variation", { min: 0, max: 1, step: 0.01 }, () => cfg.colorVariation, (v) => {
                cfg.colorVariation = v;
                apply();
            });
            look.slider("Crust variation", { min: 0, max: 1, step: 0.01 }, () => cfg.crustVariation, (v) => {
                cfg.crustVariation = v;
                apply();
            });
            look.buttons(
                ...Object.keys(PRESETS).map((name) => ({
                    label: name,
                    onClick: () => {
                        Object.assign(cfg, PRESETS[name]);
                        apply();
                        panel.refresh();
                    },
                })),
            );
            look.note("The cool rim inside a channel is derived from Molten — darken that, not a picker.");

            // ---- Pattern ---------------------------------------------------------------------
            const pattern = panel.folder("Pattern");
            pattern.slider("Pattern scale", { min: 0.3, max: 10, step: 0.05 }, () => cfg.patternScale, (v) => {
                cfg.patternScale = v;
                apply();
            });
            pattern.slider("Crack width", { min: 0.005, max: 0.35, step: 0.005 }, () => cfg.crackWidth, (v) => {
                cfg.crackWidth = v;
                apply();
            });
            pattern.slider("Crack variation", { min: 0, max: 1.5, step: 0.01 }, () => cfg.crackVariation, (v) => {
                cfg.crackVariation = v;
                apply();
            });
            pattern.slider("Pattern distortion", { min: 0, max: 1.5, step: 0.01 }, () => cfg.patternDistortion, (v) => {
                cfg.patternDistortion = v;
                apply();
            });
            pattern.slider("Detail scale", { min: 0.5, max: 10, step: 0.05 }, () => cfg.detailScale, (v) => {
                cfg.detailScale = v;
                apply();
            });
            pattern.note("Scale is a plate in world units; width is a fraction of one, so they stay in step.");

            // ---- Animation -------------------------------------------------------------------
            const anim = panel.folder("Animation", false);
            anim.slider("Flow speed", { min: 0, max: 0.8, step: 0.005 }, () => cfg.flowSpeed, (v) => {
                cfg.flowSpeed = v;
                apply();
            });
            anim.slider("Flow direction", { min: 0, max: 360, step: 1 }, () => cfg.flowDirection, (v) => {
                cfg.flowDirection = v;
                apply();
            });
            anim.slider("Flow intensity", { min: 0, max: 2, step: 0.01 }, () => cfg.flowIntensity, (v) => {
                cfg.flowIntensity = v;
                apply();
            });
            anim.slider("Heat pulse speed", { min: 0, max: 2, step: 0.01 }, () => cfg.heatPulseSpeed, (v) => {
                cfg.heatPulseSpeed = v;
                apply();
            });
            anim.slider("Heat pulse intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.heatPulseIntensity, (v) => {
                cfg.heatPulseIntensity = v;
                apply();
            });
            anim.note("Speed translates the molten; intensity is how much it churns on the way. Lava is slow.");

            // ---- Surface ---------------------------------------------------------------------
            const surface = panel.folder("Surface", false);
            surface.slider("Surface size", { min: 8, max: 160, step: 1 }, () => cfg.surfaceSize, (v) => {
                cfg.surfaceSize = v;
                apply();
            });
            surface.slider("Displacement", { min: 0, max: 0.4, step: 0.005 }, () => cfg.displacementIntensity, (v) => {
                cfg.displacementIntensity = v;
                apply();
            });
            surface.slider("Edge fade", { min: 0, max: 1, step: 0.01 }, () => cfg.edgeFade, (v) => {
                cfg.edgeFade = v;
                apply();
            });
            surface.note("Size adds plates, it does not stretch them. Displacement is capped by 64 segments.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/lavasurface/lavasurface-vfx.json to keep a session.");
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
    a.download = "lavasurface-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
