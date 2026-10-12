/**
 * The whole sky in one draw call: gradient, haze, sun, moon, stars and the cloud decks.
 *
 * Everything here is a function of the view *direction*, which is why it can share a single
 * fullscreen-ish pass. A dome mesh would need tessellation (and show its seams); layered quads
 * would need one draw call each and sort against the particles. A unit box drawn from the inside,
 * with the camera translation stripped out of the view matrix in the vertex shader, gives an
 * exact ray per fragment for the price of 12 triangles and no per-frame matrix write.
 *
 * Draw order is the load-bearing part — see the comment on `transparent` in `buildMaterial`.
 */

import {
    BackSide,
    BoxGeometry,
    Camera,
    Color,
    LessEqualDepth,
    Mesh,
    ShaderMaterial,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";
import { resolveColor } from "../../core/colorCache";
import type { SkyConfig, SkyQuality } from "./config";
import { CLOUD_TYPE_SHAPES, SKY_QUALITY_PRESETS } from "./quality";

const VERTEX = /* glsl */ `
varying vec3 vDir;

void main() {
    // Object space is the ray: the box is a unit cube centred on the origin, so a vertex position
    // interpolated across a (planar) face is exactly that face's intersection with the view ray.
    vDir = position;

    // mat3(viewMatrix) drops the translation, which pins the box to the camera without anything
    // ever touching its matrix — no onBeforeRender write, no matrixWorld update, no drift.
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);

#ifdef USE_REVERSED_DEPTH_BUFFER
    // Reversed depth puts the far plane at 0 and clears to 0; GEqual then passes against the
    // clear. Writing w here instead would land the sky on the NEAR plane and paint over the scene.
    clip.z = 0.0;
#else
    // z == w is exactly the far plane, i.e. window depth 1.0 — the same value the buffer is
    // cleared to. That is why depthFunc must be LessEqual: plain Less rejects every fragment and
    // the screen comes out black with a perfectly correct shader.
    clip.z = clip.w;
#endif

    gl_Position = clip;
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>

uniform float uTime;

uniform vec3 uZenith;
uniform vec3 uUpperSky;
uniform vec3 uHorizon;
uniform vec3 uLowerHorizon;
uniform vec3 uNightZenith;
uniform vec3 uNightHorizon;
uniform float uHorizonHeight;
uniform float uGradientSoftness;
uniform float uAtmosphere;
uniform float uHaze;
uniform float uNight;
uniform float uBrightness;
uniform float uSaturation;
uniform float uContrast;
uniform float uExposure;
uniform float uFlash;
uniform float uVisibility;
uniform vec3 uTint;
uniform float uTintStrength;

uniform float uSunEnabled;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uSunIntensity;
uniform float uSunGlow;
uniform float uSunGlowRadius;
uniform float uSunGlowSoftness;
uniform float uLowSun;

uniform float uMoonEnabled;
uniform vec3 uMoonDir;
uniform vec3 uMoonRight;
uniform vec3 uMoonUp;
uniform vec3 uMoonColor;
uniform float uMoonSize;
uniform float uMoonIntensity;
uniform float uMoonGlow;
uniform float uMoonGlowRadius;
uniform float uMoonPhase;
uniform float uMoonDetail;

uniform float uStarDensity;
uniform float uStarBright;
uniform float uStarSize;
uniform float uStarTwinkle;
uniform float uStarTwinkleSpeed;
uniform vec3 uStarColor;
uniform float uStarCoverage;
uniform float uStarFade;

uniform vec3 uCloudColor;
uniform vec3 uCloudShadow;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform float uCloudScale;
uniform float uCloudDetail;
uniform float uCloudSoftness;
uniform float uCloudOpacity;
uniform float uCloudHeight;
uniform float uCloudVariation;
uniform float uCloudLight;
uniform float uCloudFar;
uniform float uCloudHorizonFade;
uniform float uCloudWarp;
uniform vec2 uCloudWind;

/** View-space units per pixel at unit depth — the LOD metric the cloud fbm fades octaves on. */
uniform float uPixelAngle;

varying vec3 vDir;

// Multiply/fract hashes, never fract(sin(...)). On mobile the sin precision drifts between
// vendors, and a drifting hash here is literally stars that crawl across the sky.
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

/**
 * fbm that drops octaves past lodLimit.
 *
 * Fading cloud alpha at grazing angles is not enough on its own: without this the octaves that
 * have gone sub-pixel keep resolving to different values every frame and you get a band of
 * boiling static sitting exactly where the deck meets the horizon. This is the fbm's mip chain.
 */
float fbmLod(vec2 p, float lodLimit) {
    float v = 0.0;
    float a = 0.5;
    float norm = 0.0;
    for (int i = 0; i < CLOUD_OCTAVES; i++) {
        float w = 1.0 - smoothstep(lodLimit - 1.0, lodLimit, float(i));
        v += a * w * vnoise(p);
        norm += a * w;
        p *= 2.03;
        a *= 0.5;
    }
    return norm > 1e-4 ? v / norm : 0.5;
}

/** Angular distance as a chord length. Monotonic in the true angle and far cheaper than acos. */
float chord(vec3 a, vec3 b) {
    return length(a - b);
}

#if STARS_ENABLED
vec3 starField(vec3 d) {
    // Cube-face parameterisation rather than spherical: lat/long clusters and crawls at the pole,
    // and the pole is exactly where you look when you are judging a star field.
    vec3 ad = abs(d);
    float m = max(ad.x, max(ad.y, ad.z));
    vec2 fuv = (ad.x == m) ? d.yz / m : ((ad.y == m) ? d.zx / m : d.xy / m);
    float face = (ad.x == m) ? 0.0 : ((ad.y == m) ? 1.0 : 2.0);

    vec2 g = fuv * uStarDensity;

    // One derivative, at top level, before any branch — derivatives in non-uniform control flow
    // are undefined. This is the angular size of a pixel in cell units and it is the entire
    // anti-shimmer mechanism.
    float px = max(fwidth(g.x), fwidth(g.y)) * 0.5;

    vec3 acc = vec3(0.0);
    vec2 base = floor(g);

#if STAR_NEIGHBOURS
    for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j));
        float jitterLo = 0.08;
        float jitterRange = 0.84;
#else
    {
    {
        vec2 cell = base;
        // Without neighbour cells a star must never touch an edge, or it gets clipped in half.
        float jitterLo = 0.25;
        float jitterRange = 0.5;
#endif
        vec3 h = hash33(vec3(cell, face));
        if (h.z < uStarCoverage) {
            vec2 c = cell + jitterLo + jitterRange * h.xy;
            float r = uStarSize * 0.10 * (0.45 + 1.1 * (h.z / max(uStarCoverage, 1e-3)));
            float rr = max(r, px * 1.2);

            // Conserve energy. Clamping the radius alone makes every star the same size and the
            // whole field strobes whenever the pixel ratio or the FOV changes — and this lab has
            // a live pixel-ratio control, so that shows up immediately.
            float dim = (r * r) / (rr * rr);

            float disc = 1.0 - smoothstep(rr * 0.35, rr, length(g - c));
            float tw = 1.0 + uStarTwinkle * sin(uTime * uStarTwinkleSpeed * (1.3 + 2.7 * h.x) + h.y * 31.4);
            acc += uStarColor * uStarBright * dim * disc * max(tw, 0.0);
        }
    }
    }

    return acc;
}
#endif

#if CLOUD_LAYERS > 0
/** Returns rgb = lit cloud colour, a = coverage. */
vec4 cloudLayer(vec3 d, float height, vec2 wind, float scaleMul, float opacityMul) {
    float hRel = height - cameraPosition.y;
    float denom = d.y;

    // Guard before the divide: a ray parallel to the deck never meets it, and a deck behind the
    // ray (t < 0) must not wrap around into view.
    if (abs(denom) < 1e-3) return vec4(0.0);
    float t = hRel / denom;
    if (t <= 0.0) return vec4(0.0);

    float graze = smoothstep(0.0, uCloudHorizonFade, abs(denom));
    float far = 1.0 - smoothstep(uCloudFar * 0.35, uCloudFar, t);
    float cover = graze * far;
    if (cover <= 0.002) return vec4(0.0);

    // Clamp only to keep the coordinate finite; the fades above decide what is actually visible.
    float tc = min(t, uCloudFar * 2.0);
    vec2 p = cameraPosition.xz + d.xz * tc;

    float scale = uCloudScale * scaleMul * 0.0016;
    vec2 q = (p + wind) * scale;

    // Pixel footprint on the deck, stretched by 1/|d.y| along the ray. The octave whose cells are
    // smaller than this is the one to stop at.
    float footprint = tc * uPixelAngle / max(abs(denom), 0.02) * scale;
    float lodLimit = -log2(max(footprint, 1e-6));

    // One domain warp, from an independent domain. A second level costs double for a difference
    // nobody can see.
    q += uCloudWarp * uCloudDetail * (vec2(fbmLod(q * 0.37 + 7.1, lodLimit), fbmLod(q * 0.37 + 23.9, lodLimit)) - 0.5);

    float detail = fbmLod(q, lodLimit);

    // The coarse coverage field is what stops this reading as a scrolling tile: it drifts at a
    // different speed in a different direction, so the big shape never comes round on the same
    // period as the detail and the eye can never locate the repeat.
    float cov = fbmLod((p + wind * 0.35) * scale * 0.13 + 5.7, max(lodLimit - 3.0, 0.0));

    float thr = (1.0 - uCloudCoverage) + (cov - 0.5) * uCloudVariation;
    float dens = smoothstep(thr, thr + uCloudSoftness, detail);
    dens = clamp(dens * uCloudDensity, 0.0, 1.0) * cover * uCloudOpacity * opacityMul;
    if (dens <= 0.002) return vec4(0.0);

    // One extra sample toward the sun fakes thickness: a lit near edge and a shaded underside,
    // which is the difference between "cloud" and "grey stain". Real self-shadowing wants a
    // raymarch, which is exactly what this system is not allowed to do.
    vec3 lit = uCloudColor;
#if CLOUD_LIGHTING
    vec2 toSun = normalize(uSunDir.xz + vec2(1e-4, 0.0)) * 0.55;
    float shade = fbmLod(q + toSun, lodLimit);
    float selfShadow = exp(-uCloudLight * 2.2 * max(shade - detail + 0.25, 0.0));
    lit = mix(uCloudShadow, uCloudColor, selfShadow);
    // Silver lining: the rim facing the sun picks up its colour.
    lit += uSunColor * uCloudLight * 0.35 * pow(max(dot(d, uSunDir), 0.0), 6.0) * (1.0 - uNight);
#endif

    return vec4(lit, dens);
}
#endif

vec3 grade(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSaturation);
    // Pivot on mid grey in linear space so contrast opens the sky up rather than crushing it.
    c = (c - 0.18) * uContrast + 0.18;
    return max(c * uBrightness, 0.0);
}

/**
 * Local tone curve.
 *
 * The host renderer uses NoToneMapping, so anything over 1.0 clips to flat white and the sun
 * becomes a disc-shaped hole with a hard contour where the glow crosses 1. Everything below 0.8
 * passes through untouched, which matters: it means the hex you typed into the config is the
 * colour that lands on screen. Only the sun's core is compressed. Doing this here rather than on
 * the renderer leaves every other material in the host's scene exactly as it was.
 */
vec3 toneMapSky(vec3 c) {
    const float k = 0.8;
    vec3 hi = vec3(k) + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k)));
    return mix(c, hi, step(vec3(k), c));
}

void main() {
    vec3 d = normalize(vDir);

    // ---- Gradient -------------------------------------------------------------------------
    float rel = d.y - uHorizonHeight;
    float up = clamp(rel / max(1.0 - uHorizonHeight, 1e-3), 0.0, 1.0);
    float down = clamp(-rel / max(1.0 + uHorizonHeight, 1e-3), 0.0, 1.0);

    float s = clamp(uGradientSoftness, 0.02, 2.0);
    // Edges are clamped apart rather than reversed: smoothstep is undefined when edge0 >= edge1.
    float e1 = clamp(0.30 * s, 0.01, 0.80);

    vec3 above = mix(uHorizon, uUpperSky, smoothstep(0.0, e1, up));
    above = mix(above, uZenith, smoothstep(e1 * 0.9, 1.0, up));
    vec3 below = mix(uHorizon, uLowerHorizon, smoothstep(0.0, clamp(0.5 * s, 0.02, 1.0), down));

    vec3 col = rel >= 0.0 ? above : below;

    // Night is a blend of the same gradient, not a second shader path.
    vec3 nightCol = mix(uNightHorizon, uNightZenith, smoothstep(0.0, 0.85, up));
    col = mix(col, nightCol, uNight);

    // ---- Sun-driven atmosphere -------------------------------------------------------------
    float sunDot = max(dot(d, uSunDir), 0.0);
    float dayWeight = (1.0 - uNight) * uSunEnabled;
    col += uSunColor * uAtmosphere * 0.30 * pow(sunDot, 4.0) * dayWeight;

    // The sunset band: warmth spread along the horizon on the sun's side, strongest when the sun
    // is near the horizon. Without the low-sun weight a midday sky gets an orange skirt.
    vec3 flatD = vec3(d.x, 0.0, d.z);
    vec3 flatSun = vec3(uSunDir.x, 0.0, uSunDir.z);
    float fl = length(flatD) * length(flatSun);
    float azDot = fl > 1e-4 ? max(dot(flatD, flatSun) / fl, 0.0) : 0.0;
    float band = 1.0 - smoothstep(0.0, 0.34, abs(rel));
    col += uSunColor * uAtmosphere * 0.55 * band * pow(azDot, 3.0) * uLowSun * dayWeight;

    // ---- Horizon haze ------------------------------------------------------------------------
    float haze = clamp((1.0 - smoothstep(0.0, 0.42, abs(rel))) * uHaze, 0.0, 1.0);
    col = mix(col, uHorizon * 1.06, haze);

    // ---- Stars (behind everything else in the sky) -------------------------------------------
#if STARS_ENABLED
    if (uStarFade > 0.001) {
        // Fade near the horizon as well as by sun elevation — stars sitting on the skyline read
        // as fireflies.
        float horizonFade = smoothstep(uHorizonHeight, uHorizonHeight + 0.12, d.y);
        col += starField(d) * uStarFade * horizonFade;
    }
#endif

    // ---- Moon ---------------------------------------------------------------------------------
    if (uMoonEnabled > 0.5) {
        float md = chord(d, uMoonDir);
        float glow = pow(max(1.0 - md / max(uMoonGlowRadius, 1e-3), 0.0), 2.5);
        col += uMoonColor * uMoonGlow * glow;

        vec3 relv = d - uMoonDir;
        vec2 muv = vec2(dot(relv, uMoonRight), dot(relv, uMoonUp)) / max(uMoonSize, 1e-4);
        float r = length(muv);
        float face = 1.0 - smoothstep(0.88, 1.0, r);

        // Phase as an occluding disc: distance 0 at new moon (fully covered), 2 at full.
        float k = 2.0 * (1.0 - abs(1.0 - 2.0 * uMoonPhase));
        k *= uMoonPhase < 0.5 ? -1.0 : 1.0;
        float occl = 1.0 - smoothstep(0.86, 1.0, length(muv - vec2(k, 0.0)));
        float lit = clamp(face - occl, 0.0, 1.0);

        float surf = 1.0 - uMoonDetail * 0.42 * vnoise(muv * 3.2 + 11.0);
        col += uMoonColor * uMoonIntensity * lit * surf;
    }

    // ---- Sun ----------------------------------------------------------------------------------
    if (uSunEnabled > 0.5) {
        float sd = chord(d, uSunDir);
        float disc = 1.0 - smoothstep(uSunSize * 0.80, uSunSize, sd);
        float falloff = mix(8.0, 1.5, clamp(uSunGlowSoftness, 0.0, 1.0));
        float glow = pow(max(1.0 - sd / max(uSunGlowRadius, 1e-3), 0.0), falloff);
        col += uSunColor * (disc * uSunIntensity + glow * uSunGlow);
    }

    // ---- Clouds, over everything above ---------------------------------------------------------
#if CLOUD_LAYERS > 0
    for (int i = 0; i < CLOUD_LAYERS; i++) {
        float fi = float(i);
        // Incommensurate ratios per layer: matched speeds make two decks read as one sheet.
        vec4 layer = cloudLayer(
            d,
            uCloudHeight * (1.0 + fi * 0.37),
            uCloudWind * (1.0 - fi * 0.23),
            1.0 + fi * 0.63,
            1.0 / (1.0 + fi * 0.55)
        );
        col = mix(col, layer.rgb, layer.a);
    }
#endif

    // ---- Weather and grade ----------------------------------------------------------------------
    col = mix(col, uTint, uTintStrength);

    // Low visibility washes the sky toward its own haze rather than toward grey.
    float wash = 1.0 - uVisibility;
    col = mix(col, uHorizon * (1.0 - 0.35 * uNight), wash * 0.75);

    col += uFlash;
    col = grade(col);

    gl_FragColor = vec4(toneMapSky(col * uExposure), 1.0);

    #include <colorspace_fragment>
    #include <dithering_fragment>
}
`;

export interface SkyDomeUniformSources {
    config: SkyConfig;
    sunDir: Vector3;
    moonDir: Vector3;
    /** 0 at full day, 1 at full night, already scaled by `sky.dayNightBlend`. */
    night: number;
    /** Raw night factor, ignoring `dayNightBlend` — what the stars actually fade on. */
    nightRaw: number;
    /** 1 when the sun is at the horizon, 0 when it is high. Drives the sunset band. */
    lowSun: number;
    flash: number;
    elapsed: number;
}

/** Degrees of arc expressed as the chord of the unit sphere, which is what the shader compares. */
function angleToChord(degrees: number): number {
    return 2 * Math.sin((degrees * Math.PI) / 360);
}

export class SkyDome {
    readonly mesh: Mesh;

    private readonly geometry: BoxGeometry;
    private material: ShaderMaterial;
    private quality: SkyQuality;
    private cloudsEnabled: boolean;
    private starsEnabled: boolean;

    // Per-frame scratch. Nothing in `apply` or `onBeforeRender` may allocate.
    private readonly moonRight = new Vector3();
    private readonly moonUp = new Vector3();
    private readonly wind = new Vector2();
    private readonly worldUp = new Vector3(0, 1, 0);
    private readonly fallbackAxis = new Vector3(1, 0, 0);

    constructor(config: SkyConfig) {
        this.quality = config.quality;
        this.cloudsEnabled = config.clouds.enabled;
        this.starsEnabled = config.stars.enabled;

        this.geometry = new BoxGeometry(2, 2, 2);
        this.material = this.buildMaterial();

        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.name = "sky:dome";
        this.mesh.matrixAutoUpdate = false;
        // The vertex shader relocates the box every frame, so the bounding sphere three would
        // test is meaningless — it would cull the sky on the first orbit.
        this.mesh.frustumCulled = false;
        // Last among the opaque objects: the scene has written depth by now, so covered pixels
        // fail the test and cost nothing, and the transparent pass still draws over the result.
        this.mesh.renderOrder = 1000;
        this.mesh.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
    }

    get material3d(): ShaderMaterial {
        return this.material;
    }

    /**
     * Feature set compiled into the shader.
     *
     * Only shape decisions live in defines — anything that is just a number stays a uniform, so
     * dragging a slider never costs a recompile.
     */
    private defines(): Record<string, string> {
        const preset = SKY_QUALITY_PRESETS[this.quality];
        return {
            CLOUD_LAYERS: String(this.cloudsEnabled ? preset.cloudLayers : 0),
            CLOUD_OCTAVES: String(preset.cloudOctaves),
            CLOUD_LIGHTING: preset.cloudLighting ? "1" : "0",
            STARS_ENABLED: this.starsEnabled ? "1" : "0",
            STAR_NEIGHBOURS: preset.starNeighbours ? "1" : "0",
        };
    }

    private buildMaterial(): ShaderMaterial {
        return new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            defines: this.defines(),
            uniforms: {
                uTime: { value: 0 },
                uZenith: { value: new Color() },
                uUpperSky: { value: new Color() },
                uHorizon: { value: new Color() },
                uLowerHorizon: { value: new Color() },
                uNightZenith: { value: new Color() },
                uNightHorizon: { value: new Color() },
                uHorizonHeight: { value: 0 },
                uGradientSoftness: { value: 0.55 },
                uAtmosphere: { value: 0.6 },
                uHaze: { value: 0.45 },
                uNight: { value: 0 },
                uBrightness: { value: 1 },
                uSaturation: { value: 1 },
                uContrast: { value: 1 },
                uExposure: { value: 1 },
                uFlash: { value: 0 },
                uVisibility: { value: 1 },
                uTint: { value: new Color(0xffffff) },
                uTintStrength: { value: 0 },

                uSunEnabled: { value: 1 },
                uSunDir: { value: new Vector3(0, 1, 0) },
                uSunColor: { value: new Color() },
                uSunSize: { value: 0.02 },
                uSunIntensity: { value: 1.6 },
                uSunGlow: { value: 0.5 },
                uSunGlowRadius: { value: 0.3 },
                uSunGlowSoftness: { value: 0.7 },
                uLowSun: { value: 0 },

                uMoonEnabled: { value: 0 },
                uMoonDir: { value: new Vector3(0, 1, 0) },
                uMoonRight: { value: new Vector3(1, 0, 0) },
                uMoonUp: { value: new Vector3(0, 0, 1) },
                uMoonColor: { value: new Color() },
                uMoonSize: { value: 0.04 },
                uMoonIntensity: { value: 1 },
                uMoonGlow: { value: 0.35 },
                uMoonGlowRadius: { value: 0.2 },
                uMoonPhase: { value: 0.5 },
                uMoonDetail: { value: 0.35 },

                uStarDensity: { value: 36 },
                uStarBright: { value: 1 },
                uStarSize: { value: 0.5 },
                uStarTwinkle: { value: 0.4 },
                uStarTwinkleSpeed: { value: 1 },
                uStarColor: { value: new Color() },
                uStarCoverage: { value: 0.35 },
                uStarFade: { value: 0 },

                uCloudColor: { value: new Color() },
                uCloudShadow: { value: new Color() },
                uCloudCoverage: { value: 0.45 },
                uCloudDensity: { value: 1 },
                uCloudScale: { value: 1 },
                uCloudDetail: { value: 1 },
                uCloudSoftness: { value: 0.35 },
                uCloudOpacity: { value: 1 },
                uCloudHeight: { value: 900 },
                uCloudVariation: { value: 0.5 },
                uCloudLight: { value: 0.6 },
                uCloudFar: { value: 26000 },
                uCloudHorizonFade: { value: 0.06 },
                uCloudWarp: { value: 0.6 },
                uCloudWind: { value: new Vector2() },

                uPixelAngle: { value: 0.0012 },
            },
            side: BackSide,
            // MUST stay false. An opaque material sits in three's opaque list, where renderOrder
            // places it after the scene's geometry but before the transparent pass. Flip this to
            // true and it moves into the transparent list, draws *after* the particles — which
            // all use depthWrite:false, so the depth under them is still 1.0 — and the sky paints
            // straight over them. The symptom is "my embers disappeared", and nothing about this
            // material looks wrong when you go looking.
            transparent: false,
            depthWrite: false,
            depthTest: true,
            // Load-bearing: the sky's depth is exactly 1.0 and the buffer is cleared to 1.0, so
            // LessDepth would reject every fragment.
            depthFunc: LessEqualDepth,
            fog: false,
            // Large smooth gradients band badly in an 8-bit buffer. This is three's own fix.
            dithering: true,
        });
    }

    /**
     * Recompiles only when the feature *set* changes.
     *
     * Quality, clouds-off and stars-off are shape decisions; everything else is a uniform, so the
     * common case — dragging a slider, loading a preset — costs no compile at all.
     */
    syncFeatures(config: SkyConfig): void {
        const wantQuality = config.quality;
        const wantClouds = config.clouds.enabled;
        const wantStars = config.stars.enabled;
        if (wantQuality === this.quality && wantClouds === this.cloudsEnabled && wantStars === this.starsEnabled) {
            return;
        }
        this.quality = wantQuality;
        this.cloudsEnabled = wantClouds;
        this.starsEnabled = wantStars;

        const next = this.buildMaterial();
        // Carry the live values across so the swap is invisible rather than a one-frame flash.
        for (const key of Object.keys(next.uniforms)) {
            const from = this.material.uniforms[key];
            if (!from) continue;
            const a = from.value;
            const b = next.uniforms[key].value;
            if (a instanceof Color && b instanceof Color) b.copy(a);
            else if (a instanceof Vector3 && b instanceof Vector3) b.copy(a);
            else if (a instanceof Vector2 && b instanceof Vector2) b.copy(a);
            else next.uniforms[key].value = a;
        }
        this.material.dispose();
        this.material = next;
        this.mesh.material = next;
    }

    /** Pushes the whole config into uniforms. Allocation-free; safe to call every frame. */
    apply(src: SkyDomeUniformSources): void {
        const c = src.config;
        const u = this.material.uniforms;
        const sky = c.sky;

        u.uTime.value = src.elapsed;
        (u.uZenith.value as Color).copy(resolveColor(sky.zenithColor));
        (u.uUpperSky.value as Color).copy(resolveColor(sky.upperSkyColor));
        (u.uHorizon.value as Color).copy(resolveColor(sky.horizonColor));
        (u.uLowerHorizon.value as Color).copy(resolveColor(sky.lowerHorizonColor));
        (u.uNightZenith.value as Color).copy(resolveColor(sky.nightZenithColor));
        (u.uNightHorizon.value as Color).copy(resolveColor(sky.nightHorizonColor));
        u.uHorizonHeight.value = sky.horizonHeight;
        u.uGradientSoftness.value = sky.gradientSoftness;
        u.uAtmosphere.value = sky.atmosphereIntensity;
        u.uHaze.value = sky.hazeIntensity;
        u.uNight.value = src.night;
        u.uBrightness.value = sky.skyBrightness;
        u.uSaturation.value = sky.skySaturation;
        u.uContrast.value = sky.skyContrast;
        u.uExposure.value = sky.exposure;
        u.uFlash.value = src.flash;
        u.uVisibility.value = c.weather.visibility;
        (u.uTint.value as Color).copy(resolveColor(c.atmosphere.tint));
        u.uTintStrength.value = c.atmosphere.tintStrength;

        // ---- Sun ----
        u.uSunEnabled.value = c.sun.enabled ? 1 : 0;
        (u.uSunDir.value as Vector3).copy(src.sunDir);
        (u.uSunColor.value as Color).copy(resolveColor(c.sun.color));
        u.uSunSize.value = angleToChord(c.sun.size);
        u.uSunIntensity.value = c.sun.intensity;
        u.uSunGlow.value = c.sun.glowIntensity;
        u.uSunGlowRadius.value = angleToChord(c.sun.glowRadius);
        u.uSunGlowSoftness.value = c.sun.glowSoftness;
        u.uLowSun.value = src.lowSun;

        // ---- Moon ----
        u.uMoonEnabled.value = c.moon.enabled ? 1 : 0;
        (u.uMoonDir.value as Vector3).copy(src.moonDir);
        // A stable tangent basis for the disc. Near the pole the up vector degenerates, so fall
        // back to an axis that cannot be parallel to it.
        const ref = Math.abs(src.moonDir.y) > 0.999 ? this.fallbackAxis : this.worldUp;
        this.moonRight.crossVectors(ref, src.moonDir).normalize();
        this.moonUp.crossVectors(src.moonDir, this.moonRight).normalize();
        (u.uMoonRight.value as Vector3).copy(this.moonRight);
        (u.uMoonUp.value as Vector3).copy(this.moonUp);
        (u.uMoonColor.value as Color).copy(resolveColor(c.moon.color));
        u.uMoonSize.value = angleToChord(c.moon.size);
        u.uMoonIntensity.value = c.moon.intensity;
        u.uMoonGlow.value = c.moon.glowIntensity;
        u.uMoonGlowRadius.value = angleToChord(c.moon.size * 6);
        u.uMoonPhase.value = c.moon.phase;
        u.uMoonDetail.value = c.moon.surfaceDetail;

        // ---- Stars ----
        u.uStarDensity.value = c.stars.density;
        u.uStarBright.value = c.stars.brightness;
        u.uStarSize.value = c.stars.size;
        u.uStarTwinkle.value = c.stars.twinkleIntensity;
        u.uStarTwinkleSpeed.value = c.stars.twinkleSpeed;
        (u.uStarColor.value as Color).copy(resolveColor(c.stars.color));
        u.uStarCoverage.value = c.stars.coverage;
        u.uStarFade.value = c.stars.enabled ? src.nightRaw : 0;

        // ---- Clouds ----
        const shape = CLOUD_TYPE_SHAPES[c.clouds.type];
        (u.uCloudColor.value as Color).copy(resolveColor(c.clouds.color));
        (u.uCloudShadow.value as Color).copy(resolveColor(c.clouds.shadowColor));
        u.uCloudCoverage.value = Math.min(c.clouds.coverage * shape.coverage, 1);
        u.uCloudDensity.value = c.clouds.density * shape.density;
        u.uCloudScale.value = c.clouds.scale * shape.scale;
        u.uCloudDetail.value = c.clouds.detail * shape.detail;
        u.uCloudSoftness.value = Math.max(c.clouds.softness * shape.softness, 0.01);
        u.uCloudOpacity.value = c.clouds.opacity * shape.opacity;
        u.uCloudHeight.value = c.clouds.height;
        u.uCloudVariation.value = c.clouds.variation;
        u.uCloudLight.value = c.clouds.lightInfluence;
        u.uCloudWarp.value = shape.warp;

        // Wind is a distance, accumulated on the CPU from dt — see SkyVfx. Keeping it here as a
        // position rather than `speed * uTime` is what makes it frame-rate independent and lets
        // the direction change without the deck jumping.
        (u.uCloudWind.value as Vector2).copy(this.wind);
    }

    /** Advances the cloud drift. Called once per frame with the already-scaled delta. */
    advanceWind(dt: number, config: SkyConfig): void {
        const c = config.clouds;
        const rad = (c.direction * Math.PI) / 180;
        const speed = c.speed * c.windStrength * 24;
        this.wind.x -= Math.cos(rad) * speed * dt;
        this.wind.y -= Math.sin(rad) * speed * dt;
    }

    private prepare(renderer: WebGLRenderer, camera: Camera): void {
        // View-space units per pixel at unit depth. The cloud fbm needs this to know which octave
        // has gone sub-pixel; everything else about the sky is resolution-independent.
        const size = renderer.getDrawingBufferSize(tmpSize);
        const projY = (camera as { projectionMatrix?: { elements: ArrayLike<number> } }).projectionMatrix?.elements[5];
        if (projY && size.y > 0) {
            this.material.uniforms.uPixelAngle.value = 2 / (projY * size.y);
        }
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
        this.mesh.onBeforeRender = () => {};
    }
}

/** Module-level scratch: `getDrawingBufferSize` writes into a target rather than allocating. */
const tmpSize = new Vector2();
