/**
 * Procedural ice: one plane, one `ShaderMaterial`, one draw call, no textures — and, in
 * ENHANCED, one framebuffer grab shared with everything else in the scene that reads it.
 *
 * The brief this was written against is "you must be able to see the fish under it", so every
 * decision below is in service of the background surviving the surface:
 *
 *  1. **The ice never paints over what is behind it.** PERFORMANCE is an ordinary transparent
 *     surface: the clear regions carry a low alpha and the scene shows through by blending.
 *     ENHANCED composites the background itself, out of the shared {@link SceneColorCapture}
 *     grab, displaced — which is the only way an object under the ice actually *bends*. Neither
 *     mode has an opaque blue fallback, and the difference between them is visibility of
 *     distortion, never visibility of the object.
 *  2. **The grab is a copy, not a second render.** The mesh's own `onBeforeRender` fires with the
 *     framebuffer already holding every opaque object — floor, fish, rocks — so a single
 *     `copyTexSubImage2D` is both the background and a guarantee the ice cannot sample itself.
 *     The capture is reference counted per renderer: two ice sheets cost one copy, not two render
 *     targets.
 *  3. **The displacement is measured in world units and projected.** The normal's tangential tilt
 *     times the slab thickness is a lateral offset in metres; pushing it through
 *     `projectionMatrix` and `1/w` turns it into the right number of pixels at any distance,
 *     aspect or field of view. Nothing swims when the camera moves, and there is no aspect
 *     uniform to keep in sync.
 *  4. **The internal layers parallax against the surface.** Cracks, bubbles and cloud are sampled
 *     at a coordinate offset along the tangent-space view vector by their own depth, so moving
 *     the camera slides them under the surface. That one term is most of what separates "a slab
 *     of ice" from "a decal of ice".
 *  5. **Features that are off are compiled out.** Cracks, bubbles, frost, the frost blur, the
 *     chromatic split and the quality mode are `#define`s, so a configuration that does not want
 *     bubbles does not pay for the branch. They are the only knobs that cost a compile; every
 *     other one is a uniform and lands on the frame it is dragged.
 *
 * Cost per pixel in ENHANCED: ~12 simplex lookups, one 3x3 Voronoi, three gradient-noise lookups
 * and one texture sample (three more with the chromatic split, four more with the frost blur).
 * PERFORMANCE drops an octave from each noise field, the whole refraction block and every texture
 * sample.
 *
 *     const ice = new IceSurfaceVfx(config);      // or ...(config) then ice.setPreset("deep-blue-ice")
 *     scene.add(ice.object3d);
 *
 *     ice.update(delta);                          // from the loop you already have
 *     ice.setConfig({ transparency: 0.95 });      // live, no rebuild
 *     ice.dispose();
 *
 *     someMesh.material = ice.material;           // or reuse the material on your own geometry
 */

import {
    Color,
    FrontSide,
    Group,
    Mesh,
    NormalBlending,
    PlaneGeometry,
    ShaderMaterial,
    Vector3,
    type WebGLRenderer,
} from "three";
import { resolveColor } from "../../core/colorCache";
import { retainSceneColor, type SceneColorCapture } from "../../core/SceneColorCapture";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeIceSurfaceConfig, type IceSurfaceConfig } from "./config";
import { ICE_PRESET_DATA, type IcePresetId } from "./presetData";

export interface IceSurfaceVfxOptions {
    /**
     * Subdivisions per side. The surface is flat — nothing here displaces a vertex — so the
     * default of 1 is not a compromise: every varying the fragment stage needs is linear in world
     * position and interpolates exactly across two triangles. Raise it only if you intend to
     * displace the plane yourself.
     */
    segments?: number;
}

/**
 * Simplex noise (Ashima / Gustavson, 2D), for the fields that must not show a lattice: the cloud
 * regions, the frost patches and the warp that bends the fracture network out of its grid.
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
uniform float uSize;
uniform vec3 uTanU;
uniform vec3 uTanV;
uniform vec3 uNrm;

varying vec2 vPlane;
varying vec3 vViewTS;
varying vec4 vClip;

void main() {
    // Pattern coordinates come from uv, not from position: the preview plane is a unit square the
    // host scales, and the same material therefore works unchanged on someone else's mesh.
    vPlane = (uv - 0.5) * uSize;

    vec4 world = modelMatrix * vec4(position, 1.0);

    // Surface-to-camera in the surface's own frame. Every view-dependent term downstream —
    // parallax, Fresnel, path length through the slab, the specular half vector — is a cheap
    // expression in this one vector, and it is linear in world position so two triangles carry it
    // exactly.
    vec3 toCam = cameraPosition - world.xyz;
    vViewTS = vec3(dot(toCam, uTanU), dot(toCam, uTanV), dot(toCam, uNrm));

    // Kept as a varying rather than recovered from gl_FragCoord: this is the one value that makes
    // the screen-space sample follow the camera instead of sliding under it.
    vClip = projectionMatrix * viewMatrix * world;
    gl_Position = vClip;
}
`;

const FRAGMENT = /* glsl */ `
#ifdef ICE_ENHANCED
uniform sampler2D uScene;
#endif
uniform float uTime;

uniform float uTransparency;
uniform float uClarity;
uniform float uRefraction;
uniform float uRefractionScale;
uniform float uRefractionDetail;
uniform float uChromatic;
uniform float uViewAngleOpacity;

uniform float uThickness;
uniform float uAbsorption;
uniform vec3 uDepthTint;
uniform float uParallax;
uniform float uInternalDepth;

uniform vec3 uIce;
uniform vec3 uDeepIce;
uniform vec3 uSurfaceCol;
uniform float uColorVariation;
uniform float uCloudiness;
uniform float uCloudScale;
uniform float uCloudContrast;

uniform float uCrackDensity;
uniform float uCrackScale;
uniform float uCrackWidth;
uniform float uCrackBranching;
uniform float uCrackIrregularity;
uniform float uCrackDepth;
uniform float uCrackOpacity;
uniform vec3 uCrackColor;
uniform float uCrackHighlight;

uniform float uBubbleDensity;
uniform float uBubbleMin;
uniform float uBubbleMax;
uniform float uBubbleCluster;
uniform float uBubbleOpacity;
uniform float uBubbleDepth;
uniform float uBubbleDistortion;

uniform float uFrostCoverage;
uniform float uFrostScale;
uniform float uFrostSoftness;
uniform float uFrostOpacity;
uniform float uFrostRoughness;
uniform vec3 uFrostColor;
uniform float uFrostEdge;
uniform float uFrostNearCracks;

uniform float uRoughness;
uniform float uSpecular;
uniform float uFresnel;
uniform vec3 uRimColor;
uniform float uRimIntensity;
uniform float uNormalStrength;
uniform float uMicroScale;
uniform float uSparkle;
uniform vec3 uLightTS;

uniform float uSize;
uniform float uEdgeFade;
uniform vec3 uTanU;
uniform vec3 uTanV;

varying vec2 vPlane;
varying vec3 vViewTS;
varying vec4 vClip;

${NOISE}

/** Hash from Dave Hoskins: no trig, stable across drivers, and the Voronoi pays for it nine times. */
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

/**
 * Value noise and its exact gradient, in one lookup.
 *
 * The surface normal and the refracting tilt are both gradients of a height field, and a finite
 * difference would mean evaluating that field three times. The analytic form costs four hashes
 * total and, unlike a screen-space derivative, does not change with how far away the pixel is —
 * which matters here, because a normal that sharpens with distance is an aliasing machine.
 */
vec3 vnoiseD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    float k1 = b - a;
    float k2 = c - a;
    float k3 = a - b - c + d;
    return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
                du.x * (k1 + k3 * u.y),
                du.y * (k2 + k3 * u.x));
}

/** Two octaves, three in ENHANCED. Enough for a cloud field; a fourth is invisible under ice. */
float fbm(vec2 p) {
    float v = snoise(p) * 0.58;
    v += snoise(p * 2.07 + 17.3) * 0.29;
#ifdef ICE_DETAIL
    v += snoise(p * 4.11 + 41.7) * 0.13;
#endif
    return v;
}

#ifdef ICE_CRACKS
/**
 * Nearest and second-nearest feature distance, plus the vector to the nearest feature.
 *
 * F2 - F1 is the cheap edge estimate rather than the exact distance-to-border: one pass instead of
 * two, and the way it thickens where three cells meet is exactly how real fractures branch. The
 * offset vector comes back because the lit sliver along a fracture and the way a fracture shears
 * the background both need a direction, and recovering one from the distance field costs a second
 * pass.
 */
vec4 voronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float f1 = 8.0;
    float f2 = 8.0;
    vec2 r1 = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 r = g + hash22(n + g) - f;
            float d = dot(r, r);
            if (d < f1) {
                f2 = f1;
                f1 = d;
                r1 = r;
            } else if (d < f2) {
                f2 = d;
            }
        }
    }
    return vec4(sqrt(f1), sqrt(f2), r1);
}
#endif

#ifdef ICE_ENHANCED
/**
 * One tap of the background.
 *
 * The grab is a copy of the output framebuffer, so it is already encoded. Decode here and let
 * colorspace_fragment put it back, or the output transform lands on it twice. Clamped rather than
 * wrapped: a displacement that leaves the screen must smear the edge pixel, never wrap the
 * opposite side of the frame into the ice.
 */
vec3 grab(vec2 uv) {
    return sRGBTransferEOTF(texture2D(uScene, clamp(uv, 0.0, 1.0))).rgb;
}
#endif

void main() {
    vec3 Vts = normalize(vViewTS);
    // Clamped away from zero: at the horizon the path through the slab goes to infinity and every
    // term that divides by it would blow out a band of pixels along the far edge.
    float facing = max(Vts.z, 0.08);

    vec2 p = vPlane;
    // How far an internal layer slides per unit of depth, in plane units. This is the whole of the
    // parallax: a feature one unit down is drawn one of these offsets away from where it sits.
    vec2 par = -Vts.xy / facing * uThickness * uParallax;

    // --- Cloud, and the deeper layer under it --------------------------------------------------
    float cs = max(uCloudScale, 0.05);
    float cloudRaw = fbm((p + par * 0.55) / cs) * 0.5 + 0.5;
    // Contrast pushes the field off its own middle, so clear and milky separate instead of
    // averaging into an even haze. Written as a mix so 0 leaves the raw field alone.
    float cloud = mix(cloudRaw, smoothstep(0.34, 0.74, cloudRaw), uCloudContrast) * uCloudiness;
    // A second field at the bottom of the slab, parallaxing further than the first. Two layers
    // sliding against each other at different rates is what reads as volume rather than as a
    // printed sheet, and it is the cheapest depth cue in the shader.
    float deep = (fbm((p + par * 1.35) / (cs * 1.7) + 13.7) * 0.5 + 0.5) * uInternalDepth;

    // --- Fractures -----------------------------------------------------------------------------
    float crack = 0.0;
    float crackNear = 0.0;
    float crackHi = 0.0;
    vec2 crackDir = vec2(0.0);
#ifdef ICE_CRACKS
    {
        float ks = max(uCrackScale, 0.05);
        vec2 cp = (p + par * uCrackDepth) / ks;
        // An unwarped Voronoi is a grid of polygons and reads as one however the widths are
        // tuned. Two samples of a field far below the cell frequency bend it into something that
        // fractured rather than something that tiled.
        vec2 warp = vec2(snoise(cp * 0.6), snoise(cp * 0.6 + 23.1));
        vec4 vo = voronoi(cp + warp * uCrackIrregularity);
        float edge = vo.y - vo.x;

        // World size of a pixel in plate units. A fracture thinner than a pixel is not a fracture,
        // it is shimmer, so the width is floored here and dimmed by exactly what the floor added —
        // far cracks go faint instead of fat.
        float px = (fwidth(cp.x) + fwidth(cp.y)) * 0.5 + 1e-5;
        float wantW = uCrackWidth * (0.45 + 0.85 * (warp.x * 0.5 + 0.5));
        float w = max(wantW, px * 1.5);
        float wFade = clamp(wantW / w, 0.0, 1.0);

        // Not every plate boundary is fractured. Gating the network on a slow field is what breaks
        // the "uniformly distributed polygon outlines" look: some stretches run unbroken, others
        // shatter, and the spacing stops being the cell spacing.
        float region = smoothstep(0.66 - uCrackDensity * 0.8, 0.94 - uCrackDensity * 0.8,
                                  fbm(cp * 0.31 + 7.1) * 0.5 + 0.5);

        float primary = (1.0 - smoothstep(0.0, w, edge)) * wFade;

        // Branches are the zero set of a finer field, faded out away from the primaries so they
        // read as splinters spreading off a fracture rather than scratches over every plate.
        float bn = snoise(cp * 2.7 + 11.0);
        float wantB = wantW * 0.55;
        float bw = max(wantB, px * 2.7 * 1.5);
        float branch = (1.0 - smoothstep(0.0, bw, abs(bn)))
                     * (1.0 - smoothstep(0.05, 0.55, edge))
                     * clamp(wantB / bw, 0.0, 1.0) * uCrackBranching;

        crack = clamp(max(primary, branch * 0.85) * region, 0.0, 1.0);
        // A wide skirt of the same shape: where frost gathers, and where the ice is bruised either
        // side of the break.
        crackNear = (1.0 - smoothstep(0.0, w * 7.0, edge)) * region;
        // The lit sliver sits just outside the fracture, on the side facing the light — a fracture
        // lit from both sides is a painted line, and the whole read depends on it being one side.
        float band = smoothstep(w, w * 2.4, edge) * (1.0 - smoothstep(w * 2.4, w * 5.0, edge));
        vec2 dir = vo.zw;
        float dl = length(dir);
        crackDir = dl > 1e-5 ? dir / dl : vec2(0.0);
        crackHi = band * region * max(dot(crackDir, uLightTS.xy), 0.0);
        crackDir *= crack;
    }
#endif

    // --- Trapped air ---------------------------------------------------------------------------
    float bubble = 0.0;
    float bubbleRim = 0.0;
    float bubbleHi = 0.0;
    vec2 bubbleDir = vec2(0.0);
#ifdef ICE_BUBBLES
    {
        // The cell is sized off the largest bubble, so raising the size spreads them out instead
        // of merging them into a foam — one lookup, no neighbourhood search.
        float cell = max(uBubbleMax * 3.2, 0.04);
        vec2 bp = (p + par * uBubbleDepth) / cell;
        vec2 ci = floor(bp);
        vec2 cf = fract(bp);
        // Clustering rides the cloud field rather than a field of its own: free, and bubbles do in
        // fact gather where the ice froze cloudy.
        float chance = uBubbleDensity * mix(1.0, smoothstep(0.28, 0.82, cloudRaw), uBubbleCluster);
        float present = step(hash12(ci + 5.3), chance);
        float rad = mix(uBubbleMin, uBubbleMax, hash12(ci + 9.1)) / cell;

        float pxb = (fwidth(bp.x) + fwidth(bp.y)) * 0.5 + 1e-5;
        float drawRad = max(rad, pxb * 1.2);
        float fade = clamp(rad / drawRad, 0.0, 1.0) * present;

        // Jitter kept inside the middle half of the cell so a bubble never crosses a border and
        // gets clipped, which is the one artefact a single-cell lookup can produce.
        vec2 d = cf - (0.28 + 0.44 * hash22(ci * 1.37));
        float dist = length(d);
        float disc = (1.0 - smoothstep(drawRad * 0.74, drawRad * 1.0, dist)) * fade;

        bubble = disc;
        // Dark where the sphere turns away, bright where it catches the key light: the two cues
        // that make a disc read as a void in solid ice rather than a dot painted on top.
        bubbleRim = smoothstep(drawRad * 0.3, drawRad * 0.96, dist) * disc;
        bubbleHi = (1.0 - smoothstep(0.0, drawRad * 0.4, length(d + uLightTS.xy * drawRad * 0.45))) * disc;
        bubbleDir = (dist > 1e-5 ? d / dist : vec2(0.0)) * disc;
    }
#endif

    // --- Frost ---------------------------------------------------------------------------------
    float frost = 0.0;
    float frostEdge = 0.0;
#ifdef ICE_FROST
    {
        // No parallax: frost is on the surface, and sliding it with the internal layers is the
        // fastest way to lose the sense that there is a surface at all.
        float fs = max(uFrostScale, 0.05);
        float fn = fbm(p / fs + 31.4) * 0.5 + 0.5;
        // Softness never reaches zero width, so the two smoothstep edges can never cross.
        float soft = mix(0.015, 0.4, uFrostSoftness);
        float threshold = 1.0 - uFrostCoverage;
        frost = smoothstep(threshold - soft, threshold + soft, fn);
        // Frost grows out of a fracture, which is where the water vapour escapes.
        frost = clamp(frost + crackNear * uFrostNearCracks, 0.0, 1.0);
        // The rim of a patch is crusted: a thin band just inside the threshold, brighter than the
        // body of the patch.
        frostEdge = (1.0 - smoothstep(0.0, soft * 1.6, abs(fn - threshold))) * frost * uFrostEdge;
    }
#endif

    // --- Surface relief ------------------------------------------------------------------------
    float ms = max(uMicroScale, 0.01);
    vec3 micro = vnoiseD(p / ms);
    vec2 slope = micro.yz;
#ifdef ICE_DETAIL
    // Sampled in a rotated domain so the second octave's lattice cannot line up with the first
    // one's. The gradient has to come back through the same rotation to still be a gradient,
    // which the row-vector multiply is.
    const mat2 R37 = mat2(0.799, 0.602, -0.602, 0.799);
    vec3 micro2 = vnoiseD((R37 * p) / (ms * 0.37));
    slope += (micro2.yz * R37) * 0.45;
#endif
    slope *= uNormalStrength;
    // Frost is crystalline: the same relief, deeper, which is what turns the sharp highlight into
    // a broad sheen without a second lighting path.
    slope *= 1.0 + frost * uFrostRoughness * 2.2;
    // A fracture is a groove, so the normal tips into it.
    slope += crackDir * 0.55;
    vec3 N = normalize(vec3(-slope, 1.0));

    // --- Optical depth ---------------------------------------------------------------------------
    // Beer-Lambert through a slab, with the path lengthened at grazing angles and again where the
    // ice is cloudy. This is what makes thick ice blue and thin ice clear out of one number.
    float path = uThickness / facing * (1.0 + cloud * 1.2);
    float absorb = 1.0 - exp(-uAbsorption * path * 2.0);

    float ndv = clamp(dot(N, Vts), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 5.0) * uFresnel;

    // --- Opacity ---------------------------------------------------------------------------------
    // Everything that stops you seeing through the ice, summed once, so the panel's knobs add up
    // the way the brief describes them: clear ice is transparency, and every feature takes some of
    // that back.
    float clarityKeep = 1.0 - 0.65 * uClarity;
    float internal = (cloud * 0.85 + deep * 0.3) * clarityKeep
                   + bubble * uBubbleOpacity
                   + crack * uCrackOpacity;
    float opacity = clamp((1.0 - uTransparency) + internal + frost * uFrostOpacity + fres * uViewAngleOpacity, 0.0, 1.0);

    // Fade the rim out well inside the mesh so the straight edge of the geometry is never what
    // ends the ice. Everything the ice contributes is faded together, which is why the boundary is
    // a crossfade to the untouched background and has no seam to hide.
    float r = length(p) / max(uSize * 0.5, 1e-4);
    float edgeMask = 1.0 - uEdgeFade * smoothstep(0.62, 1.0, r);
    opacity *= edgeMask;
    absorb *= edgeMask;

    // --- Body colour -------------------------------------------------------------------------------
    float depthMix = clamp(absorb * 0.9 + deep * 0.75 + cloud * 0.55, 0.0, 1.0);
    vec3 body = mix(uIce, uDeepIce, depthMix);
    // The cloud field also swings the body brightness, so the milky regions are never one flat
    // colour — at colorVariation 0 the ice is a single tone, which is what makes the knob honest.
    body *= 1.0 + uColorVariation * 0.45 * (cloudRaw - 0.5);
    body = mix(body, body * uDepthTint, absorb * 0.8);
    body = mix(body, uCrackColor, crack * 0.85);
    body *= 1.0 - bubbleRim * 0.45;
    body = mix(body, uFrostColor, frost);
    body += uFrostColor * frostEdge * 0.6;
    body += uCrackColor * crackHi * uCrackHighlight;
    body += uSurfaceCol * bubbleHi * 0.8;

    // --- Surface shading -----------------------------------------------------------------------------
    float rough = clamp(uRoughness + frost * uFrostRoughness * 0.7, 0.03, 1.0);
    vec3 H = normalize(uLightTS + Vts);
    float spec = pow(max(dot(N, H), 0.0), exp2(mix(10.0, 2.5, rough))) * uSpecular * (1.0 - rough * 0.55);
    // Crystalline twinkle, and the only animated term in the shader: the top of the micro field,
    // phase-offset per cell so the frost glitters rather than pulsing as one sheet.
    float glint = smoothstep(0.84, 1.0, micro.x) * frost * uSparkle
                * (0.35 + 0.65 * sin(uTime * 2.3 + hash12(floor(p / ms)) * 62.8));
    vec3 emit = (uSurfaceCol * (spec + max(glint, 0.0) * 0.8) + uRimColor * fres * uRimIntensity) * edgeMask;

#ifdef ICE_ENHANCED
    // --- Refraction ------------------------------------------------------------------------------
    // The tangential tilt of the surface, times how far the ray travels inside the slab: a lateral
    // displacement in world units, which is the only form of this quantity that stays physically
    // sized when the camera moves.
    vec3 refrN = vnoiseD(p / max(uRefractionScale, 0.02));
    vec2 bend = (refrN.yz + slope * uRefractionDetail) * uRefraction * uThickness * 3.0;
    // A fracture shears what is behind it sideways; a bubble is a lens.
    bend += crackDir * uRefraction * uThickness * 2.0;
    bend += bubbleDir * uBubbleDistortion * uThickness * 1.5;
    // Cloudy and frosted ice scatters instead of refracting, so the coherent displacement drops
    // there — which is most of why a frosted patch reads as a different material.
    bend *= mix(1.0, 0.3, clamp(frost + cloud * 0.5, 0.0, 1.0)) * edgeMask;

    vec3 bendV = (viewMatrix * vec4(bend.x * uTanU + bend.y * uTanV, 0.0)).xyz;
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    // Through the projection and the perspective divide: a metre of displacement at the far end of
    // the lake is worth fewer pixels than a metre at the near end, and this is what knows that.
    vec2 off = vec2(bendV.x * projectionMatrix[0][0], bendV.y * projectionMatrix[1][1]) * 0.5 / max(vClip.w, 1e-4);

    vec3 bg = grab(suv + off);
#ifdef ICE_CHROMATIC
    // Red bends least, blue bends most. Two extra taps, and only the channel each one is for.
    float ca = uChromatic * 0.35;
    bg.r = grab(suv + off * (1.0 - ca)).r;
    bg.b = grab(suv + off * (1.0 + ca)).b;
#endif
#ifdef ICE_FROST_BLUR
    float blurAmt = clamp(frost * 0.9 + cloud * 0.4, 0.0, 1.0);
    if (blurAmt > 0.01) {
        // Three taps on a triangle, radius in screen space and corrected to a circle by the ratio
        // the projection already carries, so the softening does not stretch on a wide viewport.
        vec2 rad = vec2(0.006 * projectionMatrix[0][0] / projectionMatrix[1][1], 0.006) * blurAmt;
        vec3 blurred = bg
                     + grab(suv + off + rad * vec2(0.87, 0.5))
                     + grab(suv + off + rad * vec2(-0.87, 0.5))
                     + grab(suv + off + rad * vec2(0.0, -1.0));
        bg = mix(bg, blurred * 0.25, blurAmt);
    }
#endif
    // What the slab leaves of the light that made it through. Multiplicative, because absorption
    // is a filter: this is the term that turns a white fish blue under thick ice.
    bg *= mix(vec3(1.0), uDepthTint, absorb);

    vec3 color = mix(bg, body, opacity) + emit;
    // The ice composites its own background out of the grab, so it owns the pixel outright. At the
    // faded rim every ice term has already gone to zero and what is left is the untouched
    // background, which is why alpha can be flat 1 without a visible edge.
    gl_FragColor = vec4(color, 1.0);
#else
    // PERFORMANCE: no sample, no grab, no refraction. The background survives by alpha blending,
    // which is why transparency has to end up in alpha rather than in a mix.
    float glow = clamp(spec + max(glint, 0.0) + fres * uRimIntensity, 0.0, 1.0) * edgeMask;
    float alpha = clamp(opacity + glow, 0.0, 1.0);
    // Highlights have to survive an alpha near zero, or a sheet of clear ice loses every cue that
    // it is there at all. Folding them into alpha and dividing them back out of the colour is
    // exactly the premultiplied form of "add this light on top of whatever is behind".
    vec3 color = (body * opacity + emit) / max(alpha, 1e-3);
    gl_FragColor = vec4(color, alpha);
#endif
    #include <colorspace_fragment>
}
`;

const DEG2RAD = Math.PI / 180;

export class IceSurfaceVfx implements VfxEffect {
    readonly id = "icesurface";
    readonly object3d: Group;

    readonly config: IceSurfaceConfig;

    private readonly geometry: PlaneGeometry;
    private shaderMaterial: ShaderMaterial;
    private readonly mesh: Mesh;

    /** Shared framebuffer grab, held only while the mode is `enhanced`. */
    private capture: SceneColorCapture | null = null;
    private captureOwner: WebGLRenderer | null = null;

    /** Which `#define` set the live program was built with, so a rebuild happens only on a change. */
    private featureKey: string;

    private running = true;
    private elapsed = 0;

    // Per-frame scratch: the surface frame is refreshed every frame and must not allocate.
    private readonly axisU = new Vector3(1, 0, 0);
    private readonly axisV = new Vector3(0, 0, -1);
    private readonly axisN = new Vector3(0, 1, 0);
    private readonly lightWorld = new Vector3();

    constructor(rawConfig?: unknown, options: IceSurfaceVfxOptions = {}) {
        const { config, issues } = normalizeIceSurfaceConfig(rawConfig);
        issues.report("IceSurfaceVfx");
        this.config = config;

        const segments = Math.max(1, Math.min(Math.round(options.segments ?? 1), 256));
        // A unit plane laid into XZ once at construction. `surfaceSize` is a mesh scale, so the
        // size slider is one matrix write rather than a new geometry on every drag.
        this.geometry = new PlaneGeometry(1, 1, segments, segments);
        this.geometry.rotateX(-Math.PI / 2);

        this.featureKey = this.currentFeatureKey();
        this.shaderMaterial = this.buildMaterial();

        this.mesh = new Mesh(this.geometry, this.shaderMaterial);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;
        // Everything the effect needs from the host arrives here: the renderer to grab from, and
        // the surface's own world frame. No camera has to be plumbed through `update`, which is
        // what keeps this droppable into a game loop that only knows how to hand out a delta.
        this.mesh.onBeforeRender = (renderer) => this.prepare(renderer);

        this.object3d = new Group();
        this.object3d.name = "vfx:icesurface";
        this.object3d.add(this.mesh);

        this.applyConfig();
    }

    /**
     * The material, for dropping this look onto a surface of your own.
     *
     * The pattern reads `uv`, so give that mesh sensible UVs and set `surfaceSize` to the world
     * span the UV range covers. If the mesh is not a plane whose `uv` runs along world +X and -Z,
     * set `uTanU`, `uTanV` and `uNrm` to its world-space tangent frame as well — the parallax, the
     * Fresnel and the lighting are all expressed in it.
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
        // A hidden surface never reaches onBeforeRender, so it stops asking for the grab on its
        // own — but it must also let go of it, or ice nobody is drawing keeps a full-viewport
        // texture alive for as long as it stays switched off.
        if (!v) this.releaseCapture();
    }

    /** No particles. One plane, one draw call — that is the whole budget. */
    get activeCount(): number {
        return this.mesh.visible ? 1 : 0;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** True while this surface is holding a share of the renderer's framebuffer grab. */
    get usesSceneCapture(): boolean {
        return this.capture !== null;
    }

    /** Resumes the glints. The effect starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the glints. The ice stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. A frozen surface has nothing to burst. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: time only reaches one sine, so the huge delta a backgrounded tab returns
        // with lands somewhere else in the twinkle and never anywhere odd.
        this.elapsed += dt;
        this.shaderMaterial.uniforms.uTime.value = this.elapsed;
    }

    /**
     * Patches the config and pushes it to the GPU in one call.
     *
     *     ice.setConfig({ transparency: 0.95, frostCoverage: 0.1 });
     */
    setConfig(patch: Partial<IceSurfaceConfig>): void {
        Object.assign(this.config, patch);
        this.applyConfig();
    }

    /**
     * Loads one of the built-in looks.
     *
     * A preset says what the ice *looks like* and nothing else: the quality mode, the extent of
     * the surface and whether it is switched on at all belong to the host and are carried across
     * untouched. Unknown ids are ignored and reported, so a typo in a preset name cannot blank the
     * configuration.
     */
    setPreset(id: IcePresetId | string): boolean {
        const entry = ICE_PRESET_DATA[id as IcePresetId];
        if (!entry) {
            console.warn(`[IceSurfaceVfx] unknown preset "${id}"`);
            return false;
        }
        const { enabled, qualityMode, surfaceSize } = this.config;
        const { config, issues } = normalizeIceSurfaceConfig(entry.config);
        issues.report(`IceSurfaceVfx preset "${id}"`);
        Object.assign(this.config, config, { enabled, qualityMode, surfaceSize });
        this.applyConfig();
        return true;
    }

    /**
     * Re-reads the config after an edit.
     *
     * Every knob is a uniform except the five in `ICE_FEATURE_KEYS`, which switch blocks of the
     * shader in and out and therefore rebuild the program — so toggling frost costs one compile
     * and dragging anything else costs nothing.
     */
    applyConfig(): void {
        const c = this.config;

        const key = this.currentFeatureKey();
        if (key !== this.featureKey) {
            this.featureKey = key;
            const next = this.buildMaterial();
            next.uniforms.uTime.value = this.elapsed;
            this.shaderMaterial.dispose();
            this.shaderMaterial = next;
            this.mesh.material = next;
            // PERFORMANCE samples nothing, so it must not keep a full-viewport texture alive for
            // the whole scene.
            if (c.qualityMode !== "enhanced") this.releaseCapture();
        }

        const u = this.shaderMaterial.uniforms;

        u.uTransparency.value = c.transparency;
        u.uClarity.value = c.clarity;
        u.uRefraction.value = c.refractionStrength;
        u.uRefractionScale.value = c.refractionScale;
        u.uRefractionDetail.value = c.refractionDetail;
        u.uChromatic.value = c.chromaticAberration;
        u.uViewAngleOpacity.value = c.viewAngleOpacity;

        u.uThickness.value = c.iceThickness;
        u.uAbsorption.value = c.depthAbsorption;
        u.uParallax.value = c.internalParallax;
        u.uInternalDepth.value = c.internalDepthIntensity;

        u.uColorVariation.value = c.colorVariation;
        u.uCloudiness.value = c.cloudiness;
        u.uCloudScale.value = c.cloudScale;
        u.uCloudContrast.value = c.cloudContrast;

        u.uCrackDensity.value = c.crackDensity;
        u.uCrackScale.value = c.crackScale;
        u.uCrackWidth.value = c.crackWidth;
        u.uCrackBranching.value = c.crackBranching;
        u.uCrackIrregularity.value = c.crackIrregularity;
        u.uCrackDepth.value = c.crackDepth;
        u.uCrackOpacity.value = c.crackOpacity;
        u.uCrackHighlight.value = c.crackHighlightIntensity;

        u.uBubbleDensity.value = c.bubbleDensity;
        // A minimum above the maximum would make the size mix run backwards; the reader allows
        // either order because they are independent keys, so the clamp belongs here.
        u.uBubbleMin.value = Math.min(c.bubbleMinSize, c.bubbleMaxSize);
        u.uBubbleMax.value = Math.max(c.bubbleMinSize, c.bubbleMaxSize);
        u.uBubbleCluster.value = c.bubbleClustering;
        u.uBubbleOpacity.value = c.bubbleOpacity;
        u.uBubbleDepth.value = c.bubbleDepth;
        u.uBubbleDistortion.value = c.bubbleDistortion;

        u.uFrostCoverage.value = c.frostCoverage;
        u.uFrostScale.value = c.frostScale;
        u.uFrostSoftness.value = c.frostSoftness;
        u.uFrostOpacity.value = c.frostOpacity;
        u.uFrostRoughness.value = c.frostRoughness;
        u.uFrostEdge.value = c.frostEdgeIntensity;
        u.uFrostNearCracks.value = c.frostNearCracks;

        u.uRoughness.value = c.roughness;
        u.uSpecular.value = c.specularIntensity;
        u.uFresnel.value = c.fresnelIntensity;
        u.uRimIntensity.value = c.rimIntensity;
        u.uNormalStrength.value = c.normalStrength;
        u.uMicroScale.value = c.microDetailScale;
        u.uSparkle.value = c.sparkleIntensity;

        u.uSize.value = c.surfaceSize;
        u.uEdgeFade.value = c.edgeFade;

        (u.uDepthTint.value as Color).copy(resolveColor(c.depthTint));
        (u.uIce.value as Color).copy(resolveColor(c.iceColor));
        (u.uDeepIce.value as Color).copy(resolveColor(c.deepIceColor));
        (u.uSurfaceCol.value as Color).copy(resolveColor(c.surfaceColor));
        (u.uCrackColor.value as Color).copy(resolveColor(c.crackColor));
        (u.uFrostColor.value as Color).copy(resolveColor(c.frostColor));
        (u.uRimColor.value as Color).copy(resolveColor(c.rimColor));

        // The pattern is sized in world units from `uv`, so the mesh has to span the same width the
        // shader thinks it does — otherwise the features stretch instead of there being more of them.
        this.mesh.scale.set(c.surfaceSize, 1, c.surfaceSize);
        this.mesh.updateMatrix();
        this.mesh.visible = c.enabled;
        if (!c.enabled) this.releaseCapture();

        this.refreshSurfaceFrame();
    }

    /** Puts the twinkle back to the start. Nothing else in the shader depends on time. */
    reset(): void {
        this.elapsed = 0;
        this.shaderMaterial.uniforms.uTime.value = 0;
        this.applyConfig();
    }

    dispose(): void {
        this.releaseCapture();
        this.mesh.onBeforeRender = () => {};
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.shaderMaterial.dispose();
    }

    /**
     * Runs after frustum culling, which is deliberate: ice nobody can see costs nothing and, more
     * importantly, never asks for the framebuffer copy.
     */
    private prepare(renderer: WebGLRenderer): void {
        this.refreshSurfaceFrame();

        if (this.config.qualityMode !== "enhanced") return;
        if (this.capture === null || this.captureOwner !== renderer) {
            this.releaseCapture();
            this.capture = retainSceneColor(renderer);
            this.captureOwner = renderer;
        }
        // Returns the same texture to every surface in the frame; only the first one copies.
        this.shaderMaterial.uniforms.uScene.value = this.capture.capture(renderer);
    }

    /**
     * The surface's world-space tangent frame, and the key light expressed in it.
     *
     * Refreshed per frame rather than cached: a host is free to reparent or rotate the ice, and
     * the whole of the view-dependent shading is expressed in this frame. Three vector reads and
     * three dot products, no allocation.
     */
    private refreshSurfaceFrame(): void {
        const c = this.config;
        const u = this.shaderMaterial.uniforms;

        // The plane geometry is baked into XZ, so its `uv` axes are object +X and object -Z.
        this.mesh.matrixWorld.extractBasis(this.axisU, this.axisN, this.axisV);
        this.axisU.normalize();
        this.axisN.normalize();
        this.axisV.normalize().negate();

        (u.uTanU.value as Vector3).copy(this.axisU);
        (u.uTanV.value as Vector3).copy(this.axisV);
        (u.uNrm.value as Vector3).copy(this.axisN);

        const az = c.lightAzimuth * DEG2RAD;
        const el = c.lightElevation * DEG2RAD;
        const horizontal = Math.cos(el);
        this.lightWorld.set(Math.cos(az) * horizontal, Math.sin(el), -Math.sin(az) * horizontal);
        (u.uLightTS.value as Vector3)
            .set(this.lightWorld.dot(this.axisU), this.lightWorld.dot(this.axisV), this.lightWorld.dot(this.axisN))
            .normalize();
    }

    /** The `#define` set as a string, so a rebuild is one comparison rather than a deep diff. */
    private currentFeatureKey(): string {
        const c = this.config;
        const chromatic = c.qualityMode === "enhanced" && c.chromaticAberration > 0;
        const blur = c.qualityMode === "enhanced" && c.frostBlur;
        return [c.qualityMode, c.cracksEnabled, c.bubblesEnabled, c.frostEnabled, chromatic, blur].join("|");
    }

    private buildMaterial(): ShaderMaterial {
        const c = this.config;
        const enhanced = c.qualityMode === "enhanced";
        const defines: Record<string, string> = {};
        // The extra noise octaves ride with the quality mode rather than having a knob of their
        // own: they are the same decision, and two ways to say it would only let them disagree.
        if (enhanced) {
            defines.ICE_ENHANCED = "";
            defines.ICE_DETAIL = "";
            if (c.chromaticAberration > 0) defines.ICE_CHROMATIC = "";
            if (c.frostBlur) defines.ICE_FROST_BLUR = "";
        }
        if (c.cracksEnabled) defines.ICE_CRACKS = "";
        if (c.bubblesEnabled) defines.ICE_BUBBLES = "";
        if (c.frostEnabled) defines.ICE_FROST = "";

        return new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            defines,
            uniforms: {
                uScene: { value: null },
                uTime: { value: 0 },

                uTransparency: { value: c.transparency },
                uClarity: { value: c.clarity },
                uRefraction: { value: c.refractionStrength },
                uRefractionScale: { value: c.refractionScale },
                uRefractionDetail: { value: c.refractionDetail },
                uChromatic: { value: c.chromaticAberration },
                uViewAngleOpacity: { value: c.viewAngleOpacity },

                uThickness: { value: c.iceThickness },
                uAbsorption: { value: c.depthAbsorption },
                uDepthTint: { value: new Color(resolveColor(c.depthTint)) },
                uParallax: { value: c.internalParallax },
                uInternalDepth: { value: c.internalDepthIntensity },

                uIce: { value: new Color(resolveColor(c.iceColor)) },
                uDeepIce: { value: new Color(resolveColor(c.deepIceColor)) },
                uSurfaceCol: { value: new Color(resolveColor(c.surfaceColor)) },
                uColorVariation: { value: c.colorVariation },
                uCloudiness: { value: c.cloudiness },
                uCloudScale: { value: c.cloudScale },
                uCloudContrast: { value: c.cloudContrast },

                uCrackDensity: { value: c.crackDensity },
                uCrackScale: { value: c.crackScale },
                uCrackWidth: { value: c.crackWidth },
                uCrackBranching: { value: c.crackBranching },
                uCrackIrregularity: { value: c.crackIrregularity },
                uCrackDepth: { value: c.crackDepth },
                uCrackOpacity: { value: c.crackOpacity },
                uCrackColor: { value: new Color(resolveColor(c.crackColor)) },
                uCrackHighlight: { value: c.crackHighlightIntensity },

                uBubbleDensity: { value: c.bubbleDensity },
                uBubbleMin: { value: c.bubbleMinSize },
                uBubbleMax: { value: c.bubbleMaxSize },
                uBubbleCluster: { value: c.bubbleClustering },
                uBubbleOpacity: { value: c.bubbleOpacity },
                uBubbleDepth: { value: c.bubbleDepth },
                uBubbleDistortion: { value: c.bubbleDistortion },

                uFrostCoverage: { value: c.frostCoverage },
                uFrostScale: { value: c.frostScale },
                uFrostSoftness: { value: c.frostSoftness },
                uFrostOpacity: { value: c.frostOpacity },
                uFrostRoughness: { value: c.frostRoughness },
                uFrostColor: { value: new Color(resolveColor(c.frostColor)) },
                uFrostEdge: { value: c.frostEdgeIntensity },
                uFrostNearCracks: { value: c.frostNearCracks },

                uRoughness: { value: c.roughness },
                uSpecular: { value: c.specularIntensity },
                uFresnel: { value: c.fresnelIntensity },
                uRimColor: { value: new Color(resolveColor(c.rimColor)) },
                uRimIntensity: { value: c.rimIntensity },
                uNormalStrength: { value: c.normalStrength },
                uMicroScale: { value: c.microDetailScale },
                uSparkle: { value: c.sparkleIntensity },
                uLightTS: { value: new Vector3(0, 0, 1) },

                uSize: { value: c.surfaceSize },
                uEdgeFade: { value: c.edgeFade },
                uTanU: { value: new Vector3(1, 0, 0) },
                uTanV: { value: new Vector3(0, 0, -1) },
                uNrm: { value: new Vector3(0, 1, 0) },
            },
            // Transparent in both modes, and that is not negotiable: it is what puts the draw in
            // the transparent pass, after every opaque object in the scene has reached the
            // framebuffer. An opaque ice sheet would be sorted front-to-back and could grab a
            // frame that does not have the fish in it yet.
            transparent: true,
            blending: NormalBlending,
            // Depth test on, so anything standing on the ice is not drawn through it; depth write
            // off, so the ice never occludes what is already behind it.
            depthWrite: false,
            // Single sided: a lake has a top. It also keeps three from drawing a transparent
            // surface twice, which for this shader would be the most expensive mistake available.
            side: FrontSide,
            fog: false,
        });
    }

    private releaseCapture(): void {
        if (this.capture === null) return;
        this.capture.release();
        this.capture = null;
        this.captureOwner = null;
        // Never leave the material pointing at a texture that may have just been freed.
        this.shaderMaterial.uniforms.uScene.value = null;
    }
}
