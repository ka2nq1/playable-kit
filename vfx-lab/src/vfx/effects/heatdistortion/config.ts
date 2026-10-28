/**
 * Typed, validated view of `heatdistortion-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect reads, every number comes out finite and clamped, and the keys stay flat so the
 * lab's "Copy JSON" round-trips straight back through this reader.
 *
 * Every key is a uniform except `qualityMode`, which picks the shader, and the four volume
 * dimensions, which also size the billboard. So one knob — the quality mode — rebuilds a
 * material; nothing else does anything heavier than a uniform write.
 *
 * Two parameters a brief would normally ask for are deliberately absent:
 *
 *  - **World position** is `object3d.position`, like every other effect in this package. A heat
 *    source is placed by parenting or moving the object, not by a number in a config file.
 *  - **A render-target resolution scale** has nothing to scale. The background comes from a copy
 *    of the framebuffer that is already being drawn (see `SceneColorCapture`), not from a target
 *    this effect allocates, so there is no resolution to trade away.
 */

import { bool, colorHex, ConfigIssues, num, oneOf } from "../../core/config";

export type HeatQualityMode = "high" | "low";

export interface HeatDistortionConfig {
    enabled: boolean;
    /**
     * `high` refracts the real background through a framebuffer grab. `low` samples nothing and
     * draws the same noise field as a faint additive shimmer — an approximation, not refraction.
     */
    qualityMode: HeatQualityMode;
    /** Master on the displacement (and, in `low`, on the shimmer). The knob to animate. */
    intensity: number;
    /** Alpha of the volume mask: how fully the refracted sample replaces the pixel under it. */
    opacity: number;

    // ---- Volume --------------------------------------------------------------------------
    /** Width of the heat source, in world units. The billboard covers this from any angle. */
    width: number;
    /** Depth of the heat source, in world units. Only the projected footprint is ever drawn. */
    depth: number;
    /** How far the hot air reaches above the source, in world units. */
    height: number;
    /** Lifts the bottom of the volume off the source. A little of this hides the ground contact. */
    heightOffset: number;
    /** Rotation of the width × depth footprint about Y, in degrees. */
    rotation: number;
    /** How far in from the sides the mask fades, as a fraction of the half-width. */
    edgeSoftness: number;
    /** Exponent on the fade with height. 1 is linear; higher keeps the shimmer near the source. */
    verticalFalloff: number;

    // ---- Distortion ----------------------------------------------------------------------
    /** Peak screen displacement, as a fraction of the volume's own on-screen height. */
    distortionStrength: number;
    /** Frequency of the broad convection cells, in cycles per world unit. */
    noiseScale: number;
    /** Frequency of the secondary turbulence. Several times `noiseScale` or it just adds blur. */
    detailNoiseScale: number;
    /** How much of that second layer reaches the displacement. 0 is smooth, lazy heat. */
    turbulence: number;
    /** Relative weight of the horizontal component of the displacement. */
    horizontalDistortion: number;
    /** Relative weight of the vertical component. Below the horizontal reads as wind, above as boil. */
    verticalDistortion: number;

    // ---- Animation -----------------------------------------------------------------------
    /** Upward speed of the noise field, in world units per second. */
    riseSpeed: number;
    /** Lateral speed of the noise field, in world units per second. */
    driftSpeed: number;
    /** Multiplier on the clock. 0 freezes the field without hiding it. */
    animationSpeed: number;
    /** How far the flow direction wanders with height and time, 0–1. The cure for a straight climb. */
    flowVariation: number;
    /** Depth of the slow swell in overall strength, 0–1. */
    pulsation: number;

    // ---- Culling -------------------------------------------------------------------------
    /** Distance at which the effect stops drawing entirely. 0 disables the check. */
    maxDistance: number;
    /** How many units before `maxDistance` the fade starts. */
    fadeDistance: number;

    // ---- Low quality ---------------------------------------------------------------------
    /** Tint of the `low` mode shimmer. Keep it close to the scene's own light or it reads as smoke. */
    shimmerColor: string;
}

export function normalizeHeatDistortionConfig(raw: unknown): { config: HeatDistortionConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "heatdistortion";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            qualityMode: oneOf(root, "qualityMode", ["high", "low"] as const, "high", p, issues),
            intensity: num(root, "intensity", 1, p, issues, 0, 4),
            opacity: num(root, "opacity", 0.9, p, issues, 0, 1),

            width: num(root, "width", 3.2, p, issues, 0.05, 200),
            depth: num(root, "depth", 2.4, p, issues, 0.05, 200),
            height: num(root, "height", 2.1, p, issues, 0.05, 200),
            heightOffset: num(root, "heightOffset", 0.04, p, issues, -10, 50),
            rotation: num(root, "rotation", 0, p, issues, -360, 360),
            edgeSoftness: num(root, "edgeSoftness", 0.55, p, issues, 0.02, 1),
            verticalFalloff: num(root, "verticalFalloff", 1.6, p, issues, 0.2, 6),

            distortionStrength: num(root, "distortionStrength", 0.06, p, issues, 0, 0.4),
            noiseScale: num(root, "noiseScale", 1.8, p, issues, 0.05, 20),
            detailNoiseScale: num(root, "detailNoiseScale", 5.5, p, issues, 0.05, 60),
            turbulence: num(root, "turbulence", 0.45, p, issues, 0, 2),
            horizontalDistortion: num(root, "horizontalDistortion", 1, p, issues, 0, 2),
            verticalDistortion: num(root, "verticalDistortion", 0.75, p, issues, 0, 2),

            riseSpeed: num(root, "riseSpeed", 0.9, p, issues, 0, 10),
            driftSpeed: num(root, "driftSpeed", 0.16, p, issues, 0, 10),
            animationSpeed: num(root, "animationSpeed", 1, p, issues, 0, 5),
            flowVariation: num(root, "flowVariation", 0.5, p, issues, 0, 1),
            pulsation: num(root, "pulsation", 0.3, p, issues, 0, 1),

            maxDistance: num(root, "maxDistance", 45, p, issues, 0, 1000),
            fadeDistance: num(root, "fadeDistance", 12, p, issues, 0, 1000),

            shimmerColor: colorHex(root, "shimmerColor", "#ffd9b0", p, issues),
        },
        issues,
    };
}
