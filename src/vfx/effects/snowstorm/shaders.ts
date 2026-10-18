/**
 * GLSL the storm body and the snow streaks both need, kept in one place so the two materials
 * cannot disagree about where the storm ends.
 *
 * The important one is {@link STORM_MASK}. Everything that makes this a *localized* storm rather
 * than a weather system lives in that function: it is evaluated in the storm's own local space,
 * so the whole formation moves by moving one parent transform and nothing in here has to know
 * about it. Both materials declare the same uniform block and get the same silhouette for free —
 * which is what keeps the snow inside the fog instead of streaming past its edge.
 */

/**
 * 2D simplex noise (Ashima / Gustavson), for the per-pixel detail inside a puff.
 *
 * Simplex rather than value noise because a puff is magnified hard on screen: value noise shows
 * its lattice as axis-aligned creases the moment it is stretched over more than a few pixels per
 * cell, and a grid is the one thing a snowstorm must not have.
 */
export const SIMPLEX_2D = /* glsl */ `
vec3 sn2_permute(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise2(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = sn2_permute(sn2_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
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

/**
 * 3D simplex noise (Ashima / Gustavson), for the silhouette.
 *
 * It is only ever called from a *vertex* shader, a couple of times per puff — a few hundred
 * invocations a frame, not a few hundred thousand — so the cost of the 3D variant is noise in the
 * budget. It has to be genuinely 3D: a 2D field smeared along Y gives the storm a vertically
 * extruded outline that reads as a curtain the moment the camera moves off its axis.
 */
export const SIMPLEX_3D = /* glsl */ `
vec3 sn3_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn3_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn3_permute(vec4 x) { return sn3_mod289(((x * 34.0) + 1.0) * x); }
vec4 sn3_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = sn3_mod289(i);
    vec4 p = sn3_permute(sn3_permute(sn3_permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = sn3_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * The storm's shape, as a scalar field in local space. Requires {@link SIMPLEX_3D} ahead of it.
 *
 * It is an ellipsoid whose *radius* is displaced by drifting 3D noise, not an ellipsoid with
 * noise multiplied over it. The distinction is the whole look: displacing the radius grows and
 * retracts lobes of real storm, so the outline is irregular and keeps re-forming; multiplying
 * would only punch holes in a shape that is still visibly an ellipsoid.
 *
 * `uDensity` moves the cut outward rather than fading the result up, so turning density up adds
 * storm at the edges instead of making the whole formation into a brighter wash. The softness
 * band is added to the cut and never subtracted, which is what keeps `smoothstep` defined at
 * both ends of the slider.
 *
 * `MASK_OCTAVES` is a define: one is a smooth lobed blob, two gives the ragged sub-lobes that
 * read as turbulence at the silhouette. It is the only quality knob in here.
 */
export const STORM_MASK = /* glsl */ `
uniform vec3 uHalfSize;
uniform float uDensity;
uniform float uEdgeSoftness;
uniform float uShapeScale;
uniform float uShapeWarp;
uniform float uShapePhase;

float stormMask(vec3 p) {
    vec3 n = p / uHalfSize;
    float r = length(n);

    // The field drifts on all three axes at incommensurate rates, so the silhouette evolves
    // instead of looping, and it is sampled in normalized space so re-sizing the storm restretches
    // the same shape rather than resampling a different part of the field.
    vec3 q = n * uShapeScale + uShapePhase * vec3(0.17, 0.31, -0.11);
    float w = snoise3(q) * 0.66;
    #if MASK_OCTAVES > 1
        w += snoise3(q * 2.31 + 11.7) * 0.28;
    #endif
    r += w * uShapeWarp;

    float cut = mix(0.45, 1.25, uDensity);
    return 1.0 - smoothstep(cut, cut + max(uEdgeSoftness, 0.02), r);
}
`;

/**
 * The lightning term, shared so the bolt lights the fog and the snow by the same rule.
 *
 * Evaluated per vertex: the flash radius is always several puffs across, so interpolating it
 * across a quad is indistinguishable from evaluating it per pixel and costs a fraction as much.
 * `uFlashPos` is in storm-local space, which is why a strike stays put inside a moving storm.
 */
export const FLASH_TERM = /* glsl */ `
uniform vec3 uFlashPos;
uniform float uFlashRadius;
uniform float uFlashIntensity;

float flashAt(vec3 p) {
    if (uFlashIntensity <= 0.0) return 0.0;
    float d = length(p - uFlashPos) / max(uFlashRadius, 0.001);
    // Inverse-square rather than a smoothstep ball: the near falloff is what makes the lit region
    // read as a source buried in the snow rather than as a painted highlight.
    return uFlashIntensity / (1.0 + d * d * 3.0);
}
`;
