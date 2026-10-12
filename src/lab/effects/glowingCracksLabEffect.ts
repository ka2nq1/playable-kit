/**
 * Lab wrapper for {@link GlowingCracksVfx}: the live knobs and four palettes.
 *
 * Every control is a uniform, so there is no spawn to wait for and no rebuild to trigger — drag a
 * slider and the frame you are looking at changes. Three things are worth being deliberate about:
 *
 *  - **Tune the three layers in order.** Base first (it should read as nearly black), then Core
 *    until the branching structure is legible on its own, then Glow last. Glow tuned first is how
 *    a crack network ends up as a bright smear with no shape in it.
 *  - **Judge it from `playable`, not `top`.** From directly above, a Voronoi network always looks
 *    like a Voronoi network. The grazing three-quarter view is where crack width, pattern scale
 *    and branching actually have to earn their defaults.
 *  - **The palettes are the reuse argument.** Volcanic, Arcane, Toxic and Rift are the same
 *    numbers with four colour sets — if a change makes one of them stop working, it is the change
 *    that is wrong, not the preset.
 *
 * "Copy JSON" exports the config in the same shape as `glowingcracks-vfx.json`.
 */

import { GlowingCracksVfx } from "../../vfx/effects/glowingcracks";
import type { GlowingCracksConfig } from "../../vfx/effects/glowingcracks";
import rawGlowingCracksConfig from "../../vfx/effects/glowingcracks/glowingcracks-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/**
 * Four looks as plain config patches.
 *
 * This is not a preset system — the lab has none and does not need one. They are here because the
 * only honest proof that one shader covers lava, magic and energy is four buttons that land in
 * four different materials. `enabled` and `surfaceSize` are deliberately absent: a preset should
 * change how the cracks look, not whether they are on or how big the preview plane is.
 */
type Appearance = Omit<GlowingCracksConfig, "enabled" | "surfaceSize">;

const PRESETS: Record<string, Appearance> = {
    Volcanic: {
        baseColor: "#0d0b0b",
        crackColor: "#ff4b0d",
        coreColor: "#ffd79b",
        glowColor: "#b31a06",
        patternScale: 2.2,
        crackWidth: 0.07,
        crackWidthVariation: 0.7,
        branchingIntensity: 0.55,
        patternDistortion: 0.45,
        detailScale: 3,
        seed: 1,
        coreWidth: 0.35,
        glowRadius: 0.16,
        glowIntensity: 0.75,
        coreIntensity: 1.3,
        edgeSoftness: 0.6,
        animationEnabled: true,
        pulseSpeed: 0.25,
        pulseIntensity: 0.3,
        detailMotionSpeed: 0.18,
        edgeFade: 1,
    },
    // Thinner, harder, colder: energy runs in fine lines, so the core carries almost everything
    // and the halo is only there to tell you the surface is being lit by it.
    Arcane: {
        baseColor: "#090b11",
        crackColor: "#2ea8ff",
        coreColor: "#d8f4ff",
        glowColor: "#0b48c8",
        patternScale: 2.6,
        crackWidth: 0.04,
        crackWidthVariation: 0.5,
        branchingIntensity: 0.8,
        patternDistortion: 0.55,
        detailScale: 3.6,
        seed: 7,
        coreWidth: 0.45,
        glowRadius: 0.2,
        glowIntensity: 0.55,
        coreIntensity: 1.8,
        edgeSoftness: 0.35,
        animationEnabled: true,
        pulseSpeed: 0.55,
        pulseIntensity: 0.45,
        detailMotionSpeed: 0.5,
        edgeFade: 1,
    },
    // Wide, sluggish channels in a big pattern: fewer regions, broader seams, a glow that creeps
    // further out than it does anywhere else.
    Toxic: {
        baseColor: "#0c1109",
        crackColor: "#6bff3c",
        coreColor: "#e8ffd0",
        glowColor: "#1f7a12",
        patternScale: 3.2,
        crackWidth: 0.1,
        crackWidthVariation: 0.9,
        branchingIntensity: 0.35,
        patternDistortion: 0.65,
        detailScale: 2.6,
        seed: 23,
        coreWidth: 0.3,
        glowRadius: 0.28,
        glowIntensity: 0.9,
        coreIntensity: 1.1,
        edgeSoftness: 0.8,
        animationEnabled: true,
        pulseSpeed: 0.16,
        pulseIntensity: 0.35,
        detailMotionSpeed: 0.1,
        edgeFade: 1,
    },
    // A small, heavily branched network on a near-black violet: dense fracture, hot white core.
    Rift: {
        baseColor: "#0b0810",
        crackColor: "#c93dff",
        coreColor: "#ffd9f6",
        glowColor: "#4b0a8c",
        patternScale: 1.6,
        crackWidth: 0.05,
        crackWidthVariation: 1.1,
        branchingIntensity: 1,
        patternDistortion: 0.35,
        detailScale: 4.2,
        seed: 42,
        coreWidth: 0.4,
        glowRadius: 0.14,
        glowIntensity: 0.7,
        coreIntensity: 1.6,
        edgeSoftness: 0.45,
        animationEnabled: true,
        pulseSpeed: 0.8,
        pulseIntensity: 0.5,
        detailMotionSpeed: 0.35,
        edgeFade: 1,
    },
};

export function createGlowingCracksLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const cracks = new GlowingCracksVfx(rawGlowingCracksConfig);

    // The set's basalt disc sits at y=0 too, so leaving it on is a z-fight across the whole floor.
    // This effect *is* the ground here — hide the set's and hand the lab back what it had.
    const restoreTerrain = ctx.environment.terrainVisible;
    ctx.environment.terrainVisible = false;

    const cfg = cracks.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => cracks.applyConfig();

    return {
        object3d: cracks.object3d,
        debug: { cracks, config: cfg, presets: PRESETS },

        update(dt: number) {
            cracks.update(dt);
        },

        statsLine() {
            return `<span>crack planes</span> ${cracks.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.terrainVisible = restoreTerrain;
            cracks.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Glowing cracks --------------------------------------------------------------
            const main = panel.folder("Glowing cracks");
            main.toggle(
                "Enabled",
                () => cracks.enabled,
                (v) => (cracks.enabled = v),
            );
            main.buttons(
                { label: "Start", onClick: () => cracks.start() },
                { label: "Stop", onClick: () => cracks.stop() },
                { label: "Reset", onClick: () => cracks.reset() },
            );
            main.note("Stop freezes the brightness; Enabled is what hides it. Nothing here rebuilds.");

            // ---- Colours ---------------------------------------------------------------------
            const look = panel.folder("Colours");
            look.color("Base colour", () => cfg.baseColor, (v) => {
                cfg.baseColor = v;
                apply();
            });
            look.color("Crack colour", () => cfg.crackColor, (v) => {
                cfg.crackColor = v;
                apply();
            });
            look.color("Core colour", () => cfg.coreColor, (v) => {
                cfg.coreColor = v;
                apply();
            });
            look.color("Glow colour", () => cfg.glowColor, (v) => {
                cfg.glowColor = v;
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
            look.note("Base near-black, crack the hue you want read at distance, core pale, glow a deep form of crack.");

            // ---- Pattern ---------------------------------------------------------------------
            const pattern = panel.folder("Pattern");
            pattern.slider("Pattern scale", { min: 0.3, max: 10, step: 0.05 }, () => cfg.patternScale, (v) => {
                cfg.patternScale = v;
                apply();
            });
            pattern.slider("Crack width", { min: 0.005, max: 0.3, step: 0.005 }, () => cfg.crackWidth, (v) => {
                cfg.crackWidth = v;
                apply();
            });
            pattern.slider("Width variation", { min: 0, max: 1.5, step: 0.01 }, () => cfg.crackWidthVariation, (v) => {
                cfg.crackWidthVariation = v;
                apply();
            });
            pattern.slider("Branching", { min: 0, max: 1, step: 0.01 }, () => cfg.branchingIntensity, (v) => {
                cfg.branchingIntensity = v;
                apply();
            });
            pattern.slider("Distortion", { min: 0, max: 1.5, step: 0.01 }, () => cfg.patternDistortion, (v) => {
                cfg.patternDistortion = v;
                apply();
            });
            pattern.slider("Detail scale", { min: 1, max: 10, step: 0.05 }, () => cfg.detailScale, (v) => {
                cfg.detailScale = v;
                apply();
            });
            pattern.slider("Seed", { min: 0, max: 200, step: 1 }, () => cfg.seed, (v) => {
                cfg.seed = Math.round(v);
                apply();
            });
            pattern.note("Scale is a region in world units; width is a fraction of one, so they stay in step.");

            // ---- Core and glow ---------------------------------------------------------------
            const glow = panel.folder("Core & glow");
            glow.slider("Core width", { min: 0.05, max: 1, step: 0.01 }, () => cfg.coreWidth, (v) => {
                cfg.coreWidth = v;
                apply();
            });
            glow.slider("Core intensity", { min: 0, max: 4, step: 0.01 }, () => cfg.coreIntensity, (v) => {
                cfg.coreIntensity = v;
                apply();
            });
            glow.slider("Glow radius", { min: 0, max: 0.8, step: 0.005 }, () => cfg.glowRadius, (v) => {
                cfg.glowRadius = v;
                apply();
            });
            glow.slider("Glow intensity", { min: 0, max: 3, step: 0.01 }, () => cfg.glowIntensity, (v) => {
                cfg.glowIntensity = v;
                apply();
            });
            glow.slider("Edge softness", { min: 0, max: 1, step: 0.01 }, () => cfg.edgeSoftness, (v) => {
                cfg.edgeSoftness = v;
                apply();
            });
            glow.note("Core width is a fraction of the crack width. Set the core before the glow, never after.");

            // ---- Animation -------------------------------------------------------------------
            const anim = panel.folder("Animation", false);
            anim.toggle(
                "Animation enabled",
                () => cfg.animationEnabled,
                (v) => {
                    cfg.animationEnabled = v;
                    apply();
                },
            );
            anim.slider("Pulse speed", { min: 0, max: 2, step: 0.01 }, () => cfg.pulseSpeed, (v) => {
                cfg.pulseSpeed = v;
                apply();
            });
            anim.slider("Pulse intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.pulseIntensity, (v) => {
                cfg.pulseIntensity = v;
                apply();
            });
            anim.slider("Detail motion", { min: 0, max: 2, step: 0.01 }, () => cfg.detailMotionSpeed, (v) => {
                cfg.detailMotionSpeed = v;
                apply();
            });
            anim.note("The network itself never moves — this is brightness only, which is why it reads as solid.");

            // ---- Surface ---------------------------------------------------------------------
            const surface = panel.folder("Surface", false);
            surface.slider("Surface size", { min: 8, max: 160, step: 1 }, () => cfg.surfaceSize, (v) => {
                cfg.surfaceSize = v;
                apply();
            });
            surface.slider("Edge fade", { min: 0, max: 1, step: 0.01 }, () => cfg.edgeFade, (v) => {
                cfg.edgeFade = v;
                apply();
            });
            surface.note("Size adds regions, it does not stretch them — it is one quad either way.");

            // ---- Export ----------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/glowingcracks/glowingcracks-vfx.json to keep a session.");
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
    a.download = "glowingcracks-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
