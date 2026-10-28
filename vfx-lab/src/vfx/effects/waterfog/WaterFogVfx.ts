/**
 * Water surface fog: a low, drifting mist that sits on a calm water plane.
 *
 * It is not a particle effect. A few hundred soft billboards would buy nothing a noise field does
 * not already give — mist has no individuals to track — so the whole effect is a stack of
 * horizontal quads with a procedural density evaluated per pixel. Three consequences:
 *
 *  - **One draw call for the whole stack.** The layers are instances of one unit quad; the layer
 *    index is an attribute, so `layerCount` is an `instanceCount` write and never a reallocation.
 *  - **Nothing happens on the CPU per frame.** `update(dt)` advances one float. The shape, the
 *    drift and the density all fall out of `uTime` in the shader.
 *  - **Every knob is a uniform.** There is no baked state, so a slider lands on the frame it is
 *    dragged, and `applyConfig()` is a dozen assignments.
 *
 * The layers are drawn flat rather than facing the camera because the fog belongs to the surface,
 * not to the viewer: from the low camera a playable ships with, a horizontal slab is crossed
 * nearly edge-on, which is exactly what piles the mist up toward the horizon and leaves the water
 * near the camera readable. That grazing-angle term is in the fragment shader, and it is the main
 * reason three planes read as a volume rather than as three planes.
 *
 *     const fog = new WaterFogVfx(config);
 *     fog.object3d.position.y = WATER_LEVEL;   // the surface the mist floats on
 *     scene.add(fog.object3d);
 *
 *     fog.update(delta);      // from the loop you already have
 *     fog.enabled = false;    // off, without tearing anything down
 *     fog.dispose();          // on teardown
 */

import { Color, DoubleSide, Group, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";
import { createRng } from "../../core/random";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { MAX_LAYERS, normalizeWaterFogConfig, type WaterFogConfig } from "./config";

export interface WaterFogVfxOptions {
    /** Base RNG seed. Only the per-layer phase offsets are random; the same seed is the same mist. */
    seed?: number;
}

const VERTEX = /* glsl */ `
// x: layer index, yz: noise phase offset in world units, w: this layer's share of the opacity
attribute vec4 aLayer;

uniform float uAreaSize;
uniform float uHeight;
uniform float uSpacing;
uniform vec2 uDrift;

varying vec2 vPlane;
varying vec2 vDrift;
varying vec2 vOffset;
varying vec3 vView;
varying float vWeight;

void main() {
    // The unit quad lies in XY; the fog lies in XZ. Laid out in local space on purpose, so the
    // noise field is anchored to the effect's own origin and the whole mist travels with it
    // instead of sliding over the water when a game moves the object.
    vec2 plane = position.xy * uAreaSize;
    vec3 p = vec3(plane.x, uHeight + aLayer.x * uSpacing, plane.y);

    vPlane = plane;
    vOffset = aLayer.yz;
    vWeight = aLayer.w;

    // Each layer drifts a little faster and a little off the heading of the one below it. That
    // parallax is what stops a stack of identical sheets reading as one thick sheet, and it costs
    // a rotation on four vertices per layer.
    float a = aLayer.x * 0.39;
    float c = cos(a);
    float s = sin(a);
    vDrift = vec2(uDrift.x * c - uDrift.y * s, uDrift.x * s + uDrift.y * c) * (1.0 + aLayer.x * 0.22);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vView = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uDensity;
uniform float uAreaSize;
uniform float uNoiseScale;
uniform float uDetailScale;
uniform float uDriftSpeed;
uniform vec3 uColor;

varying vec2 vPlane;
varying vec2 vDrift;
varying vec2 vOffset;
varying vec3 vView;
varying float vWeight;

// Simplex noise (Ashima / Gustavson, 2D). Chosen over value noise because it has no axis-aligned
// grid in it: value noise on a plane this large shows its lattice as soon as the fog is thin.
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
    // Drift is accumulated in world units, before the scale knobs are applied, so changing
    // noiseScale re-sizes the patches without also changing how fast they travel.
    vec2 flow = vDrift * (uTime * uDriftSpeed);
    vec2 b = vPlane + vOffset;

    // Four octaves, each travelling at its own speed and the third one across the other two. The
    // beat between them is the animation: nothing here loops, and the shapes genuinely re-form
    // rather than sliding past as fixed blobs. The fine octave is weighted into the same field
    // instead of being multiplied over it, so it ragged the patch edges into wisps rather than
    // punching holes in the middle.
    float broad = snoise((b - flow * 0.55) * uNoiseScale * 0.42);
    float mid = snoise((b - flow) * uNoiseScale);
    float crossOct = snoise((b - vec2(-flow.y, flow.x) * 1.6) * uNoiseScale * 2.1);
    float fine = snoise((b - flow * 2.3) * uDetailScale);
    float d = 0.5 + 0.5 * (broad * 0.46 + mid * 0.30 + crossOct * 0.14 + fine * 0.10);

    // One soft threshold. Density moves the cut, so turning it up grows the patches outward from
    // where they already were; the fixed 0.30 band is the soft edge and is never reversed, which
    // is what keeps smoothstep defined at both ends of the slider.
    float t0 = mix(0.78, 0.16, uDensity);
    float a = smoothstep(t0, t0 + 0.30, d);

    // Fade to nothing well inside the quad, on a circle, so the straight edge of the plane can
    // never be the thing that ends the fog.
    float r = length(vPlane) / max(uAreaSize * 0.5, 0.0001);
    a *= 1.0 - smoothstep(0.55, 1.0, r);

    vec3 view = normalize(vView);

    // A horizontal slab seen edge-on is a lot more mist than one seen from above: 1/|dir.y| is
    // that path length. It is what makes the mist gather toward the horizon and stay thin over
    // the water in front of the camera. The clamp is what stops the horizon going solid white.
    a *= clamp(0.42 / max(abs(view.y), 0.02), 0.5, 2.0);

    // Insurance for a camera that dips to the surface: without it the plane passing a metre under
    // the eye reads as a sheet of paper.
    a *= smoothstep(0.5, 2.5, length(vView));

    a = clamp(a * vWeight * uOpacity, 0.0, 1.0);
    if (a <= 0.003) discard;

    // Thicker mist is brighter mist — a flat tint over the whole field is what makes fog read as
    // a wash sitting on the lens rather than as something with a near side and a far side.
    gl_FragColor = vec4(uColor * (0.86 + 0.24 * d), a);
    #include <colorspace_fragment>
}
`;

export class WaterFogVfx implements VfxEffect {
    readonly id = "waterfog";
    readonly object3d: Group;

    readonly config: WaterFogConfig;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;

    private running = true;
    /** Scratch so `applyConfig` allocates nothing even when called from a slider drag. */
    private readonly scratchDrift = new Vector2();

    constructor(rawConfig?: unknown, options: WaterFogVfxOptions = {}) {
        const { config, issues } = normalizeWaterFogConfig(rawConfig);
        issues.report("WaterFogVfx");
        this.config = config;

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: config.opacity },
                uDensity: { value: config.density },
                uAreaSize: { value: config.areaSize },
                uHeight: { value: config.heightOffset },
                uSpacing: { value: config.layerSpacing },
                uNoiseScale: { value: config.noiseScale },
                uDetailScale: { value: config.detailScale },
                uDriftSpeed: { value: config.driftSpeed },
                uDrift: { value: new Vector2(1, 0) },
                uColor: { value: new Color(resolveColor(config.fogColor)) },
            },
            transparent: true,
            // Mist does not occlude mist: writing depth would let the nearest layer cut a hole in
            // every layer behind it, which on a stack this soft is instantly visible.
            depthWrite: false,
            depthTest: true,
            // Horizontal planes with a camera that can pass under them have no back face to cull,
            // and DoubleSide keeps a basis mistake from ever being able to eat the effect.
            side: DoubleSide,
        });

        this.geometry = this.buildGeometry(options.seed ?? 1);
        this.mesh = new Mesh(this.geometry, this.material);
        // The quad is a unit square until the vertex shader scales it, so its own bounds mean
        // nothing — and the fog is meant to be on screen whenever the water is.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;

        this.object3d = new Group();
        this.object3d.name = "vfx:waterfog";
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

    /** Layers currently drawn. There are no particles to count; this is what the budget is. */
    get activeCount(): number {
        return this.mesh.visible ? this.geometry.instanceCount : 0;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Resumes the drift. The effect starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the mist where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. Ambient fog has nothing to burst; kept so hosts can stay generic. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: the drift is a translation of a field that is continuous everywhere, so
        // a huge delta out of a backgrounded tab moves the mist further along, never anywhere odd.
        this.material.uniforms.uTime.value = (this.material.uniforms.uTime.value as number) + dt;
    }

    /**
     * Re-reads the config object after an edit. Every knob is a uniform or the instance count, so
     * this is the whole of it — there is nothing baked that a slider could invalidate, and no
     * buffer is touched however fast the panel calls it.
     */
    applyConfig(): void {
        const c = this.config;
        const u = this.material.uniforms;
        u.uOpacity.value = c.opacity;
        u.uDensity.value = c.density;
        u.uAreaSize.value = c.areaSize;
        u.uHeight.value = c.heightOffset;
        u.uSpacing.value = c.layerSpacing;
        u.uNoiseScale.value = c.noiseScale;
        u.uDetailScale.value = c.detailScale;
        u.uDriftSpeed.value = c.driftSpeed;

        const rad = (c.driftDirection * Math.PI) / 180;
        this.scratchDrift.set(Math.cos(rad), Math.sin(rad));
        (u.uDrift.value as Vector2).copy(this.scratchDrift);
        (u.uColor.value as Color).copy(resolveColor(c.fogColor));

        // Re-clamped rather than trusted: the panel writes to the config object directly, without
        // going back through the validator.
        this.geometry.instanceCount = Math.max(1, Math.min(Math.round(c.layerCount), MAX_LAYERS));
        this.mesh.visible = c.enabled;
    }

    /** Puts the drift back to the start. The mist re-forms from the same field, so nothing pops. */
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

    /**
     * Builds every layer the config is allowed to ask for, once. `layerCount` then only moves
     * `instanceCount`, so the slider costs nothing and the layers it reveals are always the same
     * ones — raising it adds a layer on top instead of reshuffling the mist you were looking at.
     */
    private buildGeometry(seed: number): InstancedBufferGeometry {
        const geo = createQuadGeometry();
        const layer = addInstancedAttribute(geo, "aLayer", MAX_LAYERS, 4);
        const rng = createRng(seed * 2654435761);

        for (let i = 0; i < MAX_LAYERS; i++) {
            const o = i * 4;
            layer.array[o] = i;
            // Far apart in world units so no two layers sample a neighbourhood of the same field
            // and show the same patch twice at slightly different heights.
            layer.array[o + 1] = (rng() * 2 - 1) * 400;
            layer.array[o + 2] = (rng() * 2 - 1) * 400;
            // Higher layers are thinner, which is what keeps the stack reading as mist lying on
            // the water rather than as a slab with a flat top.
            layer.array[o + 3] = Math.pow(0.72, i);
        }

        flushPrefix(layer.attribute, MAX_LAYERS);
        geo.instanceCount = MAX_LAYERS;
        return geo;
    }
}
