/**
 * Lab wrapper for {@link IceSurfaceVfx}: the live knobs, and the world the ice needs to be judged
 * against.
 *
 * Transparent surfaces cannot be tuned over a lava pit, so this wrapper swaps the set for a frozen
 * lake — a basin, a checkered bed and a fish swimming under the surface — and puts the volcanic
 * dressing back on teardown. The fish is preview furniture: the material has no idea it exists.
 *
 * Worth being deliberate about while tuning:
 *
 *  - **Watch the fish, not the ice.** Every knob here is really a knob about how much of the fish
 *    survives. If a change makes the surface prettier and the fish gone, it is the wrong change.
 *  - **Read refraction off the checker, not off the noise.** A straight line in the bed either
 *    bends or it does not; shimmer in the ice itself proves nothing.
 *  - **Switch to PERFORMANCE and say what changed.** That mode samples no background at all. The
 *    fish stays visible — it is blended through, not refracted — and the checker goes straight.
 *    That is correct, not a bug.
 *  - **Orbit while it runs.** The internal layers are parallaxed against the surface; if cracks
 *    and bubbles swim with the camera instead of sliding under the ice, something is wrong
 *    upstream.
 *  - **Pause the swimmer** to inspect a distorted silhouette on a still frame.
 *
 * "Copy JSON" exports the ice config in the shape of `icesurface-vfx.json`. Preview settings are
 * deliberately not in it: they are the lab's, not the material's.
 */

import { Object3D } from "three";
import { IceSurfaceVfx, ICE_PRESET_IDS, ICE_QUALITY_MODES } from "../../vfx/effects/icesurface";
import type { IceQualityMode } from "../../vfx/effects/icesurface";
import rawIceConfig from "../../vfx/effects/icesurface/icesurface-vfx.json";
import { UnderIceScene, type UnderIceObjectType } from "../UnderIceScene";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/** How far the lake bed sits below the ice. Also how far the internal layers have to parallax. */
const BASIN_DEPTH = 1.8;

/**
 * Framings that show both halves of the effect at once.
 *
 * `three-quarter` is the default because it is the only one where the surface highlights and the
 * swimmer are both legible; `grazing` is where Fresnel and the frosted patches earn their values,
 * and `overhead` is where the fracture network is actually readable.
 */
const CAMERA_ANGLES = {
    "three-quarter": { position: [0.2, 3.3, 6.8], target: [0, -0.25, 0] },
    grazing: { position: [0, 1.3, 8.4], target: [0, -0.1, 0] },
    overhead: { position: [0.6, 7.6, 3.0], target: [0, -0.3, 0] },
} as const satisfies Record<string, { position: readonly [number, number, number]; target: readonly [number, number, number] }>;

type CameraAngle = keyof typeof CAMERA_ANGLES;
const CAMERA_ANGLE_IDS = Object.keys(CAMERA_ANGLES) as CameraAngle[];

export function createIceSurfaceLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const ice = new IceSurfaceVfx(rawIceConfig);
    const cfg = ice.config;

    const preview = new UnderIceScene({ extent: cfg.surfaceSize, depth: BASIN_DEPTH });

    const root = new Object3D();
    root.name = "lab:icesurface";
    root.add(preview.group, ice.object3d);

    // The volcanic set is a lit basalt disc at y=0 — the exact plane the ice occupies, and lit
    // orange. Both go, and both come back in dispose.
    const restoreTerrain = ctx.environment.terrainVisible;
    const restoreGlow = ctx.environment.glow;
    ctx.environment.terrainVisible = false;
    ctx.environment.glow = 0;

    let cameraAngle: CameraAngle = "three-quarter";
    const applyCamera = (name: CameraAngle) => {
        cameraAngle = name;
        const preset = CAMERA_ANGLES[name];
        ctx.app.camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
        ctx.app.controls.target.set(preset.target[0], preset.target[1], preset.target[2]);
        ctx.app.controls.update();
    };
    // The lab's own presets frame a fire pit standing on the ground; none of them look at a lake.
    applyCamera(cameraAngle);

    let preset: string = ICE_PRESET_IDS[0];

    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => ice.applyConfig();

    return {
        object3d: root,
        debug: { ice, config: cfg, preview, presets: ICE_PRESET_IDS },

        update(dt: number) {
            preview.update(dt);
            ice.update(dt);
        },

        statsLine() {
            const grabs = cfg.qualityMode === "enhanced" && ice.enabled ? 1 : 0;
            return (
                `<span>ice planes</span> ${ice.activeCount} <span>·</span> <span>mode</span> ${cfg.qualityMode}` +
                ` <span>·</span> <span>scene grabs/frame</span> ${grabs}` +
                ` <span>·</span> <span>draw calls</span> ${ctx.app.renderer.info.render.calls}`
            );
        },

        dispose() {
            ctx.environment.terrainVisible = restoreTerrain;
            ctx.environment.glow = restoreGlow;
            ice.dispose();
            preview.dispose();
            root.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Presets ---------------------------------------------------------------------
            const presets = panel.folder("Presets");
            presets.select(
                "Ice preset",
                ICE_PRESET_IDS,
                () => preset,
                (v) => {
                    preset = v;
                    // A preset is a look: the quality mode, the extent and the on/off state are the
                    // host's and are carried across untouched.
                    ice.setPreset(v);
                    panel.refresh();
                },
            );
            presets.note("Ordered by how much of the fish survives them. Mode, size and Enabled are not touched.");

            // ---- Ice surface -----------------------------------------------------------------
            const main = panel.folder("Ice surface");
            main.toggle(
                "Enabled",
                () => ice.enabled,
                (v) => {
                    cfg.enabled = v;
                    apply();
                },
            );
            main.buttons(
                { label: "Start", onClick: () => ice.start() },
                { label: "Stop", onClick: () => ice.stop() },
                { label: "Reset", onClick: () => ice.reset() },
            );
            main.slider("Surface size", { min: 4, max: 60, step: 0.5 }, () => cfg.surfaceSize, (v) => {
                cfg.surfaceSize = v;
                apply();
            });
            main.slider("Edge fade", { min: 0, max: 1, step: 0.01 }, () => cfg.edgeFade, (v) => {
                cfg.edgeFade = v;
                apply();
            });
            main.note("Start/Stop only freezes the glints. The basin keeps the size it was built with.");

            // ---- Transparency & refraction ---------------------------------------------------
            const clear = panel.folder("Transparency & refraction");
            clear.slider("Transparency", { min: 0, max: 1, step: 0.01 }, () => cfg.transparency, (v) => {
                cfg.transparency = v;
                apply();
            });
            clear.slider("Clarity", { min: 0, max: 1, step: 0.01 }, () => cfg.clarity, (v) => {
                cfg.clarity = v;
                apply();
            });
            clear.slider("Refraction strength", { min: 0, max: 1.5, step: 0.01 }, () => cfg.refractionStrength, (v) => {
                cfg.refractionStrength = v;
                apply();
            });
            clear.slider("Refraction scale", { min: 0.05, max: 6, step: 0.05 }, () => cfg.refractionScale, (v) => {
                cfg.refractionScale = v;
                apply();
            });
            clear.slider("Refraction detail", { min: 0, max: 1, step: 0.01 }, () => cfg.refractionDetail, (v) => {
                cfg.refractionDetail = v;
                apply();
            });
            clear.slider("Chromatic aberration", { min: 0, max: 1, step: 0.01 }, () => cfg.chromaticAberration, (v) => {
                cfg.chromaticAberration = v;
                apply();
            });
            clear.slider("View-angle opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.viewAngleOpacity, (v) => {
                cfg.viewAngleOpacity = v;
                apply();
            });
            clear.slider("Ice thickness", { min: 0.01, max: 3, step: 0.01 }, () => cfg.iceThickness, (v) => {
                cfg.iceThickness = v;
                apply();
            });
            clear.slider("Depth absorption", { min: 0, max: 4, step: 0.01 }, () => cfg.depthAbsorption, (v) => {
                cfg.depthAbsorption = v;
                apply();
            });
            clear.color("Depth tint", () => cfg.depthTint, (v) => {
                cfg.depthTint = v;
                apply();
            });
            clear.slider("Internal parallax", { min: 0, max: 2, step: 0.01 }, () => cfg.internalParallax, (v) => {
                cfg.internalParallax = v;
                apply();
            });
            clear.slider("Internal depth", { min: 0, max: 1, step: 0.01 }, () => cfg.internalDepthIntensity, (v) => {
                cfg.internalDepthIntensity = v;
                apply();
            });
            clear.note("Thickness scales absorption, parallax and refraction together — it is the depth knob.");

            // ---- Ice body --------------------------------------------------------------------
            const body = panel.folder("Ice body");
            body.color("Ice colour", () => cfg.iceColor, (v) => {
                cfg.iceColor = v;
                apply();
            });
            body.color("Deep ice colour", () => cfg.deepIceColor, (v) => {
                cfg.deepIceColor = v;
                apply();
            });
            body.color("Highlight colour", () => cfg.surfaceColor, (v) => {
                cfg.surfaceColor = v;
                apply();
            });
            body.slider("Colour variation", { min: 0, max: 1, step: 0.01 }, () => cfg.colorVariation, (v) => {
                cfg.colorVariation = v;
                apply();
            });
            body.slider("Cloudiness", { min: 0, max: 1, step: 0.01 }, () => cfg.cloudiness, (v) => {
                cfg.cloudiness = v;
                apply();
            });
            body.slider("Cloud scale", { min: 0.2, max: 20, step: 0.1 }, () => cfg.cloudScale, (v) => {
                cfg.cloudScale = v;
                apply();
            });
            body.slider("Cloud contrast", { min: 0, max: 1, step: 0.01 }, () => cfg.cloudContrast, (v) => {
                cfg.cloudContrast = v;
                apply();
            });
            body.note("Cloudiness is the milk inside the slab; frost is the crust on top of it.");

            // ---- Cracks ----------------------------------------------------------------------
            const cracks = panel.folder("Cracks", false);
            cracks.toggle("Cracks enabled", () => cfg.cracksEnabled, (v) => {
                cfg.cracksEnabled = v;
                apply();
            });
            cracks.slider("Density", { min: 0, max: 1, step: 0.01 }, () => cfg.crackDensity, (v) => {
                cfg.crackDensity = v;
                apply();
            });
            cracks.slider("Scale", { min: 0.2, max: 12, step: 0.05 }, () => cfg.crackScale, (v) => {
                cfg.crackScale = v;
                apply();
            });
            cracks.slider("Width", { min: 0.002, max: 0.2, step: 0.002 }, () => cfg.crackWidth, (v) => {
                cfg.crackWidth = v;
                apply();
            });
            cracks.slider("Branching", { min: 0, max: 1, step: 0.01 }, () => cfg.crackBranching, (v) => {
                cfg.crackBranching = v;
                apply();
            });
            cracks.slider("Irregularity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.crackIrregularity, (v) => {
                cfg.crackIrregularity = v;
                apply();
            });
            cracks.slider("Depth", { min: 0, max: 1, step: 0.01 }, () => cfg.crackDepth, (v) => {
                cfg.crackDepth = v;
                apply();
            });
            cracks.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.crackOpacity, (v) => {
                cfg.crackOpacity = v;
                apply();
            });
            cracks.color("Colour", () => cfg.crackColor, (v) => {
                cfg.crackColor = v;
                apply();
            });
            cracks.slider("Highlight", { min: 0, max: 2, step: 0.01 }, () => cfg.crackHighlightIntensity, (v) => {
                cfg.crackHighlightIntensity = v;
                apply();
            });
            cracks.note("Irregularity at 0 is a bare Voronoi grid. Density below 1 is what leaves unbroken plates.");

            // ---- Bubbles ---------------------------------------------------------------------
            const bubbles = panel.folder("Bubbles", false);
            bubbles.toggle("Bubbles enabled", () => cfg.bubblesEnabled, (v) => {
                cfg.bubblesEnabled = v;
                apply();
            });
            bubbles.slider("Density", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleDensity, (v) => {
                cfg.bubbleDensity = v;
                apply();
            });
            bubbles.slider("Min size", { min: 0.001, max: 0.2, step: 0.001 }, () => cfg.bubbleMinSize, (v) => {
                cfg.bubbleMinSize = v;
                apply();
            });
            bubbles.slider("Max size", { min: 0.002, max: 0.3, step: 0.002 }, () => cfg.bubbleMaxSize, (v) => {
                cfg.bubbleMaxSize = v;
                apply();
            });
            bubbles.slider("Clustering", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleClustering, (v) => {
                cfg.bubbleClustering = v;
                apply();
            });
            bubbles.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleOpacity, (v) => {
                cfg.bubbleOpacity = v;
                apply();
            });
            bubbles.slider("Depth", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleDepth, (v) => {
                cfg.bubbleDepth = v;
                apply();
            });
            bubbles.slider("Lens distortion", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleDistortion, (v) => {
                cfg.bubbleDistortion = v;
                apply();
            });
            bubbles.note("Max size also sets the spacing. Lens distortion is ENHANCED only.");

            // ---- Frost -----------------------------------------------------------------------
            const frost = panel.folder("Frost", false);
            frost.toggle("Frost enabled", () => cfg.frostEnabled, (v) => {
                cfg.frostEnabled = v;
                apply();
            });
            frost.slider("Coverage", { min: 0, max: 1, step: 0.01 }, () => cfg.frostCoverage, (v) => {
                cfg.frostCoverage = v;
                apply();
            });
            frost.slider("Scale", { min: 0.1, max: 12, step: 0.05 }, () => cfg.frostScale, (v) => {
                cfg.frostScale = v;
                apply();
            });
            frost.slider("Softness", { min: 0, max: 1, step: 0.01 }, () => cfg.frostSoftness, (v) => {
                cfg.frostSoftness = v;
                apply();
            });
            frost.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.frostOpacity, (v) => {
                cfg.frostOpacity = v;
                apply();
            });
            frost.slider("Roughness", { min: 0, max: 1, step: 0.01 }, () => cfg.frostRoughness, (v) => {
                cfg.frostRoughness = v;
                apply();
            });
            frost.color("Colour", () => cfg.frostColor, (v) => {
                cfg.frostColor = v;
                apply();
            });
            frost.slider("Edge crust", { min: 0, max: 2, step: 0.01 }, () => cfg.frostEdgeIntensity, (v) => {
                cfg.frostEdgeIntensity = v;
                apply();
            });
            frost.slider("Frost on cracks", { min: 0, max: 1, step: 0.01 }, () => cfg.frostNearCracks, (v) => {
                cfg.frostNearCracks = v;
                apply();
            });
            frost.note("Coverage is the one knob that can hide the fish entirely. That is the point of it.");

            // ---- Surface ---------------------------------------------------------------------
            const surface = panel.folder("Surface", false);
            surface.slider("Roughness", { min: 0.02, max: 1, step: 0.01 }, () => cfg.roughness, (v) => {
                cfg.roughness = v;
                apply();
            });
            surface.slider("Specular", { min: 0, max: 4, step: 0.01 }, () => cfg.specularIntensity, (v) => {
                cfg.specularIntensity = v;
                apply();
            });
            surface.slider("Fresnel", { min: 0, max: 2, step: 0.01 }, () => cfg.fresnelIntensity, (v) => {
                cfg.fresnelIntensity = v;
                apply();
            });
            surface.color("Rim colour", () => cfg.rimColor, (v) => {
                cfg.rimColor = v;
                apply();
            });
            surface.slider("Rim intensity", { min: 0, max: 2, step: 0.01 }, () => cfg.rimIntensity, (v) => {
                cfg.rimIntensity = v;
                apply();
            });
            surface.slider("Normal strength", { min: 0, max: 2, step: 0.01 }, () => cfg.normalStrength, (v) => {
                cfg.normalStrength = v;
                apply();
            });
            surface.slider("Micro detail scale", { min: 0.01, max: 2, step: 0.01 }, () => cfg.microDetailScale, (v) => {
                cfg.microDetailScale = v;
                apply();
            });
            surface.slider("Sparkle", { min: 0, max: 1, step: 0.01 }, () => cfg.sparkleIntensity, (v) => {
                cfg.sparkleIntensity = v;
                apply();
            });
            surface.slider("Light azimuth", { min: 0, max: 360, step: 1 }, () => cfg.lightAzimuth, (v) => {
                cfg.lightAzimuth = v;
                apply();
            });
            surface.slider("Light elevation", { min: 1, max: 89, step: 1 }, () => cfg.lightElevation, (v) => {
                cfg.lightElevation = v;
                apply();
            });
            surface.note("The shader has its own key light; this pair is not the scene's directional light.");

            // ---- Under-ice preview -----------------------------------------------------------
            const under = panel.folder("Under-ice preview");
            under.toggle("Show object", () => preview.showObject, (v) => (preview.showObject = v));
            under.select(
                "Object type",
                ["fish", "sphere"] as const satisfies readonly UnderIceObjectType[],
                () => preview.objectType,
                (v) => (preview.objectType = v),
            );
            under.slider("Object depth", { min: 0.05, max: BASIN_DEPTH - 0.15, step: 0.01 }, () => preview.objectDepth, (v) => (preview.objectDepth = v));
            under.slider("Object speed", { min: 0, max: 3, step: 0.01 }, () => preview.objectSpeed, (v) => (preview.objectSpeed = v));
            under.slider("Object scale", { min: 0.2, max: 3, step: 0.01 }, () => preview.objectScale, (v) => (preview.objectScale = v));
            under.toggle("Pause swimmer", () => preview.paused, (v) => (preview.paused = v));
            under.toggle("Show floor", () => preview.showFloor, (v) => (preview.showFloor = v));
            under.select(
                "Camera angle",
                CAMERA_ANGLE_IDS,
                () => cameraAngle,
                (v) => applyCamera(v),
            );
            under.note("Preview only — none of this is in the exported config, and the material never sees it.");

            // ---- Performance -----------------------------------------------------------------
            const perf = panel.folder("Performance");
            perf.select(
                "Quality mode",
                ICE_QUALITY_MODES,
                () => cfg.qualityMode,
                (v: IceQualityMode) => {
                    cfg.qualityMode = v;
                    apply();
                    panel.refresh();
                },
            );
            perf.toggle("Frost blur (enhanced)", () => cfg.frostBlur, (v) => {
                cfg.frostBlur = v;
                apply();
            });
            perf.readout("Scene grabs/frame", () => (cfg.qualityMode === "enhanced" && ice.enabled ? "1 (shared)" : "0"));
            perf.readout("Draw calls", () => String(ctx.app.renderer.info.render.calls));
            perf.note("Mode, the three feature toggles and Frost blur each cost one program build. Everything else is a uniform.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/icesurface/icesurface-vfx.json to keep a session.");
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
    a.download = "icesurface-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
