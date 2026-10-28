/**
 * The built-in ice looks, as data.
 *
 * A TS module rather than a JSON file on purpose: everything else under `src/vfx` is importable
 * into a playable with nothing but `three` on the dependency list, and a JSON import would make
 * `resolveJsonModule` (or a bundler plugin) a requirement for anyone integrating the ice. The
 * effect's own tunable config stays JSON, because the lab is what loads that one.
 *
 * Each entry is a *partial* config handed straight to `normalizeIceSurfaceConfig`, which fills
 * every unmentioned field from the schema defaults — so a preset only ever states what makes it
 * different, and gains new fields automatically as the schema grows.
 *
 * They are ordered by how much of the world below survives them, because that is the axis the
 * whole effect is judged on: Crystal Clear hides almost nothing, Dark Frozen Lake leaves a
 * silhouette. A preset that does not change how well you can see through the ice is not a
 * different preset.
 */

export interface IcePresetEntry {
    readonly label: string;
    /** Partial `IceSurfaceConfig`; validated on load like any other raw input. */
    readonly config: Record<string, unknown>;
}

export const ICE_PRESET_DATA = {
    "clear-frozen-lake": {
        label: "Clear Frozen Lake",
        config: {
            transparency: 0.88,
            clarity: 0.8,
            refractionStrength: 0.22,
            iceThickness: 0.35,
            depthAbsorption: 0.5,
            depthTint: "#9fdef5",
            cloudiness: 0.22,
            cloudContrast: 0.5,
            crackDensity: 0.35,
            crackWidth: 0.03,
            crackOpacity: 0.45,
            bubbleDensity: 0.22,
            frostCoverage: 0.18,
            frostOpacity: 0.8,
            specularIntensity: 0.9,
            fresnelIntensity: 0.7,
        },
    },
    "cracked-frozen-lake": {
        label: "Cracked Frozen Lake",
        config: {
            transparency: 0.76,
            clarity: 0.6,
            refractionStrength: 0.3,
            iceThickness: 0.45,
            depthAbsorption: 0.7,
            cloudiness: 0.35,
            cloudScale: 2.6,
            cloudContrast: 0.7,
            crackDensity: 0.85,
            crackScale: 1.9,
            crackWidth: 0.055,
            crackBranching: 0.85,
            crackIrregularity: 0.7,
            crackOpacity: 0.62,
            crackHighlightIntensity: 0.9,
            bubbleDensity: 0.5,
            bubbleMaxSize: 0.038,
            bubbleOpacity: 0.78,
            frostCoverage: 0.32,
            frostNearCracks: 0.55,
        },
    },
    "deep-blue-ice": {
        label: "Deep Blue Ice",
        config: {
            transparency: 0.78,
            clarity: 0.7,
            refractionStrength: 0.34,
            iceThickness: 1.1,
            depthAbsorption: 1.15,
            depthTint: "#5ab6dd",
            iceColor: "#8fd0ea",
            deepIceColor: "#15577f",
            internalParallax: 0.85,
            internalDepthIntensity: 0.65,
            cloudiness: 0.28,
            cloudScale: 4.5,
            crackDensity: 0.3,
            crackDepth: 0.7,
            crackOpacity: 0.45,
            bubbleDensity: 0.25,
            bubbleDepth: 0.9,
            frostCoverage: 0.14,
            fresnelIntensity: 1.3,
            rimIntensity: 0.6,
            specularIntensity: 1.1,
        },
    },
    "frosted-lake": {
        label: "Frosted Lake",
        config: {
            transparency: 0.7,
            clarity: 0.35,
            refractionStrength: 0.18,
            iceThickness: 0.5,
            depthAbsorption: 0.7,
            cloudiness: 0.62,
            cloudScale: 4.2,
            cloudContrast: 0.35,
            crackDensity: 0.3,
            crackOpacity: 0.4,
            bubbleDensity: 0.3,
            frostCoverage: 0.68,
            frostScale: 3.4,
            frostSoftness: 0.75,
            frostOpacity: 0.9,
            frostRoughness: 0.85,
            frostEdgeIntensity: 0.7,
            roughness: 0.42,
            specularIntensity: 0.6,
        },
    },
    "glacier-ice": {
        label: "Glacier Ice",
        config: {
            transparency: 0.74,
            clarity: 0.45,
            refractionStrength: 0.4,
            refractionScale: 1.8,
            iceThickness: 1.4,
            depthAbsorption: 0.95,
            depthTint: "#6fe0d8",
            iceColor: "#a8ece9",
            deepIceColor: "#11787a",
            internalParallax: 1.0,
            internalDepthIntensity: 0.85,
            cloudiness: 0.55,
            cloudScale: 5.5,
            cloudContrast: 0.65,
            crackDensity: 0.45,
            crackScale: 3.4,
            crackColor: "#cdf6f2",
            bubbleDensity: 0.8,
            bubbleMinSize: 0.006,
            bubbleMaxSize: 0.026,
            bubbleClustering: 0.85,
            bubbleOpacity: 0.8,
            bubbleDepth: 0.9,
            frostCoverage: 0.25,
            rimColor: "#aef2ea",
        },
    },
    "crystal-clear-ice": {
        label: "Crystal Clear Ice",
        config: {
            transparency: 0.97,
            clarity: 1.0,
            refractionStrength: 0.42,
            refractionScale: 0.75,
            refractionDetail: 0.7,
            chromaticAberration: 0.22,
            iceThickness: 0.3,
            depthAbsorption: 0.25,
            depthTint: "#c9f2ff",
            cloudiness: 0.07,
            crackDensity: 0.2,
            crackWidth: 0.02,
            crackOpacity: 0.35,
            crackHighlightIntensity: 1.0,
            bubbleDensity: 0.12,
            frostCoverage: 0.06,
            roughness: 0.07,
            specularIntensity: 1.5,
            fresnelIntensity: 1.0,
            normalStrength: 0.3,
            sparkleIntensity: 0.25,
        },
    },
    "fantasy-ice": {
        label: "Fantasy Ice",
        config: {
            transparency: 0.82,
            clarity: 0.75,
            refractionStrength: 0.5,
            refractionScale: 0.9,
            chromaticAberration: 0.35,
            iceThickness: 0.7,
            depthAbsorption: 0.9,
            depthTint: "#49e8ff",
            iceColor: "#79e6ff",
            deepIceColor: "#1b3fd0",
            surfaceColor: "#ffffff",
            colorVariation: 0.85,
            cloudiness: 0.3,
            cloudContrast: 0.8,
            crackDensity: 0.7,
            crackScale: 2.2,
            crackWidth: 0.045,
            crackBranching: 0.8,
            crackColor: "#d8fbff",
            crackHighlightIntensity: 1.8,
            crackOpacity: 0.7,
            bubbleDensity: 0.35,
            frostCoverage: 0.2,
            rimColor: "#67f0ff",
            rimIntensity: 0.9,
            fresnelIntensity: 1.4,
            specularIntensity: 1.6,
            sparkleIntensity: 0.8,
        },
    },
    "dark-frozen-lake": {
        label: "Dark Frozen Lake",
        config: {
            transparency: 0.72,
            clarity: 0.4,
            refractionStrength: 0.26,
            iceThickness: 0.9,
            depthAbsorption: 1.6,
            depthTint: "#3f6d84",
            iceColor: "#5c7482",
            deepIceColor: "#101c26",
            surfaceColor: "#c9dde6",
            colorVariation: 0.35,
            cloudiness: 0.45,
            cloudContrast: 0.6,
            crackDensity: 0.25,
            crackWidth: 0.025,
            crackColor: "#eaf8ff",
            crackHighlightIntensity: 1.4,
            crackOpacity: 0.55,
            bubbleDensity: 0.2,
            bubbleOpacity: 0.5,
            frostCoverage: 0.3,
            frostColor: "#cfdde4",
            frostOpacity: 0.7,
            roughness: 0.3,
            specularIntensity: 0.7,
            rimColor: "#8fb6c8",
            rimIntensity: 0.4,
        },
    },
} as const satisfies Readonly<Record<string, IcePresetEntry>>;

export type IcePresetId = keyof typeof ICE_PRESET_DATA;

export const ICE_PRESET_IDS = Object.keys(ICE_PRESET_DATA) as IcePresetId[];

export function icePresetLabel(id: string): string {
    return ICE_PRESET_DATA[id as IcePresetId]?.label ?? id;
}
