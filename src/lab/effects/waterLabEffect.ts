/**
 * Lab wrapper for {@link WaterVfx}: a swamp surface, a click-to-emit control and the live knobs.
 *
 * Ripples are events, not a stream, so the tuning loop is different from the fire pit's: you fire
 * one, watch it, change a number, fire it again. Hence the click-to-emit on the water and the auto
 * emitter — the first for placing a single ripple exactly where you want to study it, the second
 * for the thing a still frame cannot show you, which is how a dozen overlapping events read.
 *
 * Sliders bind to `config.presets[name].ripple` by reference, so they change what the *next* event
 * spawns with and leave ripples already expanding alone.
 */

import { Group, Plane, Raycaster, Vector2, Vector3 } from "three";
import { createRng } from "../../vfx/core/random";
import { WaterVfx } from "../../vfx/effects/water";
import rawWaterConfig from "../../vfx/effects/water/water-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";
import { WaterSurface } from "../WaterSurface";

export function createWaterLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const surface = new WaterSurface();
    const water = new WaterVfx(rawWaterConfig);
    water.object3d.position.y = surface.level;

    // Siblings, not parent and child: the surface mesh already sits at the water level, and
    // parenting it under the effect would stack the two offsets and sink the rings below it.
    const group = new Group();
    group.name = "lab:water";
    group.add(surface.mesh, water.object3d);

    // The volcanic set is the wrong light for water. Dim it rather than replace it, and hand the
    // lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.08;

    const cfg = water.config;
    let preset = cfg.defaultPreset;
    const active = () => cfg.presets[preset] ?? cfg.presets[cfg.defaultPreset];

    // ---- Click to emit -----------------------------------------------------------------------
    // A pointer-up that did not travel is a click; anything further was an orbit drag, and
    // dropping a ripple at the end of every camera move would make the lab unusable.
    const canvas = ctx.app.renderer.domElement;
    const raycaster = new Raycaster();
    const surfacePlane = new Plane(new Vector3(0, 1, 0), -surface.level);
    const ndc = new Vector2();
    const hit = new Vector3();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (ev: PointerEvent) => {
        downX = ev.clientX;
        downY = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
        const rect = canvas.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, ctx.app.camera);
        if (raycaster.ray.intersectPlane(surfacePlane, hit)) water.emit(preset, hit);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    // ---- Auto emitter ------------------------------------------------------------------------
    // Lab-side on purpose: scheduling events is the game's job, and nothing in src/vfx should
    // grow a timer just so the lab can test overlap.
    const rng = createRng(90210);
    const autoPos = new Vector3();
    let autoEnabled = false;
    let autoRate = 2.5;
    let autoRadius = 3.5;
    let autoDebt = 0;

    function emitScattered(count: number): void {
        for (let i = 0; i < count; i++) {
            const r = autoRadius * Math.sqrt(rng());
            const a = rng() * Math.PI * 2;
            autoPos.set(Math.cos(a) * r, surface.level, Math.sin(a) * r);
            water.emit(preset, autoPos);
        }
    }

    return {
        object3d: group,
        debug: { water, surface, config: cfg, emit: (p: string, x: number, z: number) => water.emit(p, autoPos.set(x, surface.level, z)) },

        update(dt: number) {
            surface.update(dt);
            if (autoEnabled && autoRate > 0 && dt > 0) {
                autoDebt += autoRate * Math.min(dt, 0.1);
                while (autoDebt >= 1) {
                    autoDebt -= 1;
                    emitScattered(1);
                }
            }
            water.update(dt);
        },

        statsLine() {
            return `<span>rings</span> ${water.ripples.activeCount} <span>·</span> <span>spray</span> ${water.spray.activeCount}`;
        },

        dispose() {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
            ctx.environment.glow = restoreGlow;
            surface.dispose();
            water.dispose();
        },

        buildControls(panel: ControlPanel) {
            // ---- Events --------------------------------------------------------------------
            const main = panel.folder("Water events");
            main.select(
                "Preset",
                water.presetNames,
                () => preset,
                (v) => {
                    preset = v;
                    // The sliders below read through `active()`, so switching presets re-points
                    // them; refresh pulls the new values into the inputs.
                    panel.refresh();
                },
            );
            main.note("Click the water to emit the selected preset where you clicked.");
            main.buttons(
                { label: "Emit", onClick: () => emitScattered(1), primary: true },
                { label: "Emit ×8", onClick: () => emitScattered(8) },
                { label: "Clear", onClick: () => water.clear() },
            );
            main.buttons(
                { label: "Impact", onClick: () => water.emit("impact", autoPos.set(0, surface.level, 0)) },
                { label: "Emergence", onClick: () => water.emit("emergence", autoPos.set(0, surface.level, 0)) },
                { label: "Ambient", onClick: () => water.emit("ambient", autoPos.set(-2.4, surface.level, -2.2)) },
            );
            main.buttons(
                { label: "Subtle rise", onClick: () => water.emit("emergence", autoPos.set(0, surface.level, 0), { scale: 0.6, intensity: 0.5 }) },
                { label: "Big rise", onClick: () => water.emit("emergence", autoPos.set(0, surface.level, 0), { scale: 1.45 }) },
            );
            main.toggle("Auto emit", () => autoEnabled, (v) => (autoEnabled = v));
            main.slider("Auto rate /s", { min: 0, max: 20, step: 0.1 }, () => autoRate, (v) => (autoRate = v));
            main.slider("Auto radius", { min: 0.5, max: 12, step: 0.1 }, () => autoRadius, (v) => (autoRadius = v));
            main.select(
                "Quality",
                ["low", "high"] as const,
                () => cfg.quality.preset,
                (v) => water.setQuality(v),
            );
            main.buttons(
                { label: "Start", onClick: () => water.start() },
                { label: "Stop", onClick: () => water.stop() },
            );

            // ---- The selected preset -------------------------------------------------------
            const p = panel.folder("Preset knobs");
            p.slider("Rings", { min: 1, max: 8, step: 1 }, () => active().ripple.rings, (v) => (active().ripple.rings = v));
            p.slider("Ring delay s", { min: 0, max: 1.2, step: 0.01 }, () => active().ripple.ringDelay, (v) => (active().ripple.ringDelay = v));
            p.slider("Start radius", { min: 0, max: 3, step: 0.01 }, () => active().ripple.startRadius, (v) => (active().ripple.startRadius = v));
            p.slider("Max radius", { min: 0.1, max: 12, step: 0.05 }, () => active().ripple.maxRadius, (v) => (active().ripple.maxRadius = v));
            p.slider("Duration s", { min: 0.1, max: 8, step: 0.05 }, () => active().ripple.duration, (v) => (active().ripple.duration = v));
            p.slider("Ring width", { min: 0.01, max: 1, step: 0.005 }, () => active().ripple.width, (v) => (active().ripple.width = v));
            p.slider("Width growth", { min: 0, max: 3, step: 0.05 }, () => active().ripple.widthGrowth, (v) => (active().ripple.widthGrowth = v));
            p.slider("Intensity", { min: 0, max: 2, step: 0.01 }, () => active().ripple.intensity, (v) => (active().ripple.intensity = v));
            p.slider("Wobble", { min: 0, max: 0.3, step: 0.005 }, () => active().ripple.wobble, (v) => (active().ripple.wobble = v));
            p.slider("Jitter", { min: 0, max: 1, step: 0.01 }, () => active().ripple.jitter, (v) => (active().ripple.jitter = v));
            p.slider("Scale", { min: 0.1, max: 3, step: 0.01 }, () => active().ripple.scale, (v) => (active().ripple.scale = v));
            p.slider("Priority", { min: 0, max: 5, step: 1 }, () => active().ripple.priority, (v) => (active().ripple.priority = v));
            p.color("Crest colour", () => active().ripple.color, (v) => (active().ripple.color = v));
            p.slider("Spray count", { min: 0, max: 60, step: 1 }, () => active().spray.count, (v) => (active().spray.count = v));
            p.slider("Spray speed", { min: 0, max: 3, step: 0.05 }, () => active().spray.speedScale, (v) => (active().spray.speedScale = v));

            // ---- The systems ---------------------------------------------------------------
            const sys = panel.folder("Ripple system", false);
            const rip = cfg.ripples;
            sys.toggle("Ripples", () => water.ripples.enabled, (v) => (water.ripples.enabled = v));
            sys.toggle("Spray", () => water.spray.enabled, (v) => (water.spray.enabled = v));
            sys.slider("Max rings", { min: 1, max: water.ripples.capacity, step: 1 }, () => rip.maxRipples, (v) => (rip.maxRipples = v));
            sys.slider("Ring opacity", { min: 0, max: 2, step: 0.01 }, () => water.ripples.opacity, (v) => (water.ripples.opacity = v));
            sys.slider("Spray opacity", { min: 0, max: 2, step: 0.01 }, () => water.spray.intensity, (v) => (water.spray.intensity = v));
            sys.color(
                "Trough colour",
                () => rip.troughColor,
                (v) => {
                    rip.troughColor = v;
                    water.ripples.refreshColors();
                },
            );
            sys.readout("Pool", () => `${water.ripples.activeCount} / ${water.ripples.capacity} rings`);

            const srf = panel.folder("Preview water", false);
            srf.slider("Glint", { min: 0, max: 2, step: 0.01 }, () => surface.glint, (v) => (surface.glint = v));
            srf.note("Preview-only surface. A game brings its own water material.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/water/water-vfx.json to keep a tuning session.");
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
    a.download = "water-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
