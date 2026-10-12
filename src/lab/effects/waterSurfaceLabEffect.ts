/**
 * Lab wrapper for {@link WaterSurfaceVfx}: the live knobs and four appearance presets.
 *
 * The tuning loop is the simplest in the lab — every control is a uniform, so there is no spawn to
 * wait for and no rebuild to trigger: drag a slider and the frame you are looking at changes. The
 * one thing worth being deliberate about is where you judge it from. Water is a grazing-angle
 * surface, so the fresnel and the highlight threshold that look right at `close` are usually two
 * different values at `playable`.
 *
 * "Copy JSON" exports the config in the same shape as `watersurface-vfx.json`.
 */

import { WaterSurfaceVfx } from "../../vfx/effects/watersurface";
import type { WaterSurfaceConfig } from "../../vfx/effects/watersurface";
import rawWaterSurfaceConfig from "../../vfx/effects/watersurface/watersurface-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/**
 * The four looks the brief asks the shader to be able to reach, as plain config patches.
 *
 * This is not a preset system — the lab has none and does not need one. They are here because the
 * only honest proof that a parameter set is wide enough is four buttons that land in four
 * different places. `enabled` and `surfaceSize` are deliberately absent: a preset should change
 * how the water looks, not whether it is on or how big the preview plane is.
 */
type Appearance = Omit<WaterSurfaceConfig, "enabled" | "surfaceSize">;

const PRESETS: Record<string, Appearance> = {
    Calm: {
        opacity: 1,
        baseColor: "#1d5468",
        deepColor: "#071a26",
        highlightColor: "#a8dcea",
        colorVariation: 0.55,
        highlightIntensity: 0.45,
        highlightThreshold: 0.55,
        fresnelIntensity: 0.35,
        waveAmplitude: 0.07,
        waveFrequency: 0.38,
        waveSpeed: 0.45,
        waveDirection: 35,
        secondaryWaveIntensity: 0.6,
        detailScale: 1.4,
        detailIntensity: 0.4,
        rippleIntensity: 0.35,
        rippleSpeed: 0.7,
    },
    Swamp: {
        opacity: 1,
        baseColor: "#24352a",
        deepColor: "#09130d",
        highlightColor: "#7f9a68",
        colorVariation: 0.72,
        highlightIntensity: 0.22,
        highlightThreshold: 0.74,
        fresnelIntensity: 0.16,
        waveAmplitude: 0.035,
        waveFrequency: 0.28,
        waveSpeed: 0.22,
        secondaryWaveIntensity: 0.45,
        waveDirection: 35,
        detailScale: 2.2,
        detailIntensity: 0.58,
        rippleIntensity: 0.22,
        rippleSpeed: 0.35,
    },
    Clear: {
        opacity: 1,
        baseColor: "#1f6f8f",
        deepColor: "#06283a",
        highlightColor: "#d2eefb",
        colorVariation: 0.42,
        highlightIntensity: 0.55,
        highlightThreshold: 0.6,
        fresnelIntensity: 0.5,
        waveAmplitude: 0.08,
        waveFrequency: 0.42,
        waveSpeed: 0.55,
        waveDirection: 35,
        secondaryWaveIntensity: 0.65,
        detailScale: 1.3,
        detailIntensity: 0.34,
        rippleIntensity: 0.42,
        rippleSpeed: 0.85,
    },
    Stylised: {
        opacity: 1,
        baseColor: "#1a7bc8",
        deepColor: "#0b3a78",
        highlightColor: "#ffffff",
        colorVariation: 0.8,
        highlightIntensity: 0.8,
        highlightThreshold: 0.68,
        fresnelIntensity: 0.42,
        waveAmplitude: 0.14,
        waveFrequency: 0.55,
        waveSpeed: 0.8,
        waveDirection: 35,
        secondaryWaveIntensity: 0.8,
        detailScale: 1.05,
        detailIntensity: 0.5,
        rippleIntensity: 0.5,
        rippleSpeed: 1.0,
    },
};

export function createWaterSurfaceLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const water = new WaterSurfaceVfx(rawWaterSurfaceConfig);

    // The volcanic set is the wrong light for water, and its glow would read through the surface
    // as an orange stain. Dim it rather than replace it, and hand the lab back what it had.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.05;
    // The ground has to go entirely: the waves displace vertices below y=0, so basalt reads
    // through every trough. Lifting the plane would only trade that for a visible horizon seam.
    const restoreTerrain = ctx.environment.terrainVisible;
    ctx.environment.terrainVisible = false;

    const cfg = water.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => water.applyConfig();

    return {
        object3d: water.object3d,
        debug: { water, config: cfg, presets: PRESETS },

        update(dt: number) {
            water.update(dt);
        },

        statsLine() {
            return `<span>water planes</span> ${water.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.glow = restoreGlow;
            ctx.environment.terrainVisible = restoreTerrain;
            water.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Water -----------------------------------------------------------------------
            const main = panel.folder("Water surface");
            main.toggle(
                "Enabled",
                () => water.enabled,
                (v) => (water.enabled = v),
            );
            main.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
                cfg.opacity = v;
                apply();
            });
            main.slider("Surface size", { min: 8, max: 160, step: 1 }, () => cfg.surfaceSize, (v) => {
                cfg.surfaceSize = v;
                apply();
            });
            main.buttons(
                { label: "Start", onClick: () => water.start() },
                { label: "Stop", onClick: () => water.stop() },
                { label: "Reset", onClick: () => water.reset() },
            );
            main.note("Stop freezes the surface; Enabled is what hides it. Size is a uniform — no rebuild.");

            // ---- Appearance ------------------------------------------------------------------
            const look = panel.folder("Appearance");
            look.color("Base colour", () => cfg.baseColor, (v) => {
                cfg.baseColor = v;
                apply();
            });
            look.color("Deep colour", () => cfg.deepColor, (v) => {
                cfg.deepColor = v;
                apply();
            });
            look.color("Highlight colour", () => cfg.highlightColor, (v) => {
                cfg.highlightColor = v;
                apply();
            });
            look.slider("Colour variation", { min: 0, max: 1, step: 0.01 }, () => cfg.colorVariation, (v) => {
                cfg.colorVariation = v;
                apply();
            });
            look.slider("Highlight intensity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.highlightIntensity, (v) => {
                cfg.highlightIntensity = v;
                apply();
            });
            look.slider("Highlight threshold", { min: 0, max: 1, step: 0.01 }, () => cfg.highlightThreshold, (v) => {
                cfg.highlightThreshold = v;
                apply();
            });
            look.slider("Fresnel intensity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.fresnelIntensity, (v) => {
                cfg.fresnelIntensity = v;
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
            look.note("Threshold is selectivity: low lights most of the surface, high only the crests.");

            // ---- Waves -----------------------------------------------------------------------
            const waves = panel.folder("Waves", false);
            waves.slider("Amplitude", { min: 0, max: 0.6, step: 0.005 }, () => cfg.waveAmplitude, (v) => {
                cfg.waveAmplitude = v;
                apply();
            });
            waves.slider("Frequency", { min: 0.05, max: 1.6, step: 0.01 }, () => cfg.waveFrequency, (v) => {
                cfg.waveFrequency = v;
                apply();
            });
            waves.slider("Speed", { min: 0, max: 3, step: 0.01 }, () => cfg.waveSpeed, (v) => {
                cfg.waveSpeed = v;
                apply();
            });
            waves.slider("Direction", { min: 0, max: 360, step: 1 }, () => cfg.waveDirection, (v) => {
                cfg.waveDirection = v;
                apply();
            });
            waves.slider("Secondary layers", { min: 0, max: 1.5, step: 0.01 }, () => cfg.secondaryWaveIntensity, (v) => {
                cfg.secondaryWaveIntensity = v;
                apply();
            });
            waves.note("Amplitude is the only knob that moves vertices. Past ~0.3 the mesh starts to show.");

            // ---- Surface detail --------------------------------------------------------------
            const detail = panel.folder("Surface detail", false);
            detail.slider("Detail scale", { min: 0.1, max: 6, step: 0.01 }, () => cfg.detailScale, (v) => {
                cfg.detailScale = v;
                apply();
            });
            detail.slider("Detail intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.detailIntensity, (v) => {
                cfg.detailIntensity = v;
                apply();
            });
            detail.slider("Ripple intensity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.rippleIntensity, (v) => {
                cfg.rippleIntensity = v;
                apply();
            });
            detail.slider("Ripple speed", { min: 0, max: 3, step: 0.01 }, () => cfg.rippleSpeed, (v) => {
                cfg.rippleSpeed = v;
                apply();
            });
            detail.note("Both fade out with distance on their own — fine detail past a pixel is shimmer.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/watersurface/watersurface-vfx.json to keep a session.");
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
    a.download = "watersurface-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
