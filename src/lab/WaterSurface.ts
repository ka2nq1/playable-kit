/**
 * Preview-only swamp water.
 *
 * The ripple effect is a decal on *something*, and judging it against the lab's volcanic ground
 * would tell you nothing: a crest reads completely differently on dark teal water than on hot
 * basalt. So this exists purely to give the rings a believable surface to sit on — one unlit
 * shader, one draw call, no reflection, no refraction, no normal map.
 *
 * It is set dressing, not part of the effect: nothing in `src/vfx` references it, and a game
 * integrating the ripples brings its own water material. The ripples are a standalone transparent
 * overlay precisely so that swap costs nothing.
 */

import { CircleGeometry, Color, Mesh, ShaderMaterial } from "three";

const VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHorizon;
uniform float uGlint;

varying vec2 vXZ;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.07;
        a *= 0.5;
    }
    return v;
}

void main() {
    float dist = length(vXZ);

    // Slow swell. Two fields drifting against each other, so nothing in the surface ever repeats
    // on a visible period while the lab is left running.
    float swell = fbm(vXZ * 0.45 + vec2(uTime * 0.035, uTime * -0.021));
    float murk = fbm(vXZ * 1.9 - vec2(uTime * 0.012, uTime * 0.018));
    vec3 color = mix(uDeep, uShallow, smoothstep(0.35, 0.75, swell * 0.7 + murk * 0.3));

    // Sparse glints off the swell crests. Kept dim: the ripples are the subject and anything the
    // water adds is brightness they have to compete with.
    float glint = pow(max(swell - 0.52, 0.0) * 2.1, 5.0);
    color += vec3(0.6, 0.85, 0.8) * glint * uGlint;

    // Fade the disc into the fog colour rather than ending on a visible rim. The uniform is a
    // THREE.Color, so the sRGB → linear conversion already happened on the CPU; a literal here
    // would have to be written in linear by hand.
    color = mix(color, uHorizon, smoothstep(13.0, 32.0, dist));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`;

export interface WaterSurfaceOptions {
    radius?: number;
    /** World height of the surface. The ripple system is parented at exactly this height. */
    level?: number;
}

export class WaterSurface {
    readonly mesh: Mesh;
    readonly level: number;

    private readonly geometry: CircleGeometry;
    private readonly material: ShaderMaterial;
    private elapsed = 0;

    constructor(options: WaterSurfaceOptions = {}) {
        // Slightly above the lab's volcanic ground so the two do not z-fight; both fade to the
        // same fog colour long before their rims are visible.
        this.level = options.level ?? 0.02;

        this.geometry = new CircleGeometry(options.radius ?? 46, 96);
        this.material = new ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                uTime: { value: 0 },
                uDeep: { value: new Color(0x061714) },
                uShallow: { value: new Color(0x11332a) },
                uHorizon: { value: new Color(0x0a0809) },
                uGlint: { value: 0.5 },
            },
            fog: false,
        });

        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = this.level;
        this.mesh.renderOrder = -9;
    }

    get glint(): number {
        return this.material.uniforms.uGlint.value as number;
    }

    set glint(v: number) {
        this.material.uniforms.uGlint.value = v;
    }

    update(dt: number): void {
        this.elapsed += dt;
        this.material.uniforms.uTime.value = this.elapsed;
    }

    dispose(): void {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}
