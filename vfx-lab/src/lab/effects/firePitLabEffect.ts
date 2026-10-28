/**
 * Lab wrapper for {@link FirePitVfx}: the live control surface over its JSON config.
 *
 * Controls bind to the config object by reference, so moving a slider changes what the next
 * particle spawns with — no rebuild, no restart, and particles already in flight keep the values
 * they were born with, which is exactly how these systems behave in an engine.
 *
 * "Export JSON" copies the current config in the same shape as `firepit-vfx.json`, so a tuning
 * session ends by pasting the result over the file rather than by transcribing slider positions.
 */

import { FirePitVfx } from "../../vfx/effects/firepit";
import rawFirePitConfig from "../../vfx/effects/firepit/firepit-vfx.json";
import type { ControlPanel } from "../ui/ControlPanel";
import type { LabEffectHandle } from "../registry";

export function createFirePitLabEffect(): LabEffectHandle {
    const firePit = new FirePitVfx(rawFirePitConfig);
    firePit.start();

    const cfg = firePit.config;

    return {
        object3d: firePit.object3d,
        debug: { firePit, config: cfg },

        update(dt: number) {
            firePit.update(dt);
        },

        statsLine() {
            return (
                `<span>sparks</span> ${firePit.sparks.activeCount} <span>·</span> ` +
                `<span>embers</span> ${firePit.embers.activeCount} <span>·</span> ` +
                `<span>smoke</span> ${firePit.smoke.activeCount}`
            );
        },

        dispose() {
            firePit.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Overall -------------------------------------------------------------------
            const main = panel.folder("Fire pit");
            main.select(
                "Quality",
                ["low", "high"] as const,
                () => cfg.quality.preset,
                (v) => firePit.setQuality(v),
            );
            main.toggle(
                "Sparks",
                () => cfg.sparks.enabled,
                (v) => {
                    cfg.sparks.enabled = v;
                    firePit.sparks.enabled = v;
                },
            );
            main.toggle(
                "Embers",
                () => cfg.embers.enabled,
                (v) => {
                    cfg.embers.enabled = v;
                    firePit.embers.enabled = v;
                },
            );
            main.toggle(
                "Smoke",
                () => cfg.smoke.enabled,
                (v) => {
                    cfg.smoke.enabled = v;
                    firePit.smoke.enabled = v;
                },
            );
            main.buttons(
                { label: "Spark burst", onClick: () => firePit.sparks.burst(), primary: true },
                { label: "Burst all", onClick: () => firePit.burst() },
            );
            main.buttons(
                { label: "Start", onClick: () => firePit.start() },
                { label: "Stop", onClick: () => firePit.stop() },
                { label: "Reset", onClick: () => firePit.reset() },
            );
            main.note("Stop lets live particles finish; Reset clears them instantly.");

            // ---- Sparks --------------------------------------------------------------------
            const sparks = panel.folder("Sparks", false);
            const s = cfg.sparks;
            sparks.slider("Max particles", { min: 0, max: firePit.sparks.capacity, step: 10 }, () => s.maxParticles, (v) => (s.maxParticles = v));
            sparks.slider("Rate /s", { min: 0, max: 200, step: 1 }, () => s.emission.rate, (v) => (s.emission.rate = v));
            sparks.range("Burst count", { min: 0, max: 120, step: 1 }, () => s.emission.burstCount, (v) => (s.emission.burstCount = v));
            sparks.range("Auto burst s", { min: 0, max: 6, step: 0.05 }, () => s.emission.autoBurstInterval, (v) => (s.emission.autoBurstInterval = v));
            sparks.range("Lifetime s", { min: 0.05, max: 3, step: 0.01 }, () => s.lifetime, (v) => (s.lifetime = v));
            sparks.range("Speed", { min: 0, max: 30, step: 0.1 }, () => s.velocity.speed, (v) => (s.velocity.speed = v));
            sparks.slider("Gravity", { min: -40, max: 10, step: 0.1 }, () => s.gravity, (v) => (s.gravity = v));
            sparks.slider("Drag", { min: 0, max: 8, step: 0.05 }, () => s.drag, (v) => (s.drag = v));
            sparks.slider("Upward bias", { min: 0, max: 1, step: 0.01 }, () => s.direction.upward, (v) => (s.direction.upward = v));
            sparks.slider("Spread °", { min: 0, max: 180, step: 1 }, () => s.direction.spreadDeg, (v) => (s.direction.spreadDeg = v));
            sparks.slider("Spawn radius", { min: 0, max: 4, step: 0.01 }, () => s.spawn.radius, (v) => (s.spawn.radius = v));
            sparks.range("Streak length", { min: 0.01, max: 1.5, step: 0.01 }, () => s.streak.length, (v) => (s.streak.length = v));
            sparks.slider("Len per speed", { min: 0, max: 0.3, step: 0.001 }, () => s.streak.lengthPerSpeed, (v) => (s.streak.lengthPerSpeed = v));
            sparks.range("Thickness", { min: 0.002, max: 0.2, step: 0.001 }, () => s.streak.thickness, (v) => (s.streak.thickness = v));
            sparks.slider("Min px width", { min: 0, max: 0.02, step: 0.0005 }, () => s.streak.minWidth, (v) => (s.streak.minWidth = v));
            sparks.range("Brightness", { min: 0, max: 5, step: 0.05 }, () => s.brightness, (v) => (s.brightness = v));
            sparks.slider("Core white", { min: 0, max: 1, step: 0.01 }, () => s.color.coreWhiteness, (v) => (s.color.coreWhiteness = v));
            sparks.slider("Flicker", { min: 0, max: 1, step: 0.01 }, () => s.flicker.amount, (v) => (s.flicker.amount = v));
            sparks.colorPair("Hot colour", () => s.color.start, (v) => (s.color.start = v));
            sparks.colorPair("Cooled colour", () => s.color.end, (v) => (s.color.end = v));

            // ---- Embers --------------------------------------------------------------------
            const embers = panel.folder("Embers", false);
            const e = cfg.embers;
            embers.slider("Max particles", { min: 0, max: firePit.embers.capacity, step: 10 }, () => e.maxParticles, (v) => (e.maxParticles = v));
            embers.slider("Rate /s", { min: 0, max: 150, step: 1 }, () => e.emission.rate, (v) => (e.emission.rate = v));
            embers.range("Lifetime s", { min: 0.2, max: 14, step: 0.1 }, () => e.lifetime, (v) => (e.lifetime = v));
            embers.range("Size", { min: 0.005, max: 0.6, step: 0.005 }, () => e.size, (v) => (e.size = v));
            embers.slider("Intensity", { min: 0, max: 3, step: 0.01 }, () => firePit.embers.intensity, (v) => (firePit.embers.intensity = v));
            embers.range("Brightness", { min: 0, max: 5, step: 0.05 }, () => e.brightness, (v) => (e.brightness = v));
            embers.range("Rise speed", { min: -2, max: 5, step: 0.01 }, () => e.velocity.rise, (v) => (e.velocity.rise = v));
            embers.slider("Buoyancy", { min: -2, max: 2, step: 0.01 }, () => e.buoyancy, (v) => (e.buoyancy = v));
            embers.slider("Drag", { min: 0, max: 4, step: 0.01 }, () => e.drag, (v) => (e.drag = v));
            embers.range("Drift amount", { min: 0, max: 2, step: 0.01 }, () => e.drift.amplitude, (v) => (e.drift.amplitude = v));
            embers.range("Drift speed", { min: 0, max: 3, step: 0.01 }, () => e.drift.frequency, (v) => (e.drift.frequency = v));
            embers.slider("Pulse", { min: 0, max: 1, step: 0.01 }, () => e.pulse.amount, (v) => (e.pulse.amount = v));
            embers.slider("Spawn radius", { min: 0, max: 8, step: 0.05 }, () => e.spawn.radius, (v) => (e.spawn.radius = v));
            embers.colorPair("Colour range", () => e.color.range, (v) => (e.color.range = v));
            embers.color("Accent", () => e.color.accent, (v) => (e.color.accent = v));
            embers.slider("Accent chance", { min: 0, max: 1, step: 0.01 }, () => e.color.accentChance, (v) => (e.color.accentChance = v));
            embers.buttons({ label: "Ember burst", onClick: () => firePit.embers.burst() });

            // ---- Smoke ---------------------------------------------------------------------
            const smoke = panel.folder("Smoke", false);
            const k = cfg.smoke;
            smoke.slider("Max particles", { min: 0, max: firePit.smoke.capacity, step: 5 }, () => k.maxParticles, (v) => (k.maxParticles = v));
            smoke.slider("Rate /s", { min: 0, max: 60, step: 0.5 }, () => k.emission.rate, (v) => (k.emission.rate = v));
            smoke.range("Lifetime s", { min: 0.2, max: 16, step: 0.1 }, () => k.lifetime, (v) => (k.lifetime = v));
            smoke.range("Start size", { min: 0.05, max: 4, step: 0.01 }, () => k.size, (v) => (k.size = v));
            smoke.slider("Expansion /s", { min: 0, max: 3, step: 0.01 }, () => k.expansion, (v) => (k.expansion = v));
            smoke.slider("Density", { min: 0, max: 2, step: 0.01 }, () => firePit.smoke.density, (v) => (firePit.smoke.density = v));
            smoke.range("Opacity", { min: 0, max: 1, step: 0.01 }, () => k.opacity, (v) => (k.opacity = v));
            smoke.range("Rise speed", { min: -2, max: 5, step: 0.01 }, () => k.velocity.rise, (v) => (k.velocity.rise = v));
            smoke.slider("Drag", { min: 0, max: 4, step: 0.01 }, () => k.drag, (v) => (k.drag = v));
            smoke.range("Drift amount", { min: 0, max: 2, step: 0.01 }, () => k.drift.amplitude, (v) => (k.drift.amplitude = v));
            smoke.range("Spin °/s", { min: -180, max: 180, step: 1 }, () => k.rotation.speedDeg, (v) => (k.rotation.speedDeg = v));
            smoke.slider("Spawn radius", { min: 0, max: 8, step: 0.05 }, () => k.spawn.radius, (v) => (k.spawn.radius = v));
            smoke.colorPair("Colour range", () => k.color.range, (v) => (k.color.range = v));
            smoke.color("Warm accent", () => k.color.accent, (v) => (k.color.accent = v));
            smoke.slider("Accent chance", { min: 0, max: 1, step: 0.01 }, () => k.color.accentChance, (v) => (k.color.accentChance = v));
            smoke.buttons({ label: "Smoke burst", onClick: () => firePit.smoke.burst() });

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/firepit/firepit-vfx.json to keep a tuning session.");
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
        // Clipboard access needs a secure context and can be denied; the log is the fallback.
        console.warn("[vfx-lab] clipboard unavailable — config printed below instead");
        console.log(text);
    }
}

function downloadConfig(cfg: unknown): void {
    const blob = new Blob([serialize(cfg)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "firepit-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
