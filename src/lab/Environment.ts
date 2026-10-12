/**
 * Preview-only volcanic set dressing.
 *
 * This exists so the particles are judged in context — against dark basalt, a warm pool and a few
 * silhouetted rocks — rather than floating on a flat background where everything looks good. It
 * is explicitly NOT part of the effect: nothing in `src/vfx` references it, and a game
 * integrating the effect never ships any of this.
 *
 * The ground is a single unlit shader rather than textured geometry so the whole set costs three
 * draw calls and never competes with the particles for frame time while you are tuning them.
 */

import {
    AmbientLight,
    CircleGeometry,
    Color,
    Fog,
    GridHelper,
    Group,
    IcosahedronGeometry,
    Mesh,
    MeshStandardMaterial,
    PointLight,
    Scene,
    ShaderMaterial,
} from "three";
import { createRng } from "../vfx/core/random";

const GROUND_VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uRock;
uniform vec3 uLavaHot;
uniform vec3 uLavaCool;
uniform float uPoolRadius;
uniform float uGlow;

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
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

void main() {
    float dist = length(vXZ);

    // Ground grain, kept very dark: the particles are the subject and anything the basalt adds
    // to the frame is brightness they have to compete with.
    float grain = fbm(vXZ * 2.6) * 0.5 + 0.5;
    vec3 color = uRock * grain;

    // Cracks are the thin ridge where an fbm field crosses its own mid-level. The threshold has
    // to stay small — widen it and the "crack" becomes a glowing continent.
    float field = fbm(vXZ * 0.42 + vec2(uTime * 0.01, -uTime * 0.007));
    float crack = 1.0 - smoothstep(0.004, 0.038, abs(field - 0.5));
    // Only the crust close to the vent is still hot enough to show through.
    crack *= 1.0 - smoothstep(1.6, 9.0, dist);

    float churn = fbm(vXZ * 1.6 + vec2(uTime * 0.08, uTime * 0.05));
    vec3 lava = mix(uLavaCool, uLavaHot, smoothstep(0.38, 0.72, churn));

    color = mix(color, lava * 0.42, crack * uGlow);

    // The molten pool itself, with a crusted rim that eats the hard circle edge.
    float pool = 1.0 - smoothstep(uPoolRadius * 0.74, uPoolRadius, dist);
    color = mix(color, lava, pool * uGlow);

    // A little bounce light on the surrounding rock, gone within a few metres.
    color += uLavaHot * 0.012 * uGlow * (1.0 - smoothstep(0.0, 4.5, dist));

    // Fade the disc into the fog colour rather than ending on a visible rim.
    // Linear-space match for the 0x08060a background; an sRGB-looking value here would read
    // as a bright band along the horizon once the output transform lifts it.
    color = mix(color, vec3(0.0022, 0.0013, 0.0031), smoothstep(14.0, 34.0, dist));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`;

export interface EnvironmentOptions {
    poolRadius?: number;
    seed?: number;
}

export class Environment {
    readonly group = new Group();

    /** Ground disc and rocks only — the lights and the grid stay out, so hiding the set keeps its light. */
    private readonly terrain = new Group();
    private readonly groundMaterial: ShaderMaterial;
    private readonly groundGeometry: CircleGeometry;
    private readonly rockGeometry: IcosahedronGeometry;
    private readonly rockMaterial: MeshStandardMaterial;
    private readonly grid: GridHelper;
    private readonly ventLight: PointLight;
    private readonly ambient: AmbientLight;

    private elapsed = 0;

    constructor(scene: Scene, options: EnvironmentOptions = {}) {
        const poolRadius = options.poolRadius ?? 1.45;

        scene.background = new Color(0x08060a);
        scene.fog = new Fog(0x0a0809, 11, 44);

        this.groundGeometry = new CircleGeometry(46, 96);
        this.groundMaterial = new ShaderMaterial({
            vertexShader: GROUND_VERT,
            fragmentShader: GROUND_FRAG,
            uniforms: {
                uTime: { value: 0 },
                uRock: { value: new Color(0x0d0a0a) },
                uLavaHot: { value: new Color(0xff7a1e) },
                uLavaCool: { value: new Color(0x8d1c05) },
                uPoolRadius: { value: poolRadius },
                uGlow: { value: 1 },
            },
            fog: false,
        });
        const ground = new Mesh(this.groundGeometry, this.groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.renderOrder = -10;
        this.terrain.add(ground);

        // A handful of chunky silhouettes so particles have something to pass in front of and
        // behind — depth is impossible to judge against an empty plane.
        this.rockGeometry = new IcosahedronGeometry(1, 0);
        this.rockMaterial = new MeshStandardMaterial({ color: 0x241b19, roughness: 0.95, metalness: 0, flatShading: true });
        const rng = createRng(options.seed ?? 4242);
        for (let i = 0; i < 9; i++) {
            const rock = new Mesh(this.rockGeometry, this.rockMaterial);
            const angle = (i / 9) * Math.PI * 2 + rng() * 0.5;
            const radius = 2.6 + rng() * 3.4;
            const scale = 0.3 + rng() * 0.75;
            rock.position.set(Math.cos(angle) * radius, scale * (0.1 + rng() * 0.35), Math.sin(angle) * radius);
            rock.scale.set(scale, scale * (0.55 + rng() * 0.5), scale);
            rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            this.terrain.add(rock);
        }

        this.group.add(this.terrain);

        this.ambient = new AmbientLight(0x191210, 1.0);
        this.ventLight = new PointLight(0xff6a22, 14, 16, 2);
        this.ventLight.position.set(0, 0.7, 0);
        this.group.add(this.ambient, this.ventLight);

        this.grid = new GridHelper(40, 40, 0x443a36, 0x241e1c);
        this.grid.position.y = 0.002;
        this.grid.visible = false;
        this.group.add(this.grid);

        scene.add(this.group);
    }

    /**
     * Hides the ground disc and the rocks. A surface that displaces its own vertices dips below
     * y=0, and no offset fixes that — the basalt shows through the troughs of every wave.
     */
    get terrainVisible(): boolean {
        return this.terrain.visible;
    }

    set terrainVisible(v: boolean) {
        this.terrain.visible = v;
    }

    get gridVisible(): boolean {
        return this.grid.visible;
    }

    set gridVisible(v: boolean) {
        this.grid.visible = v;
    }

    /** Dims the whole set, so you can check that particles stay readable on their own. */
    get glow(): number {
        return this.groundMaterial.uniforms.uGlow.value as number;
    }

    set glow(v: number) {
        this.groundMaterial.uniforms.uGlow.value = v;
        this.ventLight.intensity = 14 * v;
        this.ambient.intensity = 1.0 * Math.max(0.25, v);
    }

    update(dt: number): void {
        this.elapsed += dt;
        this.groundMaterial.uniforms.uTime.value = this.elapsed;
    }

    dispose(): void {
        this.group.removeFromParent();
        this.groundGeometry.dispose();
        this.groundMaterial.dispose();
        this.rockGeometry.dispose();
        this.rockMaterial.dispose();
        this.grid.geometry.dispose();
        const gridMat = this.grid.material;
        if (Array.isArray(gridMat)) gridMat.forEach((m) => m.dispose());
        else gridMat.dispose();
        this.terrain.clear();
        this.group.clear();
    }
}
