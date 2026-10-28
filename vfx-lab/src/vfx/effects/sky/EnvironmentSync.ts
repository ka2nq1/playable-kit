/**
 * Optional, reversible synchronisation between the sky and the host's scene.
 *
 * The contract here is the important part: this never creates a light, never replaces one, and
 * never keeps writing a property the host owns once synchronisation is switched off. Everything
 * it touches is snapshotted the moment it is handed a reference and put back verbatim on
 * `dispose()` — or the moment the relevant toggle goes false. A host that constructs the sky,
 * disables both toggles and throws it away gets its scene back exactly as it was.
 *
 * `syncFog` defaults on for a concrete reason: a host that set fog for a different mood produces
 * a hard dark band exactly at the horizon under a bright sky, and that reads as a bug in the sky
 * shader rather than as the fog it actually is.
 */

import {
    AmbientLight,
    Color,
    DirectionalLight,
    Fog,
    FogExp2,
    HemisphereLight,
    Scene,
    Vector3,
} from "three";
import { resolveColor } from "../../core/colorCache";
import type { SkyConfig } from "./config";

export interface SkyLightTargets {
    /** Fog and background are written here. Omit it and neither is ever touched. */
    scene?: Scene | null;
    directionalLight?: DirectionalLight | null;
    ambientLight?: AmbientLight | HemisphereLight | null;
}

interface LightSnapshot {
    color: Color;
    intensity: number;
    groundColor: Color | null;
    position: Vector3 | null;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite ramp, matching GLSL `smoothstep`. Undefined for e0 >= e1, same as the shader. */
function smoothstep(e0: number, e1: number, x: number): number {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}

/** How much the weather is allowed to drag the lighting down. */
const WEATHER_GLOOM: Record<string, number> = {
    clear: 1,
    rain: 0.62,
    snow: 0.74,
    storm: 0.38,
    dust: 0.7,
    ash: 0.45,
};

export class EnvironmentSync {
    private readonly scene: Scene | null;
    private readonly directional: DirectionalLight | null;
    private readonly ambient: AmbientLight | HemisphereLight | null;

    private readonly fogSnapshot: Scene["fog"];
    private readonly backgroundSnapshot: Scene["background"];
    private readonly directionalSnapshot: LightSnapshot | null;
    private readonly ambientSnapshot: LightSnapshot | null;

    /** Owned by this class; reused rather than reallocated when the fog type changes. */
    private readonly linearFog = new Fog(0xffffff, 10, 100);
    private readonly expFog = new FogExp2(0xffffff, 0.01);

    private fogActive = false;
    private lightingActive = false;
    private backgroundActive = false;

    // Smoothed state, so a preset change eases rather than snapping.
    private dirIntensity = 0;
    private ambIntensity = 0;
    private readonly dirColor = new Color(1, 1, 1);
    private readonly ambColor = new Color(1, 1, 1);
    private primed = false;

    // Per-frame scratch.
    private readonly tmpColor = new Color();
    private readonly tmpColorB = new Color();

    constructor(targets: SkyLightTargets) {
        this.scene = targets.scene ?? null;
        this.directional = targets.directionalLight ?? null;
        this.ambient = targets.ambientLight ?? null;

        this.fogSnapshot = this.scene ? this.scene.fog : null;
        this.backgroundSnapshot = this.scene ? this.scene.background : null;
        this.directionalSnapshot = snapshot(this.directional);
        this.ambientSnapshot = snapshot(this.ambient);
    }

    get hasTargets(): boolean {
        return this.scene !== null || this.directional !== null || this.ambient !== null;
    }

    /**
     * @param sunDir   unit vector pointing *at* the sun
     * @param elevation sun elevation in degrees
     * @param flash     current lightning level; applied unsmoothed, since a flash that eases in
     *                  is not a flash
     */
    update(dt: number, config: SkyConfig, sunDir: Vector3, elevation: number, flash: number): void {
        const l = config.lighting;

        if (l.syncFog) this.applyFog(config);
        else if (this.fogActive) this.restoreFog();

        if (l.syncBackground) this.applyBackground(config);
        else if (this.backgroundActive) this.restoreBackground();

        if (l.syncLighting) this.applyLighting(dt, config, sunDir, elevation, flash);
        else if (this.lightingActive) this.restoreLighting();
    }

    private applyFog(config: SkyConfig): void {
        if (!this.scene) return;
        const a = config.atmosphere;
        if (!a.fogEnabled) {
            if (this.fogActive) this.restoreFog();
            return;
        }

        // Fog colour tracks the live horizon so geometry dissolves into the sky it is actually
        // standing under rather than into a grey that was right for a different preset.
        const hex = a.fogFollowsSky ? config.sky.horizonColor : a.fogColor;
        this.tmpColor.copy(resolveColor(hex));

        // Night pulls it down; the horizon colour is authored for daylight.
        const night = nightFactor(config, elevationOf(config));
        this.tmpColor.multiplyScalar(1 - 0.72 * night);

        const vis = config.weather.visibility;

        if (a.fogType === "exp2") {
            this.expFog.color.copy(this.tmpColor);
            this.expFog.density = a.fogDensity / Math.max(vis, 0.02);
            if (this.scene.fog !== this.expFog) this.scene.fog = this.expFog;
        } else {
            this.linearFog.color.copy(this.tmpColor);
            this.linearFog.near = a.fogNear * vis;
            // visibilityDistance is the hard ceiling; weather tightens it from there.
            this.linearFog.far = Math.max(Math.min(a.fogFar, a.visibilityDistance) * vis, this.linearFog.near + 0.1);
            if (this.scene.fog !== this.linearFog) this.scene.fog = this.linearFog;
        }
        this.fogActive = true;
    }

    private applyBackground(config: SkyConfig): void {
        if (!this.scene) return;
        // Only useful as a fallback for the frames before the sky draws, or if it is disabled —
        // the sky itself overdraws the clear colour everywhere it is allowed to draw.
        this.tmpColor.copy(resolveColor(config.sky.horizonColor));
        if (this.scene.background instanceof Color) this.scene.background.copy(this.tmpColor);
        else this.scene.background = this.tmpColor.clone();
        this.backgroundActive = true;
    }

    private applyLighting(dt: number, config: SkyConfig, sunDir: Vector3, elevation: number, flash: number): void {
        const l = config.lighting;

        // ---- Targets -------------------------------------------------------------------------
        const dayness = smoothstep(-6, 10, elevation);
        const highness = smoothstep(6, 34, elevation);
        const gloom = WEATHER_GLOOM[config.weather.type] ?? 1;
        const visWeight = 0.35 + 0.65 * config.weather.visibility;
        const weather = gloom * visWeight;

        let targetDir: number;
        let targetAmb: number;

        if (l.driveFromSun) {
            // Warm and low at sunrise/sunset, neutral and bright at midday, near-nothing at night
            // with a little left over if there is a moon up.
            this.tmpColor.copy(resolveColor("#ff9d4d")).lerp(resolveColor(l.directionalColor), highness);
            const moonlight = config.moon.enabled ? config.moon.intensity * 0.05 : 0;
            targetDir = (l.directionalIntensity * dayness + moonlight) * weather;

            // Ambient takes its hue from the sky it is standing under.
            this.tmpColorB.copy(resolveColor(config.sky.horizonColor)).lerp(resolveColor(l.ambientColor), 0.5);
            this.tmpColorB.lerp(resolveColor("#2a3550"), 1 - dayness);
            targetAmb = l.ambientIntensity * (0.18 + 0.82 * dayness) * weather;
        } else {
            this.tmpColor.copy(resolveColor(l.directionalColor));
            this.tmpColorB.copy(resolveColor(l.ambientColor));
            targetDir = l.directionalIntensity;
            targetAmb = l.ambientIntensity;
        }

        // ---- Approach ------------------------------------------------------------------------
        // Exponential, so the result does not depend on frame rate. On the first frame we snap:
        // easing up from zero would make every load look like a fade-in.
        const k = this.primed ? 1 - Math.exp(-l.transitionSpeed * Math.max(dt, 0)) : 1;
        this.primed = true;

        this.dirIntensity += (targetDir - this.dirIntensity) * k;
        this.ambIntensity += (targetAmb - this.ambIntensity) * k;
        this.dirColor.lerp(this.tmpColor, k);
        this.ambColor.lerp(this.tmpColorB, k);

        // ---- Write -----------------------------------------------------------------------------
        if (this.directional) {
            // Point the light the way the sun is shining, i.e. from the sun toward the origin.
            this.directional.position.copy(sunDir).multiplyScalar(60);
            this.directional.color.copy(this.dirColor);
            this.directional.intensity = this.dirIntensity + flash * 2.4;
        }
        if (this.ambient) {
            this.ambient.color.copy(this.ambColor);
            this.ambient.intensity = this.ambIntensity + flash * 0.9;
        }
        this.lightingActive = true;
    }

    private restoreFog(): void {
        if (this.scene) this.scene.fog = this.fogSnapshot;
        this.fogActive = false;
    }

    private restoreBackground(): void {
        if (this.scene) this.scene.background = this.backgroundSnapshot;
        this.backgroundActive = false;
    }

    private restoreLighting(): void {
        restore(this.directional, this.directionalSnapshot);
        restore(this.ambient, this.ambientSnapshot);
        this.lightingActive = false;
        this.primed = false;
    }

    /**
     * Puts everything back without ending the object's life.
     *
     * Called when the sky is disabled as well as when it is thrown away — a switched-off sky that
     * kept the host's fog pinned to its own horizon colour would be exactly the kind of lingering
     * side effect this class exists to avoid. Re-enabling re-applies on the next frame.
     */
    restoreAll(): void {
        this.restoreFog();
        this.restoreBackground();
        this.restoreLighting();
    }

    /** Safe to call more than once. */
    dispose(): void {
        this.restoreAll();
    }
}

function snapshot(light: DirectionalLight | AmbientLight | HemisphereLight | null): LightSnapshot | null {
    if (!light) return null;
    return {
        color: light.color.clone(),
        intensity: light.intensity,
        groundColor: light instanceof HemisphereLight ? light.groundColor.clone() : null,
        position: light instanceof DirectionalLight ? light.position.clone() : null,
    };
}

function restore(light: DirectionalLight | AmbientLight | HemisphereLight | null, snap: LightSnapshot | null): void {
    if (!light || !snap) return;
    light.color.copy(snap.color);
    light.intensity = snap.intensity;
    if (snap.groundColor && light instanceof HemisphereLight) light.groundColor.copy(snap.groundColor);
    if (snap.position && light instanceof DirectionalLight) light.position.copy(snap.position);
}

/** The sun elevation the config currently implies, for the places that only have the config. */
function elevationOf(config: SkyConfig): number {
    return config.sun.elevation;
}

/** 0 by day, 1 at night. Shared with the dome so the two never disagree about what "night" is. */
export function nightFactor(config: SkyConfig, elevation: number): number {
    const sunDown = 1 - smoothstep(-9, 4, elevation);
    return config.sun.enabled ? sunDown : 1;
}
