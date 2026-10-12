/**
 * Smoke wisps: thin strands of smoke rising off a smouldering surface, curling, widening and
 * dissolving into the air.
 *
 * Built like the rising embers rather than like the fire pit's smoke, and for the same reason:
 * nothing here needs integrating. A wisp's whole existence — where it left the source, how fast it
 * climbs, how it curls, when it dies — is a pure function of time and one seed, so `update(dt)`
 * advances a single uniform and no attribute is re-uploaded after construction.
 *
 * **A wisp is a streamline, not a card.** The vertex shader has one function, `wispPath(t)`, that
 * answers "where has the smoke that left the source `t` seconds ago got to". One instance is a
 * thin triangle strip, and the strip's rows sample that function at a spread of `t`: the old end
 * of the strand is smoke that left a second or two ago and has been curling ever since, the new
 * end is still at the vent. So the strand's shape *is* the path's history, which is why it reads
 * as a strand of smoke and not as a bent quad with a smoke texture on it — the silhouette curls
 * because the flow curled, and no two wisps bend the same way.
 *
 * Three consequences worth knowing before tuning:
 *
 *  - **`minLength` / `maxLength` are world units applied as a time lag** (`length / riseSpeed`),
 *    so a fast wisp and a slow one of the same length really are the same length, and the lag
 *    opens from zero at birth — a wisp grows out of the source instead of appearing whole.
 *  - **Width and opacity follow the parcel's own age, not the wisp's.** The old end is the wide
 *    end, and alpha drops as `w0 / (w0 + expansion·t)` — the same smoke spread thinner. That ties
 *    "becomes diffuse" to `expansionRate` rather than making it a second knob.
 *  - **Recycling re-rolls everything.** The per-wisp draws are hashed against the cycle index as
 *    well as the seed, so a wisp coming round again is a new wisp: new source point, speed,
 *    width, length and lifetime. There is no loop to spot, and the swap happens at zero opacity.
 *
 * One draw call, alpha-blended, no texture and no bloom.
 *
 *     const smoke = new SmokeWispsVfx(config);
 *     smoke.object3d.position.set(0, 0, 0);   // the smouldering surface
 *     scene.add(smoke.object3d);
 *
 *     smoke.update(delta);     // from the loop you already have
 *     smoke.stop();            // stops emitting; the live strands finish and drift away
 *     smoke.enabled = false;   // off, without tearing anything down
 *     smoke.dispose();         // on teardown
 */

import {
    BufferAttribute,
    Color,
    DoubleSide,
    Group,
    InstancedBufferGeometry,
    Mesh,
    NormalBlending,
    ShaderMaterial,
    Vector2,
    Vector3,
} from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, flushPrefix } from "../../core/instancing";
import { createRng } from "../../core/random";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { WISP_EMISSION_SHAPES, MAX_WISPS, normalizeSmokeWispsConfig, type SmokeWispsConfig } from "./config";

export interface SmokeWispsVfxOptions {
    /** Base RNG seed; two instances with the same seed lay out an identical column. */
    seed?: number;
    /**
     * Rows of geometry along one strand. More rows is a smoother curl, not more smoke — the
     * default resolves the curl the defaults ask for, and the cost is vertices, never fill.
     */
    segments?: number;
}

/** Stands in for "never" on the emission gate. Far beyond any session length, finite on purpose. */
const FOREVER = 1e9;

const VERTEX = /* glsl */ `
attribute float aSeed;

uniform float uTime;
// Emission window in effect-time: a wisp renders only if it was born inside it. This is what makes
// stop() drain the column over one lifetime instead of blinking it out.
uniform float uEmitFrom;
uniform float uEmitTo;

uniform vec3 uEmission;      // half width, half depth, height
uniform float uShape;        // 0 point, 1 line, 2 area
uniform vec2 uLife;          // min, max seconds
uniform vec2 uRise;          // average speed, variation
uniform float uMaxHeight;
uniform vec2 uDrift;         // coherent wind velocity on x / z
uniform float uSpread;
uniform float uTurbulence;
uniform float uCurlFrequency;
uniform float uExpansion;
uniform vec2 uWidth;         // min, max world width at birth
uniform vec2 uLength;        // min, max world length
uniform vec2 uFade;          // in, out seconds
uniform float uOpacityVariation;
uniform float uColorVariation;
uniform vec3 uColor;
uniform float uRandomness;
uniform float uMinScreenWidth;

varying vec2 vUv;            // x: -1..1 across the strand, y: 0..1 along it (0 = the source end)
varying vec3 vColor;
varying float vAlpha;
varying vec2 vNoise;

const float TAU = 6.2831853;

// Dave Hoskins' integer-free hash. No sin(), which on mobile GPUs is where the usual
// fract(sin(x)*43758.5) trick quietly loses its entropy and starts banding.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

/**
 * Pulls a 0..1 draw toward its mean. One knob for "how much do wisps differ from each other",
 * applied to magnitudes only — collapsing the *directions* as well would turn the column into a
 * sheet, which is not what "less random" should mean.
 */
float vary(float r) {
    return mix(0.5, r, uRandomness);
}

/**
 * Where the smoke that left the source t seconds ago has got to, in the effect's local space.
 *
 * Sampling this across a strand is the whole effect: the shape of a wisp is the history of one
 * parcel's path, so the strand curls because the flow curled.
 */
vec3 wispPath(float t, float life, vec3 origin, float climb, vec2 fan, float curlPhase, float curlRate) {
    float u = clamp(t / life, 0.0, 1.0);

    vec3 p = origin;
    // Buoyancy bleeds away as the parcel cools and mixes into the air, so the climb eases out. A
    // constant rise over a long life reads as a jet, which is the usual way smoke goes wrong.
    p.y += climb * u * (2.0 - u);
    p.xz += uDrift * t;
    p.xz += fan * uSpread * u * u;

    // The curl builds in rather than starting at full amplitude: gas leaves a vent laminar, and a
    // sine at full strength from t = 0 puts a visible kink right at the source.
    float amp = uTurbulence * smoothstep(0.0, 0.35, u);
    float w = t * uCurlFrequency * curlRate;
    // uTime is in here too, slowly, so a strand keeps re-forming instead of rising as a rigid
    // corkscrew. Two incommensurate rates per axis, so there is no period to spot.
    float evolve = uTime * 0.25;
    p.x += amp * (sin(w + curlPhase + evolve) + 0.45 * sin(w * 2.37 + curlPhase * 3.1));
    p.z += amp * (cos(w * 0.86 + curlPhase * 1.7 + evolve * 0.8) + 0.45 * cos(w * 1.93 + curlPhase * 2.3));
    return p;
}

void main() {
    // Per-wisp and fixed for its whole existence: the phase is what desynchronises the column, so
    // all of it is never at the same point of life at once.
    float phase = hash11(aSeed + 0.73);
    float life = mix(uLife.x, uLife.y, vary(hash11(aSeed + 1.37)));

    float cursor = uTime / life + phase;
    float cycle = floor(cursor);
    float u = cursor - cycle;     // normalised age, 0 at birth
    float age = u * life;

    // Per-cycle, re-drawn every time this wisp recycles — the cycle index is in the hash. Without
    // it the whole column is a loop of one lifetime, which the eye finds within seconds. Chained
    // rather than hashed from the seed each time: one multiply-add per extra random.
    float r1 = hash11(aSeed * 1.313 + cycle * 7.137);
    float r2 = hash11(r1 + 1.0);
    float r3 = hash11(r2 + 1.0);
    float r4 = hash11(r3 + 1.0);
    float r5 = hash11(r4 + 1.0);
    float r6 = hash11(r5 + 1.0);
    float r7 = hash11(r6 + 1.0);
    float r8 = hash11(r7 + 1.0);
    float r9 = hash11(r8 + 1.0);

    vec2 local = vec2(0.0);
    if (uShape > 1.5) local = vec2(r1, r2) * 2.0 - 1.0;         // area
    else if (uShape > 0.5) local = vec2(r1 * 2.0 - 1.0, 0.0);   // line, along the width axis
    vec3 origin = vec3(local.x * uEmission.x, uEmission.z, local.y * uEmission.y);

    float speed = uRise.x * (1.0 + uRise.y * (vary(r3) * 2.0 - 1.0));
    float climb = min(speed * life, uMaxHeight);

    // The fan direction stays fully random whatever uRandomness says, for the reason in vary().
    float fanAngle = r4 * TAU;
    vec2 fan = vec2(cos(fanAngle), sin(fanAngle));
    float curlRate = 0.7 + vary(r5) * 0.8;
    float curlPhase = phase * 61.0;

    // Length is authored in world units but applied as a lag in seconds, so two wisps of the same
    // length really are the same length however fast they climb. The lag opens from zero, so a
    // wisp grows out of the source — and the strand can never collapse to a point, which would
    // leave the billboard basis undefined.
    float strand = mix(uLength.x, uLength.y, vary(r6));
    float reach = min(strand / max(speed, 0.05), age);

    float v = position.y;
    // How long ago this row's smoke left the source. v = 0 is the newest end, v = 1 the oldest.
    float t = age - (1.0 - v) * reach;

    vec3 p = wispPath(t, life, origin, climb, fan, curlPhase, curlRate);
    // Finite difference along the strand for the billboard basis: sampling the same function a
    // short step further on is cheaper than carrying a tangent attribute, and stays correct
    // however the path is edited later.
    float ds = max(reach * 0.04, 0.01);
    vec3 pNext = wispPath(t + ds, life, origin, climb, fan, curlPhase, curlRate);

    float w0 = mix(uWidth.x, uWidth.y, vary(r7)) * 0.5;
    // Width follows the parcel's own age, not the wisp's, so the old end is the wide end — which
    // is the single thing that makes rising smoke read as expanding rather than as a strip.
    float halfWidth = w0 + uExpansion * t * 0.5;
    // The newest end is still leaving the source, so it tapers in rather than starting full width.
    halfWidth *= mix(0.3, 1.0, smoothstep(0.0, 0.35, v));

    // Ramps rather than smoothstep pairs: the durations are in seconds and may exceed the life
    // they are clipped into, and a ratio clamps safely where reversed smoothstep edges would not.
    float fadeIn = uFade.x > 0.0 ? min(age / uFade.x, 1.0) : 1.0;
    float fadeOut = uFade.y > 0.0 ? min((life - age) / uFade.y, 1.0) : 1.0;
    fadeOut *= fadeOut;
    // Expanding smoke is thinner smoke — the same material spread across a wider strand. One line,
    // and it ties "becomes more diffuse as it rises" to expansionRate instead of a second knob.
    float thin = w0 / max(w0 + uExpansion * t * 0.5, 0.0001);

    float born = (cycle - phase) * life;
    float gate = step(uEmitFrom, born) * step(born, uEmitTo);

    vAlpha = fadeIn * fadeOut * thin * (1.0 + uOpacityVariation * (vary(r8) * 2.0 - 1.0)) * gate;
    vUv = vec2(position.x, v);
    // Per-wisp offset into the noise field, so no two strands show the same pattern.
    vNoise = vec2(phase * 31.7, r1 * 17.3);
    // Brightness and a slight warm/cool tilt, both small: smoke varies between strands, it does
    // not come in colours.
    float tint = (vary(r9) - 0.5) * uColorVariation;
    vColor = uColor * (1.0 + tint * 0.8) + vec3(tint, 0.0, -tint) * 0.05;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 mvNext = modelViewMatrix * vec4(pNext, 1.0);

    vec2 along = mvNext.xy - mv.xy;
    float len = length(along);
    // A strand pointing straight at the camera has no usable direction on screen; any
    // perpendicular will do there, and the guard keeps a normalize() of zero out of the pipeline.
    vec2 dir = len > 1e-5 ? along / len : vec2(0.0, 1.0);
    // Same handedness as StreakRenderer. The material is DoubleSide — a strand that curls past
    // edge-on flips its winding halfway along and back-face culling would eat it — but keeping
    // the convention means the winding is still predictable if that ever changes.
    vec2 perp = vec2(dir.y, -dir.x);

    // Same screen-space floor as StreakRenderer, for the same reason: a strand sized correctly in
    // world units thins to under a pixel at playable framing and scintillates instead of drifting.
    // projectionMatrix[1][1] == 1 / tan(fov/2), so this needs no viewport uniform to maintain.
    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    // Gated wisps collapse to zero width, so a drained column costs no fill rate, only its
    // vertices.
    float w = max(halfWidth, uMinScreenWidth * viewPerScreen) * gate;

    mv.xy += perp * (position.x * w);
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSoftness;
uniform float uNoiseScale;
uniform float uNoiseIntensity;
uniform float uDetailScale;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vNoise;

// Simplex noise (Ashima / Gustavson, 2D). Chosen over value noise because it has no axis-aligned
// grid in it: a lattice running along a strand reads as a weave the moment the smoke is thin.
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
    float v = vUv.y;

    // The sample grid is stretched along the strand, so the detail reads as streaks drawn out by
    // the rise rather than as round blobs pasted onto a ribbon.
    vec2 np = vec2(vUv.x * 0.5, v * 2.4) + vNoise;
    float flow = uTime * 0.09;
    float broad = snoise((np - vec2(0.0, flow)) * uNoiseScale);
    float fine = snoise((np - vec2(flow * 0.7, flow * 1.6)) * uDetailScale);
    float n = broad * 0.7 + fine * 0.3;

    // Distorting the across-coordinate *before* the falloff is what breaks the silhouette: the
    // edge wanders instead of running straight down the side of a card.
    float across = abs(vUv.x + n * uNoiseIntensity * 0.6);
    float body = clamp(1.0 - across, 0.0, 1.0);
    // Softness moves an exponent rather than a smoothstep edge pair, which could be reversed.
    float a = pow(body, mix(0.45, 2.6, uSoftness));
    // Eat into the interior with the same field, so a wisp has thin spots and gaps rather than a
    // uniform core with soft sides.
    a *= mix(1.0, clamp(0.45 + 0.75 * n, 0.0, 1.0), uNoiseIntensity);

    // Both ends dissolve: the new end has not fully left the source, and the old end is what the
    // smoke is turning into — air.
    a *= smoothstep(0.0, 0.16, v);
    a *= 1.0 - smoothstep(0.7, 1.0, v);

    a = clamp(a * vAlpha * uOpacity, 0.0, 1.0);
    if (a <= 0.002) discard;

    // Darker inside, lighter at the edge: the thin margin of a real wisp scatters more light than
    // its core transmits, and it is what keeps overlapping strands readable against each other.
    gl_FragColor = vec4(vColor * mix(1.16, 0.84, body), a);
    #include <colorspace_fragment>
}
`;

export class SmokeWispsVfx implements VfxEffect {
    readonly id = "smokewisps";
    readonly object3d: Group;

    readonly config: SmokeWispsConfig;

    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly seed: number;
    private readonly segments: number;

    private geometry: InstancedBufferGeometry;
    /** Wisp slots the seed buffer holds; only ever grows, and only when the count asks it to. */
    private capacity = 0;
    private count = 0;
    private time = 0;
    private emitting = true;

    constructor(rawConfig?: unknown, options: SmokeWispsVfxOptions = {}) {
        const { config, issues } = normalizeSmokeWispsConfig(rawConfig);
        issues.report("SmokeWispsVfx");
        this.config = config;
        this.seed = options.seed ?? 1;
        this.segments = Math.max(2, Math.min(64, Math.round(options.segments ?? 14)));

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uEmitFrom: { value: -FOREVER },
                uEmitTo: { value: FOREVER },
                uEmission: { value: new Vector3() },
                uShape: { value: 2 },
                uLife: { value: new Vector2() },
                uRise: { value: new Vector2() },
                uMaxHeight: { value: 0 },
                uDrift: { value: new Vector2() },
                uSpread: { value: 0 },
                uTurbulence: { value: 0 },
                uCurlFrequency: { value: 1 },
                uExpansion: { value: 0 },
                uWidth: { value: new Vector2() },
                uLength: { value: new Vector2() },
                uFade: { value: new Vector2() },
                uOpacityVariation: { value: 0 },
                uColorVariation: { value: 0 },
                uColor: { value: new Color() },
                uRandomness: { value: 1 },
                uMinScreenWidth: { value: 0 },
                uOpacity: { value: 1 },
                uSoftness: { value: 0.6 },
                uNoiseScale: { value: 1 },
                uNoiseIntensity: { value: 0.5 },
                uDetailScale: { value: 3 },
            },
            transparent: true,
            // Smoke blends rather than adds — it occludes what is behind it. Depth writes are off
            // because strands constantly overlap and a near one would punch a hole in a far one.
            depthWrite: false,
            depthTest: true,
            blending: NormalBlending,
            // A curling strand crosses edge-on and flips its own winding partway along; culling
            // would silently eat half of it.
            side: DoubleSide,
        });

        this.geometry = this.buildGeometry(this.targetCount());
        this.mesh = new Mesh(this.geometry, this.material);
        // Every position is computed in the vertex shader, so the geometry's own bounds are
        // meaningless and the mesh must never be culled against them.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;

        this.object3d = new Group();
        this.object3d.name = "vfx:smokewisps";
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

    /**
     * Wisp slots currently being drawn.
     *
     * This is the steady-state population the rate and the lifetimes settle at, which is also the
     * cost: after `stop()` the slots that have drained render as degenerate strips rather than
     * disappearing from the draw.
     */
    get activeCount(): number {
        return this.mesh.visible ? this.count : 0;
    }

    get isEmitting(): boolean {
        return this.emitting;
    }

    /**
     * Resumes emission. Wisps grow out of the source and the column refills over one lifetime, so
     * this never puts a bank of smoke into mid-air. Idempotent.
     */
    start(): void {
        if (this.emitting) return;
        this.emitting = true;
        this.material.uniforms.uEmitFrom.value = this.time;
        this.material.uniforms.uEmitTo.value = FOREVER;
    }

    /** Stops emitting. Strands already in the air finish rising and dissolve — the column drains. */
    stop(): void {
        if (!this.emitting) return;
        this.emitting = false;
        this.material.uniforms.uEmitTo.value = this.time;
    }

    /** `VfxEffect` compliance. A smouldering source has nothing to burst; kept so hosts can be generic. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.mesh.visible || dt <= 0) return;
        // No clamp on dt: unlike a CPU emitter there is no backlog to fire. A huge delta after a
        // backgrounded tab only moves every wisp further along a path that is continuous
        // everywhere, including across the recycle.
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
    }

    /**
     * Re-reads the config object after it was edited.
     *
     * Every knob except `wispCount` is a uniform, so a slider lands on the frame it is dragged
     * with nothing reallocated and no strand disturbed. `wispCount` only resizes the draw, and the
     * seeds come from a seeded sequence, so growing the column leaves every existing wisp exactly
     * where it was and appends new ones.
     */
    applyConfig(): void {
        const cfg = this.config;
        const u = this.material.uniforms;

        (u.uEmission.value as Vector3).set(cfg.emissionWidth * 0.5, cfg.emissionDepth * 0.5, cfg.emissionHeight);
        u.uShape.value = Math.max(0, WISP_EMISSION_SHAPES.indexOf(cfg.emissionShape));
        (u.uLife.value as Vector2).set(Math.max(0.1, cfg.minLifetime), Math.max(0.1, cfg.maxLifetime));
        (u.uRise.value as Vector2).set(Math.max(0.01, cfg.riseSpeed), cfg.riseSpeedVariation);
        u.uMaxHeight.value = cfg.maxHeight;

        const a = (cfg.driftAngle * Math.PI) / 180;
        (u.uDrift.value as Vector2).set(Math.cos(a) * cfg.horizontalDrift, Math.sin(a) * cfg.horizontalDrift);
        u.uSpread.value = cfg.spread;
        u.uTurbulence.value = cfg.turbulence;
        u.uCurlFrequency.value = Math.max(0.01, cfg.curlFrequency);
        u.uExpansion.value = cfg.expansionRate;

        (u.uWidth.value as Vector2).set(cfg.minWidth, cfg.maxWidth);
        (u.uLength.value as Vector2).set(cfg.minLength, cfg.maxLength);
        (u.uFade.value as Vector2).set(cfg.fadeInDuration, cfg.fadeOutDuration);
        u.uOpacityVariation.value = cfg.opacityVariation;
        u.uColorVariation.value = cfg.colorVariation;
        (u.uColor.value as Color).copy(resolveColor(cfg.smokeColor));
        u.uRandomness.value = cfg.randomness;
        u.uMinScreenWidth.value = cfg.minScreenWidth;

        u.uOpacity.value = cfg.baseOpacity;
        u.uSoftness.value = cfg.softness;
        u.uNoiseScale.value = cfg.noiseScale;
        u.uNoiseIntensity.value = cfg.noiseIntensity;
        u.uDetailScale.value = cfg.detailScale;

        this.setCount(this.targetCount());
        this.mesh.visible = cfg.enabled;
    }

    /** Clears the column and starts it again from an empty source. */
    reset(): void {
        this.time = 0;
        this.material.uniforms.uTime.value = 0;
        this.emitting = true;
        // Born at or after t = 0 — every wisp, since the clock just went back there.
        this.material.uniforms.uEmitFrom.value = -FOREVER;
        this.material.uniforms.uEmitTo.value = FOREVER;
        this.applyConfig();
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.material.dispose();
    }

    /**
     * Live population the current config asks for.
     *
     * Rate times average lifetime is the steady state an emitter settles at, so `emissionRate` is
     * honoured by drawing that many slots and `wispCount` is the budget ceiling over it.
     */
    private targetCount(): number {
        const cfg = this.config;
        // Re-clamped rather than trusted: the config object is editable at runtime and the panel
        // writes to it directly, without going back through the validator.
        const cap = Math.max(0, Math.min(Math.round(cfg.wispCount), MAX_WISPS));
        const averageLife = (Math.max(0.1, cfg.minLifetime) + Math.max(0.1, cfg.maxLifetime)) * 0.5;
        return Math.min(cap, Math.max(0, Math.round(cfg.emissionRate * averageLife)));
    }

    private setCount(count: number): void {
        if (count > this.capacity) {
            const old = this.geometry;
            this.geometry = this.buildGeometry(count);
            this.mesh.geometry = this.geometry;
            old.dispose();
            return;
        }
        this.count = count;
        this.geometry.instanceCount = count;
    }

    /**
     * Allocates one strand's strip plus the seed buffer. One float per wisp is the whole of the
     * per-particle state — the rest is hashed from it in the shader — and it is written once,
     * here, and never again.
     *
     * The strip is authored in strand space: `position.x` is the side (-1 or 1) and `position.y`
     * runs 0 at the source end to 1 at the oldest end. The vertex shader turns that into a
     * camera-facing ribbon following the path, so the geometry itself carries no shape at all.
     */
    private buildGeometry(count: number): InstancedBufferGeometry {
        const geo = new InstancedBufferGeometry();
        const rows = this.segments + 1;
        const positions = new Float32Array(rows * 2 * 3);
        const indices: number[] = [];

        for (let row = 0; row < rows; row++) {
            const v = row / this.segments;
            for (let side = 0; side < 2; side++) {
                const base = (row * 2 + side) * 3;
                positions[base] = side === 0 ? -1 : 1;
                positions[base + 1] = v;
                positions[base + 2] = 0;
            }
            if (row < this.segments) {
                const a = row * 2;
                indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
            }
        }

        geo.setAttribute("position", new BufferAttribute(positions, 3));
        geo.setIndex(indices);

        // An empty column still needs a real buffer behind the attribute; instanceCount hides it.
        const capacity = Math.max(1, count);
        const seeds = addInstancedAttribute(geo, "aSeed", capacity, 1);

        // Drawn from a seeded sequence, so a larger column reproduces the smaller one's prefix: a
        // wisp keeps its identity when the count slider moves, and only new slots are new wisps.
        const rng = createRng(this.seed * 2654435761);
        for (let i = 0; i < capacity; i++) seeds.array[i] = rng() * 997;

        geo.instanceCount = count;
        flushPrefix(seeds.attribute, capacity);

        this.capacity = capacity;
        this.count = count;
        return geo;
    }
}
