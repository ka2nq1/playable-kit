/**
 * Lab wrapper for {@link HeatDistortionVfx}: the live knobs, and the one thing the set is missing.
 *
 * Heat haze cannot be judged against an empty background — distortion with nothing to distort is
 * a correctly-working effect that looks like a bug. The volcanic set has a glowing pool (the heat
 * source, already there) and rounded rocks (no straight edges to bend), so this wrapper adds the
 * minimum that makes refraction legible: a row of square pillars behind the pit, one instanced
 * draw, and the set's own grid switched on. Both are put back on teardown.
 *
 * Worth being deliberate about while tuning:
 *
 *  - **Watch an edge, not the middle.** Strength is read off a vertical line bending, never off
 *    the shimmer itself. If the pillars stay straight, the effect is doing nothing, whatever the
 *    centre of the volume looks like.
 *  - **Switch to LOW and say what changed.** LOW samples no background at all. The pillars will
 *    stay perfectly straight, and that is correct — it is additive filaments, not refraction.
 *  - **Orbit while it runs.** The noise field is anchored in world space; if the pattern swims
 *    with the camera rather than parallaxing against it, something has gone wrong upstream.
 *  - **Turn on the second source** to confirm two heat volumes still cost one framebuffer grab.
 *
 * "Copy JSON" exports the primary source's config in the shape of `heatdistortion-vfx.json`.
 */

import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Group } from "three";
import { HeatDistortionVfx } from "../../vfx/effects/heatdistortion";
import type { HeatQualityMode } from "../../vfx/effects/heatdistortion";
import rawHeatConfig from "../../vfx/effects/heatdistortion/heatdistortion-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/** The second source is the same look at a different size — a crack rather than a pool. */
const SECOND_VOLUME = { width: 1.1, depth: 0.7, height: 1.2, heightOffset: 0.03 } as const;

/**
 * Nine pillars and two rails, one instanced draw.
 *
 * Square section on purpose: a cylinder's silhouette is already curved, so a bend in it reads as
 * lighting. A hard vertical line either bends or it does not.
 */
function createReference(): { group: Group; dispose(): void } {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: 0x7d746b, roughness: 0.85, metalness: 0 });
    const mesh = new InstancedMesh(geometry, material, 11);
    const m = new Matrix4();
    const place = (i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        m.makeScale(sx, sy, sz);
        m.setPosition(x, y, z);
        mesh.setMatrixAt(i, m);
    };

    for (let i = 0; i < 9; i++) {
        const x = -3.6 + i * 0.9;
        place(i, x, 1.35, -3.8, 0.22, 2.7, 0.22);
    }
    // Two horizontals, so there is a straight edge running the other way as well.
    place(9, 0, 2.62, -3.8, 8.0, 0.16, 0.18);
    place(10, 0, 0.62, -3.8, 8.0, 0.12, 0.18);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;

    const group = new Group();
    group.name = "lab:heat-reference";
    group.add(mesh);

    return {
        group,
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}

export function createHeatDistortionLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const heat = new HeatDistortionVfx(rawHeatConfig);
    const second = new HeatDistortionVfx({ ...rawHeatConfig, ...SECOND_VOLUME });
    second.object3d.position.set(2.6, 0, 1.2);
    second.enabled = false;

    const reference = createReference();

    const root = new Object3D();
    root.name = "lab:heatdistortion";
    root.add(heat.object3d, second.object3d, reference.group);

    // The set's rocks are round and its pool is a gradient; the grid is the only straight line it
    // owns, and a grazing view of it is the clearest read on horizontal displacement there is.
    const restoreGrid = ctx.environment.gridVisible;
    ctx.environment.gridVisible = true;

    const cfg = heat.config;
    let secondEnabled = false;

    /**
     * One place where config reaches the GPU. The second source tracks every knob but its own
     * dimensions, so switching quality or strength changes both — which is the point of having it.
     */
    const apply = () => {
        heat.applyConfig();
        Object.assign(second.config, cfg, SECOND_VOLUME);
        second.config.enabled = cfg.enabled && secondEnabled;
        second.applyConfig();
    };
    apply();

    return {
        object3d: root,
        debug: { heat, second, config: cfg, reference: reference.group },

        update(dt: number) {
            heat.update(dt);
            second.update(dt);
        },

        statsLine() {
            const sources = heat.activeCount + second.activeCount;
            const grabs = cfg.qualityMode === "high" && sources > 0 ? 1 : 0;
            return `<span>sources</span> ${sources} <span>·</span> <span>mode</span> ${cfg.qualityMode} <span>·</span> <span>scene grabs/frame</span> ${grabs} <span>·</span> <span>draw calls</span> ${ctx.app.renderer.info.render.calls}`;
        },

        dispose() {
            ctx.environment.gridVisible = restoreGrid;
            heat.dispose();
            second.dispose();
            reference.dispose();
            root.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Heat distortion -------------------------------------------------------------
            const main = panel.folder("Heat distortion");
            main.toggle(
                "Enabled",
                () => heat.enabled,
                (v) => {
                    cfg.enabled = v;
                    apply();
                },
            );
            main.select(
                "Quality",
                ["high", "low"] as const satisfies readonly HeatQualityMode[],
                () => cfg.qualityMode,
                (v) => {
                    cfg.qualityMode = v;
                    apply();
                },
            );
            main.slider("Intensity", { min: 0, max: 3, step: 0.01 }, () => cfg.intensity, (v) => {
                cfg.intensity = v;
                apply();
            });
            main.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
                cfg.opacity = v;
                apply();
            });
            main.buttons(
                { label: "Start", onClick: () => heat.start() },
                { label: "Stop", onClick: () => heat.stop() },
                { label: "Reset", onClick: () => heat.reset() },
            );
            main.note("HIGH refracts the real background. LOW samples nothing — the pillars stay straight by design.");

            // ---- Volume and placement --------------------------------------------------------
            const vol = panel.folder("Volume & placement");
            vol.slider("Width", { min: 0.2, max: 12, step: 0.05 }, () => cfg.width, (v) => {
                cfg.width = v;
                apply();
            });
            vol.slider("Depth", { min: 0.2, max: 12, step: 0.05 }, () => cfg.depth, (v) => {
                cfg.depth = v;
                apply();
            });
            vol.slider("Height", { min: 0.2, max: 10, step: 0.05 }, () => cfg.height, (v) => {
                cfg.height = v;
                apply();
            });
            vol.slider("Height offset", { min: -1, max: 4, step: 0.01 }, () => cfg.heightOffset, (v) => {
                cfg.heightOffset = v;
                apply();
            });
            vol.slider("Rotation", { min: -180, max: 180, step: 1 }, () => cfg.rotation, (v) => {
                cfg.rotation = v;
                apply();
            });
            vol.slider("Edge softness", { min: 0.02, max: 1, step: 0.01 }, () => cfg.edgeSoftness, (v) => {
                cfg.edgeSoftness = v;
                apply();
            });
            vol.slider("Vertical falloff", { min: 0.2, max: 5, step: 0.05 }, () => cfg.verticalFalloff, (v) => {
                cfg.verticalFalloff = v;
                apply();
            });
            vol.slider("Source X", { min: -6, max: 6, step: 0.05 }, () => heat.object3d.position.x, (v) => (heat.object3d.position.x = v));
            vol.slider("Source Y", { min: -1, max: 4, step: 0.05 }, () => heat.object3d.position.y, (v) => (heat.object3d.position.y = v));
            vol.slider("Source Z", { min: -6, max: 6, step: 0.05 }, () => heat.object3d.position.z, (v) => (heat.object3d.position.z = v));
            vol.note("Width and depth are the source footprint; the quad shows whichever of them the camera sees.");

            // ---- Distortion ------------------------------------------------------------------
            const dist = panel.folder("Distortion");
            dist.slider("Strength", { min: 0, max: 0.25, step: 0.002 }, () => cfg.distortionStrength, (v) => {
                cfg.distortionStrength = v;
                apply();
            });
            dist.slider("Noise scale", { min: 0.1, max: 8, step: 0.05 }, () => cfg.noiseScale, (v) => {
                cfg.noiseScale = v;
                apply();
            });
            dist.slider("Detail scale", { min: 0.5, max: 24, step: 0.1 }, () => cfg.detailNoiseScale, (v) => {
                cfg.detailNoiseScale = v;
                apply();
            });
            dist.slider("Turbulence", { min: 0, max: 1.5, step: 0.01 }, () => cfg.turbulence, (v) => {
                cfg.turbulence = v;
                apply();
            });
            dist.slider("Horizontal", { min: 0, max: 2, step: 0.01 }, () => cfg.horizontalDistortion, (v) => {
                cfg.horizontalDistortion = v;
                apply();
            });
            dist.slider("Vertical", { min: 0, max: 2, step: 0.01 }, () => cfg.verticalDistortion, (v) => {
                cfg.verticalDistortion = v;
                apply();
            });
            dist.note("Strength is a fraction of the volume's own on-screen height, so it holds at any distance.");

            // ---- Animation -------------------------------------------------------------------
            const anim = panel.folder("Animation");
            anim.slider("Rise speed", { min: 0, max: 4, step: 0.01 }, () => cfg.riseSpeed, (v) => {
                cfg.riseSpeed = v;
                apply();
            });
            anim.slider("Drift speed", { min: 0, max: 2, step: 0.01 }, () => cfg.driftSpeed, (v) => {
                cfg.driftSpeed = v;
                apply();
            });
            anim.slider("Animation speed", { min: 0, max: 3, step: 0.01 }, () => cfg.animationSpeed, (v) => {
                cfg.animationSpeed = v;
                apply();
            });
            anim.slider("Flow variation", { min: 0, max: 1, step: 0.01 }, () => cfg.flowVariation, (v) => {
                cfg.flowVariation = v;
                apply();
            });
            anim.slider("Pulsation", { min: 0, max: 1, step: 0.01 }, () => cfg.pulsation, (v) => {
                cfg.pulsation = v;
                apply();
            });
            anim.note("Rise and drift move the noise field in metres per second, not the quad.");

            // ---- Optimisation ----------------------------------------------------------------
            const opt = panel.folder("Optimisation", false);
            opt.slider("Max distance", { min: 0, max: 120, step: 1 }, () => cfg.maxDistance, (v) => {
                cfg.maxDistance = v;
                apply();
            });
            opt.slider("Fade distance", { min: 0, max: 60, step: 0.5 }, () => cfg.fadeDistance, (v) => {
                cfg.fadeDistance = v;
                apply();
            });
            opt.toggle(
                "Second source",
                () => secondEnabled,
                (v) => {
                    secondEnabled = v;
                    apply();
                },
            );
            opt.note("Max distance 0 disables the check. Two sources still cost one framebuffer grab — watch the stats line.");

            // ---- Preview ---------------------------------------------------------------------
            const preview = panel.folder("Preview refs", false);
            preview.toggle("Pillars", () => reference.group.visible, (v) => (reference.group.visible = v));
            preview.toggle("Grid", () => ctx.environment.gridVisible, (v) => (ctx.environment.gridVisible = v));
            preview.note("Lab set dressing only — none of this ships with the effect.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/heatdistortion/heatdistortion-vfx.json to keep a session.");
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
    a.download = "heatdistortion-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
