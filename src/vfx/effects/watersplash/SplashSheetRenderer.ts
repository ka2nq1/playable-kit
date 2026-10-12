/**
 * The sheets of water a splash is actually made of — one draw call for every stream on screen.
 *
 * A crown of water is not a particle system and it is not a mesh either. It is a handful of thin,
 * curved *sheets* leaving the surface at different angles, each with its own silhouette, and the
 * cheapest honest way to draw one is a quad whose outline is carved in the fragment shader. So a
 * stream here is one instance: the CPU animates four numbers (height, width, lean, progress) and
 * the shader turns the rectangle into a tapered, wavering, frayed sheet.
 *
 * Three decisions carry the look:
 *
 *  - **Cylindrical billboarding, not spherical.** A jet of water is vertical in the world; it may
 *    turn to face the camera but it must never lie down. The quad therefore spins around the
 *    effect's own up axis only, which keeps every stream standing whether the camera is at
 *    playable height or directly overhead.
 *  - **The silhouette is a profile function, not geometry.** Width along the sheet is
 *    `pow(1 - t, taper)` with a flared foot, and the centreline wanders on a per-instance sine.
 *    One attribute (`taper`) slides the same shader between a narrow stream and a broad lobe,
 *    which is where the irregularity of the crown comes from — no second material, no second mesh.
 *  - **Thickness, not opacity.** Alpha comes from how much water the view passes through: thin
 *    and see-through down the middle of the sheet, dense and bright at the silhouette, with foam
 *    at the foot and at the fraying tip. That single term gives the translucency and the bright
 *    edges at once, so there is nothing to keep in sync.
 *
 * Alpha blending, not additive: a splash is lit water over dark water, and two overlapping sheets
 * must not sum their way to white.
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

export interface SplashSheetRendererOptions {
    capacity: number;
    /** Multiplies every sheet's alpha — the per-system master opacity. */
    opacity?: number;
    /** Strength of the bright edges and the foam. */
    highlight?: number;
    color?: Color;
}

const VERTEX = /* glsl */ `
// x = half width, y = height, z = alpha, w = life progress 0->1
attribute vec4 aColumn;
// xy = horizontal lean of the tip, z = shape seed, w = taper exponent
attribute vec4 aForm;
attribute vec3 aBase;

varying vec2 vShape;
varying float vAlpha;
varying float vSeed;
varying float vTaper;
varying float vProgress;

void main() {
    float halfWidth = max(aColumn.x, 1e-4);
    float height = max(aColumn.y, 1e-4);
    vAlpha = aColumn.z;
    vProgress = aColumn.w;
    vSeed = aForm.z;
    vTaper = aForm.w;

    // Remap the unit quad to x in [-1, 1] across the sheet and y in [0, 1] from the water up.
    vec2 q = vec2(position.x * 2.0, position.y + 0.5);
    vShape = q;

    vec4 mv = modelViewMatrix * vec4(aBase, 1.0);
    vec3 up = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);

    // Cylindrical billboard: perpendicular to both the up axis and the direction the camera is
    // looking at this sheet, so it turns to face the viewer without ever leaving the vertical.
    // The camera sits at the view-space origin, so mv.xyz is already that direction.
    vec3 right = cross(up, mv.xyz);
    float rl = length(right);
    right = rl > 1e-5 ? right / rl : vec3(1.0, 0.0, 0.0);

    // The lean is authored in the effect's own horizontal plane and applied as t², so the sheet
    // leaves the water vertically and only arcs outward near the tip — a jet, not a ramp.
    vec3 lean = (modelViewMatrix * vec4(aForm.x, 0.0, aForm.y, 0.0)).xyz;

    mv.xyz += right * (q.x * halfWidth) + up * (q.y * height) + lean * (q.y * q.y);
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHighlight;

varying vec2 vShape;
varying float vAlpha;
varying float vSeed;
varying float vTaper;
varying float vProgress;

void main() {
    float t = clamp(vShape.y, 0.0, 1.0);
    float u = vShape.x;

    // The centreline wanders as the sheet stretches: water leaving a surface is never straight,
    // and a per-instance frequency means no two streams wave together.
    float center = sin(t * (2.4 + vSeed * 3.6) + vSeed * 17.0) * 0.26 * t;

    // Width along the sheet. The taper exponent slides between a broad lobe (low) and a narrow stream
    // (high); the exponential term is the foot flaring out where the water leaves the surface.
    float profile = pow(max(1.0 - t, 0.0), vTaper) * (1.0 + 0.9 * exp(-t * 9.0));
    float width = 0.5 * profile;

    float d = abs(u - center) / max(width, 1e-4);
    if (d > 1.0) discard;

    // Path length through the sheet: see-through down the middle, dense at the silhouette. The
    // bright edges the crown reads by are this term, not a separate highlight pass.
    float rim = smoothstep(0.45, 1.0, d);
    // Aerated water: churned at the foot, frothy where the tip is coming apart.
    float foam = exp(-t * 7.0) * 0.7 + smoothstep(0.6, 1.0, t) * 0.45;

    // The tip is where the sheet runs out of water. It frays on a per-instance pattern rather
    // than ending on a clean curve — that break-up is what hands over to the droplets.
    float fray = 0.5 + 0.5 * sin(u * 7.0 + vSeed * 31.0 + t * 5.0);
    float tip = 1.0 - smoothstep(0.62, 1.0, t) * (0.45 + 0.55 * fray);

    // Past the peak the sheet tears from the top down instead of fading uniformly — a collapsing
    // crown loses its tips first, and a uniform fade is what makes an effect read as a decal.
    float tear = 1.0 - smoothstep(0.55, 1.0, vProgress) * smoothstep(0.2, 1.0, t) * 0.85;

    float a = (0.3 + 0.55 * rim + 0.45 * foam) * tip * tear * vAlpha * uOpacity;
    if (a <= 0.004) discard;

    // Highlights push the tint toward white rather than adding a second colour: foam is water
    // full of air, and the brightest part of a splash has no hue left.
    float lit = clamp((rim * 0.75 + foam * 0.85) * uHighlight, 0.0, 0.92);
    vec3 color = mix(uColor, vec3(1.0), lit);

    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
}
`;

export class SplashSheetRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aBase: Float32Array;
    readonly aColumn: Float32Array;
    readonly aForm: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];
    private readonly color = new Color(0x79c4d8);

    constructor(opts: SplashSheetRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const base = addInstancedAttribute(geo, "aBase", this.capacity, 3);
        const column = addInstancedAttribute(geo, "aColumn", this.capacity, 4);
        const form = addInstancedAttribute(geo, "aForm", this.capacity, 4);

        this.aBase = base.array;
        this.aColumn = column.array;
        this.aForm = form.array;
        this.attrs = [base.attribute, column.attribute, form.attribute];

        if (opts.color) this.color.copy(opts.color);
        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uColor: { value: this.color },
                uOpacity: { value: opts.opacity ?? 1 },
                uHighlight: { value: opts.highlight ?? 1 },
            },
            transparent: true,
            // Sheets overlap constantly inside one crown; writing depth would make them punch
            // holes in each other.
            depthWrite: false,
            depthTest: true,
            // The quad is billboarded from a derived basis, which is exactly the winding trap
            // that eats an effect silently. DoubleSide removes the trap, and a sheet of water has
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

    get highlight(): number {
        return this.material.uniforms.uHighlight.value as number;
    }

    set highlight(v: number) {
        this.material.uniforms.uHighlight.value = v;
    }

    /** Copies `color` in; the renderer never holds a reference the caller could mutate. */
    setColor(color: Color): void {
        this.color.copy(color);
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

    /** Publishes `count` live sheets to the GPU. */
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
