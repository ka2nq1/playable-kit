/**
 * Typed, validated view of `icesurface-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 *
 * Almost every key is a plain uniform, so dragging it lands on the next frame. The exceptions are
 * listed in {@link ICE_FEATURE_KEYS}: they switch whole blocks of the shader in or out with a
 * `#define`, which costs one compile each time they change and buys the fragment cost of a
 * feature nobody asked for. Everything else is free to drag.
 */

import { bool, colorHex, ConfigIssues, num, oneOf } from "../../core/config";

/**
 * PERFORMANCE samples nothing: the ice is an ordinary transparent surface and what is under it
 * shows through by alpha blending. ENHANCED reads the shared framebuffer grab and displaces the
 * sample, which is the only way an object under the ice actually bends.
 */
export const ICE_QUALITY_MODES = ["performance", "enhanced"] as const;
export type IceQualityMode = (typeof ICE_QUALITY_MODES)[number];

/** The config keys that are compiled in rather than uploaded. Changing one rebuilds the program. */
export const ICE_FEATURE_KEYS = ["qualityMode", "cracksEnabled", "bubblesEnabled", "frostEnabled", "frostBlur"] as const;

export interface IceSurfaceConfig {
    enabled: boolean;
    /** PERFORMANCE is the mobile path; ENHANCED adds the framebuffer grab and real refraction. */
    qualityMode: IceQualityMode;

    // ---- Transparency & refraction ---------------------------------------------------------
    /** How much of the scene behind the ice survives in a *clear* region. 1 is window glass. */
    transparency: number;
    /** How well clear ice resists its own milkiness. 1 keeps the clear patches genuinely clear. */
    clarity: number;
    /** Lateral displacement of the background, in world units at `iceThickness` 1. 0 is flat glass. */
    refractionStrength: number;
    /** World size of one feature in the refracting normal field. Small values read as hammered glass. */
    refractionScale: number;
    /** How much of the fine surface detail feeds refraction, rather than only the broad tilt. */
    refractionDetail: number;
    /** Splits the refracted sample across R and B. Subtle: past ~0.3 it reads as a broken shader. */
    chromaticAberration: number;
    /** Extra opacity at grazing angles — ice seen edge-on is a longer path through the same slab. */
    viewAngleOpacity: number;
    /** Softens the refracted sample inside frosted regions. ENHANCED only; costs 3 extra taps. */
    frostBlur: boolean;

    // ---- Thickness & optical depth ---------------------------------------------------------
    /** Apparent slab thickness in world units. Scales absorption, parallax and refraction together. */
    iceThickness: number;
    /** How fast light is eaten on its way through. The Beer-Lambert coefficient, near enough. */
    depthAbsorption: number;
    /** What the ice leaves of the light it does not absorb. Keep it a cold, desaturated colour. */
    depthTint: string;
    /** How far the internal layers slide against the surface as the camera moves. 0 is a decal. */
    internalParallax: number;
    /** Strength of the deeper cloud layer that makes the slab read as a volume, not a sheet. */
    internalDepthIntensity: number;

    // ---- Ice body ---------------------------------------------------------------------------
    /** The ice itself where it is neither clear nor frosted. */
    iceColor: string;
    /** What thick, absorbing or cloudy ice tends toward. The blue end of the palette. */
    deepIceColor: string;
    /** Tint of the specular highlights and the glints. Near white, slightly cool. */
    surfaceColor: string;
    /** How far the body colour swings between the cloud field's low and high ground. */
    colorVariation: number;
    /** Coverage of the milky internal regions. This is what stops the sheet reading as glass. */
    cloudiness: number;
    /** World size of one cloudy region. */
    cloudScale: number;
    /** How hard the edge between clear and milky is. 1 is marbled, 0 is an even haze. */
    cloudContrast: number;

    // ---- Cracks -------------------------------------------------------------------------------
    cracksEnabled: boolean;
    /** Fraction of the surface the fracture network actually reaches. Low leaves clear plates. */
    crackDensity: number;
    /** World size of one plate between fractures. */
    crackScale: number;
    /** Width of a primary fracture as a fraction of a plate. */
    crackWidth: number;
    /** Strength of the finer branches spreading off the primaries. */
    crackBranching: number;
    /** Domain warp on the network. 0 is a bare Voronoi grid, which never looks like ice. */
    crackIrregularity: number;
    /** How far below the surface the fracture plane sits, as a fraction of `iceThickness`. */
    crackDepth: number;
    /** How much a fracture obscures what is behind it. */
    crackOpacity: number;
    /** Colour inside the fracture. Darker than the ice reads as depth; brighter reads as frost. */
    crackColor: string;
    /** Brightness of the lit sliver along one side of each fracture. */
    crackHighlightIntensity: number;

    // ---- Bubbles ------------------------------------------------------------------------------
    bubblesEnabled: boolean;
    /** Fraction of cells that hold a bubble. */
    bubbleDensity: number;
    /** Smallest bubble radius, in world units. */
    bubbleMinSize: number;
    /** Largest bubble radius, in world units. Also sets the cell size, so it sets the spacing. */
    bubbleMaxSize: number;
    /** How strongly bubbles gather into the cloudy regions instead of spreading evenly. */
    bubbleClustering: number;
    /** How opaque a bubble is. */
    bubbleOpacity: number;
    /** Depth of the bubble layer as a fraction of `iceThickness`. Deeper than the cracks reads best. */
    bubbleDepth: number;
    /** Lens distortion around each bubble. ENHANCED only — it displaces the background sample. */
    bubbleDistortion: number;

    // ---- Frost ---------------------------------------------------------------------------------
    frostEnabled: boolean;
    /** Fraction of the surface under frost. */
    frostCoverage: number;
    /** World size of one frost patch. */
    frostScale: number;
    /** Width of the transition into a patch. 0 is a hard-edged stencil. */
    frostSoftness: number;
    /** How much of the background a fully frosted pixel hides. 1 is solid white. */
    frostOpacity: number;
    /** Extra surface roughness under frost: broad sheen instead of a sharp highlight. */
    frostRoughness: number;
    /** The frost itself. Near white; the tint comes from the ice under it. */
    frostColor: string;
    /** Brightness of the crust along the rim of a patch. */
    frostEdgeIntensity: number;
    /** How much frost gathers along the fractures. 0 leaves the cracks bare. */
    frostNearCracks: number;

    // ---- Surface --------------------------------------------------------------------------------
    /** Surface roughness. Low is wet and glassy, high is a dull sheen. */
    roughness: number;
    /** Specular strength. */
    specularIntensity: number;
    /** Strength of the Fresnel brightening toward grazing angles. */
    fresnelIntensity: number;
    /** Colour of the Fresnel rim. */
    rimColor: string;
    /** Strength of that rim as emitted light, separate from its effect on opacity. */
    rimIntensity: number;
    /** Depth of the micro relief on the surface. This is what the highlights break up against. */
    normalStrength: number;
    /** World size of one micro-relief feature. */
    microDetailScale: number;
    /** Crystalline twinkle in frosted regions. The only animated term in the shader. */
    sparkleIntensity: number;
    /** Heading of the key light, in degrees counter-clockwise from +X. */
    lightAzimuth: number;
    /** Elevation of the key light above the surface, in degrees. */
    lightElevation: number;

    // ---- Surface extent ---------------------------------------------------------------------------
    /** Width of the square the surface spans, in world units. Also the span the UV range covers. */
    surfaceSize: number;
    /** Fades the outer rim out, so the straight edge of the mesh is never what ends the ice. */
    edgeFade: number;
}

export function normalizeIceSurfaceConfig(raw: unknown): { config: IceSurfaceConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "icesurface";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            qualityMode: oneOf(root, "qualityMode", ICE_QUALITY_MODES, "enhanced", p, issues),

            transparency: num(root, "transparency", 0.86, p, issues, 0, 1),
            clarity: num(root, "clarity", 0.75, p, issues, 0, 1),
            refractionStrength: num(root, "refractionStrength", 0.22, p, issues, 0, 2),
            refractionScale: num(root, "refractionScale", 1.1, p, issues, 0.02, 20),
            refractionDetail: num(root, "refractionDetail", 0.45, p, issues, 0, 1),
            chromaticAberration: num(root, "chromaticAberration", 0.12, p, issues, 0, 1),
            viewAngleOpacity: num(root, "viewAngleOpacity", 0.35, p, issues, 0, 1),
            frostBlur: bool(root, "frostBlur", false, p, issues),

            iceThickness: num(root, "iceThickness", 0.35, p, issues, 0.01, 5),
            depthAbsorption: num(root, "depthAbsorption", 0.55, p, issues, 0, 4),
            depthTint: colorHex(root, "depthTint", "#8fd8f2", p, issues),
            internalParallax: num(root, "internalParallax", 0.6, p, issues, 0, 2),
            internalDepthIntensity: num(root, "internalDepthIntensity", 0.45, p, issues, 0, 1),

            iceColor: colorHex(root, "iceColor", "#bfe8f7", p, issues),
            deepIceColor: colorHex(root, "deepIceColor", "#2f7fa8", p, issues),
            surfaceColor: colorHex(root, "surfaceColor", "#eafbff", p, issues),
            colorVariation: num(root, "colorVariation", 0.5, p, issues, 0, 1),
            cloudiness: num(root, "cloudiness", 0.3, p, issues, 0, 1),
            cloudScale: num(root, "cloudScale", 3.2, p, issues, 0.1, 60),
            cloudContrast: num(root, "cloudContrast", 0.55, p, issues, 0, 1),

            cracksEnabled: bool(root, "cracksEnabled", true, p, issues),
            crackDensity: num(root, "crackDensity", 0.45, p, issues, 0, 1),
            crackScale: num(root, "crackScale", 2.6, p, issues, 0.1, 40),
            crackWidth: num(root, "crackWidth", 0.035, p, issues, 0.002, 0.4),
            crackBranching: num(root, "crackBranching", 0.55, p, issues, 0, 1),
            crackIrregularity: num(root, "crackIrregularity", 0.55, p, issues, 0, 1.5),
            crackDepth: num(root, "crackDepth", 0.5, p, issues, 0, 1),
            crackOpacity: num(root, "crackOpacity", 0.5, p, issues, 0, 1),
            crackColor: colorHex(root, "crackColor", "#dff4ff", p, issues),
            crackHighlightIntensity: num(root, "crackHighlightIntensity", 0.6, p, issues, 0, 2),

            bubblesEnabled: bool(root, "bubblesEnabled", true, p, issues),
            bubbleDensity: num(root, "bubbleDensity", 0.3, p, issues, 0, 1),
            bubbleMinSize: num(root, "bubbleMinSize", 0.008, p, issues, 0.001, 0.4),
            bubbleMaxSize: num(root, "bubbleMaxSize", 0.03, p, issues, 0.002, 0.6),
            bubbleClustering: num(root, "bubbleClustering", 0.6, p, issues, 0, 1),
            bubbleOpacity: num(root, "bubbleOpacity", 0.7, p, issues, 0, 1),
            bubbleDepth: num(root, "bubbleDepth", 0.75, p, issues, 0, 1),
            bubbleDistortion: num(root, "bubbleDistortion", 0.35, p, issues, 0, 1),

            frostEnabled: bool(root, "frostEnabled", true, p, issues),
            frostCoverage: num(root, "frostCoverage", 0.22, p, issues, 0, 1),
            frostScale: num(root, "frostScale", 2.4, p, issues, 0.05, 40),
            frostSoftness: num(root, "frostSoftness", 0.45, p, issues, 0, 1),
            frostOpacity: num(root, "frostOpacity", 0.85, p, issues, 0, 1),
            frostRoughness: num(root, "frostRoughness", 0.6, p, issues, 0, 1),
            frostColor: colorHex(root, "frostColor", "#f2fbff", p, issues),
            frostEdgeIntensity: num(root, "frostEdgeIntensity", 0.5, p, issues, 0, 2),
            frostNearCracks: num(root, "frostNearCracks", 0.35, p, issues, 0, 1),

            roughness: num(root, "roughness", 0.18, p, issues, 0.02, 1),
            specularIntensity: num(root, "specularIntensity", 0.9, p, issues, 0, 4),
            fresnelIntensity: num(root, "fresnelIntensity", 0.7, p, issues, 0, 2),
            rimColor: colorHex(root, "rimColor", "#cfefff", p, issues),
            rimIntensity: num(root, "rimIntensity", 0.35, p, issues, 0, 2),
            normalStrength: num(root, "normalStrength", 0.45, p, issues, 0, 2),
            microDetailScale: num(root, "microDetailScale", 0.22, p, issues, 0.01, 4),
            sparkleIntensity: num(root, "sparkleIntensity", 0.4, p, issues, 0, 1),
            lightAzimuth: num(root, "lightAzimuth", 125, p, issues, -360, 360),
            lightElevation: num(root, "lightElevation", 42, p, issues, 1, 89),

            surfaceSize: num(root, "surfaceSize", 16, p, issues, 0.5, 500),
            edgeFade: num(root, "edgeFade", 1, p, issues, 0, 1),
        },
        issues,
    };
}
