/**
 * Lab wrapper for {@link SwampBubblesVfx}: the preview swamp to bubble through, and the live knobs.
 *
 * The tuning loop here is slower than the other effects', because the subject is a lifecycle rather
 * than a stream: you watch one bubble form, hold and tear, change a number, and watch the next one.
 * The two controls that exist only in the lab — "Pop one" and clicking the water — are there for
 * exactly that, so you do not have to wait out a spawn interval to judge a pop.
 *
 * Sliders write straight into `vfx.config`, so size and timing changes land on the **next** bubble
 * and leave the ones already swelling alone, exactly as they would in an engine. Everything the
 * shader reads is a uniform and lands on the frame it is dragged.
 *
 * "Copy JSON" exports the config in the same shape as `swampbubbles-vfx.json`.
 */

import { Group, Plane, Raycaster, Vector2, Vector3 } from "three";
import { SwampBubblesVfx } from "../../vfx/effects/swampbubbles";
import rawSwampBubblesConfig from "../../vfx/effects/swampbubbles/swampbubbles-vfx.json";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";
import { WaterSurface } from "../WaterSurface";

export function createSwampBubblesLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const surface = new WaterSurface();
    const bubbles = new SwampBubblesVfx(rawSwampBubblesConfig);
    bubbles.object3d.position.y = surface.level;

    // Siblings, not parent and child: the surface mesh already sits at the water level, and
    // parenting it under the effect would stack the two offsets and lift the bubbles off the water.
    const group = new Group();
    group.name = "lab:swampbubbles";
    group.add(surface.mesh, bubbles.object3d);

    // The volcanic set is the wrong light for a stagnant pool. Dim it rather than replace it, and
    // hand the lab back exactly what it had when this effect goes away.
    const restoreGlow = ctx.environment.glow;
    ctx.environment.glow = 0.06;
    const restoreGlint = surface.glint;
    // A quieter surface than the ripple effect wants: the domes are the only bright thing here.
    surface.glint = 0.3;

    const cfg = bubbles.config;
    // Every knob goes through here, so there is exactly one place the config reaches the GPU.
    const apply = () => bubbles.applyConfig();

    // ---- Click to spawn ------------------------------------------------------------------------
    // A pointer-up that did not travel is a click; anything further was an orbit drag, and dropping
    // a bubble at the end of every camera move would make the lab unusable.
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
        if (raycaster.ray.intersectPlane(surfacePlane, hit)) bubbles.burst(hit);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    return {
        object3d: group,
        debug: {
            bubbles,
            surface,
            config: cfg,
            spawn: (x = 0, z = 0) => bubbles.burst(hit.set(x, surface.level, z)),
        },

        update(dt: number) {
            surface.update(dt);
            bubbles.update(dt);
        },

        statsLine() {
            return (
                `<span>bubbles</span> ${bubbles.activeCount} <span>·</span> ` +
                `<span>rings</span> ${bubbles.ripples.activeCount} <span>·</span> ` +
                `<span>drops</span> ${bubbles.splash.activeCount} <span>·</span> ` +
                `<span>draw calls</span> 3`
            );
        },

        dispose() {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
            ctx.environment.glow = restoreGlow;
            surface.glint = restoreGlint;
            bubbles.dispose();
            surface.dispose();
            group.removeFromParent();
            group.clear();
        },

        buildControls(panel: ControlPanel) {
            // ---- Bubbles -------------------------------------------------------------------
            const main = panel.folder("Swamp bubbles");
            main.toggle(
                "Enabled",
                () => bubbles.enabled,
                (v) => {
                    bubbles.enabled = v;
                    apply();
                },
            );
            main.slider("Max bubbles", { min: 1, max: bubbles.capacity, step: 1 }, () => cfg.bubbleCount, (v) => {
                cfg.bubbleCount = v;
                apply();
            });
            main.slider("Spawn rate /s", { min: 0, max: 12, step: 0.05 }, () => cfg.spawnRate, (v) => (cfg.spawnRate = v));
            main.slider("Activity variation", { min: 0, max: 1, step: 0.01 }, () => cfg.activityVariation, (v) => (cfg.activityVariation = v));
            main.slider("Spawn area", { min: 0.5, max: 24, step: 0.1 }, () => cfg.spawnAreaSize, (v) => (cfg.spawnAreaSize = v));
            main.buttons(
                { label: "Pop one", onClick: () => bubbles.burst(), primary: true },
                { label: "Start", onClick: () => bubbles.start() },
                { label: "Stop", onClick: () => bubbles.stop() },
                { label: "Reset", onClick: () => bubbles.reset() },
            );
            main.note("Click the water to raise a bubble there. Stop ends spawning; the ones already up still pop.");

            // ---- Size ----------------------------------------------------------------------
            const size = panel.folder("Size", false);
            size.slider("Min size", { min: 0.005, max: 0.4, step: 0.005 }, () => cfg.minBubbleSize, (v) => (cfg.minBubbleSize = v));
            size.slider("Max size", { min: 0.005, max: 0.4, step: 0.005 }, () => cfg.maxBubbleSize, (v) => (cfg.maxBubbleSize = v));
            size.slider("Size bias", { min: 0.5, max: 6, step: 0.05 }, () => cfg.sizeBias, (v) => (cfg.sizeBias = v));
            size.slider("Cluster chance", { min: 0, max: 1, step: 0.01 }, () => cfg.clusterChance, (v) => (cfg.clusterChance = v));
            size.range("Cluster size", { min: 1, max: 8, step: 1 }, () => cfg.clusterSize, (v) => (cfg.clusterSize = v));
            size.note("Size bias above 1 keeps big bubbles rare. At 1 every size is equally likely.");

            // ---- Timing --------------------------------------------------------------------
            const timing = panel.folder("Timing", false);
            timing.slider("Growth speed", { min: 0.1, max: 8, step: 0.05 }, () => cfg.growthSpeed, (v) => (cfg.growthSpeed = v));
            timing.slider("Min lifetime s", { min: 0, max: 8, step: 0.05 }, () => cfg.minLifetime, (v) => (cfg.minLifetime = v));
            timing.slider("Max lifetime s", { min: 0, max: 8, step: 0.05 }, () => cfg.maxLifetime, (v) => (cfg.maxLifetime = v));
            timing.slider("Pop speed", { min: 1, max: 40, step: 0.5 }, () => cfg.popSpeed, (v) => (cfg.popSpeed = v));
            timing.note("Speeds are inverse seconds. Lifetime is the held moment, after the swell and before the tear.");

            // ---- Appearance ----------------------------------------------------------------
            const look = panel.folder("Appearance", false);
            look.color("Bubble colour", () => cfg.bubbleColor, (v) => (cfg.bubbleColor = v));
            look.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cfg.bubbleOpacity, (v) => {
                cfg.bubbleOpacity = v;
                apply();
            });
            look.slider("Highlight", { min: 0, max: 2, step: 0.01 }, () => cfg.highlightIntensity, (v) => {
                cfg.highlightIntensity = v;
                apply();
            });
            look.slider("Emergence", { min: 0, max: 1, step: 0.01 }, () => cfg.emergence, (v) => (cfg.emergence = v));
            look.slider("Surface offset", { min: -0.1, max: 0.3, step: 0.002 }, () => cfg.surfaceOffset, (v) => {
                cfg.surfaceOffset = v;
                apply();
            });
            look.note("Emergence 0.5 is a hemisphere; above it the waterline cuts below the sphere's equator.");

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
            ripple.slider("Speed", { min: 0.05, max: 4, step: 0.01 }, () => cfg.rippleSpeed, (v) => (cfg.rippleSpeed = v));
            ripple.slider("Opacity", { min: 0, max: 1.5, step: 0.01 }, () => cfg.rippleOpacity, (v) => {
                cfg.rippleOpacity = v;
                apply();
            });
            ripple.slider("Radius × bubble", { min: 1, max: 20, step: 0.1 }, () => cfg.rippleRadiusScale, (v) => (cfg.rippleRadiusScale = v));
            ripple.slider("Width", { min: 0.005, max: 0.2, step: 0.002 }, () => cfg.rippleWidth, (v) => (cfg.rippleWidth = v));
            ripple.color("Colour", () => cfg.rippleColor, (v) => {
                cfg.rippleColor = v;
                apply();
            });

            // ---- Splash --------------------------------------------------------------------
            const splash = panel.folder("Splash", false);
            splash.toggle(
                "Enabled",
                () => cfg.splashEnabled,
                (v) => {
                    cfg.splashEnabled = v;
                    apply();
                },
            );
            splash.slider("Probability", { min: 0, max: 1, step: 0.01 }, () => cfg.splashProbability, (v) => (cfg.splashProbability = v));
            splash.range("Droplets", { min: 0, max: 16, step: 1 }, () => cfg.splashCount, (v) => (cfg.splashCount = v));
            splash.range("Speed", { min: 0, max: 4, step: 0.05 }, () => cfg.splashSpeed, (v) => (cfg.splashSpeed = v));
            splash.range("Size", { min: 0.002, max: 0.08, step: 0.002 }, () => cfg.splashSize, (v) => (cfg.splashSize = v));
            splash.slider("Gravity", { min: -30, max: 0, step: 0.1 }, () => cfg.splashGravity, (v) => (cfg.splashGravity = v));
            splash.colorPair("Colour", () => cfg.splashColor, (v) => (cfg.splashColor = v));
            splash.note("Probability is the chance at the top of the size band; small bubbles always pop quietly.");

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
            out.note("Paste over src/vfx/effects/swampbubbles/swampbubbles-vfx.json to keep a tuning session.");
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
    a.download = "swampbubbles-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}
