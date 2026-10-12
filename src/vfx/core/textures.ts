/**
 * Procedural particle textures, drawn on a canvas at startup.
 *
 * The project has no artist sprites yet, so every texture here is generated. They are built as
 * plain `CanvasTexture`s behind {@link TextureProvider} precisely so that swapping in a painted
 * PNG or a flipbook later is a provider change, not a rewrite of the effects.
 *
 * RGB is always white; tint comes from the per-particle colour attribute. That keeps one texture
 * serving every colour variant instead of one texture per hue.
 */

import { CanvasTexture, LinearFilter, SRGBColorSpace, Texture, ClampToEdgeWrapping } from "three";
import { createRng } from "./random";

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("vfx: 2D canvas context unavailable, cannot build procedural textures");
    return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): Texture {
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
}

/**
 * Soft round glow: a hot core that falls off fast, then a wide dim halo.
 *
 * The two-stop falloff is what makes an ember read as "glowing" under additive blending without
 * a bloom pass — a single linear gradient blows out to a flat disc as soon as particles overlap.
 */
export function createGlowTexture(size = 128): Texture {
    const { canvas, ctx } = makeCanvas(size);
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0.0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.18, "rgba(255,255,255,0.92)");
    g.addColorStop(0.42, "rgba(255,255,255,0.35)");
    g.addColorStop(0.72, "rgba(255,255,255,0.07)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return finish(canvas);
}

/**
 * Ember silhouette: the glow above, nibbled by a few soft dark blobs so the outline is irregular
 * rather than a perfect circle. The blobs stay inside the mid-radius, so the halo is untouched
 * and the particle still fades to zero at the quad edge.
 */
export function createEmberTexture(size = 128, seed = 1337): Texture {
    const { canvas, ctx } = makeCanvas(size);
    const half = size / 2;
    const rng = createRng(seed);

    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0.0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.22, "rgba(255,255,255,0.88)");
    g.addColorStop(0.5, "rgba(255,255,255,0.28)");
    g.addColorStop(0.78, "rgba(255,255,255,0.05)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2;
        const d = half * (0.18 + rng() * 0.22);
        const r = half * (0.1 + rng() * 0.16);
        const x = half + Math.cos(a) * d;
        const y = half + Math.sin(a) * d;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, `rgba(0,0,0,${0.16 + rng() * 0.2})`);
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    return finish(canvas);
}

/**
 * Smoke puff: fractal value noise masked by a radial falloff.
 *
 * The mask is raised to a power so alpha reaches exactly zero well before the quad border —
 * that is what prevents the square sprite edge from ever becoming visible, which is the usual
 * giveaway on cheap smoke. The noise is multiplied in (not added) so the puff stays wispy and
 * never turns into a solid grey disc.
 */
export function createSmokeTexture(size = 256, seed = 9001): Texture {
    const { canvas, ctx } = makeCanvas(size);
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const noise = buildValueNoise(seed);
    const half = size / 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = (x - half) / half;
            const ny = (y - half) / half;
            const dist = Math.hypot(nx, ny);

            // Warp the sample point slightly so the silhouette is lumpy, not concentric.
            const warp = noise.fbm(nx * 1.7 + 11.3, ny * 1.7 - 4.1, 3);
            const d = Math.min(1, dist * (0.82 + warp * 0.45));

            const mask = Math.pow(Math.max(0, 1 - d), 1.9);
            const detail = 0.45 + 0.55 * noise.fbm(nx * 2.6, ny * 2.6, 4);
            const alpha = Math.max(0, Math.min(1, mask * detail));

            const i = (y * size + x) * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = Math.round(alpha * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
    return finish(canvas);
}

/** Value noise with smoothstep interpolation; enough structure for a 256px puff, no deps. */
function buildValueNoise(seed: number) {
    const perm = new Uint8Array(512);
    const rng = createRng(seed);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

    const grad = (ix: number, iy: number) => perm[(perm[ix & 255] + (iy & 255)) & 511] / 255;
    const fade = (t: number) => t * t * (3 - 2 * t);

    const value = (x: number, y: number) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = fade(x - x0);
        const fy = fade(y - y0);
        const a = grad(x0, y0);
        const b = grad(x0 + 1, y0);
        const c = grad(x0, y0 + 1);
        const d = grad(x0 + 1, y0 + 1);
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };

    return {
        fbm(x: number, y: number, octaves: number): number {
            let sum = 0;
            let amp = 0.5;
            let freq = 4;
            let norm = 0;
            for (let o = 0; o < octaves; o++) {
                sum += value(x * freq, y * freq) * amp;
                norm += amp;
                amp *= 0.5;
                freq *= 2;
            }
            return sum / norm;
        },
    };
}

export type ParticleTextureId = "glow" | "ember" | "smoke";

/**
 * Lazily builds and owns the procedural textures, one instance per effect system.
 *
 * Replacing the procedural look with artist art later means subclassing this (or passing an
 * override map) — the effects only ever ask for an id such as `"smoke"` and never know whether
 * what came back was drawn on a canvas or loaded from a file. No asset path is baked in anywhere.
 */
export class TextureProvider {
    private readonly cache = new Map<string, Texture>();
    private readonly overrides: Partial<Record<ParticleTextureId, Texture>>;

    constructor(overrides: Partial<Record<ParticleTextureId, Texture>> = {}) {
        this.overrides = overrides;
    }

    get(id: ParticleTextureId): Texture {
        const override = this.overrides[id];
        if (override) return override;

        const cached = this.cache.get(id);
        if (cached) return cached;

        const created = id === "smoke" ? createSmokeTexture() : id === "ember" ? createEmberTexture() : createGlowTexture();
        this.cache.set(id, created);
        return created;
    }

    /** Disposes only what this provider created; injected overrides stay owned by their creator. */
    dispose(): void {
        for (const tex of this.cache.values()) tex.dispose();
        this.cache.clear();
    }
}
