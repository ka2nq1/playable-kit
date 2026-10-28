/**
 * Lab wrapper for {@link LavaImpactVfx}: a lava surface to hit, a repeatable trigger and the live
 * knobs.
 *
 * An impact is an event with a very short life, so the tuning loop is "fire it, watch it, change a
 * number, fire it again" — which is why the trigger is the first control in the panel and why the
 * auto trigger exists. Pause and the time-scale slider in the Lab folder are the other half of it:
 * the flash, the splash and the break-up all happen inside a second, and the only way to judge the
 * break-up is to slow it down or step into it.
 *
 * The preview ground is the lab's own {@link LavaSurfaceVfx}, because the failure mode of a molten
 * effect is looking right over black and disappearing over lava. It is set dressing — none of its
 * knobs are part of this effect, and the only one exposed here is its glow, which is what the
 * splash has to stay readable against.
 *
 * Sliders write straight into `vfx.config`, so size and timing changes land on the **next** impact
 * and leave the one already in the air alone, exactly as they would in an engine. Everything the
 * shader reads is a uniform and lands on the frame it is dragged.
 *
 * "Copy JSON" exports the config in the same shape as `lavaimpact-vfx.json`.
 */

import { Group, Plane, Raycaster, Vector2, Vector3 } from "three";
import { LavaImpactVfx } from "../../vfx/effects/lavaimpact";
import rawLavaImpactConfig from "../../vfx/effects/lavaimpact/lavaimpact-vfx.json";
import { LavaSurfaceVfx } from "../../vfx/effects/lavasurface";
import rawLavaSurfaceConfig from "../../vfx/effects/lavasurface/lavasurface-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/** Height of the preview lava plane. The effect's own `surfaceOffset` lifts the glow off it. */
const SURFACE_Y = 0;

export function createLavaImpactLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const surface = new LavaSurfaceVfx(rawLavaSurfaceConfig);
    const impact = new LavaImpactVfx(rawLavaImpactConfig);
    impact.object3d.position.y = SURFACE_Y;

    // Siblings, not parent and child: the surface already sits at the lava level, and parenting it
    // under the effect would stack the two offsets.
    const group = new Group();
    group.name = "lab:lavaimpact";
    group.add(surface.object3d, impact.object3d);

    // The set's basalt disc sits at y=0 too, so leaving it on is a z-fight across the whole floor.
    // Hide it and hand the lab back exactly what it had when this effect goes away.
    const restoreTerrain = ctx.environment.terrainVisible;
    ctx.environment.terrainVisible = false;

    const cfg = impact.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => impact.applyConfig();

    const point = new Vector3();
    const fire = (x = 0, z = 0) => impact.emit(point.set(x, SURFACE_Y, z));

    // ---- Click to impact -------------------------------------------------------------------
    // A pointer-up that did not travel is a click; anything further was an orbit drag, and firing
    // an impact at the end of every camera move would make the lab unusable.
    const canvas = ctx.app.renderer.domElement;
    const raycaster = new Raycaster();
    const surfacePlane = new Plane(new Vector3(0, 1, 0), -SURFACE_Y);
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

    // ---- Auto trigger ----------------------------------------------------------------------
    // Lab-side on purpose: scheduling impacts is the game's job, and nothing in src/vfx should
    // grow a timer just so the lab can replay an event.
    let autoEnabled = false;
    let autoPeriod = 1.6;
    let autoTimer = 0;

    return {
        object3d: group,
        debug: { impact, surface, config: cfg, fire },

        update(dt: number) {
            surface.update(dt);
            if (autoEnabled && autoPeriod > 0 && dt > 0) {
                autoTimer -= Math.min(dt, 0.1);
                if (autoTimer <= 0) {
                    autoTimer = autoPeriod;
                    fire();
                }
            }
            impact.update(dt);
        },

        statsLine() {
            return (
                `<span>tongues</span> ${impact.tongueCount} <span>·</span> ` +
                `<span>drops</span> ${impact.droplets.activeCount} <span>·</span> ` +
                `<span>glow</span> ${impact.glow.activeCount} <span>·</span> ` +
                `<span>draw calls</span> 3 <span>+1 surface</span>`
            );
        },

        dispose() {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
            ctx.environment.terrainVisible = restoreTerrain;
            impact.dispose();
            surface.dispose();
            group.removeFromParent();
            group.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Trigger -------------------------------------------------------------------
            const trigger = panel.folder("Impact");
            trigger.buttons(
                { label: "Impact", onClick: () => fire(), primary: true },
                { label: "Stop", onClick: () => impact.stop() },
                { label: "Start", onClick: () => impact.start() },
                { label: "Reset", onClick: () => impact.reset() },
            );
            trigger.toggle("Enabled", () => impact.enabled, (v) => (impact.enabled = v));
            trigger.slider("Impact scale", { min: 0.1, max: 4, step: 0.05 }, () => cfg.impactScale, (v) => (cfg.impactScale = v));
            trigger.slider("Intensity", { min: 0, max: 3, step: 0.05 }, () => cfg.impactIntensity, (v) => (cfg.impactIntensity = v));
            trigger.slider("Impact radius", { min: 0.05, max: 3, step: 0.01 }, () => cfg.impactRadius, (v) => (cfg.impactRadius = v));
            trigger.slider("Flash intensity", { min: 0, max: 4, step: 0.05 }, () => cfg.impactFlashIntensity, (v) => (cfg.impactFlashIntensity = v));
            trigger.slider("Flash duration s", { min: 0.02, max: 1, step: 0.01 }, () => cfg.impactFlashDuration, (v) => (cfg.impactFlashDuration = v));
            trigger.slider("Surface glow", { min: 0, max: 4, step: 0.05 }, () => cfg.surfaceGlowIntensity, (v) => (cfg.surfaceGlowIntensity = v));
            trigger.slider("Glow duration s", { min: 0.05, max: 4, step: 0.05 }, () => cfg.surfaceGlowDuration, (v) => (cfg.surfaceGlowDuration = v));
            trigger.slider("Surface offset", { min: -0.1, max: 0.3, step: 0.002 }, () => cfg.surfaceOffset, (v) => {
                cfg.surfaceOffset = v;
                apply();
            });
            trigger.note("Click the lava to hit it there. Intensity decides how many tongues and droplets the burst is made of, so it is the one knob for a harder hit.");

            // ---- Playback ------------------------------------------------------------------
            const playback = panel.folder("Playback");
            playback.toggle("Auto trigger", () => autoEnabled, (v) => {
                autoEnabled = v;
                autoTimer = 0;
            });
            playback.slider("Trigger every s", { min: 0.3, max: 6, step: 0.1 }, () => autoPeriod, (v) => (autoPeriod = v));
            playback.note("Preview only — the lab schedules the repeats, not the effect. The whole burst is under two seconds, so use the Lab folder's time scale and frame step to judge the break-up.");

            // ---- Splash shape --------------------------------------------------------------
            const splash = panel.folder("Splash shape");
            splash.slider("Height", { min: 0.05, max: 4, step: 0.01 }, () => cfg.splashHeight, (v) => (cfg.splashHeight = v));
            splash.slider("Width", { min: 0.02, max: 1.5, step: 0.01 }, () => cfg.splashWidth, (v) => (cfg.splashWidth = v));
            splash.slider("Spread", { min: 0, max: 3, step: 0.01 }, () => cfg.splashSpread, (v) => (cfg.splashSpread = v));
            splash.slider("Duration s", { min: 0.1, max: 3, step: 0.01 }, () => cfg.splashDuration, (v) => (cfg.splashDuration = v));
            splash.slider("Tongue count", { min: 0, max: 16, step: 1 }, () => cfg.splashTongueCount, (v) => (cfg.splashTongueCount = v));
            splash.slider("Shape variation", { min: 0, max: 1, step: 0.01 }, () => cfg.splashShapeVariation, (v) => (cfg.splashShapeVariation = v));
            splash.slider("Taper", { min: 0.2, max: 4, step: 0.05 }, () => cfg.splashTaper, (v) => (cfg.splashTaper = v));
            splash.slider("Curvature", { min: 0, max: 1, step: 0.01 }, () => cfg.splashCurvature, (v) => (cfg.splashCurvature = v));
            splash.note("Width is the thickness of one ribbon; Spread is how far they lean out. Shape variation at 0 gives an even starburst — the one shape thrown lava never makes.");

            // ---- Droplets ------------------------------------------------------------------
            const drops = panel.folder("Droplets", false);
            drops.slider("Count", { min: 0, max: 120, step: 1 }, () => cfg.dropletCount, (v) => (cfg.dropletCount = v));
            drops.slider("Size min", { min: 0.004, max: 0.2, step: 0.001 }, () => cfg.dropletSizeMin, (v) => (cfg.dropletSizeMin = v));
            drops.slider("Size max", { min: 0.004, max: 0.3, step: 0.001 }, () => cfg.dropletSizeMax, (v) => (cfg.dropletSizeMax = v));
            drops.slider("Speed", { min: 0.2, max: 12, step: 0.05 }, () => cfg.dropletSpeed, (v) => (cfg.dropletSpeed = v));
            drops.slider("Speed variation", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletSpeedVariation, (v) => (cfg.dropletSpeedVariation = v));
            drops.slider("Spread", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletSpread, (v) => (cfg.dropletSpread = v));
            drops.slider("Upward force", { min: 0, max: 12, step: 0.05 }, () => cfg.dropletUpwardForce, (v) => (cfg.dropletUpwardForce = v));
            drops.slider("Gravity", { min: -30, max: -0.5, step: 0.1 }, () => cfg.gravity, (v) => (cfg.gravity = v));
            drops.slider("Lifetime s", { min: 0.1, max: 4, step: 0.05 }, () => cfg.dropletLifetime, (v) => (cfg.dropletLifetime = v));
            drops.slider("Lifetime variation", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletLifetimeVariation, (v) => (cfg.dropletLifetimeVariation = v));
            drops.slider("Streak amount", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletStreakAmount, (v) => (cfg.dropletStreakAmount = v));
            drops.readout("Pool", () => `${impact.droplets.activeCount} / ${impact.droplets.capacity}`);
            drops.note("Count is per impact, before intensity scales it. The pool is allocated from the JSON at load, so the slider can only cap below it. Most droplets die on falling back into the lava, not on their lifetime.");

            // ---- Appearance ----------------------------------------------------------------
            const look = panel.folder("Appearance", false);
            look.color("Hot colour", () => cfg.hotColor, (v) => {
                cfg.hotColor = v;
                apply();
            });
            look.color("Lava colour", () => cfg.lavaColor, (v) => {
                cfg.lavaColor = v;
                apply();
            });
            look.color("Cool colour", () => cfg.coolColor, (v) => {
                cfg.coolColor = v;
                apply();
            });
            look.slider("Emissive", { min: 0, max: 3, step: 0.01 }, () => cfg.emissiveIntensity, (v) => {
                cfg.emissiveIntensity = v;
                apply();
            });
            look.slider("Droplet glow", { min: 0, max: 3, step: 0.01 }, () => cfg.dropletGlowIntensity, (v) => (cfg.dropletGlowIntensity = v));
            look.slider("Splash opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.splashOpacity, (v) => {
                cfg.splashOpacity = v;
                apply();
            });
            look.slider("Droplet opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.dropletOpacity, (v) => {
                cfg.dropletOpacity = v;
                apply();
            });
            look.slider("Cooling", { min: 0, max: 1, step: 0.01 }, () => cfg.coolingIntensity, (v) => {
                cfg.coolingIntensity = v;
                apply();
            });
            look.slider("Edge variation", { min: 0, max: 1, step: 0.01 }, () => cfg.edgeVariation, (v) => {
                cfg.edgeVariation = v;
                apply();
            });
            look.note("Hot is the core, Lava the body, Cool what everything fades through. Cooling at 0 means nothing ever goes dark — the burst then reads as plastic.");

            // ---- Variation -----------------------------------------------------------------
            const variation = panel.folder("Variation", false);
            variation.slider("Randomness", { min: 0, max: 1, step: 0.01 }, () => cfg.randomness, (v) => (cfg.randomness = v));
            variation.slider("Secondary droplets", { min: 0, max: 60, step: 1 }, () => cfg.secondaryDropletCount, (v) => (cfg.secondaryDropletCount = v));
            variation.slider("Secondary delay s", { min: 0, max: 1.5, step: 0.01 }, () => cfg.secondaryBurstDelay, (v) => (cfg.secondaryBurstDelay = v));
            variation.note("Randomness is how far one trigger differs from the next; Shape variation is how far the tongues inside one trigger differ from each other.");

            // ---- Scene ---------------------------------------------------------------------
            const scene = panel.folder("Scene", false);
            scene.slider("Lava glow", { min: 0, max: 3, step: 0.01 }, () => surface.config.glowIntensity, (v) => {
                surface.config.glowIntensity = v;
                surface.applyConfig();
            });
            scene.note("Preview lava surface only — not part of the effect. Turn it down to check the burst still reads against a cold floor.");

            // ---- Export --------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(cfg), primary: true },
                { label: "Download", onClick: () => downloadConfig(cfg) },
            );
            out.note("Paste over src/vfx/effects/lavaimpact/lavaimpact-vfx.json to keep a tuning session.");
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
    a.download = "lavaimpact-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
