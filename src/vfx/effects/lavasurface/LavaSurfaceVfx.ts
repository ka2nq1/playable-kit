/**
 * Animated lava surface: one subdivided plane, one `ShaderMaterial`, one draw call, no textures.
 *
 * The whole look is a Voronoi crack network under a domain warp, lit by a temperature field that
 * flows through it. Five noise samples and one 3×3 cell search per pixel, and that is the entire
 * budget — there is no simulation, no render target, no bloom pass and no second light.
 *
 *  - **The crust is the subject, not the cracks.** Plates are dark; the channels between them are
 *    a small fraction of the surface and the hottest cores a small fraction of that. A lava shader
 *    fails by being uniformly orange, so every term here is written to protect that contrast.
 *  - **The plate network is stable; only its boundaries and the molten inside it move.** The cell
 *    centres never move, the warp that bends them drifts slowly, and the temperature field is
 *    advected and churned on top. Nothing scrolls as one sheet, which is what gives a procedural
 *    surface away.
 *  - **Nothing happens on the CPU per frame.** `update(dt)` advances one float. Every knob is a
 *    uniform (plus one mesh scale), so no slider allocates, rebuilds a buffer or recompiles.
 *  - **It reads without post-processing.** The emission is tuned to sit just under clipping at the
 *    default glow, so the channels are bright on a renderer with no bloom and no tone mapping.
 *
 * The pattern is driven by `uv`, not by vertex position, so the same material drops onto any mesh
 * with sensible UVs — `surfaceSize` is then simply how many world units the UV range spans.
 *
 *     const lava = new LavaSurfaceVfx(config);
 *     scene.add(lava.object3d);
 *
 *     lava.update(delta);     // from the loop you already have
 *     lava.enabled = false;   // off, without tearing anything down
 *     lava.dispose();         // on teardown
 *
 *     someMesh.material = lava.material;   // or reuse the material on your own geometry
 */

import { Color, FrontSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeLavaSurfaceConfig, type LavaSurfaceConfig } from "./config";

export interface LavaSurfaceVfxOptions {
    /**
     * Subdivisions per side. The only thing here that is not a uniform: it decides how finely the
     * crust heave can be sampled, so it is fixed at construction rather than put on a slider that
     * would reallocate. 64 is plenty for a displacement this subtle; 1 is legal if you have turned
     * `displacementIntensity` off and want the cheapest possible quad.
     */
    segments?: number;
}

/**
 * Simplex noise (Ashima / Gustavson, 2D), shared by both stages.
 *
 * Value noise would be cheaper, but it carries an axis-aligned lattice, and feeding a lattice into
 * a Voronoi warp produces cracks that line up with the grid — the one thing the brief rules out.
 */
const NOISE = /* glsl */ `
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
`;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPatternScale;
uniform float uFlowSpeed;
uniform float uDisplacement;
uniform vec2 uFlowDir;

varying vec2 vPlane;
varying float vLift;

${NOISE}

void main() {
    // Pattern coordinates come from uv, not from position: the preview plane is a unit square the
    // host scales, and the same material therefore works unchanged on someone else's mesh.
    vPlane = (uv - 0.5) * uSize;

    float scale = max(uPatternScale, 0.01);
    vec2 flow = uFlowDir * (uTime * uFlowSpeed) / scale;

    // One sample, well below the plate frequency and barely moving: a cooled crust heaves, it does
    // not ripple, and anything finer than this would need vertices the plane does not have.
    vLift = snoise(vPlane / (scale * 2.6) - flow * 0.18) * uDisplacement;

    // Along the mesh normal rather than straight up, so a curved host mesh displaces correctly.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * vLift, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform vec3 uCrust;
uniform vec3 uCrust2;
uniform vec3 uMolten;
uniform vec3 uHot;
uniform float uGlow;
uniform float uColorVariation;
uniform float uCrustVariation;
uniform float uPatternScale;
uniform float uCrackWidth;
uniform float uCrackVariation;
uniform float uDistortion;
uniform float uDetailScale;
uniform float uFlowSpeed;
uniform float uFlowIntensity;
uniform float uPulseSpeed;
uniform float uPulseIntensity;
uniform float uEdgeFade;
uniform vec2 uFlowDir;

varying vec2 vPlane;
varying float vLift;

${NOISE}

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
 * Nine cells is the minimum a Voronoi can be correct with, and it is the only loop in the shader.
 * F2 - F1 is the cheap edge estimate rather than the exact distance-to-border: it costs one pass
 * instead of two, and the way it thickens at cell junctions is exactly what makes the channels
 * look like they branch instead of meeting at clean points.
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

void main() {
    float scale = max(uPatternScale, 0.01);
    // Everything below works in plate units, so patternScale re-sizes the pattern without also
    // changing how fast it travels or how wide the cracks read.
    vec2 p = vPlane / scale;
    vec2 flow = uFlowDir * (uTime * uFlowSpeed) / scale;
    vec2 sideFlow = vec2(-flow.y, flow.x);

    // --- Warp field (2 samples) -------------------------------------------------------------
    // The same field does two jobs: it bends the cell grid out of shape, and it is what the molten
    // churns against. It drifts far slower than the flow, which is what keeps the plate network
    // recognisably the same network while its boundaries creep.
    float w0 = snoise(p * 0.45 - flow * 0.3);
    float w1 = snoise(p * 0.45 + 31.7 - sideFlow * 0.26);
    vec2 warp = vec2(w0, w1);

    vec2 pw = p + warp * uDistortion;
    vec2 pm = p + warp * uFlowIntensity * 0.55 - flow * 0.6;

    vec2 f = voronoiF1F2(pw);
    float edge = f.y - f.x;

    // --- Detail and molten fields (3 samples) ------------------------------------------------
    // One fine field serves three purposes — crust mottle, hairline cracks, and the variation in
    // channel width — because all three want the same features and a fourth sample buys nothing.
    float detail = snoise(pw * uDetailScale - flow * 0.9);
    // Two scales crossing, both advected through the churned coordinates. One field on its own is
    // precisely what reads as a texture sliding under the crust.
    float mA = snoise(pm * 0.9);
    float mB = snoise(pm * 2.3 + sideFlow * 0.5 + 11.3);
    float molten = mA * 0.62 + mB * 0.38;

    // --- Crack network ------------------------------------------------------------------------
    // World size of a pixel, in plate units. A channel thinner than a pixel is not a channel, it
    // is shimmer, so every width below is floored here rather than allowed to alias away.
    float px = (fwidth(pw.x) + fwidth(pw.y)) * 0.5 + 1e-5;

    // Width varies with a static field and a moving one: the first makes some channels broad and
    // others hairline, the second lets a broad one swell into an exposed pool and settle again.
    float widthField = detail * 0.55 + mA * 0.45;
    float wantW = uCrackWidth * (1.0 + uCrackVariation * widthField);
    float w = max(wantW, px * 1.5);
    // Widening a sub-pixel channel back up to a pixel is what stops it aliasing, but on its own it
    // also *adds* molten area with distance — and a horizon that turns orange is the failure this
    // effect cannot afford. Dimming by exactly the factor the width was inflated by keeps the heat
    // the channel contributes the same, so far cracks go faint instead of fat. The same factor
    // retires a channel whose width field went negative, which is the other thing it has to do.
    float wFade = clamp(wantW / w, 0.0, 1.0);

    float core = (1.0 - smoothstep(0.0, w, edge)) * wFade;
    // A wider skirt of the same shape, for the heat that spills onto the crust either side.
    float halo = (1.0 - smoothstep(0.0, w * 3.2, edge)) * wFade;

    // Hairline branches: the zero set of the fine field, faded out away from the plate boundaries
    // so they read as cracks spreading off the channels rather than scratches over every plate.
    float wantBw = wantW * 0.5;
    float bw = max(wantBw, px * uDetailScale * 1.5);
    float branch = (1.0 - smoothstep(0.0, bw, abs(detail)))
                 * (1.0 - smoothstep(0.04, 0.42, edge))
                 * clamp(wantBw / bw, 0.0, 1.0);

    float lavaMask = max(core, branch * 0.8);

    // --- Temperature --------------------------------------------------------------------------
    // Hot patches are cut from the top of one noise field only, so they stay occasional. Widening
    // this threshold is the fastest way to lose the contrast the whole effect rests on.
    float hot = smoothstep(0.38, 0.95, mA);
    float temp = lavaMask * (0.52 + 0.48 * (molten * 0.5 + 0.5)) + hot * lavaMask * 0.5;
    // At colourVariation 0 the molten is one flat mid temperature, which is what makes the knob
    // honest at both ends instead of merely less of the same.
    temp = clamp(mix(lavaMask * 0.72, temp, uColorVariation), 0.0, 1.0);

    // One slow sine whose phase varies with the molten field and with which plate you are on, so
    // the glow breathes in patches. A global sine would read as the renderer flashing.
    float pulse = 1.0 + uPulseIntensity * sin(uTime * uPulseSpeed * 6.2832 + molten * 2.4 + f.x * 3.1);

    // --- Colour ---------------------------------------------------------------------------------
    // The cool rim is derived from moltenColor rather than being a fifth picker: a crack that fades
    // to crust colour reads as a painted line, and the only right answer is a much darker, redder
    // moltenColor — which is a multiply, not a decision the author needs to make twice.
    vec3 lavaCol = mix(uMolten * vec3(0.30, 0.11, 0.07), uMolten, smoothstep(0.02, 0.52, temp));
    lavaCol = mix(lavaCol, uHot, smoothstep(0.6, 0.98, temp));

    // Crust: two colours mottled by the fine field, with plate interiors a shade darker than their
    // rims — a plate loses its heat from the middle outward, and the gradient is what stops the
    // crust reading as flat paint between the cracks.
    float mottle = clamp(detail * 0.5 + 0.5 + w0 * 0.22, 0.0, 1.0);
    vec3 crust = mix(uCrust, uCrust2, mottle * uCrustVariation);
    crust *= mix(1.06, 0.82, smoothstep(0.03, 0.5, edge));
    // There is no lighting term in this shader, so displaced crust would be invisible except on
    // the silhouette. Tinting by the height is what makes the heave readable — and it costs
    // nothing and vanishes on its own when displacementIntensity is 0.
    crust *= 1.0 + vLift * 2.5;

    float emission = uGlow * pulse * (0.3 + 0.7 * temp);
    vec3 color = mix(crust, lavaCol * emission, lavaMask);
    // A narrow bleed onto the crust beside each channel. Deliberately weak: crust lit all over by
    // its own cracks is exactly the neon look the brief rules out.
    color += lavaCol * max(halo - lavaMask, 0.0) * 0.22 * uGlow;

    // Fade the rim to nothing well inside the mesh, so the straight edge of the geometry is never
    // what ends the lava. On a dark scene this reads as distance; set edgeFade to 0 to turn it off
    // when the material is applied to a mesh that already ends where it should.
    float r = length(vPlane) / max(uSize * 0.5, 0.0001);
    color *= 1.0 - uEdgeFade * smoothstep(0.55, 1.0, r);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`;

export class LavaSurfaceVfx implements VfxEffect {
    readonly id = "lavasurface";
    readonly object3d: Group;

    readonly config: LavaSurfaceConfig;

    private readonly geometry: PlaneGeometry;
    private readonly shaderMaterial: ShaderMaterial;
    private readonly mesh: Mesh;

    private running = true;
    /** Scratch so `applyConfig` allocates nothing even when called from a slider drag. */
    private readonly scratchDir = new Vector2();

    constructor(rawConfig?: unknown, options: LavaSurfaceVfxOptions = {}) {
        const { config, issues } = normalizeLavaSurfaceConfig(rawConfig);
        issues.report("LavaSurfaceVfx");
        this.config = config;

        const segments = Math.max(1, Math.min(Math.round(options.segments ?? 64), 512));
        // A unit plane laid into XZ once at construction. `surfaceSize` is a mesh scale, so the
        // size slider is one matrix write rather than a new geometry on every drag.
        this.geometry = new PlaneGeometry(1, 1, segments, segments);
        this.geometry.rotateX(-Math.PI / 2);

        this.shaderMaterial = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: config.surfaceSize },
                uCrust: { value: new Color(resolveColor(config.crustColor)) },
                uCrust2: { value: new Color(resolveColor(config.secondaryCrustColor)) },
                uMolten: { value: new Color(resolveColor(config.moltenColor)) },
                uHot: { value: new Color(resolveColor(config.hotColor)) },
                uGlow: { value: config.glowIntensity },
                uColorVariation: { value: config.colorVariation },
                uCrustVariation: { value: config.crustVariation },
                uPatternScale: { value: config.patternScale },
                uCrackWidth: { value: config.crackWidth },
                uCrackVariation: { value: config.crackVariation },
                uDistortion: { value: config.patternDistortion },
                uDetailScale: { value: config.detailScale },
                uFlowSpeed: { value: config.flowSpeed },
                uFlowIntensity: { value: config.flowIntensity },
                uPulseSpeed: { value: config.heatPulseSpeed },
                uPulseIntensity: { value: config.heatPulseIntensity },
                uDisplacement: { value: config.displacementIntensity },
                uEdgeFade: { value: config.edgeFade },
                uFlowDir: { value: new Vector2(1, 0) },
            },
            // Opaque ground: it writes depth so anything buried under it is culled, and a surface
            // this dark has nothing to gain from blending.
            side: FrontSide,
        });

        this.mesh = new Mesh(this.geometry, this.shaderMaterial);
        // The plane is a unit square scaled by the config, and ground is on screen whenever
        // anything else is — culling it against its own bounds is work for no saving.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;
        // Ground goes out before everything that stands on it.
        this.mesh.renderOrder = -9;

        this.object3d = new Group();
        this.object3d.name = "vfx:lavasurface";
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

    /** Freezes the surface where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. A lava field has nothing to burst; throw sparks at it instead. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: every term in the shader is a continuous function of time, so the huge
        // delta a backgrounded tab returns with moves the lava further along and never anywhere odd.
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
        u.uGlow.value = c.glowIntensity;
        u.uColorVariation.value = c.colorVariation;
        u.uCrustVariation.value = c.crustVariation;
        u.uPatternScale.value = c.patternScale;
        u.uCrackWidth.value = c.crackWidth;
        u.uCrackVariation.value = c.crackVariation;
        u.uDistortion.value = c.patternDistortion;
        u.uDetailScale.value = c.detailScale;
        u.uFlowSpeed.value = c.flowSpeed;
        u.uFlowIntensity.value = c.flowIntensity;
        u.uPulseSpeed.value = c.heatPulseSpeed;
        u.uPulseIntensity.value = c.heatPulseIntensity;
        u.uDisplacement.value = c.displacementIntensity;
        u.uEdgeFade.value = c.edgeFade;

        (u.uCrust.value as Color).copy(resolveColor(c.crustColor));
        (u.uCrust2.value as Color).copy(resolveColor(c.secondaryCrustColor));
        (u.uMolten.value as Color).copy(resolveColor(c.moltenColor));
        (u.uHot.value as Color).copy(resolveColor(c.hotColor));

        const rad = (c.flowDirection * Math.PI) / 180;
        this.scratchDir.set(Math.cos(rad), Math.sin(rad));
        (u.uFlowDir.value as Vector2).copy(this.scratchDir);

        // The pattern is sized in world units from `uv`, so the mesh has to span the same width the
        // shader thinks it does — otherwise the plates stretch instead of there being more of them.
        this.mesh.scale.set(c.surfaceSize, 1, c.surfaceSize);
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
