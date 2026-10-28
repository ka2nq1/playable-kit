/**
 * Procedural glowing cracks: one plane, one `ShaderMaterial`, one draw call, no textures.
 *
 * The shader is built as **three layers that never share a term**, because that separation is the
 * whole reason this is reusable rather than a second lava shader:
 *
 *  1. **Base surface** — the dark, unbroken material. Grain and a rim-to-centre falloff only; it
 *     knows nothing about the glow, so swapping `baseColor` cannot wash the network out.
 *  2. **Core** — a narrow, hard line down the middle of every channel. This is what carries the
 *     branching structure, so it is the layer that must stay legible at every setting.
 *  3. **Glow** — a wide, soft halo around the core, explicitly attenuated *under* the core so a
 *     bright halo can never fill in the shape the core is drawing.
 *
 * Re-colour and re-scale those three and the same material is lava, an arcane fracture, or a
 * cracked energy shield — which is what the colour presets in the lab wrapper demonstrate.
 *
 * How the network is built:
 *
 *  - **One distance field, not two patterns.** A domain-warped Voronoi gives `F2 - F1`, the
 *    distance to the nearest region boundary. The branch network is a second Voronoi at
 *    `detailScale`, *offset* in the same distance units and merged with `min()`. Offsetting a
 *    distance field thins the lines it produces, so `branchingIntensity` fades branches in by
 *    narrowing them — and because core, channel and halo are all thresholds on that one field,
 *    branches get their own cores and haloes for free, perfectly registered.
 *  - **The pattern is static. Only brightness moves.** Nothing advects the coordinates, so the
 *    cracks read as fractures in a solid, not as flowing liquid. `uTime` reaches the pulse phase
 *    and the fine shimmer and nothing else.
 *  - **Nothing happens on the CPU per frame.** `update(dt)` advances one float. Every knob is a
 *    uniform (plus one mesh scale), so no slider allocates, rebuilds a buffer or recompiles.
 *  - **It reads without post-processing.** Emission is tuned to sit just under clipping outside
 *    the core, so the network is bright on a renderer with no bloom and no tone mapping.
 *
 * Cost per pixel: two 3×3 Voronoi searches (one when `branchingIntensity` is 0) and four noise
 * samples (five with `detailMotionSpeed` on). Both extras are behind uniform branches, which are
 * coherent across the whole draw.
 *
 * The pattern is driven by `uv`, not by vertex position, so the same material drops onto any mesh
 * with sensible UVs — `surfaceSize` is then simply how many world units the UV range spans.
 *
 *     const cracks = new GlowingCracksVfx(config);
 *     scene.add(cracks.object3d);
 *
 *     cracks.update(delta);     // from the loop you already have
 *     cracks.enabled = false;   // off, without tearing anything down
 *     cracks.dispose();         // on teardown
 *
 *     someMesh.material = cracks.material;   // or reuse the material on your own geometry
 */

import { Color, FrontSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeGlowingCracksConfig, type GlowingCracksConfig } from "./config";

export interface GlowingCracksVfxOptions {
    /**
     * Plane orientation. The lab previews this as ground; `"xy"` stands the same plane up as a
     * wall, which is how a cracked shield or a fractured rock face wants it. Not a uniform: it is
     * a geometry rotation, so it is fixed at construction.
     */
    orientation?: "ground" | "xy";
}

const VERTEX = /* glsl */ `
uniform float uSize;

varying vec2 vPlane;

void main() {
    // Pattern coordinates come from uv, not from position: the preview plane is a unit square the
    // host scales, and the same material therefore works unchanged on someone else's mesh.
    vPlane = (uv - 0.5) * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform vec3 uBase;
uniform vec3 uCrack;
uniform vec3 uCore;
uniform vec3 uGlowColor;
uniform float uPatternScale;
uniform float uCrackWidth;
uniform float uWidthVar;
uniform float uBranching;
uniform float uDistortion;
uniform float uDetailScale;
uniform vec2 uSeed;
uniform float uCoreWidth;
uniform float uGlowRadius;
uniform float uGlowIntensity;
uniform float uCoreIntensity;
uniform float uEdgeSoftness;
uniform float uAnim;
uniform float uPulseSpeed;
uniform float uPulseIntensity;
uniform float uMotionSpeed;
uniform float uEdgeFade;

varying vec2 vPlane;

/**
 * Simplex noise (Ashima / Gustavson, 2D).
 *
 * Value noise would be cheaper, but it carries an axis-aligned lattice, and feeding a lattice into
 * a Voronoi warp produces cracks that line up with the grid — the one thing this effect cannot do.
 */
vec3 permute289(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute289(permute289(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Hash from Dave Hoskins: no trig, stable across drivers, and three multiplies cheaper than the
// sin-based hash that a Voronoi this size would otherwise pay nine times over.
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

/**
 * Nearest and second-nearest feature distance over the 3×3 neighbourhood.
 *
 * Nine cells is the minimum a Voronoi can be correct with, and this is the only loop in the
 * shader. F2 - F1 is the cheap edge estimate rather than the exact distance-to-border: it costs
 * one pass instead of two, and the way it thickens where three regions meet is exactly what makes
 * the channels look like they branch instead of meeting at clean points.
 */
vec2 voronoiF1F2(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 r = g + hash22(n + g) - f;
            float d = dot(r, r);
            if (d < f1) {
                f2 = f1;
                f1 = d;
            } else if (d < f2) {
                f2 = d;
            }
        }
    }
    return vec2(sqrt(f1), sqrt(f2));
}

/**
 * Mask for "within halfWidth of the centreline", with a configurable ramp.
 *
 * The inner edge is pulled back by at least one pixel so it is always strictly below the outer
 * one — smoothstep is undefined when edge0 >= edge1, which at edgeSoftness 0 is exactly where
 * this would otherwise land. That same pixel is what keeps a hard-edged crack anti-aliased.
 */
float band(float d, float halfWidth, float soft, float px) {
    float inner = halfWidth - max(halfWidth * soft, px);
    return 1.0 - smoothstep(inner, halfWidth, d);
}

void main() {
    float scale = max(uPatternScale, 0.01);
    // Everything below works in region units, so patternScale re-sizes the pattern without also
    // changing how wide the cracks read or how far the glow reaches.
    vec2 p = vPlane / scale + uSeed;

    // --- Network ------------------------------------------------------------------------------
    // Two samples bend the cell grid out of shape. Below the region frequency, so it tears the
    // boundaries rather than adding a second, finer pattern on top of them.
    vec2 warp = vec2(snoise(p * 0.45), snoise(p * 0.45 + 31.7));
    vec2 pw = p + warp * uDistortion;

    vec2 f = voronoiF1F2(pw);
    float edge = f.y - f.x;

    // World size of a pixel, in region units. A channel thinner than a pixel is not a channel, it
    // is shimmer, so every width below is floored here rather than allowed to alias away.
    float px = (fwidth(pw.x) + fwidth(pw.y)) * 0.5 + 1e-5;

    // One fine field serves the surface grain and the width variation; one slow field serves the
    // regional brightness. A third would buy nothing either of them does not already have.
    float detail = snoise(pw * uDetailScale + 9.2);
    float heat = snoise(p * 0.7 + 17.3);

    // Some channels broad, others hairline. This is what stops every crack reading as one stroke
    // width, and past ~1.0 it closes the thinnest ones entirely.
    float wantW = uCrackWidth * (1.0 + uWidthVar * (detail * 0.6 + heat * 0.4));
    float w = max(wantW, px * 1.5);
    // Widening a sub-pixel channel back up to a pixel is what stops it aliasing, but on its own it
    // also *adds* lit area with distance — and a horizon that glows is the failure this effect
    // cannot afford. Dimming by exactly the factor the width was inflated by keeps the light the
    // channel contributes the same, so far cracks go faint instead of fat. The same factor retires
    // a channel whose width field went negative, which is the other thing it has to do.
    float wFade = clamp(wantW / w, 0.0, 1.0);

    // Branches: a second network merged into the same distance field, so they inherit the core,
    // the channel and the halo already defined on it rather than being a fourth layer to balance.
    //
    // Merged with a smooth union, not min(): that is what makes a branch *fuse* into the channel
    // it reaches, thickening slightly at the junction, instead of crossing it like a drawn line.
    // The strength term rides along so the branches can also be dimmer than the mains — a hairline
    // fracture does not emit as much as the seam it runs off, and fading it out is what lets
    // branchingIntensity reach a genuine zero.
    float d = edge;
    float strength = 1.0;
    if (uBranching > 0.001) {
        vec2 fb = voronoiF1F2(pw * uDetailScale);
        // Deep inside a region, away = 1. Branches thin out and dim there, so they read as
        // spreading off the main network rather than as a second pattern laid over everything.
        float away = smoothstep(0.05, 0.5, edge);
        float hide = 1.0 - uBranching;
        // Scaling a distance field steepens it, which narrows every line it produces; fading is
        // what finishes them off. Low intensity is therefore thin *and* faint, never just fewer.
        float bd = (fb.y - fb.x) / uDetailScale * (1.0 + hide * 4.0);
        float fade = uBranching * (1.0 - away * 0.65);

        float k = w * 1.5;
        float h = clamp(0.5 + 0.5 * (d - bd) / k, 0.0, 1.0);
        d = mix(d, bd, h) - k * h * (1.0 - h);
        strength = mix(1.0, fade, h);
    }

    // --- Brightness ---------------------------------------------------------------------------
    float t = uTime * uAnim;
    // Slow, regional. Without it every channel is lit to the same value along its whole length,
    // which is the other way a procedural network gives itself away.
    float bright = 0.6 + 0.4 * (heat * 0.5 + 0.5);
    // The phase varies with the heat field and with which region you are on, so the network
    // breathes in patches. A global sine would read as the renderer flashing.
    float pulse = 1.0 + uPulseIntensity * sin(t * uPulseSpeed * 6.2832 + heat * 3.0 + f.x * 4.3);
    float level = bright * pulse;

    // Fine shimmer *inside* the channels: it multiplies the lit layers only, never the base, so it
    // cannot show up as noise crawling over the solid material.
    float flicker = 1.0;
    if (uMotionSpeed > 0.001) {
        flicker = 1.0 + 0.4 * snoise(pw * uDetailScale * 1.6 + vec2(0.6, -0.35) * (t * uMotionSpeed));
    }

    // --- Three layers ---------------------------------------------------------------------------
    // 1. Base surface. Grain from the fine field, and region interiors a shade darker than their
    // rims — material loses its heat from the middle outward, and the gradient is what stops the
    // surface reading as flat paint between the cracks.
    vec3 color = uBase * mix(0.84, 1.16, detail * 0.5 + 0.5);
    color *= mix(1.05, 0.80, smoothstep(0.02, 0.45, edge));

    // 2. Glow. A wide, soft falloff — squared so it stays tight to the channel instead of lifting
    // the whole surface — and attenuated under the channel, so turning it up spreads the halo
    // outward rather than filling in the shape the core is drawing.
    // One multiplier for everything lit: the sub-pixel dimming and the branch fade. The base
    // surface deliberately does not get it — only the three lit layers are allowed to vanish.
    float lit = wFade * strength;
    float halo = 1.0 - smoothstep(0.0, w + uGlowRadius, d);
    halo = halo * halo * lit;
    float channel = band(d, w, uEdgeSoftness, px) * lit;
    float core = band(d, max(w * uCoreWidth, px * 0.75), uEdgeSoftness, px) * lit;

    color += uGlowColor * (uGlowIntensity * halo * (1.0 - channel * 0.8) * level);

    // 3. Channel and core. The channel is tinted toward the core colour only at the top of the
    // brightness field, which is the subtle hue drift along a crack; the core itself then lands on
    // top, attenuating the channel under it so coreColour is what the hottest pixels actually are.
    vec3 channelColor = mix(uCrack, uCore, 0.3 * smoothstep(0.70, 0.92, bright));
    color += channelColor * (channel * (1.0 - core * 0.5) * level * flicker);
    color += uCore * (uCoreIntensity * core * level * flicker);

    // Fade the rim to nothing well inside the mesh, so the straight edge of the geometry is never
    // what ends the pattern. On a dark scene this reads as distance; set edgeFade to 0 when the
    // material is on a mesh that already ends where it should.
    float r = length(vPlane) / max(uSize * 0.5, 0.0001);
    color *= 1.0 - uEdgeFade * smoothstep(0.55, 1.0, r);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`;

export class GlowingCracksVfx implements VfxEffect {
    readonly id = "glowingcracks";
    readonly object3d: Group;

    readonly config: GlowingCracksConfig;

    private readonly geometry: PlaneGeometry;
    private readonly shaderMaterial: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly ground: boolean;

    private running = true;

    constructor(rawConfig?: unknown, options: GlowingCracksVfxOptions = {}) {
        const { config, issues } = normalizeGlowingCracksConfig(rawConfig);
        issues.report("GlowingCracksVfx");
        this.config = config;

        // A unit plane, built once. `surfaceSize` is a mesh scale, so the size slider is one matrix
        // write rather than a new geometry on every drag. There is no displacement here and the
        // pattern is entirely in the fragment shader, so one quad is all the geometry needed.
        this.ground = (options.orientation ?? "ground") === "ground";
        this.geometry = new PlaneGeometry(1, 1, 1, 1);
        if (this.ground) this.geometry.rotateX(-Math.PI / 2);

        this.shaderMaterial = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: config.surfaceSize },
                uBase: { value: new Color(resolveColor(config.baseColor)) },
                uCrack: { value: new Color(resolveColor(config.crackColor)) },
                uCore: { value: new Color(resolveColor(config.coreColor)) },
                uGlowColor: { value: new Color(resolveColor(config.glowColor)) },
                uPatternScale: { value: config.patternScale },
                uCrackWidth: { value: config.crackWidth },
                uWidthVar: { value: config.crackWidthVariation },
                uBranching: { value: config.branchingIntensity },
                uDistortion: { value: config.patternDistortion },
                uDetailScale: { value: config.detailScale },
                uSeed: { value: new Vector2() },
                uCoreWidth: { value: config.coreWidth },
                uGlowRadius: { value: config.glowRadius },
                uGlowIntensity: { value: config.glowIntensity },
                uCoreIntensity: { value: config.coreIntensity },
                uEdgeSoftness: { value: config.edgeSoftness },
                uAnim: { value: config.animationEnabled ? 1 : 0 },
                uPulseSpeed: { value: config.pulseSpeed },
                uPulseIntensity: { value: config.pulseIntensity },
                uMotionSpeed: { value: config.detailMotionSpeed },
                uEdgeFade: { value: config.edgeFade },
            },
            // Opaque material: it writes depth so anything buried under it is culled, and a surface
            // this dark has nothing to gain from blending.
            side: FrontSide,
        });

        this.mesh = new Mesh(this.geometry, this.shaderMaterial);
        // Ground is on screen whenever anything else is — culling it against its own bounds is
        // work for no saving.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;
        // Ground goes out before everything that stands on it.
        this.mesh.renderOrder = -9;

        this.object3d = new Group();
        this.object3d.name = "vfx:glowingcracks";
        this.object3d.add(this.mesh);

        this.applyConfig();
    }

    /**
     * The material itself, for dropping this look onto an existing mesh in another project. The
     * pattern reads `uv`, so give that mesh sensible UVs and set `surfaceSize` to the world span
     * the UV range covers.
     */
    get material(): ShaderMaterial {
        return this.shaderMaterial;
    }

    get enabled(): boolean {
        return this.mesh.visible;
    }

    set enabled(v: boolean) {
        this.config.enabled = v;
        this.mesh.visible = v;
    }

    /** There are no particles to count. One plane, one draw call — this is what the budget is. */
    get activeCount(): number {
        return this.mesh.visible ? 1 : 0;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Resumes the motion. The effect starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the glow where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. A crack network has nothing to burst; throw sparks at it instead. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: time only reaches a sine and a noise lookup, so the huge delta a
        // backgrounded tab returns with lands somewhere else in the cycle and never anywhere odd.
        this.shaderMaterial.uniforms.uTime.value = (this.shaderMaterial.uniforms.uTime.value as number) + dt;
    }

    /**
     * Re-reads the config object after an edit. Every knob is a uniform bar `surfaceSize`, which is
     * a mesh scale — so this is the whole of it: no buffer is touched however fast the panel calls
     * it, no shader is recompiled, and nothing can go stale.
     */
    applyConfig(): void {
        const c = this.config;
        const u = this.shaderMaterial.uniforms;
        u.uSize.value = c.surfaceSize;
        u.uPatternScale.value = c.patternScale;
        u.uCrackWidth.value = c.crackWidth;
        u.uWidthVar.value = c.crackWidthVariation;
        u.uBranching.value = c.branchingIntensity;
        u.uDistortion.value = c.patternDistortion;
        u.uDetailScale.value = c.detailScale;
        u.uCoreWidth.value = c.coreWidth;
        u.uGlowRadius.value = c.glowRadius;
        u.uGlowIntensity.value = c.glowIntensity;
        u.uCoreIntensity.value = c.coreIntensity;
        u.uEdgeSoftness.value = c.edgeSoftness;
        u.uAnim.value = c.animationEnabled ? 1 : 0;
        u.uPulseSpeed.value = c.pulseSpeed;
        u.uPulseIntensity.value = c.pulseIntensity;
        u.uMotionSpeed.value = c.detailMotionSpeed;
        u.uEdgeFade.value = c.edgeFade;

        (u.uBase.value as Color).copy(resolveColor(c.baseColor));
        (u.uCrack.value as Color).copy(resolveColor(c.crackColor));
        (u.uCore.value as Color).copy(resolveColor(c.coreColor));
        (u.uGlowColor.value as Color).copy(resolveColor(c.glowColor));

        // The seed is only a translation of the pattern coordinates — the cheapest deterministic
        // variation there is. Kept small so the noise and hash keep their float precision.
        const s = c.seed * 0.618034;
        (u.uSeed.value as Vector2).set(frac(s) * 64 - 32, frac(s * 1.7549) * 64 - 32);

        // The pattern is sized in world units from `uv`, so the mesh has to span the same width the
        // shader thinks it does — otherwise the regions stretch instead of there being more of them.
        if (this.ground) this.mesh.scale.set(c.surfaceSize, 1, c.surfaceSize);
        else this.mesh.scale.set(c.surfaceSize, c.surfaceSize, 1);
        this.mesh.updateMatrix();
        this.mesh.visible = c.enabled;
    }

    /** Puts the motion back to the start. Every term is continuous in time, so nothing pops. */
    reset(): void {
        this.shaderMaterial.uniforms.uTime.value = 0;
        this.applyConfig();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.shaderMaterial.dispose();
    }
}

function frac(v: number): number {
    return v - Math.floor(v);
}
