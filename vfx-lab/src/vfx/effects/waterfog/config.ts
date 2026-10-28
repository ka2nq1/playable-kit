/**
 * Typed, validated view of `waterfog-vfx.json`.
 *
 * Same contract as the other configs here: the JSON is the authoring surface, this module is what
 * the effect actually reads, and every number comes out finite and clamped. Keys are flat so the
 * lab's "Copy JSON" can round-trip the normalised object straight back through this reader.
 */

import { bool, colorHex, ConfigIssues, int, num } from "../../core/config";

export interface WaterFogConfig {
    enabled: boolean;
    /** Master alpha on top of everything the shader works out per pixel. */
    opacity: number;
    /**
     * How much of the surface the mist covers, 0–1. It moves the threshold the noise field is cut
     * at, so raising it grows the patches outward from where they already are rather than fading
     * a flat sheet up — which is the difference between more fog and a brighter overlay.
     */
    density: number;
    fogColor: string;
    /** Width of the square the layers span, in world units. Fog fades out well inside it. */
    areaSize: number;
    /** Height of the lowest layer above the effect's own origin — i.e. above the water. */
    heightOffset: number;
    /** Vertical gap between layers. Small: the stack should hug the surface, not fill the scene. */
    layerSpacing: number;
    /** Overlapping layers. Each one is a full-screen-ish transparent pass, so this is the fill-rate knob. */
    layerCount: number;
    /** Horizontal drift in world units per second. Read as metres: 0.1 is a slow walk of the mist. */
    driftSpeed: number;
    /** Drift heading in degrees, counter-clockwise from +X. */
    driftDirection: number;
    /** Scale of the broad patches: smaller is bigger on screen. Roughly 1 / feature size in metres. */
    noiseScale: number;
    /** Scale of the fine wisps that ragged the patch edges. Keep it several times `noiseScale`. */
    detailScale: number;
}

/**
 * Hard ceiling on layers. Exported because the effect re-applies it — the config object is edited
 * live by the panel, which does not come back through this reader.
 */
export const MAX_LAYERS = 6;

export function normalizeWaterFogConfig(raw: unknown): { config: WaterFogConfig; issues: ConfigIssues } {
    const issues = new ConfigIssues();
    const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") issues.warn("config", "not an object, using defaults throughout");

    const p = "waterfog";
    return {
        config: {
            enabled: bool(root, "enabled", true, p, issues),
            opacity: num(root, "opacity", 0.55, p, issues, 0, 1),
            density: num(root, "density", 0.55, p, issues, 0, 1),
            fogColor: colorHex(root, "fogColor", "#b9c9d6", p, issues),
            areaSize: num(root, "areaSize", 38, p, issues, 0.5, 1000),
            heightOffset: num(root, "heightOffset", 0.06, p, issues, -20, 50),
            layerSpacing: num(root, "layerSpacing", 0.1, p, issues, 0, 10),
            layerCount: int(root, "layerCount", 3, p, issues, 1, MAX_LAYERS),
            driftSpeed: num(root, "driftSpeed", 0.08, p, issues, 0, 10),
            driftDirection: num(root, "driftDirection", 35, p, issues, -360, 360),
            noiseScale: num(root, "noiseScale", 0.17, p, issues, 0.005, 5),
            detailScale: num(root, "detailScale", 0.8, p, issues, 0.01, 20),
        },
        issues,
    };
}
