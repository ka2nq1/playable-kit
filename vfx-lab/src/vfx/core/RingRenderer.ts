/**
 * Flat expanding rings lying on a horizontal surface — one draw call for every ripple on screen.
 *
 * Unlike the particle renderers this one does not billboard: a ripple is a decal on the water, so
 * the quad is laid into the XZ plane and stays there. Each instance carries only a centre, a
 * radius and a width; the ring itself is evaluated analytically in the fragment shader, which
 * keeps the crest exactly one width thick whether it is 5cm or 5m across — a texture would go
 * soft the moment the ring outgrew its own resolution.
 *
 * The profile is deliberately asymmetric and carries a dark trough ahead of the bright crest.
 * That contrast is what makes the ring read as displaced water rather than as a painted circle,
 * and it is also why the material alpha-blends instead of adding: a trough has to be able to
 * darken what is behind it.
 */

import {
    Color,
    DoubleSide,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    NormalBlending,
    ShaderMaterial,
} from "three";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "./instancing";

export interface RingRendererOptions {
    capacity: number;
    /** Colour the water is pushed toward in the trough. Keep it near the water's own dark value. */
    trough?: Color;
    /** Multiplies every ring's alpha — the per-system master opacity. */
    opacity?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aCenter;
// x = crest radius, y = crest width, z = alpha, w = wobble amount
attribute vec4 aRing;
attribute vec3 aColor;
attribute float aPhase;

varying vec2 vOffset;
varying vec4 vRing;
varying vec3 vColor;
varying float vPhase;

void main() {
    vRing = aRing;
    vColor = aColor;
    vPhase = aPhase;

    // Half-extent of the quad: the crest, the distance the wobble can push it out, and the tail
    // of the trough beyond it. Too tight and the ring is clipped by its own quad; too loose and
    // the system pays fill rate for transparent pixels.
    float extent = aRing.x * (1.0 + aRing.w) + aRing.y * 2.5;

    // The unit quad is authored in XY; lay it flat into XZ here. DoubleSide below means the
    // handedness of that mapping cannot silently cull the whole effect.
    vOffset = position.xy * 2.0 * extent;
    vec3 local = aCenter + vec3(vOffset.x, 0.0, vOffset.y);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTrough;
uniform float uOpacity;

varying vec2 vOffset;
varying vec4 vRing;
varying vec3 vColor;
varying float vPhase;

void main() {
    float radius = vRing.x;
    float width = max(vRing.y, 1e-4);

    float r = length(vOffset);
    // atan(0, 0) is undefined; the very centre texel would otherwise come back NaN.
    float ang = r > 1e-5 ? atan(vOffset.y, vOffset.x) : 0.0;

    // A mathematically perfect circle reads as UI. Two low harmonics push the crest in and out by
    // a few percent, which is all it takes to look like water without looking broken.
    float wob = sin(ang * 3.0 + vPhase) * 0.6 + sin(ang * 5.0 - vPhase * 1.7) * 0.4;
    radius *= 1.0 + vRing.w * wob;

    float x = (r - radius) / width;

    // Asymmetric gaussian: tight on the leading edge, trailing off behind the crest the way a real
    // wave does. exp() rather than smoothstep so there is no hard edge left to alias.
    float crest = exp(-x * x * (x > 0.0 ? 9.0 : 2.2));
    // A second, weaker ring behind the first. One ring is a decal; two are a wave train.
    float trail = 0.30 * exp(-(x + 2.3) * (x + 2.3) * 1.6);
    // The trough sits just ahead of the crest and darkens instead of brightening.
    float trough = 0.35 * exp(-(x - 1.15) * (x - 1.15) * 5.0);

    float lit = crest + trail;
    float a = (lit + trough) * vRing.z * uOpacity;
    if (a <= 0.003) discard;

    vec3 color = mix(uTrough, vColor * (0.72 + 0.5 * crest), lit / max(lit + trough, 1e-4));
    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
}
`;

export class RingRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aCenter: Float32Array;
    readonly aRing: Float32Array;
    readonly aColor: Float32Array;
    readonly aPhase: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];
    private readonly trough = new Color(0x02100d);

    constructor(opts: RingRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const center = addInstancedAttribute(geo, "aCenter", this.capacity, 3);
        const ring = addInstancedAttribute(geo, "aRing", this.capacity, 4);
        const color = addInstancedAttribute(geo, "aColor", this.capacity, 3);
        const phase = addInstancedAttribute(geo, "aPhase", this.capacity, 1);

        this.aCenter = center.array;
        this.aRing = ring.array;
        this.aColor = color.array;
        this.aPhase = phase.array;
        this.attrs = [center.attribute, ring.attribute, color.attribute, phase.attribute];

        if (opts.trough) this.trough.copy(opts.trough);
        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uTrough: { value: this.trough },
                uOpacity: { value: opts.opacity ?? 1 },
            },
            transparent: true,
            // Rings overlap constantly and lie almost coplanar with the surface they sit on;
            // writing depth would make them fight each other and the water both.
            depthWrite: false,
            depthTest: true,
            // The XY→XZ mapping above is a winding trap. Rendering both faces removes the trap
            // instead of relying on getting it right, and a flat ring has no back to hide.
            side: DoubleSide,
            blending: NormalBlending,
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

    /** Copies `color` in; the renderer never holds a reference the caller could mutate. */
    setTrough(color: Color): void {
        this.trough.copy(color);
    }

    setCenterAt(i: number, x: number, y: number, z: number): void {
        const o = i * 3;
        this.aCenter[o] = x;
        this.aCenter[o + 1] = y;
        this.aCenter[o + 2] = z;
    }

    setRingAt(i: number, radius: number, width: number, alpha: number, wobble: number): void {
        const o = i * 4;
        this.aRing[o] = radius;
        this.aRing[o + 1] = width;
        this.aRing[o + 2] = alpha;
        this.aRing[o + 3] = wobble;
    }

    /** Publishes `count` live rings to the GPU. */
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
