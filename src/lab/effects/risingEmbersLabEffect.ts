/**
 * Lab wrapper for {@link RisingEmbersVfx}: the live control surface over its JSON config.
 *
 * Every knob here is a shader uniform, so there is nothing to wait for and nothing to rebuild —
 * drag a slider and the frame you are looking at changes. `Count` is the one exception, and even
 * that only resizes the draw: the seeds are a seeded sequence, so raising it appends embers rather
 * than reshuffling the ones you were watching.
 *
 * Two things worth being deliberate about while tuning:
 *
 *  - **Judge it from `playable`, against the pool.** The set's molten pool is the heat source the
 *    defaults are sized to; from `top` a rising column always looks like a rising column.
 *  - **Watch the bright ones, not the field.** The failure mode is yellow confetti. Push
 *    `Glow` down until the field is nearly all dull red, then look at whether the handful of hot
 *    embers still read — that balance, not the overall brightness, is what sells lava.
 *
 * "Copy JSON" exports the config in the same shape as `risingembers-vfx.json`.
 */

import { EMISSION_SHAPES, RisingEmbersVfx, type EmissionShape } from "../../vfx/effects/risingembers";
import rawRisingEmbersConfig from "../../vfx/effects/risingembers/risingembers-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

export function createRisingEmbersLabEffect(_ctx: LabEffectContext): LabEffectHandle {
    const embers = new RisingEmbersVfx(rawRisingEmbersConfig);
    // The source is placed by emissionHeight within the effect, so the object itself sits on the
    // ground — the same thing a game does when it parents this to a lava surface.
    embers.object3d.position.set(0, 0, 0);

    const cfg = embers.config;
    const apply = () => embers.applyConfig();

    return {
        object3d: embers.object3d,
        debug: { embers, config: cfg },

        update(dt: number) {
            embers.update(dt);
        },

        statsLine() {
            return `<span>embers</span> ${embers.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            embers.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Emission ------------------------------------------------------------------
            const main = panel.folder("Rising embers");
            main.toggle(
                "Enabled",
                () => embers.enabled,
                (v) => (embers.enabled = v),
            );
            main.slider("Max count", { min: 0, max: 1500, step: 1 }, () => cfg.particleCount, (v) => {
                cfg.particleCount = v;
                apply();
            });
            main.slider("Emission rate", { min: 0, max: 300, step: 1 }, () => cfg.emissionRate, (v) => {
                cfg.emissionRate = v;
                apply();
            });
            main.buttons(
                { label: "Start", onClick: () => embers.start() },
                { label: "Stop", onClick: () => embers.stop() },
                { label: "Reset", onClick: () => embers.reset() },
            );
            main.note("Live embers settle at rate x average lifetime, capped by max count. Stop drains the column.");

            // ---- Source --------------------------------------------------------------------
            const source = panel.folder("Source", false);
            source.select<EmissionShape>("Shape", EMISSION_SHAPES, () => cfg.emissionShape, (v) => {
                cfg.emissionShape = v;
                apply();
            });
            source.slider("Width", { min: 0, max: 20, step: 0.05 }, () => cfg.emissionWidth, (v) => {
                cfg.emissionWidth = v;
                apply();
            });
            source.slider("Depth", { min: 0, max: 20, step: 0.05 }, () => cfg.emissionDepth, (v) => {
                cfg.emissionDepth = v;
                apply();
            });
            source.slider("Height", { min: -2, max: 6, step: 0.05 }, () => cfg.emissionHeight, (v) => {
                cfg.emissionHeight = v;
                apply();
            });
            source.note("Ring emits from the rim only — a vent whose middle has crusted over.");

            // ---- Motion --------------------------------------------------------------------
            const motion = panel.folder("Motion", false);
            motion.slider("Rise speed", { min: 0, max: 4, step: 0.01 }, () => cfg.riseSpeed, (v) => {
                cfg.riseSpeed = v;
                apply();
            });
            motion.slider("Rise variation", { min: 0, max: 1, step: 0.01 }, () => cfg.riseSpeedVariation, (v) => {
                cfg.riseSpeedVariation = v;
                apply();
            });
            motion.slider("Drift speed", { min: 0, max: 1.5, step: 0.01 }, () => cfg.driftSpeed, (v) => {
                cfg.driftSpeed = v;
                apply();
            });
            motion.slider("Drift angle", { min: -180, max: 180, step: 1 }, () => cfg.driftAngle, (v) => {
                cfg.driftAngle = v;
                apply();
            });
            motion.slider("Turbulence", { min: 0, max: 1.5, step: 0.01 }, () => cfg.turbulence, (v) => {
                cfg.turbulence = v;
                apply();
            });
            motion.slider("Spread", { min: 0, max: 5, step: 0.01 }, () => cfg.spread, (v) => {
                cfg.spread = v;
                apply();
            });
            motion.slider("Max height", { min: 0.5, max: 20, step: 0.1 }, () => cfg.maxHeight, (v) => {
                cfg.maxHeight = v;
                apply();
            });
            motion.note("Drift is one wind every ember shares; spread is the cone; turbulence is per-ember wander.");

            // ---- Look ----------------------------------------------------------------------
            const look = panel.folder("Look", false);
            look.range("Size", { min: 0.004, max: 0.25, step: 0.001 }, () => [cfg.minSize, cfg.maxSize], (v) => {
                cfg.minSize = v[0];
                cfg.maxSize = v[1];
                apply();
            });
            look.slider("Size variation", { min: 0, max: 1, step: 0.01 }, () => cfg.sizeVariation, (v) => {
                cfg.sizeVariation = v;
                apply();
            });
            look.colorPair("Hot / base", () => [cfg.hotColor, cfg.baseColor], (v) => {
                cfg.hotColor = v[0];
                cfg.baseColor = v[1];
                apply();
            });
            look.color("Cooled", () => cfg.coolColor, (v) => {
                cfg.coolColor = v;
                apply();
            });
            look.slider("Glow", { min: 0, max: 3, step: 0.01 }, () => cfg.glowIntensity, (v) => {
                cfg.glowIntensity = v;
                apply();
            });
            look.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
                cfg.opacity = v;
                apply();
            });
            look.slider("Min px size", { min: 0, max: 0.02, step: 0.0005 }, () => cfg.minScreenSize, (v) => {
                cfg.minScreenSize = v;
                apply();
            });
            look.note("Size variation at 0 ties size to heat: the hottest embers are the biggest.");

            // ---- Life and flicker ----------------------------------------------------------
            const life = panel.folder("Life & flicker", false);
            life.range("Lifetime", { min: 0.5, max: 25, step: 0.1 }, () => [cfg.minLifetime, cfg.maxLifetime], (v) => {
                cfg.minLifetime = v[0];
                cfg.maxLifetime = v[1];
                apply();
            });
            life.slider("Fade in", { min: 0, max: 3, step: 0.01 }, () => cfg.fadeInDuration, (v) => {
                cfg.fadeInDuration = v;
                apply();
            });
            life.slider("Fade out", { min: 0, max: 8, step: 0.05 }, () => cfg.fadeOutDuration, (v) => {
                cfg.fadeOutDuration = v;
                apply();
            });
            life.slider("Flicker speed", { min: 0, max: 25, step: 0.1 }, () => cfg.flickerSpeed, (v) => {
                cfg.flickerSpeed = v;
                apply();
            });
            life.slider("Flicker depth", { min: 0, max: 1, step: 0.01 }, () => cfg.flickerIntensity, (v) => {
                cfg.flickerIntensity = v;
                apply();
            });
            life.slider("Cooling", { min: 0, max: 1, step: 0.01 }, () => cfg.coolingIntensity, (v) => {
                cfg.coolingIntensity = v;
                apply();
            });
            life.note("Moving the lifetime range re-phases the field: embers shift along their cycle, they do not pop.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/risingembers/risingembers-vfx.json to keep a tuning session.");
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
    a.download = "risingembers-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
