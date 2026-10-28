/**
 * Rising embers: glowing fragments lifting off a hot surface, cooling, and going out.
 *
 * Built like the fireflies rather than like the fire pit, and for the same reason: an ember's
 * whole path — where it was born, how fast it climbs, how it wanders, when it dies — is a pure
 * function of time and a per-ember seed, so there is nothing for the CPU to integrate. `update(dt)`
 * advances one float. Three hundred embers and three thousand cost the same on the main thread,
 * and no attribute is ever re-uploaded after construction.
 *
 * Unlike the fireflies these particles do die, which a looping shader normally pays for in a
 * visible period: every ember would retrace the same path every `lifetime` seconds. The fix is
 * that the per-ember draws are hashed against the **cycle index** as well as the seed, so an ember
 * recycling is an ember re-rolled — new spawn point, new speed, new size, new heat. There is no
 * loop to spot and no respawn to hide, because the recycle happens at zero opacity either way.
 *
 * The look is built around one idea: **heat is rare**. Each ember draws a heat value biased hard
 * toward zero, and heat is what makes an ember bigger, faster, longer-lived and white-centred. So
 * a handful of yellow-hot sparks ride above a field of dull red ones, which is how a lava surface
 * actually reads — a uniform draw turns the same geometry into orange confetti.
 *
 * Rendering is one draw call of instanced camera-facing quads. `gl_PointSize` is driver-capped and
 * a point sprite pops out of existence the moment its centre leaves the frustum, which on a column
 * of embers drifting across the frame is exactly where it would be seen. The glow is two gaussians
 * in the fragment shader, so there is no texture to load or dispose and no bloom pass.
 *
 *     const embers = new RisingEmbersVfx(config);
 *     embers.object3d.position.set(0, 0, 0);   // the hot surface
 *     scene.add(embers.object3d);
 *
 *     embers.update(delta);     // from the loop you already have
 *     embers.stop();            // stops emitting; the live ones finish and drain away
 *     embers.enabled = false;   // off, without tearing anything down
 *     embers.dispose();         // on teardown
 */

import { AdditiveBlending, Color, Group, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";
import { createRng } from "../../core/random";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { EMISSION_SHAPES, MAX_PARTICLES, normalizeRisingEmbersConfig, type RisingEmbersConfig } from "./config";

export interface RisingEmbersVfxOptions {
    /** Base RNG seed; two instances with the same seed lay out an identical field. */
    seed?: number;
}

/** Stands in for "never" on the emission gate. Far beyond any session length, finite on purpose. */
const FOREVER = 1e9;

const VERTEX = /* glsl */ `
attribute float aSeed;

uniform float uTime;
// Emission window in effect-time: an ember renders only if it was born inside it. This is what
// makes stop() drain the field over one lifetime instead of blinking it out.
uniform float uEmitFrom;
uniform float uEmitTo;

uniform vec3 uEmission;      // half width, half depth, height
uniform float uShape;        // 0 box, 1 disc, 2 ring
uniform vec2 uLife;          // min, max seconds
uniform vec2 uRise;          // average speed, variation
uniform float uMaxHeight;
uniform vec2 uDrift;         // coherent wind velocity on x / z
uniform float uSpread;
uniform float uTurbulence;
uniform vec2 uSize;          // min, max world size
uniform float uSizeVariation;
uniform vec2 uFade;          // in, out seconds
uniform vec2 uFlicker;       // rate, depth
uniform float uCooling;
uniform float uGlow;
uniform float uMinScreenSize;
uniform vec3 uHotColor;
uniform vec3 uBaseColor;
uniform vec3 uCoolColor;

varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;
varying float vCore;

const float TAU = 6.2831853;

// Dave Hoskins' integer-free hash. No sin(), which on mobile GPUs is where the usual
// fract(sin(x)*43758.5) trick quietly loses its entropy and starts banding.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

void main() {
    vUv = uv;

    // Per-ember and fixed for its whole existence: the phase is what desynchronises the field, so
    // all of it is never at the same point of life at once.
    float phase = hash11(aSeed + 0.73);
    float life = mix(uLife.x, uLife.y, hash11(aSeed + 1.37));

    float cursor = uTime / life + phase;
    float cycle = floor(cursor);
    float u = cursor - cycle;     // normalised age, 0 at birth
    float age = u * life;

    // Per-cycle, re-drawn every time this ember recycles — the cycle index is in the hash. Without
    // it the whole field is a loop of one lifetime, which the eye finds within seconds. Chained
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

    // Spawn. The disc takes sqrt(r) so the rim does not crowd; the ring keeps the middle clear,
    // which is what a vent with a crusted-over centre actually does.
    vec2 local;
    if (uShape < 0.5) {
        local = vec2(r1, r2) * 2.0 - 1.0;
    } else {
        float a = r1 * TAU;
        float radius = uShape < 1.5 ? sqrt(r2) : mix(0.82, 1.0, r2);
        local = vec2(cos(a), sin(a)) * radius;
    }
    vec3 p = vec3(local.x * uEmission.x, uEmission.z, local.y * uEmission.y);

    // Heat is the ember's entire character — size, speed, lifetime, colour and the white centre
    // all hang off it. Cubing the draw is what keeps the hot ones rare; a uniform draw gives a
    // field of yellow confetti instead of a few sparks riding above dull red ones.
    float heat = r3 * r3 * r3;

    float speed = uRise.x * (1.0 + uRise.y * (r4 * 2.0 - 1.0)) * (0.75 + heat * 0.6);
    float climb = min(speed * life, uMaxHeight);
    // Buoyancy bleeds away as the ember cools, so the climb eases out. A constant speed over a
    // long life reads as a rocket, which is the single most common way this effect goes wrong.
    p.y += climb * u * (2.0 - u);

    // Three horizontal terms doing three different jobs: a coherent wind every ember shares, a
    // cone that opens with height, and a wander that is unique per ember.
    p.xz += uDrift * age * (0.5 + r5);
    float fan = r6 * TAU;
    p.xz += vec2(cos(fan), sin(fan)) * uSpread * u * u * (0.35 + r7 * 0.65);

    // The wander builds in rather than starting at full amplitude: gas leaves a vent laminar, and
    // a sine at full strength from frame one puts a visible kink right at the spawn point.
    float wander = uTurbulence * smoothstep(0.0, 0.3, u);
    float wanderRate = 0.55 + r8 * 0.8;
    p.x += wander * sin(uTime * wanderRate + phase * 37.0);
    p.z += wander * cos(uTime * wanderRate * 0.83 + phase * 53.0);

    // Size follows heat unless sizeVariation says otherwise, and every ember shrinks a little as
    // it burns down.
    float sizeT = mix(heat, r9, uSizeVariation);
    float size = mix(uSize.x, uSize.y, sizeT) * (1.0 - 0.3 * u);

    // Ramps rather than smoothstep pairs: the durations are in seconds and may exceed the life
    // they are clipped into, and a ratio clamps safely where reversed smoothstep edges would not.
    float fadeIn = uFade.x > 0.0 ? min(age / uFade.x, 1.0) : 1.0;
    float fadeOut = uFade.y > 0.0 ? min((life - age) / uFade.y, 1.0) : 1.0;
    fadeOut *= fadeOut;

    // Two incommensurate sines: smooth in time, but with no period short enough to read as a
    // pulse. Per-ember rate and phase keep the field from flickering in unison.
    float flickerRate = uFlicker.x * (0.7 + phase * 0.7);
    float flicker = 1.0 + uFlicker.y * (
        sin(uTime * flickerRate + phase * 29.0) * 0.6 +
        sin(uTime * flickerRate * 2.37 + phase * 11.0) * 0.4);

    float cooled = mix(1.0, 1.0 - 0.85 * uCooling, u);
    float born = (cycle - phase) * life;
    float gate = step(uEmitFrom, born) * step(born, uEmitTo);

    vGlow = max(flicker, 0.0) * fadeIn * fadeOut * cooled * uGlow * (0.3 + heat * 0.95) * gate;

    // One temperature ramp, cool -> base -> hot, walked by heat and then back down by age. An
    // ember is born at its own heat and slides down as it cools, so the few hot ones pass through
    // the whole palette while the many dull ones start part-way down it and die deep red. That
    // mix — a handful of yellow-orange sparks over a field of dim red fragments — is what reads
    // as glowing material over lava; an even spread of the same colours reads as decorative dust.
    float temp = clamp(heat - u * uCooling, 0.0, 1.0);
    vColor = temp < 0.5 ? mix(uCoolColor, uBaseColor, temp * 2.0) : mix(uBaseColor, uHotColor, temp * 2.0 - 1.0);
    // Only the genuinely hot end of the ramp gets a white centre, and it loses it as it cools.
    // Whitening the dull ones is what turns a field of embers into a field of glowing dots.
    vCore = smoothstep(0.55, 1.0, temp) * 0.7;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Same screen-space floor as StreakRenderer, for the same reason: an ember sized correctly in
    // world units covers under a pixel at playable framing and scintillates instead of glowing.
    // projectionMatrix[1][1] == 1 / tan(fov/2), so this needs no viewport uniform to maintain.
    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    // Gated embers collapse to zero size, so a drained field costs no fill rate, only its vertices.
    float w = max(size, uMinScreenSize * viewPerScreen) * gate;

    // Billboard in view space: no CPU matrix work, and the unit quad's own winding is preserved,
    // so there is no hand-built basis here that could cull the field away. Stretching along travel
    // while the ember is still fast reads as a fragment in motion rather than a bead, which is a
    // second renderer's worth of look for one multiply.
    mv.xy += position.xy * vec2(w, w * (1.0 + 0.5 * (1.0 - u)));
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;
varying float vCore;

void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r2 = dot(d, d);

    // A tight core that carries the light plus a wide, weak halo standing in for the bloom a
    // playable cannot afford. One falloff alone reads either as a hard dot or as fog.
    float core = exp(-r2 * 13.0);
    float halo = exp(-r2 * 2.8) * 0.28;

    float a = clamp((core + halo) * vGlow * uOpacity, 0.0, 1.0);
    if (a <= 0.003) discard;

    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * vCore), a);
    #include <colorspace_fragment>
}
`;

export class RisingEmbersVfx implements VfxEffect {
    readonly id = "risingembers";
    readonly object3d: Group;

    readonly config: RisingEmbersConfig;

    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly seed: number;

    private geometry: InstancedBufferGeometry;
    /** Ember slots the seed buffer holds; only ever grows, and only when the count asks it to. */
    private capacity = 0;
    private count = 0;
    private time = 0;
    private emitting = true;

    constructor(rawConfig?: unknown, options: RisingEmbersVfxOptions = {}) {
        const { config, issues } = normalizeRisingEmbersConfig(rawConfig);
        issues.report("RisingEmbersVfx");
        this.config = config;
        this.seed = options.seed ?? 1;

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uEmitFrom: { value: -FOREVER },
                uEmitTo: { value: FOREVER },
                uEmission: { value: new Vector3() },
                uShape: { value: 0 },
                uLife: { value: new Vector2() },
                uRise: { value: new Vector2() },
                uMaxHeight: { value: 0 },
                uDrift: { value: new Vector2() },
                uSpread: { value: 0 },
                uTurbulence: { value: 0 },
                uSize: { value: new Vector2() },
                uSizeVariation: { value: 0 },
                uFade: { value: new Vector2() },
                uFlicker: { value: new Vector2() },
                uCooling: { value: 0 },
                uGlow: { value: 0 },
                uMinScreenSize: { value: 0 },
                uHotColor: { value: new Color() },
                uBaseColor: { value: new Color() },
                uCoolColor: { value: new Color() },
                uOpacity: { value: 1 },
            },
            transparent: true,
            // Embers add; and writing depth would let the near halos punch holes in the far ones.
            depthWrite: false,
            depthTest: true,
            blending: AdditiveBlending,
        });

        this.geometry = this.buildGeometry(this.targetCount());
        this.mesh = new Mesh(this.geometry, this.material);
        // Every position is computed in the vertex shader, so the geometry's own bounds are
        // meaningless and the mesh must never be culled against them.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;

        this.object3d = new Group();
        this.object3d.name = "vfx:risingembers";
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
     * Ember slots currently being drawn.
     *
     * This is the steady-state population the rate and the lifetimes settle at, which is also the
     * cost: after `stop()` the slots that have drained render as degenerate quads rather than
     * disappearing from the draw.
     */
    get activeCount(): number {
        return this.mesh.visible ? this.count : 0;
    }

    get isEmitting(): boolean {
        return this.emitting;
    }

    /**
     * Resumes emission. Embers appear at the source and the column refills over one lifetime, so
     * this never puts a field of embers into mid-air. Idempotent.
     */
    start(): void {
        if (this.emitting) return;
        this.emitting = true;
        this.material.uniforms.uEmitFrom.value = this.time;
        this.material.uniforms.uEmitTo.value = FOREVER;
    }

    /** Stops emitting. Embers already lit finish their climb and fade out — the field drains. */
    stop(): void {
        if (!this.emitting) return;
        this.emitting = false;
        this.material.uniforms.uEmitTo.value = this.time;
    }

    /** `VfxEffect` compliance. An ambient column has nothing to burst; kept so hosts can be generic. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.mesh.visible || dt <= 0) return;
        // No clamp on dt: unlike a CPU emitter there is no backlog to fire. A huge delta after a
        // backgrounded tab only moves every ember further along a path that is continuous
        // everywhere, including across the recycle.
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
    }

    /**
     * Re-reads the config object after it was edited.
     *
     * Every knob except `particleCount` is a uniform, so a slider lands on the frame it is dragged
     * with nothing reallocated and no ember disturbed. `particleCount` only resizes the draw, and
     * the seeds are drawn from a seeded sequence, so growing the pool leaves every existing ember
     * exactly where it was and appends new ones.
     */
    applyConfig(): void {
        const cfg = this.config;
        const u = this.material.uniforms;

        (u.uEmission.value as Vector3).set(cfg.emissionWidth * 0.5, cfg.emissionDepth * 0.5, cfg.emissionHeight);
        u.uShape.value = Math.max(0, EMISSION_SHAPES.indexOf(cfg.emissionShape));
        (u.uLife.value as Vector2).set(Math.max(0.1, cfg.minLifetime), Math.max(0.1, cfg.maxLifetime));
        (u.uRise.value as Vector2).set(cfg.riseSpeed, cfg.riseSpeedVariation);
        u.uMaxHeight.value = cfg.maxHeight;

        const a = (cfg.driftAngle * Math.PI) / 180;
        (u.uDrift.value as Vector2).set(Math.cos(a) * cfg.driftSpeed, Math.sin(a) * cfg.driftSpeed);
        u.uSpread.value = cfg.spread;
        u.uTurbulence.value = cfg.turbulence;

        (u.uSize.value as Vector2).set(cfg.minSize, cfg.maxSize);
        u.uSizeVariation.value = cfg.sizeVariation;
        (u.uFade.value as Vector2).set(cfg.fadeInDuration, cfg.fadeOutDuration);
        (u.uFlicker.value as Vector2).set(cfg.flickerSpeed, cfg.flickerIntensity);
        u.uCooling.value = cfg.coolingIntensity;
        u.uGlow.value = cfg.glowIntensity;
        u.uMinScreenSize.value = cfg.minScreenSize;
        u.uOpacity.value = cfg.opacity;

        (u.uHotColor.value as Color).copy(resolveColor(cfg.hotColor));
        (u.uBaseColor.value as Color).copy(resolveColor(cfg.baseColor));
        (u.uCoolColor.value as Color).copy(resolveColor(cfg.coolColor));

        this.setCount(this.targetCount());
        this.mesh.visible = cfg.enabled;
    }

    /** Clears the column and starts it again from an empty source. */
    reset(): void {
        this.time = 0;
        this.material.uniforms.uTime.value = 0;
        this.emitting = true;
        // Born at or after t=0 — every ember, since the clock just went back there. The field is
        // immediately full rather than filling in, which is the state construction leaves it in.
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
     * honoured by drawing that many slots and `particleCount` is the budget ceiling over it.
     */
    private targetCount(): number {
        const cfg = this.config;
        // Re-clamped rather than trusted: the config object is editable at runtime and the panel
        // writes to it directly, without going back through the validator.
        const cap = Math.max(0, Math.min(Math.round(cfg.particleCount), MAX_PARTICLES));
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
     * Allocates the seed buffer. One float per ember is the whole of the per-particle state — the
     * rest is hashed from it in the shader — and it is written once, here, and never again.
     */
    private buildGeometry(count: number): InstancedBufferGeometry {
        const geo = createQuadGeometry();
        // An empty field still needs a real buffer behind the attribute; instanceCount hides it.
        const capacity = Math.max(1, count);
        const seeds = addInstancedAttribute(geo, "aSeed", capacity, 1);

        // Drawn from a seeded sequence, so a larger pool reproduces the smaller one's prefix: an
        // ember keeps its identity when the count slider moves, and only new slots are new embers.
        const rng = createRng(this.seed * 2654435761);
        for (let i = 0; i < capacity; i++) seeds.array[i] = rng() * 997;

        geo.instanceCount = count;
        flushPrefix(seeds.attribute, capacity);

        this.capacity = capacity;
        this.count = count;
        return geo;
    }
}
