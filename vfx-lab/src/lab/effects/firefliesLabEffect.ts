/**
 * Lab wrapper for {@link FirefliesVfx}: the live control surface over its JSON config.
 *
 * The tuning loop differs from the particle effects'. There is no spawn to wait for, because every
 * firefly is already alive — the four uniforms (glow, pulse depth, opacity, min screen size) change
 * the field you are looking at in the same frame, and everything else is baked into the attributes
 * and reaches the GPU when the slider's setter calls `applyConfig()`. Rebuilding a sixty-particle
 * field is cheap enough to do on every drag, so both kinds of knob feel the same from the panel.
 *
 * "Copy JSON" exports the config in the same shape as `fireflies-vfx.json`.
 */

import { FirefliesVfx } from "../../vfx/effects/fireflies";
import rawFirefliesConfig from "../../vfx/effects/fireflies/fireflies-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

export function createFirefliesLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const fireflies = new FirefliesVfx(rawFirefliesConfig);
    // The volume is centred on the object's origin, so lift it to roughly eye height for the
    // playable camera. A game positions this wherever its own scene wants the field.
    fireflies.object3d.position.y = 2.4;

    // Lights this faint cannot be judged against a glowing vent. Dim the set rather than replace
    // it, and hand the lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.06;

    const cfg = fireflies.config;
    // Every baked knob goes through here, so the attribute rebuild happens in exactly one place.
    const rebuild = () => fireflies.applyConfig();

    return {
        object3d: fireflies.object3d,
        debug: { fireflies, config: cfg },

        update(dt: number) {
            fireflies.update(dt);
        },

        statsLine() {
            return `<span>fireflies</span> ${fireflies.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.glow = restoreGlow;
            fireflies.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Field ---------------------------------------------------------------------
            const main = panel.folder("Fireflies");
            main.toggle(
                "Enabled",
                () => fireflies.enabled,
                (v) => (fireflies.enabled = v),
            );
            main.slider("Count", { min: 0, max: 400, step: 1 }, () => cfg.count, (v) => {
                cfg.count = v;
                rebuild();
            });
            main.slider("Height", { min: 0, max: 8, step: 0.05 }, () => fireflies.object3d.position.y, (v) => (fireflies.object3d.position.y = v));
            main.buttons(
                { label: "Start", onClick: () => fireflies.start() },
                { label: "Stop", onClick: () => fireflies.stop() },
                { label: "Reset", onClick: () => fireflies.reset() },
            );
            main.note("Stop freezes the drift; Enabled is what hides the field.");

            // ---- Volume --------------------------------------------------------------------
            const volume = panel.folder("Volume", false);
            const axis = (label: string, i: number) =>
                volume.slider(label, { min: 0.5, max: 60, step: 0.1 }, () => cfg.areaSize[i], (v) => {
                    cfg.areaSize[i] = v;
                    rebuild();
                });
            axis("Area X (width)", 0);
            axis("Area Y (height)", 1);
            axis("Area Z (depth)", 2);
            volume.slider("Clear radius", { min: 0, max: 20, step: 0.1 }, () => cfg.clearRadius, (v) => {
                cfg.clearRadius = v;
                rebuild();
            });
            volume.note("The volume is a ring: clear radius is the hole kept free for gameplay.");

            // ---- Look ----------------------------------------------------------------------
            const look = panel.folder("Look", false);
            look.slider("Min size", { min: 0.005, max: 0.3, step: 0.001 }, () => cfg.minSize, (v) => {
                cfg.minSize = v;
                rebuild();
            });
            look.slider("Max size", { min: 0.005, max: 0.3, step: 0.001 }, () => cfg.maxSize, (v) => {
                cfg.maxSize = v;
                rebuild();
            });
            look.slider("Glow", { min: 0, max: 3, step: 0.01 }, () => cfg.glowIntensity, (v) => {
                cfg.glowIntensity = v;
                rebuild();
            });
            look.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
                cfg.opacity = v;
                rebuild();
            });
            look.slider("Min px size", { min: 0, max: 0.02, step: 0.0005 }, () => cfg.minScreenSize, (v) => {
                cfg.minScreenSize = v;
                rebuild();
            });
            look.colorPair("Palette 1–2", () => [cfg.colors[0], cfg.colors[1] ?? cfg.colors[0]], (v) => {
                cfg.colors[0] = v[0];
                cfg.colors[1] = v[1];
                rebuild();
            });
            look.color("Accent", () => cfg.colors[2] ?? cfg.colors[0], (v) => {
                cfg.colors[2] = v;
                rebuild();
            });

            // ---- Motion --------------------------------------------------------------------
            const motion = panel.folder("Motion", false);
            motion.slider("Min speed", { min: 0, max: 2, step: 0.01 }, () => cfg.minSpeed, (v) => {
                cfg.minSpeed = v;
                rebuild();
            });
            motion.slider("Max speed", { min: 0, max: 2, step: 0.01 }, () => cfg.maxSpeed, (v) => {
                cfg.maxSpeed = v;
                rebuild();
            });
            motion.slider("Vertical bob", { min: 0, max: 2, step: 0.01 }, () => cfg.verticalAmplitude, (v) => {
                cfg.verticalAmplitude = v;
                rebuild();
            });
            motion.slider("Pulse speed", { min: 0, max: 6, step: 0.01 }, () => cfg.pulseSpeed, (v) => {
                cfg.pulseSpeed = v;
                rebuild();
            });
            motion.slider("Pulse depth", { min: 0, max: 1, step: 0.01 }, () => cfg.pulseAmount, (v) => {
                cfg.pulseAmount = v;
                rebuild();
            });

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/fireflies/fireflies-vfx.json to keep a tuning session.");
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
    a.download = "fireflies-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
