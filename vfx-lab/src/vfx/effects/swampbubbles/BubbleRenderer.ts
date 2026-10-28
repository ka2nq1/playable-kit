/**
 * Translucent bubble domes standing on a water plane — one draw call for every bubble on screen.
 *
 * The dome is a camera-facing quad shaded as a sphere: the normal is reconstructed analytically
 * from the quad's own uv, so there is no geometry to tessellate, no texture to load and no normal
 * map. At the sizes these bubbles occupy on screen — a few dozen pixels at playable framing — a
 * shaded disc and a real half-sphere are indistinguishable, and the disc costs one quad.
 *
 * Two things make it read as water rather than as a ball:
 *
 *  - **The waterline is cut in the shader.** A billboarded sprite cannot be clipped on the CPU, so
 *    the fragment shader works out the real height of each point of the sphere above the water —
 *    the surface normal it already reconstructed, measured against the effect's own up axis — and
 *    discards everything below it. Doing it in world height rather than as a horizontal line
 *    across the sprite is what keeps the cut correct as the camera orbits or tips overhead, and it
 *    gives the dark meniscus at the contact line for free, which is what sits the bubble *in* the
 *    surface instead of on top of it.
 *  - **Thickness, not opacity.** Alpha comes from how much film the view passes through, which is
 *    near zero down the middle of the dome and high at the silhouette. That single term gives the
 *    dark rim, the transparent centre and the refraction-like darkening for free.
 *
 * Alpha blending, not additive: a swamp bubble is a dark lens over dark water, and it has to be
 * able to darken what is behind it.
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
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "../../core/instancing";

export interface BubbleRendererOptions {
    capacity: number;
    /** Height of the water plane in the mesh's own local space. */
    surfaceY?: number;
    /** Multiplies every dome's alpha — the per-system master opacity. */
    opacity?: number;
    /** Strength of the specular highlight and the broad sheen. */
    highlight?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aPos;
// x = radius, y = alpha, z = pop progress 0→1, w = highlight jitter in [-1, 1]
attribute vec4 aShape;
attribute vec3 aColor;

uniform float uSurfaceY;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vPop;
varying float vHeight;
varying vec3 vUp;
varying vec3 vKey;

// One fixed key light in the effect's own space — above, and off to one side. A bubble this small
// cannot afford a light of its own, and a highlight defined in view space would swim across every
// dome in the scene the moment the camera orbited.
const vec3 KEY = vec3(-0.4719, 0.8181, 0.3303);

void main() {
    vUv = uv;
    vColor = aColor;
    vAlpha = aShape.y;
    vPop = aShape.z;

    float radius = max(aShape.x, 1e-5);

    // How high the dome's centre floats above the water, measured in its own radii. Paired with
    // vUp below it is everything the fragment shader needs to find the waterline on the sphere.
    vHeight = (aPos.y - uSurfaceY) / radius;
    // The effect's own up axis, in view space. The normals the fragment shader reconstructs live
    // in view space too, so this is the one conversion needed to ask how high a point on the
    // sphere actually is — and it survives the whole object being rotated by the host scene.
    vUp = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);

    // Swing the key a few degrees around the up axis per bubble. One shared highlight position
    // across a dozen domes reads as the same sprite stamped repeatedly; this is small enough that
    // it still reads as a single light.
    float ja = aShape.w * 0.5;
    float jc = cos(ja);
    float js = sin(ja);
    vec3 key = vec3(KEY.x * jc + KEY.z * js, KEY.y, KEY.z * jc - KEY.x * js);
    vKey = normalize((modelViewMatrix * vec4(key, 0.0)).xyz);

    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    // The unit quad spans [-0.5, 0.5], so this puts the sphere's silhouette exactly on its border.
    mv.xy += position.xy * (radius * 2.0);
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uHighlight;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vPop;
varying float vHeight;
varying vec3 vUp;
varying vec3 vKey;

void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r2 = dot(d, d);
    if (r2 > 1.0) discard;

    float z = sqrt(max(0.0, 1.0 - r2));
    vec3 n = vec3(d, z);

    // Height of this point of the sphere above the water, in radii. Below zero the dome is under
    // the surface and does not exist; the soft edge is the wet line itself.
    float h = dot(n, vUp) + vHeight;
    float above = smoothstep(-0.02, 0.06, h);
    if (above <= 0.002) discard;

    // Path length through the film: near zero down the middle, long at the silhouette. This is
    // the whole lighting model — the dark rim, the see-through centre and the murky refraction
    // all fall out of it, so there is nothing else to keep in sync.
    float film = pow(1.0 - z, 2.1);

    // The rupture opens from the top of the dome and runs out to the rim, rather than the whole
    // sphere fading at once: a film tears, it does not dissolve.
    float hole = vPop * 1.6 - 0.12;
    float intact = smoothstep(hole - 0.3, hole, sqrt(r2));

    float ndl = max(dot(n, vKey), 0.0);
    // Tight hot spot plus a wide sheen. The spot alone vanishes whenever it falls off the dome's
    // visible cap, and a bubble with no highlight at all stops reading as wet.
    float spec = pow(ndl, 42.0) * (1.0 - vPop);
    float sheen = pow(ndl, 3.0) * 0.14;

    // Water seen through the dome is darker and greener than the water beside it, and more so
    // where the film is thick — a refraction stand-in that costs one mix.
    vec3 color = vColor * (0.3 + 0.8 * film) + vec3(spec * 0.9 + sheen) * uHighlight;

    // The meniscus: the water climbs the dome, so the contact line is the darkest part of the
    // silhouette and the one thing that keeps a bubble from looking pasted on.
    float wet = 1.0 - smoothstep(0.0, 0.28, h);
    color = mix(color, vColor * 0.18, wet * 0.65);

    float a = (0.06 + film * 0.9 + spec * uHighlight) * vAlpha * uOpacity * above * intact;
    a = max(a, wet * above * intact * 0.22 * vAlpha * uOpacity);
    if (a <= 0.003) discard;

    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
}
`;

export class BubbleRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aPos: Float32Array;
    readonly aShape: Float32Array;
    readonly aColor: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];

    constructor(opts: BubbleRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const pos = addInstancedAttribute(geo, "aPos", this.capacity, 3);
        const shape = addInstancedAttribute(geo, "aShape", this.capacity, 4);
        const color = addInstancedAttribute(geo, "aColor", this.capacity, 3);

        this.aPos = pos.array;
        this.aShape = shape.array;
        this.aColor = color.array;
        this.attrs = [pos.attribute, shape.attribute, color.attribute];

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uSurfaceY: { value: opts.surfaceY ?? 0 },
                uOpacity: { value: opts.opacity ?? 1 },
                uHighlight: { value: opts.highlight ?? 1 },
            },
            transparent: true,
            // Domes overlap and sit almost on the water; writing depth would make them punch
            // holes in each other and fight the surface both.
            depthWrite: false,
            depthTest: true,
            // The quad is billboarded from the unit quad's own winding, so there is no derived
            // basis to get backwards here — but a bubble has no back to hide either, and
            // DoubleSide removes the trap rather than relying on it staying right.
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

    get highlight(): number {
        return this.material.uniforms.uHighlight.value as number;
    }

    set highlight(v: number) {
        this.material.uniforms.uHighlight.value = v;
    }

    set surfaceY(v: number) {
        this.material.uniforms.uSurfaceY.value = v;
    }

    setPositionAt(i: number, x: number, y: number, z: number): void {
        const o = i * 3;
        this.aPos[o] = x;
        this.aPos[o + 1] = y;
        this.aPos[o + 2] = z;
    }

    setShapeAt(i: number, radius: number, alpha: number, pop: number, jitter: number): void {
        const o = i * 4;
        this.aShape[o] = radius;
        this.aShape[o + 1] = alpha;
        this.aShape[o + 2] = pop;
        this.aShape[o + 3] = jitter;
    }

    /** Copies `color` in; the renderer never holds a reference the caller could mutate. */
    setColorAt(i: number, color: Color): void {
        const o = i * 3;
        this.aColor[o] = color.r;
        this.aColor[o + 1] = color.g;
        this.aColor[o + 2] = color.b;
    }

    /** Publishes `count` live domes to the GPU. */
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
