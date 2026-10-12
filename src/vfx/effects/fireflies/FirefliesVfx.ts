/**
 * Ambient fireflies: a drifting, blinking field of small warm lights.
 *
 * Unlike the other effects here this one has no emitter and no lifetimes. A firefly is born with
 * the simulation and never dies, so its whole motion is written as a sum of sines around a fixed
 * home position and evaluated in the vertex shader from a single `uTime` uniform. Three
 * consequences, all of them the reason it is built this way:
 *
 *  - The CPU does nothing per frame. `update(dt)` advances one float; no particle is touched, no
 *    attribute is re-uploaded. Sixty fireflies and six hundred cost the same on the main thread.
 *  - A sum of sines is bounded by construction, so a firefly can never leave its volume and there
 *    is no wrap, no respawn and therefore nothing that can visibly teleport.
 *  - Nothing is synchronised. Every firefly carries its own frequencies, phases, size, brightness
 *    and colour, so the field never pulses or sways in lockstep.
 *
 * Rendering is one draw call of instanced camera-facing quads — the same technique as the embers,
 * for the same reason: `gl_PointSize` is driver-capped and a point sprite pops out of existence
 * the moment its centre crosses the frustum edge, which on a field of lights drifting past the
 * screen border is exactly where it would be noticed. The glow is evaluated analytically in the
 * fragment shader, so there is no texture to load, upload or dispose, and no bloom pass.
 *
 *     const fireflies = new FirefliesVfx(config);
 *     fireflies.object3d.position.set(0, 2.4, 0);   // centre of the volume
 *     scene.add(fireflies.object3d);
 *
 *     fireflies.update(delta);   // from the loop you already have
 *     fireflies.enabled = false; // off, without tearing anything down
 *     fireflies.dispose();       // on teardown
 */

import { AdditiveBlending, Color, Group, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3 } from "three";
import { resolveColor } from "../../core/colorCache";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";
import { createRng, type Rng } from "../../core/random";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { MAX_COUNT, normalizeFirefliesConfig, type FirefliesConfig } from "./config";

export interface FirefliesVfxOptions {
    /** Base RNG seed; two instances with the same seed lay out an identical field. */
    seed?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aOrigin;
// x: wander radius, y: wander rate, z: vertical amplitude, w: vertical rate
attribute vec4 aMotion;
// Four independent phase offsets, so no two axes of one firefly turn together either.
attribute vec4 aPhase;
// x: world size, y: brightness, z: blink rate, w: blink phase
attribute vec4 aLook;
attribute vec3 aColor;

uniform float uTime;
uniform float uGlow;
uniform float uPulseAmount;
uniform float uMinScreenSize;

varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;

void main() {
    vUv = uv;
    vColor = aColor;

    float t = uTime;
    float w = aMotion.y;

    // Two beating frequencies per axis. A single sine is an orbit and reads as machinery; the
    // slow second term keeps pushing the turn-around points somewhere new, which is what makes
    // the path look like a decision rather than a cycle. Both terms are scaled so the pair can
    // never exceed aMotion.x — that bound is what keeps the firefly inside its volume for ever.
    vec3 p = aOrigin;
    p.x += aMotion.x * (sin(t * w + aPhase.x) * 0.72 + sin(t * w * 0.43 + aPhase.z) * 0.28);
    p.z += aMotion.x * (cos(t * w * 0.81 + aPhase.y) * 0.68 + sin(t * w * 0.29 + aPhase.w) * 0.32);
    p.y += aMotion.z * (sin(t * aMotion.w + aPhase.y) * 0.8 + sin(t * aMotion.w * 0.53 + aPhase.x) * 0.2);

    // Blink. The smoothstep on a raised sine makes each firefly linger dim and pass quickly
    // through bright, which is the half of the rhythm that reads as a firefly rather than a
    // fading lamp. uPulseAmount sets how far down the dim end goes.
    float s = 0.5 + 0.5 * sin(t * aLook.z + aLook.w);
    float pulse = mix(1.0 - uPulseAmount, 1.0, s * s * (3.0 - 2.0 * s));
    vGlow = aLook.y * pulse * uGlow;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Same screen-space floor as StreakRenderer, for the same reason: a firefly sized correctly
    // in world units covers well under a pixel at the far end of the volume and scintillates out.
    // projectionMatrix[1][1] == 1 / tan(fov/2), so this needs no viewport uniform to maintain.
    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    float size = max(aLook.x, uMinScreenSize * viewPerScreen);

    // Billboard in view space: the quad faces the camera with no CPU matrix work, and the unit
    // quad's own winding is preserved, so there is no basis here that could cull the field away.
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vColor;
varying float vGlow;

void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r2 = dot(d, d);

    // Two gaussians: a tight core that carries the light, and a wide, weak halo standing in for
    // the bloom a playable cannot afford. One falloff alone reads either as a hard dot or as fog.
    float core = exp(-r2 * 16.0);
    float halo = exp(-r2 * 3.2) * 0.22;

    float a = clamp((core + halo) * vGlow * uOpacity, 0.0, 1.0);
    if (a <= 0.002) discard;

    // The core washes toward white as it burns, which is what sells a point of light as a light
    // instead of a coloured dot. The halo keeps the hue, so the colour still reads at a glance.
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.45), a);
    #include <colorspace_fragment>
}
`;

export class FirefliesVfx implements VfxEffect {
    readonly id = "fireflies";
    readonly object3d: Group;

    readonly config: FirefliesConfig;

    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly seed: number;

    private geometry: InstancedBufferGeometry;
    private count = 0;
    /** Fingerprint of the values that are baked into attributes, so `applyConfig` can skip work. */
    private baked = "";
    private running = true;
    private readonly scratch = new Color();

    constructor(rawConfig?: unknown, options: FirefliesVfxOptions = {}) {
        const { config, issues } = normalizeFirefliesConfig(rawConfig);
        issues.report("FirefliesVfx");
        this.config = config;
        this.seed = options.seed ?? 1;

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uGlow: { value: config.glowIntensity },
                uPulseAmount: { value: config.pulseAmount },
                uMinScreenSize: { value: config.minScreenSize },
                uOpacity: { value: config.opacity },
            },
            transparent: true,
            // Lights add; and writing depth would let the near halos punch holes in the far ones.
            depthWrite: false,
            depthTest: true,
            blending: AdditiveBlending,
        });

        this.geometry = this.buildGeometry();
        this.mesh = new Mesh(this.geometry, this.material);
        // Every position lives in the vertex shader, so the geometry's own bounds are meaningless.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;

        this.object3d = new Group();
        this.object3d.name = "vfx:fireflies";
        this.object3d.add(this.mesh);
    }

    get enabled(): boolean {
        return this.mesh.visible;
    }

    set enabled(v: boolean) {
        this.config.enabled = v;
        this.mesh.visible = v;
    }

    get activeCount(): number {
        return this.mesh.visible ? this.count : 0;
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Resumes drift and blink. The effect starts running, so this is only needed after `stop()`. */
    start(): void {
        this.running = true;
    }

    /** Freezes the field where it is. The fireflies stay lit — `enabled = false` is what hides them. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. An ambient field has nothing to burst; kept so hosts can be generic. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt here: unlike an emitter, a huge delta after a backgrounded tab only
        // advances the sines further along a path that is continuous everywhere.
        this.material.uniforms.uTime.value = (this.material.uniforms.uTime.value as number) + dt;
    }

    /**
     * Re-reads the config object after it was edited, and brings the field in line with it.
     *
     * `glowIntensity`, `pulseAmount`, `opacity` and `minScreenSize` are uniforms, so they land for
     * free. Everything else is baked into the attributes — that is the trade that buys the empty
     * per-frame cost — and changing one means laying the field out again. The fingerprint check is
     * what keeps a glow slider from reallocating buffers on every frame of a drag.
     *
     * The layout is seeded, so a rebuild reproduces the same field rather than reshuffling it: the
     * firefly you were watching is still where you left it, with whatever you just changed applied.
     */
    applyConfig(): void {
        this.material.uniforms.uGlow.value = this.config.glowIntensity;
        this.material.uniforms.uPulseAmount.value = this.config.pulseAmount;
        this.material.uniforms.uMinScreenSize.value = this.config.minScreenSize;
        this.material.uniforms.uOpacity.value = this.config.opacity;
        this.mesh.visible = this.config.enabled;

        if (this.bakedSignature() === this.baked) return;
        const old = this.geometry;
        this.geometry = this.buildGeometry();
        this.mesh.geometry = this.geometry;
        old.dispose();
    }

    /** Rebuilds the field and puts the clock back to zero. */
    reset(): void {
        this.material.uniforms.uTime.value = 0;
        this.applyConfig();
    }

    /** The config values `buildGeometry` reads. Only a change here can require a rebuild. */
    private bakedSignature(): string {
        const c = this.config;
        return JSON.stringify([
            c.count,
            c.areaSize,
            c.clearRadius,
            c.minSize,
            c.maxSize,
            c.minSpeed,
            c.maxSpeed,
            c.verticalAmplitude,
            c.pulseSpeed,
            c.colors,
        ]);
    }

    dispose(): void {
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.material.dispose();
    }

    /**
     * Lays out one field: a home position per firefly plus the constants its motion is derived
     * from. Everything random is drawn here, once, and never looked at again.
     */
    private buildGeometry(): InstancedBufferGeometry {
        const cfg = this.config;
        // Re-clamped rather than trusted: the config object is editable at runtime, and the
        // panel writes to it directly without going back through the validator.
        const count = Math.max(0, Math.min(Math.round(cfg.count), MAX_COUNT));
        this.count = count;

        const geo = createQuadGeometry();
        // An empty field still needs real buffers behind the attributes; instanceCount does the
        // actual hiding.
        const capacity = Math.max(1, count);
        const origin = addInstancedAttribute(geo, "aOrigin", capacity, 3);
        const motion = addInstancedAttribute(geo, "aMotion", capacity, 4);
        const phase = addInstancedAttribute(geo, "aPhase", capacity, 4);
        const look = addInstancedAttribute(geo, "aLook", capacity, 4);
        const color = addInstancedAttribute(geo, "aColor", capacity, 3);

        const rng = createRng(this.seed * 2654435761);
        const halfX = cfg.areaSize[0] * 0.5;
        const halfY = cfg.areaSize[1] * 0.5;
        const halfZ = cfg.areaSize[2] * 0.5;
        // The wander radius is a fraction of the volume rather than a knob of its own: it is how
        // far a firefly strays from home, which is a property of the space, not of the species.
        const wanderBase = Math.min(halfX, halfZ) * 0.2;
        // Normalised hole in the middle of the disc. Clamped below 1 so a clearRadius larger than
        // the volume leaves a thin ring of fireflies instead of an empty scene.
        const hole = Math.min(0.92, cfg.clearRadius / Math.max(Math.min(halfX, halfZ), 1e-4));

        for (let i = 0; i < count; i++) {
            // Sampled on an elliptical annulus: random by angle and by radius, so no grid, and
            // biased outward so the middle of the scene — where the game happens — stays clear.
            // The sqrt is what keeps the ring uniform instead of crowding its inner edge.
            const angle = rng() * Math.PI * 2;
            const u = Math.sqrt(hole * hole + (1 - hole * hole) * rng());
            const o = i * 3;
            origin.array[o] = Math.cos(angle) * u * halfX;
            origin.array[o + 1] = (rng() * 2 - 1) * halfY;
            origin.array[o + 2] = Math.sin(angle) * u * halfZ;

            const speed = cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * rng();
            const wander = wanderBase * (0.45 + rng() * 0.55);
            const vertical = cfg.verticalAmplitude * (0.4 + rng() * 0.6);
            // Drawn unconditionally: a branch that skips an rng() call would shift every later
            // firefly's layout, so the same seed would stop meaning the same field.
            const bobRatio = 1.2 + rng() * 0.8;
            const m = i * 4;
            motion.array[m] = wander;
            // Rate from speed and radius, not the other way round: it is the speed a viewer reads,
            // and it keeps a firefly confined to a small patch jittery and a wide-ranging one slow.
            motion.array[m + 1] = speed / Math.max(wander, 1e-4);
            motion.array[m + 2] = vertical;
            // The bob runs a little faster than the drift, which is what keeps a firefly from
            // tracing one smooth arc. Zero amplitude parks the rate at zero rather than letting
            // the division blow it up into a pointless high-frequency sine of nothing.
            motion.array[m + 3] = vertical > 1e-4 ? (speed * bobRatio) / vertical : 0;

            phase.array[m] = rng() * Math.PI * 2;
            phase.array[m + 1] = rng() * Math.PI * 2;
            phase.array[m + 2] = rng() * Math.PI * 2;
            phase.array[m + 3] = rng() * Math.PI * 2;

            look.array[m] = cfg.minSize + (cfg.maxSize - cfg.minSize) * rng();
            look.array[m + 1] = 0.55 + rng() * 0.45;
            look.array[m + 2] = cfg.pulseSpeed * (0.6 + rng() * 0.8);
            look.array[m + 3] = rng() * Math.PI * 2;

            this.pickColor(rng, cfg.colors);
            color.array[o] = this.scratch.r;
            color.array[o + 1] = this.scratch.g;
            color.array[o + 2] = this.scratch.b;
        }

        geo.instanceCount = count;
        this.baked = this.bakedSignature();
        // Written once and never again: this is the only upload the field ever does.
        for (const attr of [origin, motion, phase, look, color]) flushPrefix(attr.attribute, count);
        return geo;
    }

    /** Takes one palette entry whole, so a three-colour palette stays three readable colours. */
    private pickColor(rng: Rng, colors: string[]): void {
        const hex = colors[Math.min(colors.length - 1, Math.floor(rng() * colors.length))];
        this.scratch.copy(resolveColor(hex));
    }
}
