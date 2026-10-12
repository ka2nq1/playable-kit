/**
 * Lab wrapper for {@link SkyVfx}: the control surface over a ~90-field sky.
 *
 * Three things are worth knowing before you start turning knobs:
 *
 *  - **The clock owns the sun.** While `Drive from time` is on, the azimuth and elevation sliders
 *    are read-outs — the system recomputes them from `Time of day` every frame and writes them
 *    back into the config, so dragging one snaps straight back. Turn the toggle off to place the
 *    sun by hand. Sunrise is 06:00, sunset 18:00.
 *  - **Judge a sky by looking up.** The lab's default framing points slightly *down*, because
 *    every other effect here is something you stand over. This effect borrows the camera on
 *    create, re-frames it at the horizon and hands it back on dispose; the View buttons snap
 *    between the three things worth inspecting.
 *  - **Lighting and fog sync are live and reversible.** With them on, the sky is driving the
 *    rig's directional light and the scene's fog. Turn them off and both snap back to what they
 *    were — that is the same guarantee a game integrating this gets.
 */

import { Vector3 } from "three";
import {
    CLOUD_TYPES,
    FOG_TYPES,
    SKY_PRESET_IDS,
    SKY_QUALITIES,
    SkyVfx,
    TRANSITION_EASINGS,
    WEATHER_TYPES,
    importSkyConfig,
    skyPresetLabel,
    type CloudType,
    type FogType,
    type SkyQuality,
    type TransitionEasing,
    type WeatherType,
} from "../../vfx/effects/sky";
import rawSkyConfig from "../../vfx/effects/sky/sky-vfx.json";
import { SkyPreviewRig } from "../SkyPreviewRig";
import {
    customPresetLabel,
    deleteCustomPreset,
    listCustomPresets,
    loadCustomPreset,
    renameCustomPreset,
    saveCustomPreset,
    slugify,
} from "../skyPresetStore";
import type { LabEffectContext, LabEffectHandle } from "../registry";
import type { ControlPanel } from "../ui/ControlPanel";

/**
 * Far plane while this effect is loaded.
 *
 * The rig's ground disc is 900 m across so its rim sits past any fog distance the presets use.
 * The lab's default far plane is 400, which would slice it into a visible circle. Borrowed and
 * restored like everything else here.
 */
const SKY_CAMERA_FAR = 1600;

export function createSkyLabEffect(ctx: LabEffectContext): LabEffectHandle {
    const rig = new SkyPreviewRig();
    ctx.app.scene.add(rig.group);

    // The sky drives these two lights and the scene's fog — by reference, never by replacement.
    const sky = new SkyVfx(rawSkyConfig, {
        scene: ctx.app.scene,
        directionalLight: rig.sun,
        ambientLight: rig.ambient,
    });
    const cfg = sky.config;

    // ---- Borrowed host state, all of it handed back in dispose ---------------------------------
    const restoreTerrain = ctx.environment.terrainVisible;
    const restoreGlow = ctx.environment.glow;
    ctx.environment.terrainVisible = false;
    // Zeroing glow is enough to neutralise the volcanic set: it kills the orange vent light and
    // drops the warm ambient to a quarter of an already near-black colour. No change to
    // Environment.ts is needed to get a clean backdrop.
    ctx.environment.glow = 0;

    const controls = ctx.app.controls;
    const camera = ctx.app.camera;
    const restoreTarget = controls.target.clone();
    const restorePolar = controls.maxPolarAngle;
    const restoreMaxDistance = controls.maxDistance;
    const restoreCameraPos = camera.position.clone();
    const restoreFar = camera.far;

    camera.far = SKY_CAMERA_FAR;
    camera.updateProjectionMatrix();
    // Past 90 degrees the camera can drop below its target, which is the only way to tilt the
    // view up. Without this the sky is a sliver along the top of the frame.
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.maxDistance = 220;

    const tmpTarget = new Vector3();

    function frameHorizon(): void {
        camera.position.set(0, 3.4, 26);
        controls.target.set(0, 5.5, 0);
        controls.update();
    }

    function frameZenith(): void {
        camera.position.set(0, 2.2, 7);
        controls.target.set(0, 30, 0);
        controls.update();
    }

    function frameSun(): void {
        // Look along the sun direction from where the camera already is, so this reads as turning
        // your head rather than teleporting.
        const dir = sky.config.sun.enabled ? sunDirection() : moonDirection();
        tmpTarget.copy(camera.position).addScaledVector(dir, 60);
        controls.target.copy(tmpTarget);
        controls.update();
    }

    function sunDirection(): Vector3 {
        return angleToVector(cfg.sun.azimuth, cfg.sun.elevation);
    }

    function moonDirection(): Vector3 {
        return angleToVector(cfg.moon.azimuth, cfg.moon.elevation);
    }

    const dirScratch = new Vector3();
    function angleToVector(azimuth: number, elevation: number): Vector3 {
        const el = (elevation * Math.PI) / 180;
        const az = (azimuth * Math.PI) / 180;
        const c = Math.cos(el);
        return dirScratch.set(Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c).normalize();
    }

    frameHorizon();

    // ---- Preset plumbing -------------------------------------------------------------------
    let presetId: string = cfg.id;
    let customIds = listCustomPresets();

    function allPresetIds(): string[] {
        return [...SKY_PRESET_IDS, ...customIds];
    }

    function presetLabelOf(id: string): string {
        return SKY_PRESET_IDS.includes(id) ? skyPresetLabel(id) : customPresetLabel(id);
    }

    function applyPreset(id: string, transition: boolean, panel: ControlPanel): void {
        presetId = id;
        if (SKY_PRESET_IDS.includes(id)) {
            if (transition) sky.transitionToPreset(id);
            else sky.loadPreset(id);
        } else {
            const stored = loadCustomPreset(id);
            if (!stored) return;
            // Custom presets load instantly: a stored config is a full snapshot rather than a
            // partial, and transitioning into one would need the same from/to pair the built-ins
            // get — which `adopt` deliberately does not build, to keep one code path.
            sky.adopt(stored);
        }
        panel.refresh();
    }

    return {
        object3d: sky.object3d,
        debug: { sky, rig, config: cfg },

        update(dt: number) {
            sky.update(dt);
        },

        statsLine() {
            const t = sky.transitioning ? ` <span>·</span> <span>fade</span> ${(sky.transitionProgress * 100).toFixed(0)}%` : "";
            const weather = cfg.weather.type === "clear" ? "clear" : `${cfg.weather.type} ${sky.precipitation.activeCount}`;
            return `<span>${cfg.time.timeOfDay.toFixed(1)}h</span> <span>·</span> <span>${weather}</span> <span>·</span> <span>${cfg.quality}</span>${t}`;
        },

        dispose() {
            // Everything borrowed, in the order it was taken. The sky's own dispose puts the
            // scene's fog and the rig's lights back before the rig itself goes away.
            sky.dispose();
            rig.dispose();
            ctx.environment.terrainVisible = restoreTerrain;
            ctx.environment.glow = restoreGlow;
            controls.target.copy(restoreTarget);
            controls.maxPolarAngle = restorePolar;
            controls.maxDistance = restoreMaxDistance;
            camera.position.copy(restoreCameraPos);
            camera.far = restoreFar;
            camera.updateProjectionMatrix();
            controls.update();
        },

        buildControls(panel: ControlPanel) {
            // ---- Main -------------------------------------------------------------------------
            const main = panel.folder("Sky & atmosphere");
            main.toggle("Enabled", () => sky.enabled, (v) => (sky.enabled = v));
            main.select<SkyQuality>("Quality", SKY_QUALITIES, () => cfg.quality, (v) => sky.setQuality(v));
            main.slider("Time of day", { min: 0, max: 24, step: 0.05 }, () => cfg.time.timeOfDay, (v) => sky.setTimeOfDay(v));
            main.readout("Sun", () => `${cfg.sun.elevation.toFixed(1)}° el · ${cfg.sun.azimuth.toFixed(0)}° az`);
            main.buttons(
                { label: "Horizon", onClick: frameHorizon, primary: true },
                { label: "Zenith", onClick: frameZenith },
                { label: "At sun", onClick: frameSun },
            );
            main.note("The View buttons move the lab camera only. It is restored when you switch effects.");

            // ---- Presets ----------------------------------------------------------------------
            const presets = panel.folder("Presets");
            presets.select("Preset", allPresetIds(), () => presetId, (v) => applyPreset(v, false, panel));
            presets.readout("Name", () => presetLabelOf(presetId));
            presets.buttons(
                { label: "Load", onClick: () => applyPreset(presetId, false, panel), primary: true },
                { label: "Transition", onClick: () => applyPreset(presetId, true, panel) },
                { label: "Reset", onClick: () => applyPreset(presetId, false, panel) },
            );
            presets.slider("Fade s", { min: 0, max: 20, step: 0.1 }, () => cfg.transition.duration, (v) => (cfg.transition.duration = v));
            presets.select<TransitionEasing>("Easing", TRANSITION_EASINGS, () => cfg.transition.easing, (v) => (cfg.transition.easing = v));
            presets.readout("Fading", () => (sky.transitioning ? `${(sky.transitionProgress * 100).toFixed(0)}%` : "—"));
            presets.buttons(
                {
                    label: "Save as…",
                    onClick: () => {
                        const name = window.prompt("Name for this preset", presetLabelOf(presetId));
                        if (!name) return;
                        const id = slugify(name);
                        if (SKY_PRESET_IDS.includes(id)) {
                            console.warn(`[vfx-lab] "${id}" is a built-in preset name; pick another`);
                            return;
                        }
                        if (!saveCustomPreset(id, name, sky.exportConfig())) return;
                        customIds = listCustomPresets();
                        presetId = id;
                        // The select's options are built once, so a new entry needs the panel back.
                        ctx.rebuildPanel();
                    },
                    primary: true,
                },
                {
                    label: "Duplicate",
                    onClick: () => {
                        const name = `${presetLabelOf(presetId)} copy`;
                        const id = slugify(name);
                        if (!saveCustomPreset(id, name, sky.exportConfig())) return;
                        customIds = listCustomPresets();
                        presetId = id;
                        ctx.rebuildPanel();
                    },
                },
            );
            presets.buttons(
                {
                    label: "Rename",
                    onClick: () => {
                        if (SKY_PRESET_IDS.includes(presetId)) {
                            console.warn("[vfx-lab] built-in presets cannot be renamed; save a copy first");
                            return;
                        }
                        const name = window.prompt("New name", presetLabelOf(presetId));
                        if (!name) return;
                        renameCustomPreset(presetId, name);
                        customIds = listCustomPresets();
                        ctx.rebuildPanel();
                    },
                },
                {
                    label: "Delete",
                    onClick: () => {
                        if (SKY_PRESET_IDS.includes(presetId)) {
                            console.warn("[vfx-lab] built-in presets cannot be deleted");
                            return;
                        }
                        if (!window.confirm(`Delete "${presetLabelOf(presetId)}"?`)) return;
                        deleteCustomPreset(presetId);
                        customIds = listCustomPresets();
                        presetId = SKY_PRESET_IDS[0];
                        sky.loadPreset(presetId);
                        ctx.rebuildPanel();
                    },
                },
            );
            presets.note(`${SKY_PRESET_IDS.length} built-in · ${customIds.length} custom. Custom presets live in this browser only.`);

            // ---- Sky ---------------------------------------------------------------------------
            const s = cfg.sky;
            const skyF = panel.folder("Sky", false);
            skyF.color("Zenith", () => s.zenithColor, (v) => (s.zenithColor = v));
            skyF.color("Upper sky", () => s.upperSkyColor, (v) => (s.upperSkyColor = v));
            skyF.color("Horizon", () => s.horizonColor, (v) => (s.horizonColor = v));
            skyF.color("Below horizon", () => s.lowerHorizonColor, (v) => (s.lowerHorizonColor = v));
            skyF.colorPair("Night zenith / horizon", () => [s.nightZenithColor, s.nightHorizonColor], (v) => {
                s.nightZenithColor = v[0];
                s.nightHorizonColor = v[1];
            });
            skyF.slider("Day↔night blend", { min: 0, max: 1, step: 0.01 }, () => s.dayNightBlend, (v) => (s.dayNightBlend = v));
            skyF.slider("Horizon height", { min: -1, max: 1, step: 0.01 }, () => s.horizonHeight, (v) => (s.horizonHeight = v));
            skyF.slider("Gradient softness", { min: 0.02, max: 2, step: 0.01 }, () => s.gradientSoftness, (v) => (s.gradientSoftness = v));
            skyF.slider("Atmosphere", { min: 0, max: 3, step: 0.01 }, () => s.atmosphereIntensity, (v) => (s.atmosphereIntensity = v));
            skyF.slider("Haze", { min: 0, max: 3, step: 0.01 }, () => s.hazeIntensity, (v) => (s.hazeIntensity = v));
            skyF.slider("Brightness", { min: 0, max: 4, step: 0.01 }, () => s.skyBrightness, (v) => (s.skyBrightness = v));
            skyF.slider("Saturation", { min: 0, max: 3, step: 0.01 }, () => s.skySaturation, (v) => (s.skySaturation = v));
            skyF.slider("Contrast", { min: 0.2, max: 3, step: 0.01 }, () => s.skyContrast, (v) => (s.skyContrast = v));
            skyF.slider("Exposure", { min: 0.05, max: 4, step: 0.01 }, () => s.exposure, (v) => (s.exposure = v));
            skyF.note("Day↔night blend 0 freezes the palette as authored — what the two fantasy presets use.");

            // ---- Sun & moon ----------------------------------------------------------------------
            const sun = cfg.sun;
            const moon = cfg.moon;
            const bodies = panel.folder("Sun & moon", false);
            bodies.toggle("Sun", () => sun.enabled, (v) => (sun.enabled = v));
            bodies.slider("Sun azimuth", { min: 0, max: 360, step: 1 }, () => sun.azimuth, (v) => (sun.azimuth = v));
            bodies.slider("Sun elevation", { min: -90, max: 90, step: 0.5 }, () => sun.elevation, (v) => (sun.elevation = v));
            bodies.color("Sun colour", () => sun.color, (v) => (sun.color = v));
            bodies.slider("Sun size °", { min: 0.05, max: 12, step: 0.05 }, () => sun.size, (v) => (sun.size = v));
            bodies.slider("Sun intensity", { min: 0, max: 8, step: 0.05 }, () => sun.intensity, (v) => (sun.intensity = v));
            bodies.slider("Glow", { min: 0, max: 4, step: 0.05 }, () => sun.glowIntensity, (v) => (sun.glowIntensity = v));
            bodies.slider("Glow radius °", { min: 0.5, max: 90, step: 0.5 }, () => sun.glowRadius, (v) => (sun.glowRadius = v));
            bodies.slider("Glow softness", { min: 0.01, max: 1, step: 0.01 }, () => sun.glowSoftness, (v) => (sun.glowSoftness = v));
            bodies.note("Azimuth and elevation are driven by the clock unless Animation ▸ Drive from time is off.");
            bodies.toggle("Moon", () => moon.enabled, (v) => (moon.enabled = v));
            bodies.slider("Moon azimuth", { min: 0, max: 360, step: 1 }, () => moon.azimuth, (v) => (moon.azimuth = v));
            bodies.slider("Moon elevation", { min: -90, max: 90, step: 0.5 }, () => moon.elevation, (v) => (moon.elevation = v));
            bodies.color("Moon colour", () => moon.color, (v) => (moon.color = v));
            bodies.slider("Moon size °", { min: 0.05, max: 14, step: 0.05 }, () => moon.size, (v) => (moon.size = v));
            bodies.slider("Moon intensity", { min: 0, max: 6, step: 0.05 }, () => moon.intensity, (v) => (moon.intensity = v));
            bodies.slider("Moon glow", { min: 0, max: 4, step: 0.05 }, () => moon.glowIntensity, (v) => (moon.glowIntensity = v));
            bodies.slider("Phase", { min: 0, max: 1, step: 0.01 }, () => moon.phase, (v) => (moon.phase = v));
            bodies.slider("Surface detail", { min: 0, max: 1, step: 0.01 }, () => moon.surfaceDetail, (v) => (moon.surfaceDetail = v));
            bodies.note("Phase 0 is new, 0.5 full. It is independent of where the moon sits.");

            // ---- Stars -------------------------------------------------------------------------
            const st = cfg.stars;
            const stars = panel.folder("Stars", false);
            stars.toggle("Enabled", () => st.enabled, (v) => (st.enabled = v));
            stars.slider("Density", { min: 2, max: 200, step: 1 }, () => st.density, (v) => (st.density = v));
            stars.slider("Coverage", { min: 0.01, max: 1, step: 0.01 }, () => st.coverage, (v) => (st.coverage = v));
            stars.slider("Brightness", { min: 0, max: 6, step: 0.05 }, () => st.brightness, (v) => (st.brightness = v));
            stars.slider("Size", { min: 0.05, max: 3, step: 0.01 }, () => st.size, (v) => (st.size = v));
            stars.slider("Twinkle", { min: 0, max: 1, step: 0.01 }, () => st.twinkleIntensity, (v) => (st.twinkleIntensity = v));
            stars.slider("Twinkle speed", { min: 0, max: 6, step: 0.05 }, () => st.twinkleSpeed, (v) => (st.twinkleSpeed = v));
            stars.color("Colour", () => st.color, (v) => (st.color = v));
            stars.note("Stars fade themselves out as the sun rises — leaving them on in a day preset costs nothing. ENHANCED samples neighbouring cells so stars can cross a cell edge.");

            // ---- Clouds ------------------------------------------------------------------------
            const cl = cfg.clouds;
            const clouds = panel.folder("Clouds", false);
            clouds.toggle("Enabled", () => cl.enabled, (v) => (cl.enabled = v));
            clouds.select<CloudType>("Type", CLOUD_TYPES, () => cl.type, (v) => (cl.type = v));
            clouds.slider("Coverage", { min: 0, max: 1, step: 0.01 }, () => cl.coverage, (v) => (cl.coverage = v));
            clouds.slider("Density", { min: 0, max: 3, step: 0.01 }, () => cl.density, (v) => (cl.density = v));
            clouds.slider("Scale", { min: 0.05, max: 10, step: 0.05 }, () => cl.scale, (v) => (cl.scale = v));
            clouds.slider("Detail", { min: 0, max: 2, step: 0.01 }, () => cl.detail, (v) => (cl.detail = v));
            clouds.slider("Softness", { min: 0.01, max: 1, step: 0.01 }, () => cl.softness, (v) => (cl.softness = v));
            clouds.slider("Opacity", { min: 0, max: 1, step: 0.01 }, () => cl.opacity, (v) => (cl.opacity = v));
            clouds.slider("Variation", { min: 0, max: 1, step: 0.01 }, () => cl.variation, (v) => (cl.variation = v));
            clouds.slider("Sun lighting", { min: 0, max: 2, step: 0.01 }, () => cl.lightInfluence, (v) => (cl.lightInfluence = v));
            clouds.color("Cloud", () => cl.color, (v) => (cl.color = v));
            clouds.color("Shadow", () => cl.shadowColor, (v) => (cl.shadowColor = v));
            clouds.slider("Height m", { min: 20, max: 6000, step: 10 }, () => cl.height, (v) => (cl.height = v));
            clouds.slider("Speed", { min: 0, max: 10, step: 0.05 }, () => cl.speed, (v) => (cl.speed = v));
            clouds.slider("Direction °", { min: 0, max: 360, step: 1 }, () => cl.direction, (v) => (cl.direction = v));
            clouds.slider("Wind", { min: 0, max: 5, step: 0.05 }, () => cl.windStrength, (v) => (cl.windStrength = v));
            clouds.readout("Layers drawn", () => `${qualityLayers(cfg.quality, cl.enabled)}`);
            clouds.note("Type is a set of multipliers over everything above, not a different renderer. Layer count comes from the quality mode.");

            // ---- Weather -----------------------------------------------------------------------
            const w = cfg.weather;
            const lt = w.lightning;
            const weather = panel.folder("Weather", false);
            weather.select<WeatherType>("Type", WEATHER_TYPES, () => w.type, (v) => (w.type = v));
            weather.slider("Intensity", { min: 0, max: 1, step: 0.01 }, () => w.intensity, (v) => (w.intensity = v));
            weather.slider("Density", { min: 0, max: 4, step: 0.01 }, () => w.precipitationDensity, (v) => (w.precipitationDensity = v));
            weather.slider("Fall speed", { min: 0, max: 5, step: 0.01 }, () => w.precipitationSpeed, (v) => (w.precipitationSpeed = v));
            weather.slider("Wind °", { min: 0, max: 360, step: 1 }, () => w.windDirection, (v) => (w.windDirection = v));
            weather.slider("Wind strength", { min: 0, max: 5, step: 0.01 }, () => w.windStrength, (v) => (w.windStrength = v));
            weather.slider("Visibility", { min: 0.02, max: 1, step: 0.01 }, () => w.visibility, (v) => (w.visibility = v));
            weather.slider("Particle size", { min: 0.05, max: 6, step: 0.05 }, () => w.particleSize, (v) => (w.particleSize = v));
            weather.slider("Particle opacity", { min: 0, max: 1, step: 0.01 }, () => w.particleOpacity, (v) => (w.particleOpacity = v));
            weather.color("Particle colour", () => w.particleColor, (v) => (w.particleColor = v));
            weather.readout("Drawn", () => `${sky.precipitation.activeCount} / ${sky.precipitation.capacity}`);
            weather.toggle("Lightning", () => lt.enabled, (v) => (lt.enabled = v));
            weather.slider("Strikes /min", { min: 0, max: 120, step: 1 }, () => lt.frequency, (v) => (lt.frequency = v));
            weather.slider("Flash intensity", { min: 0, max: 5, step: 0.05 }, () => lt.intensity, (v) => (lt.intensity = v));
            weather.slider("Flash duration s", { min: 0.05, max: 3, step: 0.01 }, () => lt.duration, (v) => (lt.duration = v));
            weather.toggle("Draw bolts", () => lt.bolts, (v) => (lt.bolts = v));
            weather.color("Bolt colour", () => lt.boltColor, (v) => (lt.boltColor = v));
            weather.buttons({ label: "Strike now", onClick: () => sky.burst(), primary: true });
            weather.note("storm draws rain and additionally darkens the deck, drops sky brightness and enables lightning. Particles are one draw call whatever the type.");

            // ---- Atmosphere ---------------------------------------------------------------------
            const a = cfg.atmosphere;
            const atmos = panel.folder("Atmosphere", false);
            atmos.toggle("Fog", () => a.fogEnabled, (v) => (a.fogEnabled = v));
            atmos.select<FogType>("Fog type", FOG_TYPES, () => a.fogType, (v) => (a.fogType = v));
            atmos.toggle("Fog follows sky", () => a.fogFollowsSky, (v) => (a.fogFollowsSky = v));
            atmos.color("Fog colour", () => a.fogColor, (v) => (a.fogColor = v));
            atmos.slider("Fog near", { min: 0, max: 400, step: 1 }, () => a.fogNear, (v) => (a.fogNear = v));
            atmos.slider("Fog far", { min: 1, max: 1200, step: 1 }, () => a.fogFar, (v) => (a.fogFar = v));
            atmos.slider("Fog density", { min: 0, max: 0.2, step: 0.001 }, () => a.fogDensity, (v) => (a.fogDensity = v));
            atmos.slider("Visibility dist", { min: 1, max: 1200, step: 1 }, () => a.visibilityDistance, (v) => (a.visibilityDistance = v));
            atmos.slider("Horizon haze", { min: 0, max: 2, step: 0.01 }, () => a.horizonHaze, (v) => (a.horizonHaze = v));
            atmos.color("Tint", () => a.tint, (v) => (a.tint = v));
            atmos.slider("Tint strength", { min: 0, max: 1, step: 0.01 }, () => a.tintStrength, (v) => (a.tintStrength = v));
            atmos.note("Fog colour is taken from the live horizon colour unless you turn that off — it is what stops a dark band appearing where the ground meets the sky.");

            // ---- Lighting ------------------------------------------------------------------------
            const li = cfg.lighting;
            const lighting = panel.folder("Lighting", false);
            lighting.toggle("Sync lighting", () => li.syncLighting, (v) => (li.syncLighting = v));
            lighting.toggle("Sync fog", () => li.syncFog, (v) => (li.syncFog = v));
            lighting.toggle("Sync background", () => li.syncBackground, (v) => (li.syncBackground = v));
            lighting.toggle("Drive from sun", () => li.driveFromSun, (v) => (li.driveFromSun = v));
            lighting.slider("Directional", { min: 0, max: 10, step: 0.05 }, () => li.directionalIntensity, (v) => (li.directionalIntensity = v));
            lighting.color("Directional colour", () => li.directionalColor, (v) => (li.directionalColor = v));
            lighting.slider("Ambient", { min: 0, max: 5, step: 0.05 }, () => li.ambientIntensity, (v) => (li.ambientIntensity = v));
            lighting.color("Ambient colour", () => li.ambientColor, (v) => (li.ambientColor = v));
            lighting.slider("Follow speed", { min: 0.1, max: 30, step: 0.1 }, () => li.transitionSpeed, (v) => (li.transitionSpeed = v));
            lighting.readout("Rig sun", () => `${rig.sun.intensity.toFixed(2)} · #${rig.sun.color.getHexString()}`);
            lighting.note("Turn a toggle off and the light or the fog snaps back to what it was before this effect loaded. Nothing here is permanent.");

            // ---- Animation -------------------------------------------------------------------------
            const t = cfg.time;
            const anim = panel.folder("Animation", false);
            anim.slider("Time of day", { min: 0, max: 24, step: 0.05 }, () => t.timeOfDay, (v) => sky.setTimeOfDay(v));
            anim.toggle("Auto cycle", () => t.autoCycle, (v) => (t.autoCycle = v));
            anim.toggle("Cycle paused", () => t.paused, (v) => (t.paused = v));
            anim.slider("Cycle seconds", { min: 1, max: 600, step: 1 }, () => t.cycleDuration, (v) => (t.cycleDuration = v));
            anim.slider("Time scale", { min: 0, max: 20, step: 0.05 }, () => t.timeScale, (v) => (t.timeScale = v));
            anim.toggle("Drive from time", () => t.driveCelestials, (v) => (t.driveCelestials = v));
            anim.buttons(
                { label: "Dawn", onClick: () => { sky.setTimeOfDay(6.4); panel.refresh(); } },
                { label: "Noon", onClick: () => { sky.setTimeOfDay(12); panel.refresh(); } },
                { label: "Dusk", onClick: () => { sky.setTimeOfDay(18); panel.refresh(); } },
                { label: "Night", onClick: () => { sky.setTimeOfDay(23); panel.refresh(); } },
            );
            anim.note("Sunrise 06:00, sunset 18:00. STATIC quality freezes the clock along with everything else.");

            // ---- Performance -----------------------------------------------------------------------
            const perf = panel.folder("Performance", false);
            perf.select<SkyQuality>("Quality mode", SKY_QUALITIES, () => cfg.quality, (v) => sky.setQuality(v));
            perf.readout("Cloud layers", () => `${qualityLayers(cfg.quality, cl.enabled)}`);
            perf.readout("Particles", () => `${sky.precipitation.activeCount} / ${sky.precipitation.capacity}`);
            perf.readout("Bolt segments", () => `${sky.lightning.segmentCount}`);
            perf.note("STATIC: one static deck, no animation, no weather particles. STANDARD: two decks, lightweight weather. ENHANCED: three decks, neighbour-sampled stars, ~1.8x particles. The sky itself is always one draw call.");

            // ---- Config -----------------------------------------------------------------------------
            const out = panel.folder("Config", false);
            out.buttons(
                { label: "Copy JSON", onClick: () => copyConfig(sky.exportConfig()), primary: true },
                { label: "Download", onClick: () => downloadConfig(sky.exportConfig()) },
            );
            out.buttons(
                { label: "Import file", onClick: () => importFromFile(sky, panel) },
                { label: "Import clipboard", onClick: () => importFromClipboard(sky, panel) },
            );
            out.note("Paste over src/vfx/effects/sky/sky-vfx.json to keep a tuning session. Imports are validated the same way the file is.");
        },
    };
}

function qualityLayers(quality: SkyQuality, cloudsEnabled: boolean): number {
    if (!cloudsEnabled) return 0;
    return quality === "static" ? 1 : quality === "standard" ? 2 : 3;
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
    a.download = "sky-vfx.json";
    a.click();
    URL.revokeObjectURL(url);
}

function adoptImported(sky: SkyVfx, text: string, panel: ControlPanel): void {
    const result = importSkyConfig(text);
    if (!result.ok || !result.config) {
        console.warn(`[vfx-lab] import rejected: ${result.error}`);
        return;
    }
    result.issues.report("imported sky config");
    sky.adopt(result.config);
    panel.refresh();
    console.info("[vfx-lab] sky config imported");
}

/**
 * A transient file input rather than a new panel control.
 *
 * `ControlPanel` has no file picker and does not need one for a single use — this is the only
 * place in the lab that reads a file, and adding a control kind for it would be a dependency
 * every other effect carries for nothing.
 */
function importFromFile(sky: SkyVfx, panel: ControlPanel): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        file.text()
            .then((text) => adoptImported(sky, text, panel))
            .catch((err) => console.warn("[vfx-lab] could not read file", err));
    });
    input.click();
}

async function importFromClipboard(sky: SkyVfx, panel: ControlPanel): Promise<void> {
    try {
        const text = await navigator.clipboard.readText();
        adoptImported(sky, text, panel);
    } catch {
        console.warn("[vfx-lab] clipboard read unavailable — use Import file instead");
    }
}
