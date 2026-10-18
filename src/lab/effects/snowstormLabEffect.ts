/**
 * Lab wrapper for {@link SnowstormVfx}: the ice field to judge it against, and the live knobs.
 *
 * Every control here is a uniform, an instance count or a `#define`, so there is no spawn to wait
 * for and no rebuild to trigger — drag a slider and the frame you are looking at changes. Three
 * things are worth being deliberate about while tuning:
 *
 *  - **Judge density against the posts, not against the sky.** The rig puts a dark ridge behind
 *    the storm and a line of posts running from behind it to in front of it. A storm that looks
 *    convincing against empty background and still lets the far posts through is not dense; it is
 *    bright. `Density` is the knob for that, not `Opacity` — density grows the formation outward
 *    from where it already is, opacity only fades the whole thing up and down.
 *  - **`Puff count` is the fill-rate cost and nothing else.** Puff radius is compensated against
 *    it, so halving the count gives a coarser storm of the same size and thickness rather than a
 *    thinner one. That is also what the quality preset does — check `low` before shipping, since
 *    that is the phone.
 *  - **Turbulence and swirl are different animations.** Turbulence wanders each puff through the
 *    volume; swirl counter-rotates them in place, which shears where they overlap. A storm that
 *    looks like it is sliding rather than churning usually wants more swirl, not more wind.
 *
 * "Copy JSON" exports the config in the same shape as `snowstorm-vfx.json`.
 */

import {
    LIGHTNING_MODES,
    MOVEMENT_MODES,
    PUFF_CAPACITY,
    SNOWSTORM_QUALITIES,
    SnowstormVfx,
    type LightningMode,
    type MovementMode,
    type SnowstormQuality,
} from "../../vfx/effects/snowstorm";
import rawSnowstormConfig from "../../vfx/effects/snowstorm/snowstorm-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import { SnowstormPreviewRig } from "../SnowstormPreviewRig";
import type { ControlPanel } from "../ui/ControlPanel";

export function createSnowstormLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const rig = new SnowstormPreviewRig();
    const storm = new SnowstormVfx(rawSnowstormConfig);

    // The volcanic set is the wrong backdrop and the wrong light for a blizzard. Hide it and turn
    // its vent light off rather than editing Environment.ts, and hand the lab back exactly what
    // it had when this effect goes away.
    const restoreTerrain = ctx.environment.terrainVisible;
    const restoreGlow = ctx.environment.glow;
    ctx.environment.terrainVisible = false;
    ctx.environment.glow = 0;

    rig.group.add(storm.object3d);

    const cfg = storm.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => storm.applyConfig();

    return {
        object3d: rig.group,
        debug: { storm, rig, config: cfg, strike: () => storm.triggerLightning() },

        update(dt: number) {
            storm.update(dt);
        },

        statsLine() {
            const calls = storm.flashLevel > 0 && cfg.lightning.mode === "bolt" ? 3 : 2;
            return (
                `<span>puffs</span> ${storm.puffCount} <span>·</span> ` +
                `<span>snow</span> ${storm.snowCount} <span>·</span> ` +
                `<span>draw calls</span> ${calls}`
            );
        },

        dispose() {
            ctx.environment.terrainVisible = restoreTerrain;
            ctx.environment.glow = restoreGlow;
            storm.dispose();
            rig.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Storm ---------------------------------------------------------------------
            const main = panel.folder("Snowstorm");
            main.toggle(
                "Enabled",
                () => storm.enabled,
                (v) => (storm.enabled = v),
            );
            main.select<SnowstormQuality>("Quality", SNOWSTORM_QUALITIES, () => cfg.quality, (v) => {
                cfg.quality = v;
                apply();
            });
            main.slider("Density", { min: 0, max: 1, step: 0.01 }, () => cfg.appearance.density, (v) => {
                cfg.appearance.density = v;
                apply();
            });
            main.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.appearance.opacity, (v) => {
                cfg.appearance.opacity = v;
                apply();
            });
            main.slider("Turbulence", { min: 0, max: 2, step: 0.01 }, () => cfg.appearance.turbulence, (v) => {
                cfg.appearance.turbulence = v;
                apply();
            });
            main.slider("Swirl", { min: 0, max: 3, step: 0.01 }, () => cfg.appearance.swirl, (v) => {
                cfg.appearance.swirl = v;
                apply();
            });
            main.buttons(
                { label: "Start", onClick: () => storm.start() },
                { label: "Stop", onClick: () => storm.stop() },
                { label: "Reset", onClick: () => storm.reset() },
            );
            main.note("Stop freezes the storm where it is; Enabled is what hides it. Quality scales both instance counts.");

            // ---- Volume --------------------------------------------------------------------
            const volume = panel.folder("Volume", false);
            volume.slider("Position X", { min: -80, max: 80, step: 0.5 }, () => cfg.position[0], (v) => (cfg.position[0] = v));
            volume.slider("Position Y", { min: -10, max: 50, step: 0.5 }, () => cfg.position[1], (v) => (cfg.position[1] = v));
            volume.slider("Position Z", { min: -140, max: 20, step: 0.5 }, () => cfg.position[2], (v) => (cfg.position[2] = v));
            volume.slider("Width", { min: 2, max: 120, step: 0.5 }, () => cfg.size.width, (v) => {
                cfg.size.width = v;
                apply();
            });
            volume.slider("Height", { min: 2, max: 80, step: 0.5 }, () => cfg.size.height, (v) => {
                cfg.size.height = v;
                apply();
            });
            volume.slider("Depth", { min: 2, max: 80, step: 0.5 }, () => cfg.size.depth, (v) => {
                cfg.size.depth = v;
                apply();
            });
            volume.slider("Scale", { min: 0.1, max: 4, step: 0.01 }, () => cfg.scale, (v) => {
                cfg.scale = v;
                apply();
            });
            volume.slider("Yaw", { min: -180, max: 180, step: 1 }, () => cfg.yaw, (v) => {
                cfg.yaw = v;
                apply();
            });
            volume.note("Yaw turns the volume and the wind axis with it. Position takes effect on the next frame.");

            // ---- Shape ---------------------------------------------------------------------
            const shape = panel.folder("Shape", false);
            shape.slider("Edge softness", { min: 0.02, max: 1.5, step: 0.01 }, () => cfg.appearance.edgeSoftness, (v) => {
                cfg.appearance.edgeSoftness = v;
                apply();
            });
            shape.slider("Shape scale", { min: 0.1, max: 8, step: 0.05 }, () => cfg.appearance.shapeScale, (v) => {
                cfg.appearance.shapeScale = v;
                apply();
            });
            shape.slider("Shape warp", { min: 0, max: 1, step: 0.01 }, () => cfg.appearance.shapeWarp, (v) => {
                cfg.appearance.shapeWarp = v;
                apply();
            });
            shape.slider("Shape drift", { min: 0, max: 0.5, step: 0.005 }, () => cfg.appearance.shapeDrift, (v) => {
                cfg.appearance.shapeDrift = v;
                apply();
            });
            shape.slider("Puff count", { min: 0, max: PUFF_CAPACITY, step: 1 }, () => cfg.appearance.puffCount, (v) => {
                cfg.appearance.puffCount = v;
                apply();
            });
            shape.slider("Puff size", { min: 0.05, max: 2, step: 0.01 }, () => cfg.appearance.puffSize, (v) => {
                cfg.appearance.puffSize = v;
                apply();
            });
            shape.slider("Detail", { min: 0.1, max: 8, step: 0.05 }, () => cfg.appearance.detail, (v) => {
                cfg.appearance.detail = v;
                apply();
            });
            shape.note("Warp tears the silhouette; drift is how fast it re-forms. Past ~0.6 warp the storm breaks into islands.");

            // ---- Look ----------------------------------------------------------------------
            const look = panel.folder("Look", false);
            look.color("Lit snow", () => cfg.appearance.snowColor, (v) => {
                cfg.appearance.snowColor = v;
                apply();
            });
            look.color("Cold fog", () => cfg.appearance.fogColor, (v) => {
                cfg.appearance.fogColor = v;
                apply();
            });
            look.color("Storm shadow", () => cfg.appearance.shadowColor, (v) => {
                cfg.appearance.shadowColor = v;
                apply();
            });
            look.slider("Light azimuth", { min: -180, max: 180, step: 1 }, () => cfg.appearance.lightAzimuth, (v) => {
                cfg.appearance.lightAzimuth = v;
                apply();
            });
            look.slider("Light elevation", { min: -90, max: 90, step: 1 }, () => cfg.appearance.lightElevation, (v) => {
                cfg.appearance.lightElevation = v;
                apply();
            });
            look.slider("Core shadow", { min: 0, max: 1, step: 0.01 }, () => cfg.appearance.coreShadow, (v) => {
                cfg.appearance.coreShadow = v;
                apply();
            });
            look.slider("Contrast", { min: 0, max: 1, step: 0.01 }, () => cfg.appearance.contrast, (v) => {
                cfg.appearance.contrast = v;
                apply();
            });
            look.note("Core shadow is the only thing giving the mass form — at 0 it flattens into a white cut-out.");

            // ---- Movement ------------------------------------------------------------------
            const move = panel.folder("Movement", false);
            move.toggle("Enabled", () => cfg.movement.enabled, (v) => (cfg.movement.enabled = v));
            move.select<MovementMode>("Mode", MOVEMENT_MODES, () => cfg.movement.mode, (v) => (cfg.movement.mode = v));
            move.slider("Speed", { min: 0, max: 8, step: 0.01 }, () => cfg.movement.speed, (v) => (cfg.movement.speed = v));
            move.slider("Speed variation", { min: 0, max: 1, step: 0.01 }, () => cfg.movement.speedVariation, (v) => (cfg.movement.speedVariation = v));
            move.slider("Travel X", { min: -160, max: 160, step: 1 }, () => cfg.movement.travel[0], (v) => (cfg.movement.travel[0] = v));
            move.slider("Travel Y", { min: -40, max: 40, step: 0.5 }, () => cfg.movement.travel[1], (v) => (cfg.movement.travel[1] = v));
            move.slider("Travel Z", { min: -160, max: 160, step: 1 }, () => cfg.movement.travel[2], (v) => (cfg.movement.travel[2] = v));
            move.slider("Vertical drift", { min: 0, max: 10, step: 0.05 }, () => cfg.movement.verticalDrift, (v) => (cfg.movement.verticalDrift = v));
            move.slider("Drift period", { min: 1, max: 120, step: 0.5 }, () => cfg.movement.verticalPeriod, (v) => (cfg.movement.verticalPeriod = v));
            move.buttons({ label: "Restart path", onClick: () => storm.reset() });
            move.note("Travel is the offset from Position to the far end. Loop cuts back to the start — use pingpong unless the storm leaves frame.");

            // ---- Snow ----------------------------------------------------------------------
            const snow = panel.folder("Snow", false);
            snow.slider("Intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.snow.intensity, (v) => {
                cfg.snow.intensity = v;
                apply();
            });
            snow.slider("Wind speed", { min: 0, max: 40, step: 0.1 }, () => cfg.snow.windSpeed, (v) => (cfg.snow.windSpeed = v));
            snow.slider("Wind angle", { min: -180, max: 180, step: 1 }, () => cfg.snow.windAngle, (v) => {
                cfg.snow.windAngle = v;
                apply();
            });
            snow.slider("Wind pitch", { min: -90, max: 90, step: 1 }, () => cfg.snow.windPitch, (v) => {
                cfg.snow.windPitch = v;
                apply();
            });
            snow.slider("Spread", { min: 0, max: 1, step: 0.01 }, () => cfg.snow.spread, (v) => {
                cfg.snow.spread = v;
                apply();
            });
            snow.slider("Gust strength", { min: 0, max: 3, step: 0.01 }, () => cfg.snow.gustStrength, (v) => (cfg.snow.gustStrength = v));
            snow.slider("Gust frequency", { min: 0, max: 60, step: 0.5 }, () => cfg.snow.gustFrequency, (v) => (cfg.snow.gustFrequency = v));
            snow.slider("Flake size", { min: 0.005, max: 0.5, step: 0.005 }, () => cfg.snow.size, (v) => {
                cfg.snow.size = v;
                apply();
            });
            snow.slider("Stretch", { min: 0, max: 30, step: 0.1 }, () => cfg.snow.stretch, (v) => {
                cfg.snow.stretch = v;
                apply();
            });
            snow.color("Flake colour", () => cfg.snow.color, (v) => {
                cfg.snow.color = v;
                apply();
            });
            snow.slider("Flake opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.snow.opacity, (v) => {
                cfg.snow.opacity = v;
                apply();
            });
            snow.note("Spread is how far flakes deviate from the shared wind — at 0 they march in formation.");

            // ---- Lightning -----------------------------------------------------------------
            const bolt = panel.folder("Lightning", false);
            bolt.toggle("Enabled", () => cfg.lightning.enabled, (v) => storm.setLightningEnabled(v));
            bolt.select<LightningMode>("Mode", LIGHTNING_MODES, () => cfg.lightning.mode, (v) => {
                cfg.lightning.mode = v;
                apply();
            });
            bolt.slider("Frequency /min", { min: 0.5, max: 120, step: 0.5 }, () => cfg.lightning.frequency, (v) => (cfg.lightning.frequency = v));
            bolt.slider("Intensity", { min: 0, max: 5, step: 0.05 }, () => cfg.lightning.intensity, (v) => (cfg.lightning.intensity = v));
            bolt.slider("Duration", { min: 0.05, max: 3, step: 0.01 }, () => cfg.lightning.duration, (v) => (cfg.lightning.duration = v));
            bolt.slider("Radius", { min: 0.05, max: 2, step: 0.01 }, () => cfg.lightning.radius, (v) => {
                cfg.lightning.radius = v;
                apply();
            });
            bolt.slider("Branching", { min: 0, max: 1, step: 0.01 }, () => cfg.lightning.branching, (v) => (cfg.lightning.branching = v));
            bolt.color("Colour", () => cfg.lightning.color, (v) => {
                cfg.lightning.color = v;
                apply();
            });
            bolt.buttons({ label: "Strike", onClick: () => storm.triggerLightning(), primary: true });
            bolt.note("Strike fires one now, even with lightning off. Flash mode is the bolt buried in the snow; bolt mode draws the channel.");

            // ---- Scene ---------------------------------------------------------------------
            const scene = panel.folder("Scene", false);
            scene.toggle("Reference rig", () => rig.group.visible, (v) => (rig.group.visible = v));
            scene.note("Ice field, ridge and posts are preview only. Far posts should vanish behind the core; the near one must not dim.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/snowstorm/snowstorm-vfx.json to keep a tuning session.");
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
    a.download = "snowstorm-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
