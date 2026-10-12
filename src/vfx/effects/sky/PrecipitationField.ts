/**
 * Rain, snow, dust and ash from one instanced draw call and zero per-frame CPU work.
 *
 * Every particle's position is computed in the vertex shader from a per-instance seed and three
 * scalar phase uniforms, then wrapped into a box anchored on the camera. The seed attributes are
 * written once at construction and never touched again: no simulation loop, no attribute upload,
 * no pooling. That is what makes heavy rain affordable on a phone — the cost is fill rate and
 * nothing else.
 *
 * The four looks are uniform sets over one material, with one exception: blending is GL state,
 * not a uniform, so ash (dark, occluding) and rain (bright, near-additive) swap it. That is a
 * state change, not a recompile.
 */

import {
    AdditiveBlending,
    Blending,
    Color,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    NormalBlending,
    ShaderMaterial,
    Vector3,
} from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry } from "../../core/instancing";
import { createRng } from "../../core/random";
import type { SkyConfig, WeatherType } from "./config";

/**
 * Hard ceiling on instances.
 *
 * Sized once at construction and never reallocated: the particle budget is `instanceCount`, which
 * is a draw-call argument, so quality changes and intensity sliders cost nothing at all.
 */
const CAPACITY = 7000;

const VERTEX = /* glsl */ `
attribute vec3 aSeed;

uniform vec3 uBox;
uniform vec3 uPhase;
uniform vec3 uVel;
uniform float uSize;
uniform float uStretch;
uniform float uSway;
uniform float uSwayTime;
uniform float uMinWidth;
uniform float uFadeStart;

varying vec2 vUv;
varying float vAlpha;

void main() {
    vUv = uv;

    // A fixed lattice point from the seed, slid along by the wrapped travel distance. uTime never
    // appears here — see advance() for why that matters.
    vec3 p = aSeed * uBox + uPhase;

    // Sway has to be per-instance or the whole field marches in step and reads as a moving wave.
    // Incommensurate frequencies per particle, the same trick the heat distortion uses.
    float a = 1.0 + aSeed.x * 2.3;
    float b = 1.3 + aSeed.z * 1.7;
    p.x += uSway * sin(uSwayTime * a + aSeed.y * 6.2831853);
    p.z += uSway * cos(uSwayTime * b + aSeed.x * 6.2831853);

    // Wrap into a box centred on the camera. Camera *rotation* never enters this — the box is
    // axis-aligned and anchored by position only, which is what keeps it stable while orbiting.
    vec3 rel = p - cameraPosition;
    rel -= uBox * floor(rel / uBox + 0.5);
    vec3 world = cameraPosition + rel;

    // Fade at the box boundary, or wrapped particles pop into existence on a flat plane.
    float radial = length(rel.xz) / max(uBox.x, 1e-3);
    float vertical = abs(rel.y) / max(uBox.y, 1e-3);
    vAlpha = (1.0 - smoothstep(uFadeStart, 0.5, radial)) * (1.0 - smoothstep(uFadeStart, 0.5, vertical));

    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    // Stretch along the velocity as projected into screen space, not along the world velocity:
    // vertical rain seen from above would otherwise collapse to a point.
    vec3 velView = (modelViewMatrix * vec4(uVel, 0.0)).xyz;
    vec2 dir = velView.xy;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(0.0, 1.0);
    // Rotating by -90, not +90. The other perpendicular makes the pair left-handed, every
    // triangle comes out clockwise, and back-face culling silently eats the entire effect.
    vec2 perp = vec2(dir.y, -dir.x);

    // Screen-space width floor. A believable raindrop covers well under a pixel at playable
    // framing and the rasteriser simply misses it.
    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    float minSize = uMinWidth * viewPerScreen;
    float width = max(uSize, minSize);

    // Conserve energy: a drop floored up in screen space has to get dimmer by the same measure,
    // or distant rain accumulates into a flat grey sheet.
    vAlpha *= (uSize * uSize) / (width * width);

    float along = max(uSize * (1.0 + uStretch), minSize);

    vec2 offset = dir * (position.y * along) + perp * (position.x * width);
    mv.xy += offset;

    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoftness;

varying vec2 vUv;
varying float vAlpha;

void main() {
    // The quad is already stretched along the velocity, so a round falloff in uv space draws as
    // an ellipse in screen space — which is exactly the streak a falling drop should be.
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // 1.0 - smoothstep rather than reversed edges: smoothstep is undefined when edge0 >= edge1.
    float a = 1.0 - smoothstep(clamp(1.0 - uSoftness, 0.0, 0.99), 1.0, r);

    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
    #include <colorspace_fragment>
}
`;

interface WeatherParticlePreset {
    /** Metres per second downward. */
    fallSpeed: number;
    /** How far the particle is blown per unit of wind strength. */
    driftScale: number;
    /** Amplitude of the per-particle sway, in metres. */
    sway: number;
    swaySpeed: number;
    size: number;
    stretch: number;
    softness: number;
    opacity: number;
    /** Base instance count before intensity, density and quality scaling. */
    count: number;
    box: [number, number, number];
    blending: Blending;
    /** Used when the config leaves `particleColor` at its default. */
    color: string;
}

const WEATHER_PARTICLES: Record<Exclude<WeatherType, "clear">, WeatherParticlePreset> = {
    rain: {
        fallSpeed: 17,
        driftScale: 3.2,
        sway: 0.05,
        swaySpeed: 2.0,
        size: 0.012,
        stretch: 16,
        softness: 0.55,
        opacity: 0.5,
        count: 2600,
        box: [34, 26, 34],
        blending: AdditiveBlending,
        color: "#cfe2f5",
    },
    snow: {
        fallSpeed: 1.15,
        driftScale: 1.4,
        sway: 0.55,
        swaySpeed: 0.55,
        size: 0.045,
        stretch: 0,
        softness: 0.95,
        opacity: 0.85,
        count: 1700,
        box: [30, 22, 30],
        blending: NormalBlending,
        color: "#f4f8ff",
    },
    // Storm is rain, harder and faster. The darkness is the sky's job, not the particles'.
    storm: {
        fallSpeed: 23,
        driftScale: 5.5,
        sway: 0.08,
        swaySpeed: 2.6,
        size: 0.014,
        stretch: 20,
        softness: 0.5,
        opacity: 0.55,
        count: 3600,
        box: [34, 26, 34],
        blending: AdditiveBlending,
        color: "#c3d6ea",
    },
    dust: {
        fallSpeed: 0.22,
        driftScale: 6.0,
        sway: 1.1,
        swaySpeed: 0.9,
        size: 0.03,
        stretch: 1.2,
        softness: 1.0,
        opacity: 0.4,
        count: 2200,
        box: [26, 16, 26],
        blending: NormalBlending,
        color: "#d8b485",
    },
    ash: {
        fallSpeed: 0.55,
        driftScale: 2.4,
        sway: 0.8,
        swaySpeed: 0.45,
        size: 0.034,
        stretch: 0.5,
        softness: 0.9,
        opacity: 0.6,
        count: 1900,
        box: [28, 20, 28],
        blending: NormalBlending,
        color: "#4a4440",
    },
};

export class PrecipitationField {
    readonly mesh: Mesh;
    readonly capacity = CAPACITY;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly seedAttribute: InstancedBufferAttribute;

    /**
     * Travel distance, wrapped on the CPU in doubles.
     *
     * `velocity * uTime` inside the shader looks equivalent and is not: after a long session the
     * products exceed what a 24-bit mantissa resolves, the quantised value feeds `floor()` in the
     * wrap, and particles start teleporting across the box as they flicker between cells. Keeping
     * the modulo here in JS doubles costs three scalars a frame and stays exact for years.
     */
    private readonly phase = new Vector3();
    private swayTime = 0;
    private activeType: WeatherType = "clear";
    private active = 0;

    private readonly tmpVel = new Vector3();
    private readonly box = new Vector3(34, 26, 34);

    constructor(seed = 7777) {
        this.geometry = createQuadGeometry();
        const seeds = addInstancedAttribute(this.geometry, "aSeed", CAPACITY, 3);
        this.seedAttribute = seeds.attribute;

        // Written once, here, and never again — which is the whole point of the design.
        const rng = createRng(seed);
        for (let i = 0; i < CAPACITY; i++) {
            seeds.array[i * 3] = rng();
            seeds.array[i * 3 + 1] = rng();
            seeds.array[i * 3 + 2] = rng();
        }
        this.seedAttribute.needsUpdate = true;

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uBox: { value: this.box },
                uPhase: { value: this.phase },
                uVel: { value: new Vector3(0, -1, 0) },
                uSize: { value: 0.012 },
                uStretch: { value: 16 },
                uSway: { value: 0.05 },
                uSwayTime: { value: 0 },
                uMinWidth: { value: 0.0022 },
                uFadeStart: { value: 0.3 },
                uColor: { value: new Color(0xcfe2f5) },
                uOpacity: { value: 0.5 },
                uSoftness: { value: 0.55 },
            },
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });

        this.geometry.instanceCount = 0;

        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.name = "sky:precipitation";
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.renderOrder = 1200;
        this.mesh.visible = false;
    }

    get activeCount(): number {
        return this.active;
    }

    get weatherType(): WeatherType {
        return this.activeType;
    }

    /** Re-reads the config. Cheap enough to call on every edit; does not reallocate. */
    apply(config: SkyConfig, particleScale: number): void {
        const w = config.weather;
        this.activeType = w.type;

        if (w.type === "clear" || particleScale <= 0 || w.intensity <= 0) {
            this.active = 0;
            this.geometry.instanceCount = 0;
            this.mesh.visible = false;
            return;
        }

        const preset = WEATHER_PARTICLES[w.type];
        const u = this.material.uniforms;

        const count = Math.min(
            CAPACITY,
            Math.round(preset.count * w.intensity * w.precipitationDensity * particleScale),
        );
        this.active = count;
        this.geometry.instanceCount = count;
        this.mesh.visible = count > 0;
        if (count === 0) return;

        this.box.set(preset.box[0], preset.box[1], preset.box[2]);

        // The velocity the streak aligns to: gravity plus the wind that actually moves it.
        const windRad = (w.windDirection * Math.PI) / 180;
        const windSpeed = w.windStrength * preset.driftScale;
        this.tmpVel.set(
            Math.cos(windRad) * windSpeed,
            -preset.fallSpeed * w.precipitationSpeed,
            Math.sin(windRad) * windSpeed,
        );
        (u.uVel.value as Vector3).copy(this.tmpVel);

        u.uSize.value = preset.size * w.particleSize;
        u.uStretch.value = preset.stretch;
        u.uSway.value = preset.sway;
        u.uOpacity.value = preset.opacity * w.particleOpacity * w.intensity;
        u.uSoftness.value = preset.softness;
        // The config colour wins when it has been changed from the schema default; otherwise each
        // weather type keeps its own, so switching rain -> ash does not leave rain-blue ash.
        const hex = w.particleColor === "#cfe2f5" ? preset.color : w.particleColor;
        (u.uColor.value as Color).copy(resolveColor(hex));

        if (this.material.blending !== preset.blending) {
            // Pure GL state — no recompile, which is why ash and rain can share one material.
            this.material.blending = preset.blending;
        }
    }

    /** Advances the fall and the sway. `dt` is already scaled by the host. */
    advance(dt: number, config: SkyConfig): void {
        if (this.active === 0 || dt <= 0) return;
        const w = config.weather;
        const preset = WEATHER_PARTICLES[w.type === "clear" ? "rain" : w.type];

        const windRad = (w.windDirection * Math.PI) / 180;
        const windSpeed = w.windStrength * preset.driftScale;

        // Modulo in doubles, uploaded as small floats. See the note on `phase`.
        this.phase.x = (this.phase.x + Math.cos(windRad) * windSpeed * dt) % this.box.x;
        this.phase.y = (this.phase.y - preset.fallSpeed * w.precipitationSpeed * dt) % this.box.y;
        this.phase.z = (this.phase.z + Math.sin(windRad) * windSpeed * dt) % this.box.z;

        // Wrapped at a multiple of 2*PI so the sway never visibly jumps when the counter resets.
        this.swayTime = (this.swayTime + dt * preset.swaySpeed) % (Math.PI * 512);
        this.material.uniforms.uSwayTime.value = this.swayTime;
    }

    reset(): void {
        this.phase.set(0, 0, 0);
        this.swayTime = 0;
        this.material.uniforms.uSwayTime.value = 0;
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}
