/**
 * Typed, validated view of `glowingcracks-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Every key below is a shader uniform except `surfaceSize`, which is also the mesh scale, so
 * `applyConfig()` is a list of assignments: a slider lands on the frame it is dragged, and no knob
 * can trigger a shader recompile.
 *
 * The parameters are grouped the way the effect is built — **base surface**, then **core**, then
 * **glow**. Those three are independent on purpose: re-colouring and re-scaling them is what turns
 * the same shader from lava into arcane fractures or a cracked energy shield.
 */

import { bool, colorHex, ConfigIssues, int, num } from "../../core/config";

export interface GlowingCracksConfig {
    enabled: boolean;

    // ---- Colours -------------------------------------------------------------------------
    /** The unbroken material between the cracks. Keep it genuinely dark — the contrast is the effect. */
    baseColor: string;
    /** Fills the body of each channel. The hue the network reads as from a distance. */
    crackColor: string;
    /** The hottest line down the middle of a channel. Pale: it only reaches a few percent of pixels. */
    coreColor: string;
    /** The halo spilling onto the surface either side. A darker, deeper form of `crackColor`. */
    glowColor: string;

    // ---- Pattern -------------------------------------------------------------------------
    /** Rough width of one unbroken region, in world units. The whole pattern is keyed off it. */
    patternScale: number;
    /** Half-width of the main channels, as a fraction of a region. 0.07 is a fifteenth of one across. */
    crackWidth: number;
    /** How far that width swings from place to place. Past 1.0 the thinnest cracks close entirely. */
    crackWidthVariation: number;
    /** How far the secondary fractures spread off the main network. 0 is the bare primary network. */
    branchingIntensity: number;
    /** Domain warp on the network: 0 is a bare Voronoi grid, high is torn and organic. */
    patternDistortion: number;
    /** Frequency of the branch network and the surface grain relative to the regions. */
    detailScale: number;
    /** Shifts the pattern deterministically. Same seed, same cracks — it is only an offset. */
    seed: number;

    // ---- Glow ----------------------------------------------------------------------------
    /** Width of the bright core, as a fraction of the channel width. 1.0 fills the whole channel. */
    coreWidth: number;
    /** How far the halo reaches past the channel edge, in region units. */
    glowRadius: number;
    /** Brightness of the halo. Keep it under the core or the network stops reading as lines. */
    glowIntensity: number;
    /** Brightness of the core. Above ~1.5 the centre line clips to white, which is often right. */
    coreIntensity: number;
    /** Softness of the channel and core edges. 0 is a hard rim, 1 ramps across the full width. */
    edgeSoftness: number;

    // ---- Animation -----------------------------------------------------------------------
    /** Master switch for the motion. Off, the cracks hold one frozen frame of it. */
    animationEnabled: boolean;
    /** Heat pulse rate in cycles per second. The phase varies per region, so it never flashes. */
    pulseSpeed: number;
    /** Depth of that pulse as a fraction of brightness. 0 is a perfectly steady glow. */
    pulseIntensity: number;
    /** Speed of the fine shimmer inside the channels. 0 skips the sample entirely. */
    detailMotionSpeed: number;

    // ---- Surface -------------------------------------------------------------------------
    /** Width of the square the surface spans, in world units. Also the span the UV range covers. */
    surfaceSize: number;
    /** Darkens the outer rim to nothing so the straight edge of the mesh never ends the pattern. */
    edgeFade: number;
}

export function normalizeGlowingCracksConfig(raw: unknown): { config: GlowingCracksConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "glowingcracks";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),

            baseColor: colorHex(root, "baseColor", "#0d0b0b", p, issues),
            crackColor: colorHex(root, "crackColor", "#ff4b0d", p, issues),
            coreColor: colorHex(root, "coreColor", "#ffd79b", p, issues),
            glowColor: colorHex(root, "glowColor", "#b31a06", p, issues),

            patternScale: num(root, "patternScale", 2.2, p, issues, 0.1, 40),
            crackWidth: num(root, "crackWidth", 0.07, p, issues, 0.002, 0.5),
            crackWidthVariation: num(root, "crackWidthVariation", 0.7, p, issues, 0, 1.5),
            branchingIntensity: num(root, "branchingIntensity", 0.55, p, issues, 0, 1),
            patternDistortion: num(root, "patternDistortion", 0.45, p, issues, 0, 1.5),
            detailScale: num(root, "detailScale", 3, p, issues, 1, 12),
            seed: int(root, "seed", 1, p, issues, 0, 9999),

            coreWidth: num(root, "coreWidth", 0.35, p, issues, 0.05, 1),
            glowRadius: num(root, "glowRadius", 0.16, p, issues, 0, 1),
            glowIntensity: num(root, "glowIntensity", 0.75, p, issues, 0, 3),
            coreIntensity: num(root, "coreIntensity", 1.3, p, issues, 0, 4),
            edgeSoftness: num(root, "edgeSoftness", 0.6, p, issues, 0, 1),

            animationEnabled: bool(root, "animationEnabled", true, p, issues),
            pulseSpeed: num(root, "pulseSpeed", 0.25, p, issues, 0, 4),
            pulseIntensity: num(root, "pulseIntensity", 0.3, p, issues, 0, 1),
            detailMotionSpeed: num(root, "detailMotionSpeed", 0.18, p, issues, 0, 2),

            surfaceSize: num(root, "surfaceSize", 60, p, issues, 1, 500),
            edgeFade: num(root, "edgeFade", 1, p, issues, 0, 1),
        },
        issues,
    };
}
