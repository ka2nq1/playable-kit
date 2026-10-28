/**
 * Lab wrapper for {@link SmokeWispsVfx}: the live control surface over its JSON config.
 *
 * Every knob here is a shader uniform, so there is nothing to wait for and nothing to rebuild —
 * drag a slider and the frame you are looking at changes. `Max count` is the one exception, and
 * even that only resizes the draw: the seeds are a seeded sequence, so raising it appends wisps
 * rather than reshuffling the ones you were watching.
 *
 * Two things worth being deliberate about while tuning:
 *
 *  - **Judge it from `playable`, and judge the overlaps.** A single strand reads well at almost
 *    any setting; what goes wrong at shipping framing is three of them crossing and turning into
 *    a grey slab. If that happens, take `Base opacity` down before you take the count down.
 *  - **Length is a time, not a mesh.** `Length` divided by a wisp's own rise speed is the lag
 *    across the strand, so turning `Rise speed` up shortens nothing — it just pays out the same
 *    strand faster. That is also why `Turbulence` and `Curl frequency` change the silhouette
 *    rather than wobbling a fixed shape.
 *
 * "Copy JSON" exports the config in the same shape as `smokewisps-vfx.json`.
 */

import { SmokeWispsVfx, WISP_EMISSION_SHAPES, type WispEmissionShape } from "../../vfx/effects/smokewisps";
import rawSmokeWispsConfig from "../../vfx/effects/smokewisps/smokewisps-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

export function createSmokeWispsLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const smoke = new SmokeWispsVfx(rawSmokeWispsConfig);
    // The source is placed by emissionHeight within the effect, so the object itself sits on the
    // ground — the same thing a game does when it parents this to a smouldering surface.
    smoke.object3d.position.set(0, 0, 0);

    // Grey smoke against a lit vent is the one case where the set dressing competes with the
    // effect: the glow washes the near strands out. Dim it rather than replace it, and hand the
    // lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.35;

    const cfg = smoke.config;
    const apply = () => smoke.applyConfig();

    return {
        object3d: smoke.object3d,
        debug: { smoke, config: cfg },

        update(dt: number) {
            smoke.update(dt);
        },

        statsLine() {
            return `<span>wisps</span> ${smoke.activeCount} <span>·</span> <span>draw calls</span> 1`;
        },

        dispose() {
            ctx.environment.glow = restoreGlow;
            smoke.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Emission ------------------------------------------------------------------
            const main = panel.folder("Smoke wisps");
            main.toggle(
                "Enabled",
                () => smoke.enabled,
                (v) => (smoke.enabled = v),
            );
            main.slider("Max count", { min: 0, max: 200, step: 1 }, () => cfg.wispCount, (v) => {
                cfg.wispCount = v;
                apply();
            });
            main.slider("Emission rate", { min: 0, max: 60, step: 0.1 }, () => cfg.emissionRate, (v) => {
                cfg.emissionRate = v;
                apply();
            });
            main.buttons(
                { label: "Start", onClick: () => smoke.start() },
                { label: "Stop", onClick: () => smoke.stop() },
                { label: "Reset", onClick: () => smoke.reset() },
            );
            main.note("Live wisps settle at rate x average lifetime, capped by max count. Stop drains the column.");

            // ---- Source --------------------------------------------------------------------
            const source = panel.folder("Source", false);
            source.select<WispEmissionShape>("Shape", WISP_EMISSION_SHAPES, () => cfg.emissionShape, (v) => {
                cfg.emissionShape = v;
                apply();
            });
            source.slider("Width", { min: 0, max: 8, step: 0.01 }, () => cfg.emissionWidth, (v) => {
                cfg.emissionWidth = v;
                apply();
            });
            source.slider("Depth", { min: 0, max: 8, step: 0.01 }, () => cfg.emissionDepth, (v) => {
                cfg.emissionDepth = v;
                apply();
            });
            source.slider("Height", { min: -2, max: 4, step: 0.01 }, () => cfg.emissionHeight, (v) => {
                cfg.emissionHeight = v;
                apply();
            });
            source.note("Line uses the width axis only — a seam or a row of embers rather than a patch.");

            // ---- Motion --------------------------------------------------------------------
            const motion = panel.folder("Motion", false);
            motion.slider("Rise speed", { min: 0.01, max: 3, step: 0.01 }, () => cfg.riseSpeed, (v) => {
                cfg.riseSpeed = v;
                apply();
            });
            motion.slider("Rise variation", { min: 0, max: 1, step: 0.01 }, () => cfg.riseSpeedVariation, (v) => {
                cfg.riseSpeedVariation = v;
                apply();
            });
            motion.slider("Drift", { min: 0, max: 1, step: 0.005 }, () => cfg.horizontalDrift, (v) => {
                cfg.horizontalDrift = v;
                apply();
            });
            motion.slider("Drift angle", { min: -180, max: 180, step: 1 }, () => cfg.driftAngle, (v) => {
                cfg.driftAngle = v;
                apply();
            });
            motion.slider("Turbulence", { min: 0, max: 1, step: 0.005 }, () => cfg.turbulence, (v) => {
                cfg.turbulence = v;
                apply();
            });
            motion.slider("Curl frequency", { min: 0.05, max: 5, step: 0.05 }, () => cfg.curlFrequency, (v) => {
                cfg.curlFrequency = v;
                apply();
            });
            motion.slider("Spread", { min: 0, max: 4, step: 0.01 }, () => cfg.spread, (v) => {
                cfg.spread = v;
                apply();
            });
            motion.slider("Expansion", { min: 0, max: 1, step: 0.005 }, () => cfg.expansionRate, (v) => {
                cfg.expansionRate = v;
                apply();
            });
            motion.slider("Max height", { min: 0.2, max: 15, step: 0.1 }, () => cfg.maxHeight, (v) => {
                cfg.maxHeight = v;
                apply();
            });
            motion.note("Turbulence is the curl written into the strand; drift is one wind every wisp shares.");

            // ---- Look ----------------------------------------------------------------------
            const look = panel.folder("Look", false);
            look.color("Smoke", () => cfg.smokeColor, (v) => {
                cfg.smokeColor = v;
                apply();
            });
            look.slider("Colour variation", { min: 0, max: 1, step: 0.01 }, () => cfg.colorVariation, (v) => {
                cfg.colorVariation = v;
                apply();
            });
            look.slider("Base opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.baseOpacity, (v) => {
                cfg.baseOpacity = v;
                apply();
            });
            look.slider("Opacity variation", { min: 0, max: 1, step: 0.01 }, () => cfg.opacityVariation, (v) => {
                cfg.opacityVariation = v;
                apply();
            });
            look.range("Width", { min: 0.01, max: 1.5, step: 0.005 }, () => [cfg.minWidth, cfg.maxWidth], (v) => {
                cfg.minWidth = v[0];
                cfg.maxWidth = v[1];
                apply();
            });
            look.range("Length", { min: 0.05, max: 6, step: 0.05 }, () => [cfg.minLength, cfg.maxLength], (v) => {
                cfg.minLength = v[0];
                cfg.maxLength = v[1];
                apply();
            });
            look.slider("Softness", { min: 0, max: 1, step: 0.01 }, () => cfg.softness, (v) => {
                cfg.softness = v;
                apply();
            });
            look.slider("Noise scale", { min: 0.05, max: 8, step: 0.05 }, () => cfg.noiseScale, (v) => {
                cfg.noiseScale = v;
                apply();
            });
            look.slider("Noise intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.noiseIntensity, (v) => {
                cfg.noiseIntensity = v;
                apply();
            });
            look.slider("Detail scale", { min: 0.1, max: 16, step: 0.1 }, () => cfg.detailScale, (v) => {
                cfg.detailScale = v;
                apply();
            });
            look.slider("Min px width", { min: 0, max: 0.02, step: 0.0005 }, () => cfg.minScreenWidth, (v) => {
                cfg.minScreenWidth = v;
                apply();
            });
            look.note("Expansion widens the smoke and thins it in the same measure — that is what reads as diffusing.");

            // ---- Life ----------------------------------------------------------------------
            const life = panel.folder("Life", false);
            life.range("Lifetime", { min: 0.5, max: 30, step: 0.1 }, () => [cfg.minLifetime, cfg.maxLifetime], (v) => {
                cfg.minLifetime = v[0];
                cfg.maxLifetime = v[1];
                apply();
            });
            life.slider("Fade in", { min: 0, max: 5, step: 0.05 }, () => cfg.fadeInDuration, (v) => {
                cfg.fadeInDuration = v;
                apply();
            });
            life.slider("Fade out", { min: 0, max: 10, step: 0.05 }, () => cfg.fadeOutDuration, (v) => {
                cfg.fadeOutDuration = v;
                apply();
            });
            life.slider("Randomness", { min: 0, max: 1, step: 0.01 }, () => cfg.randomness, (v) => {
                cfg.randomness = v;
                apply();
            });
            life.note("Randomness at 0 makes every wisp the average of its ranges — useful for seeing one shape clearly.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/smokewisps/smokewisps-vfx.json to keep a tuning session.");
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
    a.download = "smokewisps-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
