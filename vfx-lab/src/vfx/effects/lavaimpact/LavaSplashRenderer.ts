/**
 * The molten tongues a lava splash is made of — one draw call for every one on screen.
 *
 * Thrown lava leaves a surface as a few thick *ribbons*, not as a cloud of sprites, so a tongue
 * here is one instance of a quad whose silhouette is carved in the fragment shader: the CPU
 * animates height, width, lean and progress, and the shader turns the rectangle into a lumpy,
 * tapered, curving form that comes apart into fragments near the end of its life.
 *
 * Four decisions carry the look:
 *
 *  - **Cylindrical billboarding, not spherical.** A tongue of lava is vertical in the world; it
 *    may turn to face the camera but it must never lie down. The quad spins around the effect's
 *    own up axis only, so the splash stands whether the camera is at playable height or overhead.
 *  - **The silhouette is a profile function, not geometry.** Width along the tongue is
 *    `pow(1 - t, taper)` with a flared foot and a lumpy modulation on top, and the centreline
 *    wanders on a per-instance sine. One attribute (`taper`) slides the same shader between a
 *    broad lobe and a narrow ribbon, which is where the irregularity comes from — no second
 *    material, no second mesh.
 *  - **Hot in the middle, cool at the edge.** Molten rock is a volume of light with a crust
 *    forming on its surface, which is the opposite of the water sheet next door: there the rim
 *    is the bright part, here the *core* is, and the silhouette is where the colour has already
 *    fallen toward red.
 *  - **It fragments rather than fades.** Past the peak a band pattern eats the tongue apart along
 *    its length, so the splash visibly breaks into separate pieces and hands over to the droplets
 *    instead of dissolving uniformly — a uniform fade is what makes an effect read as a decal.
 *
 * Alpha blending, not additive: lava is opaque, and two overlapping tongues must not sum their
 * way to white.
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

export interface LavaSplashRendererOptions {
    capacity: number;
    /** Multiplies every tongue's alpha — the per-system master opacity. */
    opacity?: number;
    /** Perceived brightness of the molten body. Above 1 the core burns toward white. */
    emissive?: number;
    /** 0–1 irregularity of the silhouette: the centreline wander and the lumps along the edge. */
    edgeVariation?: number;
    /** 0–1. How far colour and brightness fall across a tongue's life. */
    cooling?: number;
}

const VERTEX = /* glsl */ `
// x = half width, y = height, z = alpha, w = life progress 0->1
attribute vec4 aColumn;
// xy = horizontal lean of the tip, z = shape seed, w = taper exponent
attribute vec4 aForm;
// x = curvature 0..1, y = base heat 0..1
attribute vec2 aStyle;
attribute vec3 aBase;

varying vec2 vShape;
varying float vAlpha;
varying float vSeed;
varying float vTaper;
varying float vProgress;
varying float vHeat;

void main() {
    float halfWidth = max(aColumn.x, 1e-4);
    float height = max(aColumn.y, 1e-4);
    vAlpha = aColumn.z;
    vProgress = aColumn.w;
    vSeed = aForm.z;
    vTaper = aForm.w;
    vHeat = aStyle.y;

    // Remap the unit quad to x in [-1, 1] across the tongue and y in [0, 1] from the surface up.
    vec2 q = vec2(position.x * 2.0, position.y + 0.5);
    vShape = q;

    vec4 mv = modelViewMatrix * vec4(aBase, 1.0);
    vec3 up = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);

    // Cylindrical billboard: perpendicular to both the up axis and the direction the camera is
    // looking at this tongue, so it turns to face the viewer without ever leaving the vertical.
    // The camera sits at the view-space origin, so mv.xyz is already that direction.
    vec3 right = cross(up, mv.xyz);
    float rl = length(right);
    right = rl > 1e-5 ? right / rl : vec3(1.0, 0.0, 0.0);

    vec3 lean = (modelViewMatrix * vec4(aForm.x, 0.0, aForm.y, 0.0)).xyz;

    // Curvature is the exponent the lean is applied with: a straight tongue leaves the surface
    // vertically and only moves out at the very tip, a curved one starts arcing over almost
    // immediately. Driving the shape with the exponent rather than with a second offset keeps
    // the foot planted on the surface at every setting.
    float curve = clamp(aStyle.x, 0.0, 1.0);
    float bend = pow(q.y, mix(2.8, 1.15, curve));
    // The tip of a curved tongue is already falling while its foot is still rising.
    float droop = curve * height * 0.22 * q.y * q.y * q.y;

    mv.xyz += right * (q.x * halfWidth) + up * (q.y * height - droop) + lean * bend;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uHot;
uniform vec3 uLava;
uniform vec3 uCool;
uniform float uOpacity;
uniform float uEmissive;
uniform float uEdge;
uniform float uCooling;

varying vec2 vShape;
varying float vAlpha;
varying float vSeed;
varying float vTaper;
varying float vProgress;
varying float vHeat;

void main() {
    float t = clamp(vShape.y, 0.0, 1.0);
    float u = vShape.x;

    // The centreline wanders as the tongue stretches: thrown lava is never straight, and a
    // per-instance frequency means no two tongues wave together.
    float center = sin(t * (2.2 + vSeed * 4.2) + vSeed * 23.0) * 0.3 * uEdge * t;

    // Width along the tongue. The taper exponent slides between a broad lobe (low) and a narrow
    // ribbon (high); the exponential is the foot flaring where the lava leaves the surface, and
    // the lump term is what stops the outline being a clean mathematical curve.
    float lump = 1.0 + uEdge * 0.38 * sin(t * (6.5 + vSeed * 9.0) + vSeed * 11.0);
    float profile = pow(max(1.0 - t, 0.0), vTaper) * (1.0 + 0.85 * exp(-t * 8.0)) * lump;
    float width = 0.5 * max(profile, 0.0);

    float d = abs(u - center) / max(width, 1e-4);
    if (d > 1.0) discard;

    // Past the peak the tongue comes apart into bands along its length instead of fading as one
    // piece — that break-up is what hands the splash over to the droplets.
    float bands = 0.5 + 0.5 * sin(t * (16.0 + vSeed * 14.0) + vSeed * 29.0);
    float breakup = 1.0 - smoothstep(0.42, 1.0, vProgress) * smoothstep(0.1, 0.9, t) * (0.35 + 0.65 * bands);

    // Soft silhouette, solid body: lava is opaque, so the alpha ramp is only wide enough to keep
    // the edge from aliasing.
    float edge = 1.0 - smoothstep(0.7, 1.0, d);
    float a = edge * breakup * vAlpha * uOpacity;
    if (a <= 0.004) discard;

    // Hot down the middle, cooler at the silhouette and cooler again toward the tip, with the
    // whole tongue dropping through the ramp as it ages. One heat scalar drives colour and
    // brightness together, so they can never disagree.
    float core = 1.0 - smoothstep(0.0, 0.8, d);
    float heat = clamp(vHeat * (1.0 - 0.55 * t) + core * 0.3 - uCooling * vProgress * 0.6, 0.0, 1.0);
    vec3 color = heat > 0.5 ? mix(uLava, uHot, (heat - 0.5) * 2.0) : mix(uCool, uLava, heat * 2.0);
    color *= uEmissive * (0.72 + 0.55 * core);

    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
}
`;

export class LavaSplashRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aBase: Float32Array;
    readonly aColumn: Float32Array;
    readonly aForm: Float32Array;
    readonly aStyle: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];
    private readonly hot = new Color(0xffe6a0);
    private readonly lava = new Color(0xff6a14);
    private readonly cool = new Color(0x8c1c06);

    constructor(opts: LavaSplashRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const base = addInstancedAttribute(geo, "aBase", this.capacity, 3);
        const column = addInstancedAttribute(geo, "aColumn", this.capacity, 4);
        const form = addInstancedAttribute(geo, "aForm", this.capacity, 4);
        const style = addInstancedAttribute(geo, "aStyle", this.capacity, 2);

        this.aBase = base.array;
        this.aColumn = column.array;
        this.aForm = form.array;
        this.aStyle = style.array;
        this.attrs = [base.attribute, column.attribute, form.attribute, style.attribute];

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uHot: { value: this.hot },
                uLava: { value: this.lava },
                uCool: { value: this.cool },
                uOpacity: { value: opts.opacity ?? 1 },
                uEmissive: { value: opts.emissive ?? 1 },
                uEdge: { value: opts.edgeVariation ?? 0.7 },
                uCooling: { value: opts.cooling ?? 0.85 },
            },
            transparent: true,
            // Tongues overlap constantly inside one splash; writing depth would make them punch
            // holes in each other.
            depthWrite: false,
            depthTest: true,
            // The quad is billboarded from a derived basis, which is exactly the winding trap
            // that eats an effect silently. DoubleSide removes the trap, and a tongue of lava has
            // no back to hide.
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

    get emissive(): number {
        return this.material.uniforms.uEmissive.value as number;
    }

    set emissive(v: number) {
        this.material.uniforms.uEmissive.value = v;
    }

    get edgeVariation(): number {
        return this.material.uniforms.uEdge.value as number;
    }

    set edgeVariation(v: number) {
        this.material.uniforms.uEdge.value = v;
    }

    get cooling(): number {
        return this.material.uniforms.uCooling.value as number;
    }

    set cooling(v: number) {
        this.material.uniforms.uCooling.value = v;
    }

    /** Copies the palette in; the renderer never holds a reference the caller could mutate. */
    setPalette(hot: Color, lava: Color, cool: Color): void {
        this.hot.copy(hot);
        this.lava.copy(lava);
        this.cool.copy(cool);
    }

    setBaseAt(i: number, x: number, y: number, z: number): void {
        const o = i * 3;
        this.aBase[o] = x;
        this.aBase[o + 1] = y;
        this.aBase[o + 2] = z;
    }

    setColumnAt(i: number, halfWidth: number, height: number, alpha: number, progress: number): void {
        const o = i * 4;
        this.aColumn[o] = halfWidth;
        this.aColumn[o + 1] = height;
        this.aColumn[o + 2] = alpha;
        this.aColumn[o + 3] = progress;
    }

    setFormAt(i: number, leanX: number, leanZ: number, seed: number, taper: number): void {
        const o = i * 4;
        this.aForm[o] = leanX;
        this.aForm[o + 1] = leanZ;
        this.aForm[o + 2] = seed;
        this.aForm[o + 3] = taper;
    }

    setStyleAt(i: number, curvature: number, heat: number): void {
        const o = i * 2;
        this.aStyle[o] = curvature;
        this.aStyle[o + 1] = heat;
    }

    /** Publishes `count` live tongues to the GPU. */
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
