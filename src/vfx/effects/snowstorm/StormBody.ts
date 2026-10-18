/**
 * The dense body of the storm: a volume of camera-facing impostors, one draw call, no CPU work.
 *
 * The brief for this part is "thick enough to hide what is behind it", and there are only three
 * honest ways to get there — ray-march a volume, spawn tens of thousands of sprites, or stack a
 * few hundred large soft impostors and let normal-blended alpha accumulate. The third is the only
 * one that fits a phone, and it is what this is:
 *
 *  - **Opacity comes from overlap, not from count.** Eight puffs at 0.35 alpha along one view ray
 *    composite to 0.98. That is why the core genuinely occludes, with ~200 instances rather than
 *    thousands, and why `density` moves a *threshold* instead of multiplying a sprite budget.
 *  - **The silhouette is a field, the puffs are only how it gets drawn.** Each instance looks up
 *    `stormMask` at its own position and fades to nothing outside it, so the outline is the noise
 *    field's — irregular, slowly re-forming — and not the convex hull of wherever the sprites
 *    happen to be. Puffs below the threshold collapse their quad off-screen in the vertex shader
 *    and cost no fill at all.
 *  - **Nothing in here knows the storm moves.** Positions, the mask and the lightning are all in
 *    the storm's local space. Translating the parent moves the formation; the puffs keep
 *    streaming through a volume that, as far as they are concerned, has not moved.
 *
 * Blending is normal, not additive: additive white cannot occlude anything and goes to paper
 * against a bright icy background, which is exactly the failure this effect is supposed to avoid.
 * The instances are not depth-sorted — with a palette this desaturated the compositing error
 * between two overlapping puffs is far below the noise in the field itself, and sorting a few
 * hundred instances every frame would hand back the CPU budget the design just bought.
 */

import { Color, InstancedBufferGeometry, Mesh, NormalBlending, ShaderMaterial, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";
import { createRng } from "../../core/random";
import { PUFF_CAPACITY, SNOWSTORM_QUALITY_PRESETS, type SnowstormConfig } from "./config";
import { FLASH_TERM, SIMPLEX_2D, SIMPLEX_3D, STORM_MASK } from "./shaders";

const VERTEX = /* glsl */ `
// xyz: lattice point in [0,1), w: rotation phase
attribute vec4 aSeed;
// x: size variation, y: layer 0..1, z: brightness/opacity variation, w: noise domain offset
attribute vec4 aRand;

uniform vec3 uWind;
uniform vec3 uLightDir;
uniform float uTime;
uniform float uTurbTime;
uniform float uTurbulence;
uniform float uSwirl;
uniform float uPuffSize;
uniform float uCoreShadow;

varying vec2 vUv;
varying vec3 vNoise;
varying float vAlpha;
varying float vShade;
varying float vFlash;

${SIMPLEX_3D}
${STORM_MASK}
${FLASH_TERM}

void main() {
    vUv = uv;
    // Each puff reads a different neighbourhood of the detail field, and the third component is
    // the scroll. Without the offset every puff shows the same blob and the storm reads as a
    // tiled sprite sheet — which is the single most obvious tell of a fake cloud.
    vNoise = vec3(aRand.w * 97.3, aSeed.w * 61.7, uTime * 0.09 + aSeed.w * 3.1);

    vec3 size = uHalfSize * 2.0;

    // Layers: the far ones drift at roughly half the speed of the near ones. That parallax is
    // what gives the mass depth — a single speed reads as one sheet however many puffs are in it.
    float layerSpeed = 0.55 + aRand.y * 0.75;

    // A fixed lattice point slid along by the accumulated wind, then wrapped back into the box.
    // Wrapping is seamless because nothing is visible at the boundary: the mask has already faded
    // the storm out well before a puff reaches a face of the volume.
    vec3 p = (aSeed.xyz - 0.5) * size + uWind * layerSpeed;
    p -= size * floor(p / size + 0.5);

    // Bounded wander on incommensurate frequencies — a sum of sines, so it never accumulates and
    // cannot walk a puff out of the volume however long the effect runs. Three different pairs of
    // rates per axis is what keeps it from reading as a shared wobble.
    float t = uTurbTime * (0.7 + aRand.x * 0.6);
    vec3 turb = vec3(
        sin(t * 0.73 + aSeed.w * 6.2831853) + 0.5 * sin(t * 1.91 + aRand.z * 6.2831853),
        0.6 * sin(t * 0.47 + aRand.w * 6.2831853),
        cos(t * 0.61 + aSeed.w * 4.1123) + 0.5 * cos(t * 1.53 + aRand.x * 6.2831853)
    );
    p += turb * uTurbulence * uHalfSize * 0.12;

    vec3 n = p / uHalfSize;

    // Fake form, two terms and no lights. Which side of the volume the puff is on gives the key;
    // how deep into the mass it sits gives the shadow, because everything in front of it is
    // between it and the light. A storm with neither is a flat white cut-out.
    //
    // The shadow scales the key rather than subtracting from it. Subtracting takes the core to
    // near black, and since the instances are not depth-sorted, a core puff compositing over a
    // lit one would then show as a hole rather than as shading. Scaling keeps the whole range
    // narrow enough that the ordering error reads as the storm's own brightness variation.
    float key = 0.5 + 0.5 * dot(clamp(n, -1.0, 1.0), uLightDir);
    float buried = 1.0 - clamp(length(n), 0.0, 1.0);
    vShade = clamp(key * (1.0 - buried * uCoreShadow), 0.0, 1.0);

    vFlash = flashAt(p);
    vAlpha = stormMask(p) * (0.72 + 0.56 * aRand.z);

    // Outside the silhouette: collapse the quad outside the clip volume instead of drawing a
    // transparent one. These are large sprites and a third of them are out of the mask at a
    // typical density, so this is most of the fill rate the effect does not pay.
    if (vAlpha <= 0.004) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    float radius = uPuffSize * (0.7 + 0.6 * aRand.x);
    // Counter-rotation: the sign comes from the brightness seed, so neighbouring puffs turn
    // opposite ways and the overlap between them shears. That shear is the churn.
    float ang = aSeed.w * 6.2831853 + uTime * uSwirl * (aRand.z - 0.5) * 2.0;
    float c = cos(ang);
    float s = sin(ang);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * (radius * 2.0);

    // Billboarding by offsetting in view space, after the model-view transform: the puff faces
    // the camera whatever yaw the storm carries, and no per-instance basis has to be built (so
    // there is no winding to get wrong — the quad keeps the geometry's own CCW order).
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uEdgeSoftness;
uniform float uDetail;
uniform float uContrast;
uniform vec3 uSnowColor;
uniform vec3 uFogColor;
uniform vec3 uShadowColor;
uniform vec3 uFlashColor;

varying vec2 vUv;
varying vec3 vNoise;
varying float vAlpha;
varying float vShade;
varying float vFlash;

${SIMPLEX_2D}

void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float disc = 1.0 - smoothstep(0.12, 1.0, length(q));
    if (disc <= 0.0) discard;

    // Octaves travel at different speeds and the odd one across the others, so the beat between
    // them keeps re-forming the puff rather than sliding a fixed shape past the quad.
    vec2 b = q * uDetail + vNoise.xy;
    float n = 0.0;
    float amp = 0.5;
    float f = 1.0;
    for (int i = 0; i < BODY_OCTAVES; i++) {
        n += amp * snoise2(b * f + vec2(vNoise.z * f * 0.6, -vNoise.z * f * 0.35));
        f *= 2.07;
        amp *= 0.5;
    }
    n = clamp(n * 0.5 + 0.5, 0.0, 1.0);

    // The noise is weighted into the falloff, not multiplied over it. Multiplying punches holes
    // through the middle of every puff and the mass goes lacy; weighting leaves the centre solid
    // and tears only the rim, which is what turbulent snow actually does at an edge.
    float d = disc * mix(0.45, 1.15, n);
    float rim = 0.08 + uEdgeSoftness * 0.75;
    float a = smoothstep(0.0, rim, d) * vAlpha * uOpacity;
    if (a <= 0.004) discard;

    // Three-point ramp: deep storm grey, through the cold fog body, to lit snow. The noise shifts
    // where a pixel sits on it, which is what puts brightness variation *inside* a puff instead
    // of only between puffs.
    float shade = clamp(vShade + (n - 0.5) * uContrast, 0.0, 1.0);
    vec3 col = mix(uShadowColor, uFogColor, smoothstep(0.0, 0.6, shade));
    col = mix(col, uSnowColor, smoothstep(0.5, 1.0, shade));

    // Lightning is added, and thickens the puff slightly: a lit region of snow scatters more back
    // at you, so a flash that only brightened would read as a decal laid over the storm.
    col += uFlashColor * vFlash;
    a = min(a * (1.0 + vFlash * 0.3), 1.0);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
}
`;

export class StormBody {
    readonly mesh: Mesh;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;

    /** Accumulated wind translation in local units. Integrated here so gusts never teleport puffs. */
    private readonly wind = new Vector3();
    private readonly windDir = new Vector3(1, 0, 0);
    private turbTime = 0;
    private time = 0;
    private shapePhase_ = 0;
    private octaves = -1;
    private maskOctaves = -1;

    /** Scratch; `applyConfig` runs on every slider drag and must not allocate. */
    private readonly scratch = new Vector3();
    private readonly scratchColor = new Color();

    constructor(seed: number) {
        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            defines: { BODY_OCTAVES: 3, MASK_OCTAVES: 2 },
            uniforms: {
                uHalfSize: { value: new Vector3(17, 8, 7) },
                uDensity: { value: 0.62 },
                uEdgeSoftness: { value: 0.42 },
                uShapeScale: { value: 1.35 },
                uShapeWarp: { value: 0.3 },
                uShapePhase: { value: 0 },
                uFlashPos: { value: new Vector3() },
                uFlashRadius: { value: 8 },
                uFlashIntensity: { value: 0 },
                uWind: { value: new Vector3() },
                uLightDir: { value: new Vector3(-0.5, 0.6, 0.6) },
                uTime: { value: 0 },
                uTurbTime: { value: 0 },
                uTurbulence: { value: 0.55 },
                uSwirl: { value: 0.22 },
                uPuffSize: { value: 2.7 },
                uCoreShadow: { value: 0.45 },
                uOpacity: { value: 1 },
                uDetail: { value: 1.7 },
                uContrast: { value: 0.35 },
                uSnowColor: { value: new Color(resolveColor("#eef3f8")) },
                uFogColor: { value: new Color(resolveColor("#a8b6c4")) },
                uShadowColor: { value: new Color(resolveColor("#4d5663")) },
                uFlashColor: { value: new Color(0, 0, 0) },
            },
            transparent: true,
            // Puffs do not occlude puffs: a depth write would let the nearest one cut a hole in
            // every puff behind it, and on a mass this soft that reads instantly as cardboard.
            depthWrite: false,
            depthTest: true,
            blending: NormalBlending,
        });

        this.geometry = this.buildGeometry(seed);
        this.mesh = new Mesh(this.geometry, this.material);
        // The quad is a unit square until the vertex shader places it, so its own bounds describe
        // nothing. Culling is the storm's job, and the lab never gets far enough away for it.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.name = "snowstorm:body";
    }

    /** Puffs actually drawn this frame — the effect's real budget. */
    get instanceCount(): number {
        return this.geometry.instanceCount;
    }

    /**
     * The silhouette clock. The body owns it and the snow borrows it, so both layers evaluate the
     * same `stormMask` on the same frame and the flakes cannot stream past the edge of the fog.
     */
    get shapePhase(): number {
        return this.shapePhase_;
    }

    /**
     * Advances the three independent clocks.
     *
     * `gust` multiplies the wind only. The turbulence and swirl clocks run at their own pace
     * because a gust is meant to move the storm's contents along faster, not to speed the whole
     * animation up like a tape — that would read as a frame-rate glitch rather than as weather.
     */
    advance(dt: number, config: SnowstormConfig, gust: number): void {
        const c = config.appearance;
        const s = config.snow;

        this.time += dt;
        this.turbTime += dt * (0.6 + c.swirl * 0.8);
        this.shapePhase_ += dt * c.shapeDrift;

        // The fog body is dragged along at a fraction of the flake speed: snow blows through the
        // cloud it is falling out of, and matching the two makes the whole mass look like it is
        // sliding sideways.
        this.wind.addScaledVector(this.windDir, s.windSpeed * 0.18 * gust * dt);

        const u = this.material.uniforms;
        u.uTime.value = this.time;
        u.uTurbTime.value = this.turbTime;
        u.uShapePhase.value = this.shapePhase_;
        (u.uWind.value as Vector3).copy(this.wind);
    }

    /** Lightning illumination, in storm-local space. Zero intensity is the "no flash" state. */
    setFlash(position: Vector3, color: Color, intensity: number, radius: number): void {
        const u = this.material.uniforms;
        (u.uFlashPos.value as Vector3).copy(position);
        (u.uFlashColor.value as Color).copy(color);
        u.uFlashIntensity.value = intensity;
        u.uFlashRadius.value = radius;
    }

    applyConfig(config: SnowstormConfig): void {
        const c = config.appearance;
        const u = this.material.uniforms;
        const preset = SNOWSTORM_QUALITY_PRESETS[config.quality];
        const scale = config.scale;

        const halfW = config.size.width * 0.5 * scale;
        const halfH = config.size.height * 0.5 * scale;
        const halfD = config.size.depth * 0.5 * scale;
        (u.uHalfSize.value as Vector3).set(halfW, halfH, halfD);

        u.uDensity.value = c.density;
        u.uEdgeSoftness.value = c.edgeSoftness;
        u.uShapeScale.value = c.shapeScale;
        u.uShapeWarp.value = c.shapeWarp;
        u.uOpacity.value = c.opacity;
        u.uDetail.value = c.detail;
        u.uTurbulence.value = c.turbulence;
        u.uSwirl.value = c.swirl;
        u.uCoreShadow.value = c.coreShadow;
        u.uContrast.value = c.contrast;

        (u.uSnowColor.value as Color).copy(resolveColor(c.snowColor));
        (u.uFogColor.value as Color).copy(resolveColor(c.fogColor));
        (u.uShadowColor.value as Color).copy(resolveColor(c.shadowColor));

        const az = (c.lightAzimuth * Math.PI) / 180;
        const el = (c.lightElevation * Math.PI) / 180;
        const ce = Math.cos(el);
        (u.uLightDir.value as Vector3).set(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce).normalize();

        // Re-clamped rather than trusted: the panel writes to the config object directly and never
        // comes back through the validator.
        const wanted = Math.max(0, Math.min(Math.round(c.puffCount), PUFF_CAPACITY));
        const count = Math.min(PUFF_CAPACITY, Math.round(wanted * preset.puffScale));
        this.geometry.instanceCount = count;

        // Fewer puffs have to be bigger or a cheaper preset would also be a thinner storm. Area
        // coverage is what opacity accumulates from, so the compensation is on the square root.
        const compensation = count > 0 ? Math.min(2, Math.sqrt(wanted / count)) : 1;
        u.uPuffSize.value = c.puffSize * Math.min(halfW, halfH, halfD) * compensation;

        if (preset.bodyOctaves !== this.octaves || preset.maskOctaves !== this.maskOctaves) {
            this.octaves = preset.bodyOctaves;
            this.maskOctaves = preset.maskOctaves;
            this.material.defines.BODY_OCTAVES = preset.bodyOctaves;
            this.material.defines.MASK_OCTAVES = preset.maskOctaves;
            this.material.needsUpdate = true;
        }
    }

    /** Wind heading in the storm's local space, shared with the snow so the two agree. */
    setWindDirection(x: number, y: number, z: number): void {
        this.scratch.set(x, y, z);
        if (this.scratch.lengthSq() > 1e-8) this.windDir.copy(this.scratch).normalize();
    }

    reset(): void {
        this.time = 0;
        this.turbTime = 0;
        this.shapePhase_ = 0;
        this.wind.set(0, 0, 0);
        this.setFlash(this.scratch.set(0, 0, 0), this.scratchColor.setRGB(0, 0, 0), 0, 1);
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    /**
     * Every puff the config could ever ask for, written once.
     *
     * `puffCount` and the quality preset then only move `instanceCount`, so dragging either costs
     * nothing and the puffs a higher setting reveals are always the same ones — raising the count
     * thickens the storm you were looking at instead of reshuffling it.
     */
    private buildGeometry(seed: number): InstancedBufferGeometry {
        const geo = createQuadGeometry();
        const rng = createRng(seed * 2654435761);
        const seeds = addInstancedAttribute(geo, "aSeed", PUFF_CAPACITY, 4);
        const rand = addInstancedAttribute(geo, "aRand", PUFF_CAPACITY, 4);

        for (let i = 0; i < PUFF_CAPACITY; i++) {
            const o = i * 4;
            seeds.array[o] = rng();
            seeds.array[o + 1] = rng();
            seeds.array[o + 2] = rng();
            seeds.array[o + 3] = rng();
            rand.array[o] = rng();
            // Four depth layers rather than a continuum: a handful of distinct drift speeds reads
            // as volume, while a continuous spread averages back out into a single apparent one.
            rand.array[o + 1] = (i % 4) / 3;
            rand.array[o + 2] = rng();
            rand.array[o + 3] = rng();
        }

        flushPrefix(seeds.attribute, PUFF_CAPACITY);
        flushPrefix(rand.attribute, PUFF_CAPACITY);
        geo.instanceCount = 0;
        return geo;
    }
}
