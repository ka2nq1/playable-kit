/**
 * Heat distortion: the air above a hot surface, refracting whatever is behind it.
 *
 * One quad, one draw call, and — in `high` — one framebuffer copy shared with every other heat
 * source in the scene. There is no post-processing pipeline here and this effect does not add
 * one.
 *
 * The three decisions that make it work:
 *
 *  1. **The background comes from a grab, not from a second render.** The mesh's own
 *     `onBeforeRender` fires with the framebuffer already holding the opaque scene, so a single
 *     `copyTexSubImage2D` is both the background and a guarantee the effect cannot sample itself.
 *     That copy lives in {@link SceneColorCapture}, is reference counted per renderer, and
 *     happens at most once per frame however many heat sources ask for it. Cost: one full-viewport
 *     blit per frame, no extra scene pass, no render target allocated per source.
 *  2. **The volume is a billboard, not a box.** A width × depth × height region of hot air is
 *     drawn as one camera-facing quad whose width is the *projected* footprint,
 *     `|w·cos a| + |d·sin a|`, so a 3 × 1 vent is wide seen from the front and narrow from the
 *     end, with no per-frame geometry and no second plane of overdraw. Nothing about the quad is
 *     visible: the sides fade out, the top fades out, and a noise term breaks the silhouette.
 *  3. **Alpha is the fade, displacement is the look.** The fragment writes the *refracted sample*
 *     with the volume mask as alpha, so the boundary is a crossfade between the distorted and the
 *     undistorted background — which is why there are no seams to hide, and why the effect is
 *     exactly invisible over an empty background: displacing a flat colour returns that colour.
 *
 * The noise field is anchored in **world space**, so orbiting the camera samples a different slice
 * of a field that is standing still. Nothing slides with the camera, and the screen UV is taken
 * from the interpolated clip position, so sampling stays correct at any viewport and pixel ratio.
 *
 *     const heat = new HeatDistortionVfx(config);
 *     heat.object3d.position.set(0, 0, 0);    // the hot surface itself
 *     scene.add(heat.object3d);
 *
 *     heat.update(delta);          // from the loop you already have
 *     heat.enabled = false;        // off, without tearing anything down
 *     heat.dispose();              // on teardown
 *
 * `low` is the mobile fallback: it samples nothing at all — no grab, no capture retained — and
 * draws the same noise field as thin additive filaments of light. It is an approximation of hot
 * air, not refraction, and it is labelled that way everywhere it appears.
 *
 * Cost per pixel in `high`: four value-noise lookups (32 hashes) and one texture sample. In `low`:
 * two lookups and no sample.
 */

import {
    Color,
    DoubleSide,
    Group,
    Mesh,
    NormalBlending,
    AdditiveBlending,
    PlaneGeometry,
    ShaderMaterial,
    Vector2,
    Vector3,
    type Camera,
    type PerspectiveCamera,
    type WebGLRenderer,
} from "three";
import { resolveColor } from "../../core/colorCache";
import { retainSceneColor, type SceneColorCapture } from "../../core/SceneColorCapture";
import type { BurstOptions, VfxEffect } from "../../core/VfxEffect";
import { normalizeHeatDistortionConfig, type HeatDistortionConfig } from "./config";

const VERTEX = /* glsl */ `
varying vec2 vQuad;
varying vec3 vWorld;
varying vec4 vClip;

void main() {
    vQuad = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // Kept as a varying rather than recovered from gl_FragCoord: this is the one value that makes
    // the screen-space sample follow the camera instead of sliding under it.
    vClip = projectionMatrix * viewMatrix * world;
    gl_Position = vClip;
}
`;

const FRAGMENT = /* glsl */ `
#ifdef HEAT_REFRACT
uniform sampler2D uScene;
#endif
uniform float uTime;
uniform float uIntensity;
uniform float uOpacity;
uniform float uFade;
uniform float uEdgeSoftness;
uniform float uVerticalFalloff;
uniform float uStrength;
uniform float uNoiseScale;
uniform float uDetailScale;
uniform float uTurbulence;
uniform vec2 uAxis;
uniform float uRise;
uniform float uDrift;
uniform float uFlowVar;
uniform float uPulsation;
uniform float uScreenScale;
uniform float uAspect;
uniform vec3 uTint;

varying vec2 vQuad;
varying vec3 vWorld;
varying vec4 vClip;

/**
 * Hash without sin.
 *
 * The usual fract(sin(dot(p, k)) * 43758.5 hash is fine on desktop and bands visibly on mobile
 * GPUs, whose sin loses precision long before the multiply does. This one is pure multiply and
 * fract, so it looks the same everywhere — which matters for an effect whose whole job is to be
 * irregular.
 */
float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

/** Value noise, not simplex: there is no structure here for a lattice to give away. */
float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x00 = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
    float x10 = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
    float x01 = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
    float x11 = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

void main() {
    // Beyond maxDistance the quad still reaches the rasteriser, but nothing past this line runs.
    if (uFade <= 0.0) discard;

    float h = vQuad.y;                          // 0 at the source, 1 at the top of the volume
    float ex = abs(vQuad.x - 0.5) * 2.0;        // 0 at the middle, 1 at the sides

    // Written as 1 - smoothstep rather than with the edges reversed: smoothstep(a, b, x) is
    // undefined when a >= b, and edgeSoftness of 1 would put them on top of each other.
    float edge = 1.0 - smoothstep(1.0 - uEdgeSoftness, 1.0, ex);
    // Two different vertical profiles, because they have two different jobs. vert is how much
    // the air bends light — up fast off the surface, then away with height. cover is how much
    // of the pixel this volume owns, and it holds a plateau through the body so the middle of the
    // column is a real refraction rather than a half-strength ghost of one.
    float vert = smoothstep(0.0, 0.16, h) * pow(max(1.0 - h, 0.0), uVerticalFalloff);
    float cover = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.70, 1.0, h));

    // Hot air accelerates as it climbs, so the field scrolls faster at the top than at the
    // bottom. That shear is also what stops any two heights ever coming round together.
    float climb = uTime * uRise * (0.7 + 0.6 * h);
    // The lateral wander is fed into the noise *domain*, never added to the output: a sine added
    // to a displacement is a visible wave, a sine shearing a noise field is convection.
    vec2 wander = uFlowVar * vec2(sin(uTime * 0.23 + vWorld.y * 0.70), cos(uTime * 0.17 + vWorld.y * 0.51));

    vec3 p = vWorld * uNoiseScale;
    p.y -= climb * uNoiseScale;
    p.xz += (wander * 0.55 + uTime * uDrift * vec2(0.8, -0.6)) * uNoiseScale;

    // The two layers are independent domains, not one domain at two frequencies, so the detail
    // cannot lock to the broad cells and produce a repeat.
    vec2 broad = vec2(vnoise(p), vnoise(p + 19.73)) - 0.5;
#ifdef HEAT_DETAIL
    vec3 q = vWorld * uDetailScale;
    q.y -= climb * 1.7 * uDetailScale;
    q.xz += (wander * 0.30 + uTime * uDrift * vec2(-0.5, 0.9)) * uDetailScale;
    vec2 disp = broad + (vec2(vnoise(q + 5.17), vnoise(q + 31.31)) - 0.5) * uTurbulence;
#else
    vec2 disp = broad;
#endif

    // The silhouette borrows the broad layer, so what fades out at the boundary is a column of
    // rising air and not the rectangle the quad actually is.
    float plume = clamp(0.45 + 1.10 * (broad.y + 0.5), 0.0, 1.0);

    // Two incommensurate rates offset by position: a swell that never lands on a beat.
    float pulse = 1.0 + uPulsation * 0.5 * (sin(uTime * 0.83 + vWorld.y * 0.9) + sin(uTime * 1.27 + vWorld.x * 0.6));

    // uScreenScale is the volume's own height as a fraction of the viewport's, so displacement is
    // measured against the effect rather than against the screen: the same heat distorts the same
    // amount *of itself* whether it is two metres away or twenty.
    float amp = uStrength * uIntensity * uFade * vert * edge * pulse * uScreenScale;
    float alpha = clamp(cover * edge * plume * uOpacity * uFade, 0.0, 1.0);

#ifdef HEAT_REFRACT
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    // uv.x is a fraction of width and uv.y a fraction of height; without the aspect divide a
    // landscape viewport shears every offset sideways.
    vec2 offset = vec2(disp.x * uAxis.x / uAspect, disp.y * uAxis.y) * amp;
    vec4 grabbed = texture2D(uScene, clamp(suv + offset, 0.0, 1.0));
    // The grab is a copy of the output framebuffer, so it is already encoded. Decode here and let
    // colorspace_fragment put it back, or the output transform lands on it twice.
    gl_FragColor = vec4(sRGBTransferEOTF(grabbed).rgb, alpha);
#else
    // Nothing is sampled. The same field is shown as thin filaments of extra light — the one cue
    // of hot air that needs no background and does not read as smoke. This is not refraction.
    float band = smoothstep(0.16, 0.46, abs(disp.x) + abs(disp.y));
    gl_FragColor = vec4(uTint, alpha * band * uIntensity);
#endif
    #include <colorspace_fragment>
}
`;

const DEG2RAD = Math.PI / 180;

export class HeatDistortionVfx implements VfxEffect {
    readonly id = "heatdistortion";
    readonly object3d: Group;

    readonly config: HeatDistortionConfig;

    private readonly geometry: PlaneGeometry;
    private readonly mesh: Mesh;
    private shaderMaterial: ShaderMaterial;

    /** Shared framebuffer grab, held only while `qualityMode` is `high`. */
    private capture: SceneColorCapture | null = null;
    private captureOwner: WebGLRenderer | null = null;

    private running = true;
    private elapsed = 0;

    // Per-frame scratch: the billboard is recomputed every frame and must not allocate.
    private readonly camPos = new Vector3();
    private readonly center = new Vector3();
    private readonly viewport = new Vector2();

    constructor(rawConfig?: unknown) {
        const { config, issues } = normalizeHeatDistortionConfig(rawConfig);
        issues.report("HeatDistortionVfx");
        this.config = config;

        // A unit quad, built once. Every dimension is a mesh scale, so dragging `width` is one
        // matrix write rather than a new geometry — and the shape is entirely in the shader.
        this.geometry = new PlaneGeometry(1, 1, 1, 1);
        this.geometry.computeBoundingSphere();
        // The billboard's width is decided in onBeforeRender, which runs *after* culling, so the
        // sphere culling tested is always one frame stale. The margin covers the widest the quad
        // can get between two frames; without it a volume can pop at the edge of the screen.
        if (this.geometry.boundingSphere) this.geometry.boundingSphere.radius *= 1.4;

        this.shaderMaterial = this.buildMaterial();

        this.mesh = new Mesh(this.geometry, this.shaderMaterial);
        this.mesh.matrixAutoUpdate = false;
        this.mesh.visible = config.enabled;
        // Everything the effect needs from the host arrives here: the renderer to grab from and
        // the camera to face. No camera has to be plumbed through `update`, which is what keeps
        // this droppable into a game loop that only knows how to hand out a delta.
        this.mesh.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);

        this.object3d = new Group();
        this.object3d.name = "vfx:heatdistortion";
        this.object3d.add(this.mesh);

        this.applyConfig();
    }

    /** The material, for dropping this onto geometry of your own. Expects a camera-facing quad. */
    get material(): ShaderMaterial {
        return this.shaderMaterial;
    }

    get enabled(): boolean {
        return this.mesh.visible;
    }

    set enabled(v: boolean) {
        this.config.enabled = v;
        this.mesh.visible = v;
        // A hidden effect never reaches onBeforeRender, so it stops asking for the grab on its
        // own — but it must also let go of it, or a source nobody is drawing keeps a
        // full-viewport texture alive for as long as it stays switched off.
        if (!v) this.releaseCapture();
    }

    /** No particles. One quad, one draw call — that is the whole budget. */
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

    /** Freezes the field where it is. It stays visible — `enabled = false` is what hides it. */
    stop(): void {
        this.running = false;
    }

    /** `VfxEffect` compliance. Hot air has nothing to burst; move the source instead. */
    burst(_position?: Vector3 | null, _options?: BurstOptions): void {}

    update(dt: number): void {
        if (!this.running || !this.mesh.visible || dt <= 0) return;
        // No clamp on dt: time only reaches noise lookups and two sines, so the huge delta a
        // backgrounded tab returns with lands somewhere else in the field and never anywhere odd.
        this.elapsed += dt * this.config.animationSpeed;
        this.shaderMaterial.uniforms.uTime.value = this.elapsed;
    }

    /**
     * Re-reads the config after an edit. Every knob is a uniform except `qualityMode`, which
     * picks between two shaders and therefore rebuilds the material — so switching quality costs
     * one compile and dragging anything else costs nothing.
     */
    applyConfig(): void {
        const c = this.config;
        const wantRefract = c.qualityMode === "high";
        if (wantRefract !== (this.shaderMaterial.defines?.HEAT_REFRACT !== undefined)) {
            const next = this.buildMaterial();
            next.uniforms.uTime.value = this.elapsed;
            this.shaderMaterial.dispose();
            this.shaderMaterial = next;
            this.mesh.material = next;
            // `low` samples nothing, so it must not keep the capture alive for the whole scene.
            if (!wantRefract) this.releaseCapture();
        }

        const u = this.shaderMaterial.uniforms;
        u.uIntensity.value = c.intensity;
        u.uOpacity.value = c.opacity;
        u.uEdgeSoftness.value = c.edgeSoftness;
        u.uVerticalFalloff.value = c.verticalFalloff;
        u.uStrength.value = c.distortionStrength;
        u.uNoiseScale.value = c.noiseScale;
        u.uDetailScale.value = c.detailNoiseScale;
        u.uTurbulence.value = c.turbulence;
        (u.uAxis.value as Vector2).set(c.horizontalDistortion, c.verticalDistortion);
        u.uRise.value = c.riseSpeed;
        u.uDrift.value = c.driftSpeed;
        u.uFlowVar.value = c.flowVariation;
        u.uPulsation.value = c.pulsation;
        (u.uTint.value as Color).copy(resolveColor(c.shimmerColor));

        // The quad spans the volume: full height, and a width that onBeforeRender replaces with
        // the projected footprint. Setting it here too keeps the first frame right.
        this.mesh.position.set(0, c.heightOffset + c.height * 0.5, 0);
        this.mesh.scale.set(Math.max(c.width, c.depth), c.height, 1);
        this.mesh.updateMatrix();
        this.mesh.visible = c.enabled;
        if (!c.enabled) this.releaseCapture();
    }

    /** Puts the field back to the start. Every term is continuous in time, so nothing pops. */
    reset(): void {
        this.elapsed = 0;
        this.shaderMaterial.uniforms.uTime.value = 0;
        this.applyConfig();
    }

    dispose(): void {
        this.releaseCapture();
        this.mesh.onBeforeRender = () => {};
        this.object3d.removeFromParent();
        this.object3d.clear();
        this.geometry.dispose();
        this.shaderMaterial.dispose();
    }

    /**
     * Everything that depends on where the camera is: orientation, projected width, the screen
     * scale the displacement is measured in, the distance fade — and the grab itself.
     *
     * This runs after frustum culling, which is deliberate: a heat source nobody can see costs
     * nothing and, more importantly, never asks for the framebuffer copy.
     */
    private prepare(renderer: WebGLRenderer, camera: Camera): void {
        const c = this.config;
        const u = this.shaderMaterial.uniforms;

        this.camPos.setFromMatrixPosition(camera.matrixWorld);
        this.center.setFromMatrixPosition(this.mesh.matrixWorld);

        const dist = Math.max(1e-3, this.camPos.distanceTo(this.center));
        // 0 means "no limit"; otherwise fade out over `fadeDistance` and stop drawing past it.
        let fade = 1;
        if (c.maxDistance > 0) {
            const start = Math.max(0, c.maxDistance - Math.max(1e-3, c.fadeDistance));
            fade = 1 - smoothstep(start, c.maxDistance, dist);
        }
        u.uFade.value = fade;
        if (fade <= 0) return;

        // Yaw the quad to face the camera about Y only. A full lookAt would roll the volume when
        // the camera pitches, and "up" is the one direction this effect is not allowed to lose.
        const dx = this.camPos.x - this.center.x;
        const dz = this.camPos.z - this.center.z;
        const yaw = Math.atan2(dx, dz);
        // The projected footprint of a width × depth box seen from `yaw`. A long, narrow vent is
        // then wide from the front and narrow from the end, out of one quad and no extra geometry.
        const a = yaw - c.rotation * DEG2RAD;
        const projected = Math.abs(c.width * Math.cos(a)) + Math.abs(c.depth * Math.sin(a));

        this.mesh.rotation.y = yaw;
        this.mesh.scale.set(projected, c.height, 1);
        this.mesh.updateMatrix();
        // The renderer has already walked the graph, so the world matrix is ours to refresh.
        // `modelViewMatrix` is derived from it immediately after this call returns.
        this.mesh.matrixWorld.multiplyMatrices(this.object3d.matrixWorld, this.mesh.matrix);

        const persp = camera as PerspectiveCamera;
        const halfFov = persp.isPerspectiveCamera ? persp.fov * 0.5 * DEG2RAD : 0.4;
        const viewHeight = 2 * dist * Math.tan(halfFov);
        u.uScreenScale.value = clamp(c.height / Math.max(1e-3, viewHeight), 0.01, 2);

        renderer.getDrawingBufferSize(this.viewport);
        u.uAspect.value = this.viewport.y > 0 ? this.viewport.x / this.viewport.y : 1;

        if (c.qualityMode === "high") {
            if (this.capture === null || this.captureOwner !== renderer) {
                this.releaseCapture();
                this.capture = retainSceneColor(renderer);
                this.captureOwner = renderer;
            }
            // Returns the same texture to every heat source in the frame; only the first copies.
            u.uScene.value = this.capture.capture(renderer);
        }
    }

    private buildMaterial(): ShaderMaterial {
        const refract = this.config.qualityMode === "high";
        return new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            // The second noise layer is compiled out of the cheap mode rather than branched past,
            // so `low` really is half the lookups and not half of them plus a branch.
            defines: refract ? { HEAT_REFRACT: "", HEAT_DETAIL: "" } : {},
            uniforms: {
                uScene: { value: null },
                uTime: { value: 0 },
                uIntensity: { value: 1 },
                uOpacity: { value: 1 },
                uFade: { value: 1 },
                uEdgeSoftness: { value: 0.5 },
                uVerticalFalloff: { value: 1.5 },
                uStrength: { value: 0.06 },
                uNoiseScale: { value: 1.8 },
                uDetailScale: { value: 5.5 },
                uTurbulence: { value: 0.45 },
                uAxis: { value: new Vector2(1, 0.75) },
                uRise: { value: 0.9 },
                uDrift: { value: 0.16 },
                uFlowVar: { value: 0.5 },
                uPulsation: { value: 0.3 },
                uScreenScale: { value: 0.3 },
                uAspect: { value: 1 },
                uTint: { value: new Color(1, 1, 1) },
            },
            transparent: true,
            // `high` crossfades a refracted copy of the background over the background, so it has
            // to be a normal blend. `low` only ever adds light, which is the one way to suggest
            // hot air without laying a translucent sheet of colour over the scene.
            blending: refract ? NormalBlending : AdditiveBlending,
            // Depth test on, so geometry in front of the volume is not distorted through it;
            // depth write off, so the volume never occludes what is behind it.
            depthWrite: false,
            // The quad always faces the camera, but a host that reparents it under something
            // mirrored would otherwise lose the whole effect to back-face culling, silently.
            side: DoubleSide,
            // Not optional. A transparent DoubleSide material is drawn *twice* by three, back
            // faces then front — which here means the refraction blends over itself at double
            // strength and the most expensive shader in the package runs for every pixel twice.
            forceSinglePass: true,
            fog: false,
        });
    }

    private releaseCapture(): void {
        if (this.capture === null) return;
        this.capture.release();
        this.capture = null;
        this.captureOwner = null;
        // Never leave the material pointing at a texture that may have just been freed.
        this.shaderMaterial.uniforms.uScene.value = null;
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/** GLSL's smoothstep, on the CPU, for the distance fade. */
function smoothstep(edge0: number, edge1: number, x: number): number {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}
