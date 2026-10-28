/**
 * Lab wrapper for {@link WaterSplashVfx}: a water surface to hit, a repeatable trigger and the
 * live knobs.
 *
 * A splash is an event with a very short life, so the tuning loop is "fire it, watch it, change a
 * number, fire it again" — which is why the trigger is the first control in the panel and why the
 * auto-repeat exists. Pause and the time-scale slider in the Lab folder are the other half of it:
 * the burst, the peak and the collapse all happen inside a second, and the only way to judge the
 * collapse is to slow it down or step into it.
 *
 * Sliders write straight into `vfx.config`, so size and timing changes land on the **next** impact
 * and leave the one already in the air alone, exactly as they would in an engine. Everything the
 * shader reads is a uniform and lands on the frame it is dragged.
 *
 * "Copy JSON" exports the config in the same shape as `watersplash-vfx.json`.
 */

import { Group, Plane, Raycaster, Vector2, Vector3 } from "three";
import { WaterSplashVfx } from "../../vfx/effects/watersplash";
import rawWaterSplashConfig from "../../vfx/effects/watersplash/watersplash-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";
import { WaterSurface } from "../WaterSurface";

export function createWaterSplashLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const surface = new WaterSurface();
    const splash = new WaterSplashVfx(rawWaterSplashConfig);
    splash.object3d.position.y = surface.level;

    // Siblings, not parent and child: the surface mesh already sits at the water level, and
    // parenting it under the effect would stack the two offsets and lift the splash off the water.
    const group = new Group();
    group.name = "lab:watersplash";
    group.add(surface.mesh, splash.object3d);

    // The volcanic set is the wrong light for open water. Dim it rather than replace it, and hand
    // the lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.07;
    const restoreGlint = surface.glint;
    surface.glint = 0.35;

    const cfg = splash.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => splash.applyConfig();

    // Lab-side only: the effect's own `scale` option, on a slider, so one config can be judged at
    // the range of impact sizes a game would actually call it with.
    let impactScale = 1;
    const impact = new Vector3();
    const fire = (x = 0, z = 0) => splash.emit(impact.set(x, surface.level, z), { scale: impactScale });

    // ---- Click to splash -----------------------------------------------------------------------
    // A pointer-up that did not travel is a click; anything further was an orbit drag, and firing
    // a splash at the end of every camera move would make the lab unusable.
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
        // The ray is in world space and the effect's group is only translated, so the hit's x/z
        // are already the local ones the effect wants.
        if (raycaster.ray.intersectPlane(surfacePlane, hit)) fire(hit.x, hit.z);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    // ---- Auto-repeat ---------------------------------------------------------------------------
    // Lab-side on purpose: scheduling impacts is the game's job, and nothing in src/vfx should
    // grow a timer just so the lab can replay an event.
    let autoEnabled = false;
    let autoPeriod = 1.6;
    let autoTimer = 0;

    return {
        object3d: group,
        debug: { splash, surface, config: cfg, fire },

        update(dt: number) {
            surface.update(dt);
            if (autoEnabled && autoPeriod > 0 && dt > 0) {
                autoTimer -= Math.min(dt, 0.1);
                if (autoTimer <= 0) {
                    autoTimer = autoPeriod;
                    fire();
                }
            }
            splash.update(dt);
        },

        statsLine() {
            return (
                `<span>sheets</span> ${splash.sheetCount} <span>·</span> ` +
                `<span>drops</span> ${splash.droplets.activeCount} <span>·</span> ` +
                `<span>rings</span> ${splash.ripples.activeCount} <span>·</span> ` +
                `<span>draw calls</span> 3`
            );
        },

        dispose() {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
            ctx.environment.glow = restoreGlow;
            surface.glint = restoreGlint;
            splash.dispose();
            surface.dispose();
            group.removeFromParent();
            group.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Trigger -------------------------------------------------------------------
            const trigger = panel.folder("Impact");
            trigger.buttons(
                { label: "Splash", onClick: () => fire(), primary: true },
                { label: "Stop", onClick: () => splash.stop() },
                { label: "Start", onClick: () => splash.start() },
                { label: "Reset", onClick: () => splash.reset() },
            );
            trigger.slider("Impact scale", { min: 0.2, max: 3, step: 0.05 }, () => impactScale, (v) => (impactScale = v));
            trigger.toggle("Auto repeat", () => autoEnabled, (v) => {
                autoEnabled = v;
                autoTimer = 0;
            });
            trigger.slider("Repeat every s", { min: 0.3, max: 6, step: 0.1 }, () => autoPeriod, (v) => (autoPeriod = v));
            trigger.note("Click the water to splash there. Impact scale is the effect's own `scale` option — one config, many sizes.");

            // ---- Main splash ---------------------------------------------------------------
            const main = panel.folder("Main splash");
            main.toggle(
                "Enabled",
                () => splash.enabled,
                (v) => {
                    splash.enabled = v;
                    apply();
                },
            );
            main.slider("Height", { min: 0.05, max: 4, step: 0.01 }, () => cfg.splashHeight, (v) => (cfg.splashHeight = v));
            main.slider("Width", { min: 0.05, max: 2, step: 0.01 }, () => cfg.splashWidth, (v) => (cfg.splashWidth = v));
            main.slider("Intensity", { min: 0, max: 3, step: 0.05 }, () => cfg.splashIntensity, (v) => (cfg.splashIntensity = v));
            main.slider("Duration s", { min: 0.1, max: 3, step: 0.01 }, () => cfg.splashDuration, (v) => (cfg.splashDuration = v));
            main.slider("Shape variation", { min: 0, max: 1, step: 0.01 }, () => cfg.shapeVariation, (v) => (cfg.shapeVariation = v));
            main.note("Intensity also decides how many streams the crown is made of. Shape variation at 0 gives an even, obviously fake crown.");

            // ---- Appearance ----------------------------------------------------------------
            const look = panel.folder("Appearance", false);
            look.color("Water colour", () => cfg.waterColor, (v) => {
                cfg.waterColor = v;
                apply();
            });
            look.slider("Highlight", { min: 0, max: 2, step: 0.01 }, () => cfg.highlightIntensity, (v) => {
                cfg.highlightIntensity = v;
                apply();
            });
            look.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.opacity, (v) => {
                cfg.opacity = v;
                apply();
            });
            look.slider("Surface offset", { min: -0.1, max: 0.3, step: 0.002 }, () => cfg.surfaceOffset, (v) => {
                cfg.surfaceOffset = v;
                apply();
            });
            look.note("Highlights push the water colour toward white — foam is water full of air, not a second hue.");

            // ---- Droplets ------------------------------------------------------------------
            const drops = panel.folder("Droplets", false);
            drops.slider("Count", { min: 0, max: 80, step: 1 }, () => cfg.dropletCount, (v) => (cfg.dropletCount = v));
            drops.slider("Size", { min: 0.005, max: 0.15, step: 0.001 }, () => cfg.dropletSize, (v) => (cfg.dropletSize = v));
            drops.slider("Size variation", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletSizeVariation, (v) => (cfg.dropletSizeVariation = v));
            drops.slider("Spread radius", { min: 0.02, max: 2, step: 0.01 }, () => cfg.spreadRadius, (v) => (cfg.spreadRadius = v));
            drops.slider("Launch velocity", { min: 0.2, max: 12, step: 0.05 }, () => cfg.launchVelocity, (v) => (cfg.launchVelocity = v));
            drops.slider("Gravity", { min: -30, max: -0.5, step: 0.1 }, () => cfg.gravity, (v) => (cfg.gravity = v));
            drops.slider("Lifetime s", { min: 0.1, max: 4, step: 0.05 }, () => cfg.dropletLifetime, (v) => (cfg.dropletLifetime = v));
            drops.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletOpacity, (v) => {
                cfg.dropletOpacity = v;
                apply();
            });
            drops.readout("Pool", () => `${splash.droplets.activeCount} / ${splash.droplets.capacity}`);
            drops.note("Count is per impact, before intensity scales it. The pool is allocated from the JSON at load, so the slider can only cap below it. Most droplets die on hitting the water, not on their lifetime.");

            // ---- Ripples -------------------------------------------------------------------
            const ripple = panel.folder("Ripples", false);
            ripple.toggle(
                "Enabled",
                () => cfg.rippleEnabled,
                (v) => {
                    cfg.rippleEnabled = v;
                    apply();
                },
            );
            ripple.slider("Rings", { min: 0, max: 8, step: 1 }, () => cfg.rippleCount, (v) => (cfg.rippleCount = v));
            ripple.slider("Speed", { min: 0.05, max: 6, step: 0.05 }, () => cfg.rippleSpeed, (v) => (cfg.rippleSpeed = v));
            ripple.slider("Width", { min: 0.005, max: 0.4, step: 0.005 }, () => cfg.rippleWidth, (v) => (cfg.rippleWidth = v));
            ripple.slider("Opacity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.rippleOpacity, (v) => {
                cfg.rippleOpacity = v;
                apply();
            });
            ripple.slider("Duration s", { min: 0.2, max: 6, step: 0.05 }, () => cfg.rippleDuration, (v) => (cfg.rippleDuration = v));
            ripple.note("Speed and duration together set how far a ring reaches. Rings take their colour from the water colour.");

            // ---- Secondary -----------------------------------------------------------------
            const second = panel.folder("Secondary splashes", false);
            second.toggle("Enabled", () => cfg.secondarySplashEnabled, (v) => (cfg.secondarySplashEnabled = v));
            second.slider("Intensity", { min: 0, max: 1, step: 0.01 }, () => cfg.secondarySplashIntensity, (v) => (cfg.secondarySplashIntensity = v));
            second.note("Fired by droplets falling back in, weighted by how heavy each one was. Secondary droplets never splash again.");

            // ---- Scene ---------------------------------------------------------------------
            const scene = panel.folder("Scene", false);
            scene.slider("Water glint", { min: 0, max: 1.5, step: 0.01 }, () => surface.glint, (v) => (surface.glint = v));
            scene.note("Preview water only — not part of the effect.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/watersplash/watersplash-vfx.json to keep a tuning session.");
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
    a.download = "watersplash-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
