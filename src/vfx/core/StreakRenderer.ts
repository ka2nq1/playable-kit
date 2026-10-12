/**
 * Velocity-aligned streaks for sparks — one draw call, no texture.
 *
 * A spark reads as a spark because it is a *streak*: a short, thin smear pointing the way it
 * flies. A round sprite at the same size reads as a dot of dust no matter how bright it is, so
 * this renderer stretches each quad along the particle's velocity as projected into screen space,
 * which is also how a camera would smear it.
 *
 * The silhouette is computed analytically in the fragment shader rather than sampled from a
 * texture: a capsule is a couple of smoothsteps, and that keeps the streak crisp at any length
 * and thickness instead of going soft when a particle stretches past its sprite's resolution.
 */

import { AdditiveBlending, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial } from "three";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "./instancing";

export interface StreakRendererOptions {
    capacity: number;
    /** How much of the head is pushed toward white; 0 keeps the particle's own colour. */
    coreWhiteness?: number;
    opacity?: number;
    /**
     * Floor on streak width, as a fraction of viewport height (0.0025 ≈ 2px on a 800px canvas).
     *
     * Without it a spark that is a believable 2cm across simply vanishes: at playable framing it
     * covers less than a pixel, the rasteriser misses it, and the effect reads as empty. Clamping
     * in screen space keeps every spark visible at any distance while leaving the near ones at
     * their authored world size.
     */
    minWidth?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aVel;
attribute float aLength;
attribute float aThickness;
attribute vec3 aColor;
attribute float aAlpha;

uniform float uMinWidth;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    vUv = uv;
    vColor = aColor;
    vAlpha = aAlpha;

    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    vec3 velView = (modelViewMatrix * vec4(aVel, 0.0)).xyz;

    vec2 dir = velView.xy;
    float len = length(dir);
    // A spark flying straight at the camera has no screen-space direction; fall back to vertical
    // so it degrades into an upright tick instead of collapsing to nothing.
    dir = len > 1e-4 ? dir / len : vec2(0.0, 1.0);
    // Rotating dir by -90 degrees, not +90. The quad's two edge vectors are (perp, dir): with
    // the other perpendicular the pair is left-handed, every triangle comes out clockwise, and
    // back-face culling silently eats the entire effect.
    vec2 perp = vec2(dir.y, -dir.x);

    // View-space size of one screen height at this depth, from the projection's vertical scale
    // (projectionMatrix[1][1] == 1 / tan(fov/2)). Expressing the floor as a fraction of the
    // viewport rather than in pixels means the shader needs no viewport uniform to maintain.
    float depth = max(-mv.z, 0.0001);
    float viewPerScreen = 2.0 * depth / projectionMatrix[1][1];
    float minSize = uMinWidth * viewPerScreen;
    float thickness = max(aThickness, minSize);
    float streak = max(aLength, minSize * 2.0);

    // position.y runs -0.5..0.5 and uv.y runs 0..1, so (position.y - 0.5) puts the head of the
    // streak exactly on the particle and trails the body behind it.
    vec2 offset = dir * ((position.y - 0.5) * streak) + perp * (position.x * thickness);
    mv.xy += offset;

    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uCoreWhiteness;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    // A short ramp, not a long one: the width this fades over is often only two or three
    // pixels, and a gentle falloff there dims the whole streak instead of just softening its edge.
    float across = smoothstep(0.0, 0.32, 1.0 - abs(vUv.x * 2.0 - 1.0));
    // Fade in from the tail, and round off the head so it is a capsule, not a cut-off bar.
    // Both edges count up: GLSL leaves smoothstep undefined when edge0 >= edge1, and on some
    // drivers a reversed pair returns zero everywhere — which silently hides every spark.
    float along = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));

    float a = across * along * vAlpha * uOpacity;
    if (a <= 0.002) discard;

    float core = pow(across, 3.0) * smoothstep(0.3, 1.0, vUv.y);
    vec3 col = mix(vColor, vec3(1.0), clamp(core * uCoreWhiteness, 0.0, 1.0));

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
}
`;

export class StreakRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aPos: Float32Array;
    readonly aVel: Float32Array;
    readonly aLength: Float32Array;
    readonly aThickness: Float32Array;
    readonly aColor: Float32Array;
    readonly aAlpha: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];

    constructor(opts: StreakRendererOptions & { capacity: number }) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const pos = addInstancedAttribute(geo, "aPos", this.capacity, 3);
        const vel = addInstancedAttribute(geo, "aVel", this.capacity, 3);
        const length = addInstancedAttribute(geo, "aLength", this.capacity, 1);
        const thickness = addInstancedAttribute(geo, "aThickness", this.capacity, 1);
        const color = addInstancedAttribute(geo, "aColor", this.capacity, 3);
        const alpha = addInstancedAttribute(geo, "aAlpha", this.capacity, 1);

        this.aPos = pos.array;
        this.aVel = vel.array;
        this.aLength = length.array;
        this.aThickness = thickness.array;
        this.aColor = color.array;
        this.aAlpha = alpha.array;
        this.attrs = [
            pos.attribute,
            vel.attribute,
            length.attribute,
            thickness.attribute,
            color.attribute,
            alpha.attribute,
        ];

        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uOpacity: { value: opts.opacity ?? 1 },
                uCoreWhiteness: { value: opts.coreWhiteness ?? 0.85 },
                uMinWidth: { value: opts.minWidth ?? 0.0025 },
            },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            // The streak basis is rebuilt per particle from a velocity that can point anywhere;
            // not culling is a cheaper guarantee than trusting every basis to stay right-handed.
            side: DoubleSide,
            blending: AdditiveBlending,
        });

        this.mesh = new Mesh(geo, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
    }

    setColorAt(i: number, color: Color): void {
        const o = i * 3;
        this.aColor[o] = color.r;
        this.aColor[o + 1] = color.g;
        this.aColor[o + 2] = color.b;
    }

    get opacity(): number {
        return this.material.uniforms.uOpacity.value as number;
    }

    set opacity(v: number) {
        this.material.uniforms.uOpacity.value = v;
    }

    get minWidth(): number {
        return this.material.uniforms.uMinWidth.value as number;
    }

    set minWidth(v: number) {
        this.material.uniforms.uMinWidth.value = v;
    }

    get coreWhiteness(): number {
        return this.material.uniforms.uCoreWhiteness.value as number;
    }

    set coreWhiteness(v: number) {
        this.material.uniforms.uCoreWhiteness.value = v;
    }

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
