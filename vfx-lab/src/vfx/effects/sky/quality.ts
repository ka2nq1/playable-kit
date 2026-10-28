/**
 * The two lookup tables that keep one renderer serving many looks.
 *
 * `SKY_QUALITY_PRESETS` is the only place rendering cost is decided — everything in it is a shape
 * decision that ends up in a `#define`, which is why switching quality costs exactly one shader
 * compile and nothing else in the system is rebuilt.
 *
 * `CLOUD_TYPE_SHAPES` is what makes six cloud looks one code path: each entry is a set of
 * multipliers over the authored cloud config, not a separate renderer. A storm deck and a wisp
 * run the same instructions.
 */

import type { CloudType, SkyQuality } from "./config";

export interface SkyQualityPreset {
    /** Cloud decks drawn. Each one is another ray-plane intersection and another fbm. */
    cloudLayers: number;
    cloudOctaves: number;
    /** The extra toward-the-sun sample that gives the deck a lit edge and a shaded underside. */
    cloudLighting: boolean;
    /** 3x3 star cells instead of 1. Nine hashes a pixel buys stars that can cross a cell edge. */
    starNeighbours: boolean;
    /** Multiplies the weather particle budget. */
    particleScale: number;
    /**
     * Whether anything moves.
     *
     * STATIC is for the playables that cannot afford a moving sky at all: the deck is still, the
     * stars do not twinkle and the clock does not advance, so the sky becomes a single shaded
     * pass whose output is identical every frame.
     */
    animated: boolean;
}

export const SKY_QUALITY_PRESETS: Record<SkyQuality, SkyQualityPreset> = {
    static: {
        cloudLayers: 1,
        cloudOctaves: 2,
        cloudLighting: false,
        starNeighbours: false,
        particleScale: 0,
        animated: false,
    },
    standard: {
        cloudLayers: 2,
        cloudOctaves: 3,
        cloudLighting: true,
        starNeighbours: false,
        particleScale: 1,
        animated: true,
    },
    enhanced: {
        cloudLayers: 3,
        cloudOctaves: 4,
        cloudLighting: true,
        starNeighbours: true,
        particleScale: 1.8,
        animated: true,
    },
};

export interface CloudShape {
    coverage: number;
    density: number;
    scale: number;
    detail: number;
    softness: number;
    opacity: number;
    /** Domain warp strength. High values smear the deck into streaks; low ones keep it lumpy. */
    warp: number;
}

export const CLOUD_TYPE_SHAPES: Record<CloudType, CloudShape> = {
    // Thin, stretched and barely there — high warp is what turns lumps into streaks.
    wispy: { coverage: 0.7, density: 0.5, scale: 0.45, detail: 1.3, softness: 2.2, opacity: 0.55, warp: 1.3 },
    // The neutral entry: every multiplier 1, so the authored config is what you get.
    scattered: { coverage: 1, density: 1, scale: 1, detail: 1, softness: 1, opacity: 1, warp: 0.6 },
    // Hard-edged lumps. Low softness and low warp are the whole difference.
    puffy: { coverage: 1.05, density: 1.5, scale: 1.5, detail: 0.7, softness: 0.5, opacity: 1, warp: 0.35 },
    overcast: { coverage: 1.6, density: 1.6, scale: 0.7, detail: 0.8, softness: 1.4, opacity: 1, warp: 0.5 },
    storm: { coverage: 1.7, density: 2.0, scale: 0.9, detail: 1.1, softness: 0.9, opacity: 1, warp: 0.8 },
    volcanic: { coverage: 1.3, density: 1.8, scale: 1.2, detail: 1.4, softness: 1.1, opacity: 0.95, warp: 1.5 },
};
