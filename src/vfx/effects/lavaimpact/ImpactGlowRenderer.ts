/**
 * Flat glowing patches lying on the lava surface — one draw call for the flash and every residual
 * glow on screen.
 *
 * Like the core `RingRenderer` this one does not billboard: a glow on a surface is a decal, so the
 * quad is laid into the XZ plane and stays there. Each instance carries a centre, a radius, a
 * brightness and a colour; the falloff is evaluated analytically in the fragment shader, which
 * keeps the gradient smooth whether the patch is 10cm or 3m across — a texture would go soft and
 * banded the moment the patch outgrew its own resolution, and this effect is meant to run on a
 * phone with no texture budget to spend.
 *
 * The outline is pushed off a perfect circle by two angular harmonics. A clean disc of light reads
 * as a decal or as UI; the irregularity is cheap and it is most of what makes the patch look like
 * molten rock rather than a spotlight.
 *
 * Additive, because this is light added to a surface that is already lit — a glow has to be able
 * to brighten the lava under it, and it must never darken it.
 */

import {
    AdditiveBlending,
    DoubleSide,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    ShaderMaterial,
} from "three";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";

export interface ImpactGlowRendererOptions {
    capacity: number;
    /** Multiplies every patch's brightness — the per-system master intensity. */
    opacity?: number;
    /** 0–1 irregularity of the outline. */
    edgeVariation?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aCenter;
// x = radius, y = brightness, z = core sharpness, w = outline phase
attribute vec4 aGlow;
attribute vec3 aColor;

varying vec2 vOffset;
varying vec4 vGlow;
varying vec3 vColor;

void main() {
    vGlow = aGlow;
    vColor = aColor;

    // Headroom for the outline wobble, which can push the patch past its nominal radius.
    float extent = aGlow.x * 1.35;

    // The unit quad is authored in XY; lay it flat into XZ here. DoubleSide below means the
    // handedness of that mapping cannot silently cull the whole effect.
    vOffset = position.xy * 2.0 * extent;
    vec3 local = aCenter + vec3(vOffset.x, 0.0, vOffset.y);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uEdge;

varying vec2 vOffset;
varying vec4 vGlow;
varying vec3 vColor;

void main() {
    float radius = max(vGlow.x, 1e-4);
    float phase = vGlow.w;

    float len = length(vOffset);
    // atan(0, 0) is undefined; the very centre texel would otherwise come back NaN.
    float ang = len > 1e-5 ? atan(vOffset.y, vOffset.x) : 0.0;

    // Two low harmonics, the same trick the ripple crest uses: enough to break the circle, not
    // enough to make the patch read as broken.
    float wob = sin(ang * 3.0 + phase) * 0.6 + sin(ang * 5.0 - phase * 1.7) * 0.4;
    float r = (len / radius) / (1.0 + uEdge * 0.24 * wob);
    if (r > 1.0) discard;

    // A wide halo plus a tight core. The two-stop falloff is what makes the patch read as glowing
    // rather than as a flat disc once several of them overlap.
    float halo = pow(1.0 - r, 2.2);
    float core = exp(-r * r * max(vGlow.z, 0.5));

    float a = (halo * 0.7 + core) * vGlow.y * uOpacity;
    if (a <= 0.003) discard;

    // The centre is hotter than the rim: pushing the core toward white is what keeps a bright
    // flash from reading as a solid orange coin.
    vec3 color = mix(vColor, vColor * 1.6 + vec3(0.35), clamp(core, 0.0, 1.0));

    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
}
`;

export class ImpactGlowRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aCenter: Float32Array;
    readonly aGlow: Float32Array;
    readonly aColor: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];

    constructor(opts: ImpactGlowRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const center = addInstancedAttribute(geo, "aCenter", this.capacity, 3);
        const glow = addInstancedAttribute(geo, "aGlow", this.capacity, 4);
        const color = addInstancedAttribute(geo, "aColor", this.capacity, 3);

        this.aCenter = center.array;
        this.aGlow = glow.array;
        this.aColor = color.array;
        this.attrs = [center.attribute, glow.attribute, color.attribute];

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uOpacity: { value: opts.opacity ?? 1 },
                uEdge: { value: opts.edgeVariation ?? 0.7 },
            },
            transparent: true,
            // Patches lie almost coplanar with the surface they sit on and overlap each other;
            // writing depth would make them fight the surface and each other both.
            depthWrite: false,
            depthTest: true,
            // The XY→XZ mapping above is a winding trap. Rendering both faces removes the trap
            // instead of relying on getting it right, and a flat patch has no back to hide.
            side: DoubleSide,
            blending: AdditiveBlending,
            fog: false,
        });

        this.mesh = new Mesh(geo, this.material);
        // Instances move entirely inside attributes, so the geometry's bounds are always stale.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
    }

    get opacity(): number {
        return this.material.uniforms.uOpacity.value as number;
    }

    set opacity(v: number) {
        this.material.uniforms.uOpacity.value = v;
    }

    get edgeVariation(): number {
        return this.material.uniforms.uEdge.value as number;
    }

    set edgeVariation(v: number) {
        this.material.uniforms.uEdge.value = v;
    }

    setCenterAt(i: number, x: number, y: number, z: number): void {
        const o = i * 3;
        this.aCenter[o] = x;
        this.aCenter[o + 1] = y;
        this.aCenter[o + 2] = z;
    }

    setGlowAt(i: number, radius: number, brightness: number, coreSharpness: number, phase: number): void {
        const o = i * 4;
        this.aGlow[o] = radius;
        this.aGlow[o + 1] = brightness;
        this.aGlow[o + 2] = coreSharpness;
        this.aGlow[o + 3] = phase;
    }

    /** Publishes `count` live patches to the GPU. */
    commit(count: number): void {
        const n = Math.min(count, this.capacity);
        this.geometry.instanceCount = n;
        for (const attr of this.attrs) flushPrefix(attr, n);
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}
