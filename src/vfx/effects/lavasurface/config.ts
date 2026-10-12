/**
 * Typed, validated view of `lavasurface-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Every key below is a shader uniform except `surfaceSize`, which is also the mesh scale. Nothing
 * is baked into a buffer, which is why `applyConfig()` is a list of assignments, a slider lands on
 * the frame it is dragged, and no knob can trigger a shader recompile.
 */

import { bool, colorHex, ConfigIssues, num } from "../../core/config";

export interface LavaSurfaceConfig {
    enabled: boolean;

    // ---- Appearance ----------------------------------------------------------------------
    /** Primary crust colour. Keep it genuinely dark — the contrast with the cracks is the effect. */
    crustColor: string;
    /** Second crust colour the fine field mottles toward. A nearby brown or grey, not a new hue. */
    secondaryCrustColor: string;
    /** Main lava colour. The cool rim colour inside the channels is derived from it. */
    moltenColor: string;
    /** Colour of the hottest cores. Pale orange or yellow; it only reaches a few percent of pixels. */
    hotColor: string;
    /** Emission multiplier on the molten regions. Past ~2 the channels clip to white. */
    glowIntensity: number;
    /** How far the temperature gradient is allowed to swing. 0 leaves the molten one flat colour. */
    colorVariation: number;
    /** How far the crust mottles toward `secondaryCrustColor`. 0 is a single crust colour. */
    crustVariation: number;

    // ---- Pattern -------------------------------------------------------------------------
    /** Rough width of one crust plate, in world units. The whole pattern is keyed off it. */
    patternScale: number;
    /** Width of the molten channels, as a fraction of a plate. 0.1 is a tenth of a plate wide. */
    crackWidth: number;
    /** How much the channel width varies from place to place. High values open molten pools. */
    crackVariation: number;
    /** Domain warp on the plate network: 0 is a bare Voronoi grid, high is torn and organic. */
    patternDistortion: number;
    /** Frequency of the fine field relative to the plates: 3 means detail three times finer. */
    detailScale: number;

    // ---- Animation -----------------------------------------------------------------------
    /** Molten travel speed in world units per second. Lava is viscous — keep it under ~0.4. */
    flowSpeed: number;
    /** Heading of the flow, in degrees counter-clockwise from +X. */
    flowDirection: number;
    /** How much the molten churns as it travels, rather than sliding as one sheet. */
    flowIntensity: number;
    /** Heat pulse rate in cycles per second. */
    heatPulseSpeed: number;
    /** Depth of that pulse as a fraction of the emission. 0 is a perfectly steady glow. */
    heatPulseIntensity: number;

    // ---- Surface -------------------------------------------------------------------------
    /** Width of the square the surface spans, in world units. Also the span the UV range covers. */
    surfaceSize: number;
    /** Vertical heave of the crust, in world units. 0 leaves the plane perfectly flat. */
    displacementIntensity: number;
    /** Darkens the outer rim to nothing so the straight edge of the mesh never ends the lava. */
    edgeFade: number;
}

export function normalizeLavaSurfaceConfig(raw: unknown): { config: LavaSurfaceConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "lavasurface";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),

            crustColor: colorHex(root, "crustColor", "#14100f", p, issues),
            secondaryCrustColor: colorHex(root, "secondaryCrustColor", "#36291f", p, issues),
            moltenColor: colorHex(root, "moltenColor", "#ff5a0f", p, issues),
            hotColor: colorHex(root, "hotColor", "#ffd37a", p, issues),
            glowIntensity: num(root, "glowIntensity", 1.15, p, issues, 0, 3),
            colorVariation: num(root, "colorVariation", 0.68, p, issues, 0, 1),
            crustVariation: num(root, "crustVariation", 0.55, p, issues, 0, 1),

            patternScale: num(root, "patternScale", 2.1, p, issues, 0.1, 40),
            crackWidth: num(root, "crackWidth", 0.085, p, issues, 0.002, 0.6),
            crackVariation: num(root, "crackVariation", 0.8, p, issues, 0, 1.5),
            patternDistortion: num(root, "patternDistortion", 0.42, p, issues, 0, 1.5),
            detailScale: num(root, "detailScale", 3.2, p, issues, 0.2, 16),

            flowSpeed: num(root, "flowSpeed", 0.11, p, issues, 0, 2),
            flowDirection: num(root, "flowDirection", 24, p, issues, -360, 360),
            flowIntensity: num(root, "flowIntensity", 0.6, p, issues, 0, 2),
            heatPulseSpeed: num(root, "heatPulseSpeed", 0.3, p, issues, 0, 4),
            heatPulseIntensity: num(root, "heatPulseIntensity", 0.22, p, issues, 0, 1),

            surfaceSize: num(root, "surfaceSize", 60, p, issues, 1, 500),
            displacementIntensity: num(root, "displacementIntensity", 0.06, p, issues, 0, 1),
            edgeFade: num(root, "edgeFade", 1, p, issues, 0, 1),
        },
        issues,
    };
}
