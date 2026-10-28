/**
 * Typed, validated view of `watersurface-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Every key below is a shader uniform. There is nothing baked into a buffer, which is why
 * `applyConfig()` is a list of assignments and a slider lands on the frame it is dragged.
 */

import { bool, colorHex, ConfigIssues, num } from "../../core/config";

export interface WaterSurfaceConfig {
    enabled: boolean;
    /** Width of the square the surface spans, in world units. It fades out on a circle inside it. */
    surfaceSize: number;
    /** Master alpha. 1 is opaque water; below ~0.9 whatever is under the plane shows through. */
    opacity: number;

    /** Primary water colour — what the surface reads as on average. */
    baseColor: string;
    /** The darker colour the pattern drops toward. Keep it a deeper, less saturated base. */
    deepColor: string;
    /** Colour of the moving highlights, and of the fresnel brightening at grazing angles. */
    highlightColor: string;
    /** How far the pattern is allowed to pull toward `deepColor`. 0 is a flat base colour. */
    colorVariation: number;
    /** Strength of the moving highlights on the crests. Past ~1 the water reads as glitter. */
    highlightIntensity: number;
    /** How selectively highlights appear: low catches most of the surface, high only the crests. */
    highlightThreshold: number;
    /** View-dependent brightening toward the horizon. Cheap stand-in for a sky reflection. */
    fresnelIntensity: number;

    /** Geometric wave height in world units. This is the only knob that moves vertices. */
    waveAmplitude: number;
    /** Wavenumber of the broad waves: bigger is tighter. Roughly 2π / wavelength in metres. */
    waveFrequency: number;
    /** Wave travel speed in world units per second. Drives the surface pattern as well. */
    waveSpeed: number;
    /** Heading of the main wave train, in degrees counter-clockwise from +X. */
    waveDirection: number;
    /** Weight of the two cross-running wave layers. 0 leaves one plain sine train. */
    secondaryWaveIntensity: number;

    /** Scale of the fine surface pattern: roughly 1 / feature size in metres. */
    detailScale: number;
    /** Strength of that pattern in the colour. It does not tilt the surface — the ripples do. */
    detailIntensity: number;
    /** Strength of the small analytic ripples that break the highlights up. */
    rippleIntensity: number;
    /** Ripple travel speed, independent of `waveSpeed` so the fine motion can be tuned alone. */
    rippleSpeed: number;
}

export function normalizeWaterSurfaceConfig(raw: unknown): { config: WaterSurfaceConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "watersurface";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            surfaceSize: num(root, "surfaceSize", 60, p, issues, 1, 500),
            opacity: num(root, "opacity", 1, p, issues, 0, 1),

            baseColor: colorHex(root, "baseColor", "#1d5468", p, issues),
            deepColor: colorHex(root, "deepColor", "#071a26", p, issues),
            highlightColor: colorHex(root, "highlightColor", "#a8dcea", p, issues),
            colorVariation: num(root, "colorVariation", 0.55, p, issues, 0, 1),
            highlightIntensity: num(root, "highlightIntensity", 0.45, p, issues, 0, 2),
            highlightThreshold: num(root, "highlightThreshold", 0.55, p, issues, 0, 1),
            fresnelIntensity: num(root, "fresnelIntensity", 0.35, p, issues, 0, 2),

            waveAmplitude: num(root, "waveAmplitude", 0.07, p, issues, 0, 2),
            waveFrequency: num(root, "waveFrequency", 0.38, p, issues, 0.01, 5),
            waveSpeed: num(root, "waveSpeed", 0.45, p, issues, 0, 10),
            waveDirection: num(root, "waveDirection", 35, p, issues, -360, 360),
            secondaryWaveIntensity: num(root, "secondaryWaveIntensity", 0.6, p, issues, 0, 2),

            detailScale: num(root, "detailScale", 1.4, p, issues, 0.05, 20),
            detailIntensity: num(root, "detailIntensity", 0.4, p, issues, 0, 1),
            rippleIntensity: num(root, "rippleIntensity", 0.35, p, issues, 0, 2),
            rippleSpeed: num(root, "rippleSpeed", 0.7, p, issues, 0, 10),
        },
        issues,
    };
}
