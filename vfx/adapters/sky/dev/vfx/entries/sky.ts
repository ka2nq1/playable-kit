import { vfxEntry } from "../../kit/vfxEntry";
import SkyC from "../../../src/controllers/VFX/SkyC";
import { SKY_PRESET_IDS, skyPresetLabel } from "../../../src/vfx/effects/sky";
import labConfig from "../../../src/vfx/effects/sky/sky-vfx.json";

export default vfxEntry(SkyC, {
    label: "Sky",
    group: "Weather & air",
    hint: "procedural sky, weather, day/night",
    defaults: labConfig,
    preview: { camera: { position: [0, 1, 0], target: [0, 1.6, -5] } },
    header: (panel, instance) => {
        const vfx = instance.vfx;
        const presets = panel.folder("Presets");
        // A preset overwrites the config in place, so the Settings below stay bound and only
        // need a refresh to show the new values.
        presets.select("Preset", SKY_PRESET_IDS, () => vfx.currentPreset ?? "", (id) => {
            vfx.loadPreset(id);
            panel.refresh();
        });
        presets.readout("Name", () => (vfx.currentPreset ? skyPresetLabel(vfx.currentPreset) : "custom"));
        presets.note("Picking a preset replaces every setting below; tweak from there. The cine-* ones are the cinematic looks.");
    },
    // Ranges the guess cannot know: these open at 0 or 1 in the defaults and presets go well past.
    schema: {
        "sun.raysIntensity": { min: 0, max: 4, step: 0.01 },
        "sun.raysLength": { min: 2, max: 180, step: 1 },
        "sun.raysCount": { min: 2, max: 80, step: 1 },
        "sun.raysSharpness": { min: 0.5, max: 8, step: 0.05 },
        "sun.raysSpeed": { min: 0, max: 3, step: 0.01 },
        "sun.raysOverClouds": { min: 0, max: 1, step: 0.01 },
        "clouds.rimIntensity": { min: 0, max: 4, step: 0.01 },
        "clouds.rimTightness": { min: 0.5, max: 64, step: 0.5 },
        "clouds.rimEdge": { min: 0, max: 1, step: 0.01 },
        "clouds.glowIntensity": { min: 0, max: 3, step: 0.01 },
        "clouds.glowSpread": { min: 0, max: 1, step: 0.01 },
        "clouds.stretch": { min: 1, max: 12, step: 0.05 },
        "clouds.sunGap": { min: 0, max: 1, step: 0.01 },
        "clouds.sunGapRadius": { min: 2, max: 90, step: 0.5 },
    },
});
