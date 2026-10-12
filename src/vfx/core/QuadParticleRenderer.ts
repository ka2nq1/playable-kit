/**
 * Billboarded textured quads, one draw call for the whole system.
 *
 * Used by embers and smoke. Points would have been less code, but `gl_PointSize` is capped by the
 * driver and point sprites vanish the moment their centre leaves the frustum — both fatal for
 * large smoke puffs near the camera. Instanced quads also give per-particle rotation, which is
 * what stops smoke from looking like the same sprite stamped repeatedly.
 *
 * The vertex shader billboards in view space, so quads always face the camera without any CPU
 * matrix work, and the per-instance `aFrame` attribute is already wired for a future flipbook
 * atlas — set `frameGrid` and the same shader plays artist-authored sheets.
 */

import {
    AdditiveBlending,
    Blending,
    Color,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    NormalBlending,
    ShaderMaterial,
    Texture,
    Vector2,
} from "three";
import { addInstancedAttribute, createQuadGeometry, flushPrefix } from "./instancing";

export interface QuadRendererOptions {
    capacity: number;
    map: Texture;
    additive?: boolean;
    /** Columns/rows of a sprite sheet; defaults to a single full-texture frame. */
    frameGrid?: [number, number];
    /** Multiplies every particle's alpha — the per-effect master opacity. */
    opacity?: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aFrame;

uniform vec2 uFrameGrid;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    float idx = floor(aFrame + 0.5);
    float col = mod(idx, uFrameGrid.x);
    float row = floor(idx / uFrameGrid.x);
    // Sheets are authored top-left first, GL samples bottom-left first: flip the row.
    vUv = (uv + vec2(col, uFrameGrid.y - 1.0 - row)) / uFrameGrid;

    vColor = aColor;
    vAlpha = aAlpha;

    float c = cos(aRot);
    float s = sin(aRot);
    vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize;

    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    mv.xy += corner;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    vec4 tex = texture2D(uMap, vUv);
    float a = tex.a * vAlpha * uOpacity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(vColor * tex.rgb, a);
    #include <colorspace_fragment>
}
`;

export class QuadParticleRenderer {
    readonly mesh: Mesh;
    readonly capacity: number;

    readonly aPos: Float32Array;
    readonly aSize: Float32Array;
    readonly aRot: Float32Array;
    readonly aColor: Float32Array;
    readonly aAlpha: Float32Array;
    readonly aFrame: Float32Array;

    private readonly geometry: InstancedBufferGeometry;
    private readonly material: ShaderMaterial;
    private readonly attrs: InstancedBufferAttribute[];

    constructor(opts: QuadRendererOptions) {
        this.capacity = Math.max(1, Math.floor(opts.capacity));
        const geo = createQuadGeometry();
        this.geometry = geo;

        const pos = addInstancedAttribute(geo, "aPos", this.capacity, 3);
        const size = addInstancedAttribute(geo, "aSize", this.capacity, 1);
        const rot = addInstancedAttribute(geo, "aRot", this.capacity, 1);
        const color = addInstancedAttribute(geo, "aColor", this.capacity, 3);
        const alpha = addInstancedAttribute(geo, "aAlpha", this.capacity, 1);
        const frame = addInstancedAttribute(geo, "aFrame", this.capacity, 1);

        this.aPos = pos.array;
        this.aSize = size.array;
        this.aRot = rot.array;
        this.aColor = color.array;
        this.aAlpha = alpha.array;
        this.aFrame = frame.array;
        this.attrs = [pos.attribute, size.attribute, rot.attribute, color.attribute, alpha.attribute, frame.attribute];

        const grid = opts.frameGrid ?? [1, 1];
        this.material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uMap: { value: opts.map },
                uOpacity: { value: opts.opacity ?? 1 },
                uFrameGrid: { value: new Vector2(grid[0], grid[1]) },
            },
            transparent: true,
            // Particles never occlude each other, and writing depth would make additive sprites
            // punch holes in the smoke behind them.
            depthWrite: false,
            depthTest: true,
            blending: (opts.additive ? AdditiveBlending : NormalBlending) as Blending,
        });

        this.mesh = new Mesh(geo, this.material);
        // Instances move entirely inside attributes, so the geometry's bounds are always stale.
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
    }

    setColorAt(i: number, color: Color): void {
        const o = i * 3;
        this.aColor[o] = color.r;
        this.aColor[o + 1] = color.g;
        this.aColor[o + 2] = color.b;
    }

    setPositionAt(i: number, x: number, y: number, z: number): void {
        const o = i * 3;
        this.aPos[o] = x;
        this.aPos[o + 1] = y;
        this.aPos[o + 2] = z;
    }

    get opacity(): number {
        return this.material.uniforms.uOpacity.value as number;
    }

    set opacity(v: number) {
        this.material.uniforms.uOpacity.value = v;
    }

    setMap(map: Texture): void {
        this.material.uniforms.uMap.value = map;
    }

    /** Publishes `count` live instances to the GPU. */
    commit(count: number): void {
        const n = Math.min(count, this.capacity);
        this.geometry.instanceCount = n;
        for (const attr of this.attrs) flushPrefix(attr, n);
    }

    /** Releases geometry and material. The texture belongs to the TextureProvider, not to us. */
    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}
