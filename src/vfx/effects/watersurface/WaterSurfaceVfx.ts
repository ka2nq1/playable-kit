/**
 * Animated water surface: one subdivided plane, one `ShaderMaterial`, one draw call.
 *
 * It is not a particle effect and it is not a simulation. Everything a viewer reads as water —
 * the swell, the colour variation, the moving highlights, the fine ripples — is a handful of
 * sines and three noise samples evaluated per pixel from a single `uTime` uniform. Three
 * consequences, and they are the whole design:
 *
 *  - **Nothing happens on the CPU per frame.** `update(dt)` advances one float. No vertex buffer
 *    is touched after construction, so the cost is fixed whatever the knobs say.
 *  - **Every knob is a uniform**, `surfaceSize` included — the geometry is a unit plane scaled in
 *    the vertex shader. There is no rebuild to trigger and no slider that allocates.
 *  - **No render target, no reflection probe, no texture.** A playable cannot pay for a second
 *    pass over the screen, and a procedural surface has no asset to load or dispose.
 *
 * The highlights come from the surface pattern rather than from a baked sun direction. A specular
 * lobe against a fixed light looks correct for exactly one camera, and a playable moves its
 * camera; pattern-driven highlights sit on the crests from every angle, and the one view-dependent
 * term — fresnel — is the cheap one.
 *
 *     const water = new WaterSurfaceVfx(config);
 *     water.object3d.position.y = WATER_LEVEL;
 *     scene.add(water.object3d);
 *
 *     water.update(delta);     // from the loop you already have
 *     water.enabled = false;   // off, without tearing anything down
 *     water.dispose();         // on teardown
 */

import { Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeWaterSurfaceConfig, type WaterSurfaceConfig } from "./config";

export interface WaterSurfaceVfxOptions {
    /**
     * Subdivisions per side. This is the one thing that is not a uniform: it decides how finely
     * the vertex displacement can be sampled, so it is fixed at construction rather than put on a
     * slider that would reallocate. 96 gives ~5 segments per wavelength at the default frequency
     * over the default size, which is enough for the amplitudes this effect is meant for.
     */
    segments?: number;
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;
uniform float uSecondary;
uniform vec2 uWaveDir;

varying vec2 vPlane;
varying vec3 vView;
varying vec3 vNormal;
varying float vShape;

vec2 rot2(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
    // The geometry is a unit plane already laid into XZ, so surfaceSize is a uniform and resizing
    // the water never touches a buffer. Laid out in local space on purpose: the pattern is
    // anchored to the effect's own origin, so moving the object moves the water with it instead
    // of sliding the surface underneath it.
    vec2 plane = position.xz * uSize;

    // Three layers at 1 : 1.63 : 2.71 frequency and 1 : 1.17 : 0.83 speed. The ratios are
    // deliberately non-harmonic: a sum of sines always repeats, and what decides whether anyone
    // notices is how long the common period is.
    float w1 = 0.55 * uSecondary;
    float w2 = 0.28 * uSecondary;
    float wsum = 1.0 + w1 + w2;

    vec2 d0 = uWaveDir;
    vec2 d1 = rot2(uWaveDir, 2.09);
    vec2 d2 = rot2(uWaveDir, -1.27);

    float k0 = uFrequency;
    float k1 = uFrequency * 1.63;
    float k2 = uFrequency * 2.71;

    // phase = k * (dot(dir, p) + speed * t): the k outside the time term is what makes every
    // layer travel at the same world speed, so waveSpeed reads as metres per second however the
    // frequency knob is set.
    float t = uTime * uSpeed;
    float p0 = k0 * (dot(d0, plane) + t);
    float p1 = k1 * (dot(d1, plane) + t * 1.17);
    float p2 = k2 * (dot(d2, plane) + t * 0.83);

    // The wave shape, normalised and independent of amplitude. The fragment shader colours by it,
    // so water flattened to amplitude 0 still has wave-shaped shading rather than going blank.
    vShape = (sin(p0) + w1 * sin(p1) + w2 * sin(p2)) / wsum;

    float amp = uAmplitude / wsum;
    float height = vShape * uAmplitude;

    // Analytic gradient of that height. Cheaper than finite differences, exact at any amplitude,
    // and it cannot go stale when a slider moves mid-frame.
    vec2 grad = d0 * (k0 * amp * cos(p0))
              + d1 * (k1 * amp * w1 * cos(p1))
              + d2 * (k2 * amp * w2 * cos(p2));

    vec4 world = modelMatrix * vec4(plane.x, height, plane.y, 1.0);

    vPlane = plane;
    vView = world.xyz - cameraPosition;
    // mat3(modelMatrix) is correct for a surface that is translated, rotated or uniformly scaled.
    // A non-uniformly scaled water plane would need the inverse transpose, and is not a thing.
    vNormal = normalize(mat3(modelMatrix) * normalize(vec3(-grad.x, 1.0, -grad.y)));

    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uOpacity;
uniform vec3 uBase;
uniform vec3 uDeep;
uniform vec3 uHighlight;
uniform float uColorVariation;
uniform float uHighlightIntensity;
uniform float uHighlightThreshold;
uniform float uFresnel;
uniform float uFrequency;
uniform float uSpeed;
uniform float uDetailScale;
uniform float uDetailIntensity;
uniform float uRippleIntensity;
uniform float uRippleSpeed;
uniform vec2 uWaveDir;

varying vec2 vPlane;
varying vec3 vView;
varying vec3 vNormal;
varying float vShape;

// Simplex noise (Ashima / Gustavson, 2D). Chosen over value noise because it has no axis-aligned
// grid in it: on a plane this large, value noise shows its lattice the moment the water is calm.
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

void main() {
    // Flow is accumulated in world units before the scale knobs are applied, so changing a scale
    // re-sizes the pattern without also changing how fast it travels.
    vec2 flow = uWaveDir * (uTime * uSpeed);

    // Two broad fields: one drifting with the waves, one across them. A single scrolling field is
    // exactly what reads as a texture sliding over the surface — crossing two makes the shapes
    // re-form instead, and there is no moment where the pattern restarts.
    float broad = snoise((vPlane - flow * 0.55) * uFrequency * 0.50);
    float crossField = snoise((vPlane - vec2(-flow.y, flow.x) * 0.40) * uFrequency * 1.07 + 37.0);
    float swell = broad * 0.62 + crossField * 0.38;

    // How many world units a pixel covers here. Fine detail smaller than a pixel is not detail,
    // it is shimmer — this is what fades the small stuff out toward the horizon instead of
    // letting it alias, and it is the whole anti-aliasing budget.
    float px = (fwidth(vPlane.x) + fwidth(vPlane.y)) * 0.5 + 1e-6;

    // Fine pattern. Colour only: taking its gradient would cost two more noise samples, and the
    // ripples below already give the surface something analytic to catch light with.
    float detail = snoise((vPlane - flow * 1.6) * uDetailScale);
    detail *= smoothstep(1.5, 5.0, 6.2832 / (uDetailScale * px));

    // Fine ripples as two crossed sines rather than a third noise octave: the gradient of a sine
    // is free, and that gradient is what makes the highlights break up instead of sitting still.
    float rk = uDetailScale * 2.7;
    float rt = uTime * uRippleSpeed;
    vec2 r0 = vec2(0.92, 0.39);
    vec2 r1 = vec2(-0.44, 0.90);
    float q0 = rk * (dot(r0, vPlane) + rt);
    float q1 = rk * 1.43 * (dot(r1, vPlane) - rt * 0.78);
    float ripFade = smoothstep(1.5, 5.0, 6.2832 / (rk * px));
    float ripple = (sin(q0) * 0.6 + sin(q1) * 0.4) * ripFade;
    vec2 rgrad = (r0 * (0.6 * cos(q0)) + r1 * (0.4 * 1.43 * cos(q1))) * uRippleIntensity * 0.22 * ripFade;

    vec3 n = normalize(vec3(vNormal.x + rgrad.x, vNormal.y, vNormal.z + rgrad.y));
    // Surface gradient: how far the water tips, in rise over run. Everything below reads this
    // rather than the normal itself, because a water normal is always within a few degrees of up
    // and the interesting signal lives in those few degrees.
    vec2 slope = vec2(n.x, n.z) / max(n.y, 0.001);

    // Colour. The pattern decides how far the surface drops from base toward deep; at variation 0
    // it is flat base colour, which is what makes the knob honest at both ends of its range.
    float field = clamp(swell + vShape * 0.45 + detail * uDetailIntensity, -1.0, 1.0);
    vec3 color = mix(uDeep, uBase, mix(1.0, field * 0.5 + 0.5, uColorVariation));

    // Faces tipping along the wave heading catch more light than the ones turning away. This is
    // the term that makes the geometric waves read as geometry with the highlights turned off.
    float tilt = dot(slope, uWaveDir);
    color *= clamp(1.0 + tilt * 0.9, 0.72, 1.3);

    // Highlights are driven by the surface itself, not by a light the host does not own: crest
    // height, which face the crest is showing, and the ripples crossing it. A baked sun direction
    // would look right for one camera, and the camera is the thing a playable changes.
    float sheen = vShape * 0.45 + clamp(tilt * 1.6, -1.0, 1.0) * 0.35 + ripple * 0.20;
    float t0 = mix(0.25, 0.92, uHighlightThreshold);
    float hi = smoothstep(t0, t0 + 0.14, sheen * 0.5 + 0.5);
    color = mix(color, uHighlight, clamp(hi * uHighlightIntensity, 0.0, 1.0));

    // Fresnel. The grazing end of any water plane is nearly all reflected sky, and this is the
    // one term that sells that without a render target.
    float fres = pow(1.0 - clamp(dot(n, normalize(-vView)), 0.0, 1.0), 5.0);
    color += uHighlight * fres * uFresnel;

    // Fade out on a circle well inside the plane, so the straight edge of the geometry can never
    // be the thing that ends the water.
    float edge = 1.0 - smoothstep(0.72, 0.98, length(vPlane) / max(uSize * 0.5, 0.0001));
    // Highlights lift the alpha a little: on transparent water a crest that is bright but as
    // see-through as the trough beside it stops reading as a crest.
    float alpha = clamp(uOpacity + hi * uHighlightIntensity * 0.35, 0.0, 1.0) * edge;
    if (alpha <= 0.004) discard;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
}
`;

export class WaterSurfaceVfx implements VfxEffect {
    readonly id = "watersurface";
    readonly object3d: Group;

    readonly config: WaterSurfaceConfig;

    private readonly geometry: PlaneGeometry;
    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;

    private running = true;
    /** Scratch so `applyConfig` allocates nothing even when called from a slider drag. */
    private readonly scratchDir = new Vector2();

    constructor(rawConfig?: unknown, options: WaterSurfaceVfxOptions = {}) {
        const { config, issues } = normalizeWaterSurfaceConfig(rawConfig);
        issues.report("WaterSurfaceVfx");
        this.config = config;

        const segments = Math.max(1, Math.min(Math.round(options.segments ?? 96), 512));
        // A unit plane, laid into XZ once at construction. `surfaceSize` scales it in the vertex
        // shader, so the size slider is a uniform write rather than a new geometry every drag.
        this.geometry = new PlaneGeometry(1, 1, segments, segments);
        this.geometry.rotateX(-Math.PI / 2);
        // The shader derives its own normals analytically and never samples a texture, so the
        // attributes PlaneGeometry ships would be two buffers uploaded for nothing.
        this.geometry.deleteAttribute("normal");
        this.geometry.deleteAttribute("uv");

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: config.surfaceSize },
                uOpacity: { value: config.opacity },
                uBase: { value: new Color(resolveColor(config.baseColor)) },
                uDeep: { value: new Color(resolveColor(config.deepColor)) },
                uHighlight: { value: new Color(resolveColor(config.highlightColor)) },
                uColorVariation: { value: config.colorVariation },
                uHighlightIntensity: { value: config.highlightIntensity },
                uHighlightThreshold: { value: config.highlightThreshold },
                uFresnel: { value: config.fresnelIntensity },
                uAmplitude: { value: config.waveAmplitude },
                uFrequency: { value: config.waveFrequency },
                uSpeed: { value: config.waveSpeed },
                uSecondary: { value: config.secondaryWaveIntensity },
                uWaveDir: { value: new Vector2(1, 0) },
                uDetailScale: { value: config.detailScale },
                uDetailIntensity: { value: config.detailIntensity },
                uRippleIntensity: { value: config.rippleIntensity },
                uRippleSpeed: { value: config.rippleSpeed },
            },
            transparent: true,
            // The camera is allowed under the surface — a playable framing often dips to the
            // waterline — and DoubleSide also keeps a basis mistake from ever eating the effect.
            side: DoubleSide,
        });

        this.mesh = new Mesh(this.geometry, this.material);
        // The plane is a unit square until the vertex shader scales it, so its own bounds mean
        // nothing, and background water is on screen whenever anything else is.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;
        // Background water is the thing everything else sits on, so it goes out early.
        this.mesh.renderOrder = -8;

        this.object3d = new Group();
        this.object3d.name = "vfx:watersurface";
        this.object3d.add(this.mesh);

        this.applyConfig();
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

    /** `VfxEffect` compliance. A standing body of water has nothing to burst. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: every term here is a continuous function of time, so a huge delta out
        // of a backgrounded tab moves the water further along and never anywhere odd.
        this.material.uniforms.uTime.value = (this.material.uniforms.uTime.value as number) + dt;
    }

    /**
     * Re-reads the config object after an edit. Every knob is a uniform, so this is the whole of
     * it: no buffer is touched however fast the panel calls it, and nothing can go stale.
     */
    applyConfig(): void {
        const c = this.config;
        const u = this.material.uniforms;
        u.uSize.value = c.surfaceSize;
        u.uOpacity.value = c.opacity;
        u.uColorVariation.value = c.colorVariation;
        u.uHighlightIntensity.value = c.highlightIntensity;
        u.uHighlightThreshold.value = c.highlightThreshold;
        u.uFresnel.value = c.fresnelIntensity;
        u.uAmplitude.value = c.waveAmplitude;
        u.uFrequency.value = c.waveFrequency;
        u.uSpeed.value = c.waveSpeed;
        u.uSecondary.value = c.secondaryWaveIntensity;
        u.uDetailScale.value = c.detailScale;
        u.uDetailIntensity.value = c.detailIntensity;
        u.uRippleIntensity.value = c.rippleIntensity;
        u.uRippleSpeed.value = c.rippleSpeed;

        (u.uBase.value as Color).copy(resolveColor(c.baseColor));
        (u.uDeep.value as Color).copy(resolveColor(c.deepColor));
        (u.uHighlight.value as Color).copy(resolveColor(c.highlightColor));

        const rad = (c.waveDirection * Math.PI) / 180;
        this.scratchDir.set(Math.cos(rad), Math.sin(rad));
        (u.uWaveDir.value as Vector2).copy(this.scratchDir);

        // Opaque water is the ground: it should write depth so what is under it is culled. Once
        // it is see-through, writing depth would let it punch a hole in whatever is behind.
        this.material.depthWrite = c.opacity >= 0.98;
        this.mesh.visible = c.enabled;
    }

    /** Puts the motion back to the start. The surface is continuous, so nothing pops. */
    reset(): void {
        this.material.uniforms.uTime.value = 0;
        this.applyConfig();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.material.dispose();
    }
}
