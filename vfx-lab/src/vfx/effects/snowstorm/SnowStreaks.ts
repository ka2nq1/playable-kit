/**
 * The flakes: velocity-stretched streaks blowing through the storm volume, one draw call and no
 * per-frame CPU work at all.
 *
 * Every streak's position is a fixed lattice point slid along its own heading by one accumulated
 * scalar and wrapped back into the box — the same trick the sky's precipitation field uses, which
 * is why a thousand of them cost a `instanceCount` write and nothing else. The attributes are
 * written once at construction and never touched again.
 *
 * Two things differ from plain snowfall, and they are what make this read as a blizzard rather
 * than as weather passing through:
 *
 *  - **Each streak has its own heading.** A per-instance unit vector is mixed into the shared
 *    wind by `spread`, so flakes genuinely cross each other instead of marching in formation. The
 *    heading is constant per instance, which is what lets the travel distance stay a single
 *    uniform — a gust changes how fast that scalar grows, never where anything is.
 *  - **The snow is densest where the fog is thinnest.** Alpha is shaped so it peaks in the mid
 *    densities and falls off again in the core, because in the core the fog is in front of the
 *    flakes. That is also what removes the need to depth-sort the snow against the body: the
 *    streaks that would be wrongly composited are the ones already faded out.
 */

import { Color, InstancedBufferGeometry, Mesh, NormalBlending, ShaderMaterial, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";
import { createRng } from "../../core/random";
import { SNOWSTORM_QUALITY_PRESETS, STREAK_CAPACITY, type SnowstormConfig } from "./config";
import { FLASH_TERM, SIMPLEX_3D, STORM_MASK } from "./shaders";

/**
 * Floor on streak width, as a fraction of viewport height.
 *
 * Not a config knob: it is a rasteriser fact, not a look. A flake at a believable world size is
 * well under a pixel at the distance a background storm sits, the rasteriser misses it entirely
 * and the snow silently disappears. The shader pays for the floor by dimming what it widens.
 */
const MIN_SCREEN_WIDTH = 0.0018;

const VERTEX = /* glsl */ `
// xyz: lattice point in [0,1), w: alpha/phase seed
attribute vec4 aSeed;
// xyz: unit deviation from the shared wind, w: size and speed variation
attribute vec4 aDrift;

uniform vec3 uWindDir;
uniform float uFlow;
uniform float uSpread;
uniform float uTurbTime;
uniform float uTurbulence;
uniform float uSize;
uniform float uStretch;
uniform float uMinWidth;

varying vec2 vUv;
varying float vAlpha;
varying float vFlash;

${SIMPLEX_3D}
${STORM_MASK}
${FLASH_TERM}

void main() {
    vUv = uv;

    vec3 size = uHalfSize * 2.0;

    // Constant per instance, so the travel below stays a single monotonic scalar: a gust can
    // change how fast the snow moves without any flake jumping.
    vec3 dir = normalize(uWindDir + aDrift.xyz * uSpread);
    float speedVar = 0.65 + aDrift.w * 0.7;

    vec3 p = (aSeed.xyz - 0.5) * size + dir * (uFlow * speedVar);
    p -= size * floor(p / size + 0.5);

    // A small bounded curl on top, so the streams bend around each other instead of running in
    // straight lines. Same sum-of-sines as the body, at a tighter amplitude — a flake that
    // wandered as far as a puff would read as a moth.
    float t = uTurbTime * (0.8 + aDrift.w * 0.6);
    p += vec3(
        sin(t * 1.31 + aSeed.w * 6.2831853),
        0.5 * sin(t * 0.93 + aDrift.x * 6.2831853),
        cos(t * 1.07 + aDrift.z * 6.2831853)
    ) * uTurbulence * uHalfSize * 0.05;

    float m = stormMask(p);
    // Peaks around three-quarters density and falls away again: at the very centre the fog is in
    // front of the snow, and drawing the flakes brightest exactly there is what makes a blizzard
    // look like sprites laid over a cloud.
    // The 2.48 puts the peak of that curve back at 1: the shaping decides *where* the snow
    // reads, not how much of it there is.
    vAlpha = clamp(m * (1.0 - 0.62 * m) * 2.48, 0.0, 1.0) * (0.55 + 0.9 * aSeed.w);
    vFlash = flashAt(p);

    if (vAlpha <= 0.003) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Stretch along the velocity as projected into *screen* space, not along the world velocity:
    // a flake blowing straight at the camera would otherwise collapse to a point.
    vec3 velView = (modelViewMatrix * vec4(dir, 0.0)).xyz;
    vec2 d2 = velView.xy;
    float l = length(d2);
    d2 = l > 1e-4 ? d2 / l : vec2(0.0, 1.0);
    // Rotating by -90, not +90. The other perpendicular makes the pair left-handed, every
    // triangle comes out clockwise, and back-face culling silently eats the whole layer.
    vec2 perp = vec2(d2.y, -d2.x);

    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    float minSize = uMinWidth * viewPerScreen;

    float natural = uSize * (0.7 + 0.6 * aDrift.w);
    float width = max(natural, minSize);
    // Conserve energy: a flake widened in screen space has to dim by the same measure, or the
    // distant snow accumulates into a flat grey sheet over the storm.
    vAlpha *= (natural * natural) / (width * width);

    float along = max(width * uStretch, minSize * 2.0);
    mv.xy += d2 * (position.y * along) + perp * (position.x * width);
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uFlashColor;
uniform float uOpacity;

varying vec2 vUv;
varying float vAlpha;
varying float vFlash;

void main() {
    // The quad is already stretched along the velocity, so a round falloff in uv space draws as
    // the ellipse a blown flake smears into.
    vec2 q = vUv * 2.0 - 1.0;
    float a = 1.0 - smoothstep(0.3, 1.0, length(q));
    a *= vAlpha * uOpacity;
    if (a <= 0.003) discard;

    gl_FragColor = vec4(uColor + uFlashColor * vFlash, a);
    #include <colorspace_fragment>
}
`;

export class SnowStreaks {
    readonly mesh: Mesh;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;

    /** Distance travelled along each streak's own heading. Monotonic, so gusts never teleport. */
    private flow = 0;
    private turbTime = 0;
    private maskOctaves = -1;

    constructor(seed: number) {
        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            defines: { MASK_OCTAVES: 2 },
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
                uWindDir: { value: new Vector3(1, -0.4, 0).normalize() },
                uFlow: { value: 0 },
                uSpread: { value: 0.45 },
                uTurbTime: { value: 0 },
                uTurbulence: { value: 0.55 },
                uSize: { value: 0.075 },
                uStretch: { value: 5.5 },
                uMinWidth: { value: MIN_SCREEN_WIDTH },
                uColor: { value: new Color(resolveColor("#f2f7fb")) },
                uFlashColor: { value: new Color(0, 0, 0) },
                uOpacity: { value: 0.85 },
            },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            // Normal, not additive. Snow is opaque: additive white has nothing to occlude with and
            // washes out completely against the bright ice this storm is meant to be seen against.
            blending: NormalBlending,
        });

        this.geometry = this.buildGeometry(seed);
        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.name = "snowstorm:snow";
        // After the body. The alpha shaping above has already faded out the streaks whose
        // compositing order against the fog would be wrong, so this needs no depth sort.
        this.mesh.renderOrder = 1;
    }

    get instanceCount(): number {
        return this.geometry.instanceCount;
    }

    advance(dt: number, config: SnowstormConfig, gust: number, shapePhase: number): void {
        this.flow += config.snow.windSpeed * gust * dt;
        this.turbTime += dt * (0.7 + config.appearance.swirl);

        const u = this.material.uniforms;
        u.uFlow.value = this.flow;
        u.uTurbTime.value = this.turbTime;
        // The silhouette clock is owned by the body; the snow borrows it so both fade out at the
        // same boundary on the same frame.
        u.uShapePhase.value = shapePhase;
    }

    setFlash(position: Vector3, color: Color, intensity: number, radius: number): void {
        const u = this.material.uniforms;
        (u.uFlashPos.value as Vector3).copy(position);
        (u.uFlashColor.value as Color).copy(color);
        u.uFlashIntensity.value = intensity;
        u.uFlashRadius.value = radius;
    }

    /** Local-space wind heading, as a unit vector. Written by the effect so the body agrees. */
    setWindDirection(x: number, y: number, z: number): void {
        (this.material.uniforms.uWindDir.value as Vector3).set(x, y, z);
    }

    applyConfig(config: SnowstormConfig): void {
        const c = config.appearance;
        const s = config.snow;
        const u = this.material.uniforms;
        const preset = SNOWSTORM_QUALITY_PRESETS[config.quality];
        const scale = config.scale;

        (u.uHalfSize.value as Vector3).set(
            config.size.width * 0.5 * scale,
            config.size.height * 0.5 * scale,
            config.size.depth * 0.5 * scale,
        );
        u.uDensity.value = c.density;
        u.uEdgeSoftness.value = c.edgeSoftness;
        u.uShapeScale.value = c.shapeScale;
        u.uShapeWarp.value = c.shapeWarp;
        u.uTurbulence.value = c.turbulence;

        u.uSpread.value = s.spread;
        // Flakes are authored at the storm's own scale, so a storm placed twice as far away and
        // scaled to match keeps the same apparent snow rather than turning to dust.
        u.uSize.value = s.size * scale;
        u.uStretch.value = s.stretch;
        u.uOpacity.value = s.opacity;
        (u.uColor.value as Color).copy(resolveColor(s.color));

        this.geometry.instanceCount = Math.round(
            Math.max(0, Math.min(1, s.intensity)) * STREAK_CAPACITY * preset.snowScale,
        );

        if (preset.maskOctaves !== this.maskOctaves) {
            this.maskOctaves = preset.maskOctaves;
            this.material.defines.MASK_OCTAVES = preset.maskOctaves;
            this.material.needsUpdate = true;
        }
    }

    reset(): void {
        this.flow = 0;
        this.turbTime = 0;
        this.material.uniforms.uFlow.value = 0;
        this.material.uniforms.uTurbTime.value = 0;
        this.material.uniforms.uFlashIntensity.value = 0;
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    private buildGeometry(seed: number): InstancedBufferGeometry {
        const geo = createQuadGeometry();
        const rng = createRng(seed * 40503);
        const seeds = addInstancedAttribute(geo, "aSeed", STREAK_CAPACITY, 4);
        const drift = addInstancedAttribute(geo, "aDrift", STREAK_CAPACITY, 4);

        for (let i = 0; i < STREAK_CAPACITY; i++) {
            const o = i * 4;
            seeds.array[o] = rng();
            seeds.array[o + 1] = rng();
            seeds.array[o + 2] = rng();
            seeds.array[o + 3] = rng();

            // A uniform direction on the sphere, so `spread` opens the heading evenly in every
            // direction rather than clumping the deviations around the poles.
            const z = rng() * 2 - 1;
            const a = rng() * Math.PI * 2;
            const r = Math.sqrt(Math.max(0, 1 - z * z));
            drift.array[o] = Math.cos(a) * r;
            drift.array[o + 1] = z;
            drift.array[o + 2] = Math.sin(a) * r;
            drift.array[o + 3] = rng();
        }

        flushPrefix(seeds.attribute, STREAK_CAPACITY);
        flushPrefix(drift.attribute, STREAK_CAPACITY);
        geo.instanceCount = 0;
        return geo;
    }
}
