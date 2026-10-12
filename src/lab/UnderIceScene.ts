/**
 * Preview-only world under the ice.
 *
 * A transparent surface cannot be judged against an empty background: perfectly working
 * refraction with nothing behind it is a shader that looks switched off. So this is the minimum
 * that makes the ice legible — a dark basin, a checkered floor whose straight lines either bend or
 * do not, and one bright animated object swimming beneath the surface.
 *
 * It is set dressing, not part of the effect: nothing in `src/vfx` references it, the ice material
 * knows nothing about fish, and a game integrating the ice brings its own world to put under it.
 * The checker is deliberately regular for the same reason the heat-distortion preview uses square
 * pillars — a straight line is the only honest read on displacement.
 *
 * Four draw calls: basin, floor, fish body, fish fins.
 */

import {
    BackSide,
    BoxGeometry,
    ConeGeometry,
    DirectionalLight,
    Group,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    ShaderMaterial,
    SphereGeometry,
    Color,
} from "three";

const FLOOR_VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uExtent;

varying vec2 vXZ;

void main() {
    // One-metre cells, anchored in world space so the pattern is fixed to the lake bed and any
    // movement you see in it is the ice bending it, never the floor sliding.
    vec2 cell = floor(vXZ);
    float checker = mod(cell.x + cell.y, 2.0);
    vec3 color = mix(uDark, uLight, checker);

    // The far end of the basin falls off into the dark, so the floor does not end on a hard rim
    // and the eye reads depth rather than a tiled plane.
    float r = length(vXZ) / max(uExtent * 0.5, 0.0001);
    color *= 1.0 - 0.75 * smoothstep(0.35, 1.0, r);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`;

export type UnderIceObjectType = "fish" | "sphere";

export interface UnderIceSceneOptions {
    /** Width of the basin in world units. Match it to the ice surface size. */
    extent?: number;
    /** How far the bed sits below the ice plane, in world units. */
    depth?: number;
}

export class UnderIceScene {
    readonly group = new Group();

    /** Metres below the ice plane the swimmer holds. */
    objectDepth = 0.45;
    /** Multiplies the path speed. 0 parks the swimmer without hiding it. */
    objectSpeed = 1;
    objectScale = 1;
    /** Freezes the swimmer where it is, for inspecting refraction on a still frame. */
    paused = false;

    private readonly basin: Mesh;
    private readonly floor: Mesh;
    private readonly fish: Group;
    private readonly tailPivot: Group;
    private readonly sphere: Mesh;
    private readonly swimmer = new Group();

    private readonly basinGeometry: BoxGeometry;
    private readonly floorGeometry: PlaneGeometry;
    private readonly bodyGeometry: SphereGeometry;
    private readonly finGeometry: ConeGeometry;
    private readonly sphereGeometry: SphereGeometry;
    private readonly basinMaterial: MeshStandardMaterial;
    private readonly floorMaterial: ShaderMaterial;
    private readonly bodyMaterial: MeshStandardMaterial;
    private readonly finMaterial: MeshStandardMaterial;
    private readonly key: DirectionalLight;
    private readonly fill: HemisphereLight;

    private readonly extent: number;
    private readonly depth: number;
    private elapsed = 0;
    private type: UnderIceObjectType = "fish";

    constructor(options: UnderIceSceneOptions = {}) {
        this.extent = options.extent ?? 16;
        this.depth = options.depth ?? 1.6;
        this.group.name = "lab:under-ice";

        // An inverted box: the camera is outside it looking in, so the near walls and the lid are
        // back-face culled away and what is left is the inside of the far walls. One draw call for
        // a basin with no hole to fall through.
        this.basinGeometry = new BoxGeometry(this.extent, this.depth, this.extent);
        this.basinMaterial = new MeshStandardMaterial({ color: 0x0c2130, roughness: 1, metalness: 0, side: BackSide });
        this.basin = new Mesh(this.basinGeometry, this.basinMaterial);
        this.basin.position.y = -this.depth * 0.5;

        this.floorGeometry = new PlaneGeometry(this.extent, this.extent, 1, 1);
        this.floorGeometry.rotateX(-Math.PI / 2);
        this.floorMaterial = new ShaderMaterial({
            vertexShader: FLOOR_VERT,
            fragmentShader: FLOOR_FRAG,
            uniforms: {
                uDark: { value: new Color(0x08202c) },
                uLight: { value: new Color(0x1d4f5e) },
                uExtent: { value: this.extent },
            },
            fog: false,
        });
        this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
        this.floor.position.y = -this.depth + 0.01;

        // Warm against the cold ice: the one object that has to stay recognisable through frost,
        // cracks and a blue depth tint, so it is given the colour furthest from all three.
        this.bodyMaterial = new MeshStandardMaterial({ color: 0xff8a33, roughness: 0.45, metalness: 0, emissive: 0x2a0d00 });
        this.finMaterial = new MeshStandardMaterial({ color: 0xe25a1c, roughness: 0.6, metalness: 0 });

        this.bodyGeometry = new SphereGeometry(0.5, 14, 10);
        this.finGeometry = new ConeGeometry(0.34, 0.6, 4);
        // The cone is built pointing +Y; this lays it along -X so one geometry serves as the tail
        // and, rescaled, as the dorsal fin.
        this.finGeometry.rotateZ(Math.PI * 0.5);

        this.fish = new Group();
        const body = new Mesh(this.bodyGeometry, this.bodyMaterial);
        body.scale.set(1.15, 0.52, 0.34);

        this.tailPivot = new Group();
        this.tailPivot.position.x = -0.5;
        const tail = new Mesh(this.finGeometry, this.finMaterial);
        tail.position.x = -0.22;
        tail.scale.set(1, 1.15, 0.2);
        this.tailPivot.add(tail);

        const dorsal = new Mesh(this.finGeometry, this.finMaterial);
        dorsal.position.set(-0.05, 0.2, 0);
        dorsal.rotation.z = -Math.PI * 0.42;
        dorsal.scale.set(0.5, 0.55, 0.14);

        this.fish.add(body, this.tailPivot, dorsal);

        // The alternative reference: no silhouette of its own, so every wobble you see in it came
        // from the ice.
        this.sphereGeometry = new SphereGeometry(0.33, 20, 14);
        this.sphere = new Mesh(this.sphereGeometry, this.bodyMaterial);
        this.sphere.visible = false;

        this.swimmer.add(this.fish, this.sphere);

        // The lab's own set is lit for lava. Ice needs a cold key high enough to put a highlight on
        // the surface, and a dim sky fill so the fish is never a black cut-out.
        this.key = new DirectionalLight(0xcfeaff, 2.1);
        this.key.position.set(3.2, 5.0, 2.4);
        this.fill = new HemisphereLight(0x9fd4ff, 0x05161f, 0.75);

        this.group.add(this.basin, this.floor, this.swimmer, this.key, this.fill);
    }

    get showFloor(): boolean {
        return this.floor.visible;
    }

    set showFloor(v: boolean) {
        this.floor.visible = v;
        this.basin.visible = v;
    }

    get showObject(): boolean {
        return this.swimmer.visible;
    }

    set showObject(v: boolean) {
        this.swimmer.visible = v;
    }

    get objectType(): UnderIceObjectType {
        return this.type;
    }

    set objectType(v: UnderIceObjectType) {
        this.type = v;
        this.fish.visible = v === "fish";
        this.sphere.visible = v === "sphere";
    }

    /**
     * Advances the swim.
     *
     * The path is a lemniscate, which is why there is no steering code: it crosses the middle of
     * the lake twice a lap and reverses direction at each end on its own, so the swimmer passes
     * under clear ice, cracks and frost in turn without anything deciding that it should.
     */
    update(dt: number): void {
        if (!this.swimmer.visible) return;
        if (!this.paused && dt > 0) this.elapsed += dt * this.objectSpeed;

        const t = this.elapsed * 0.45;
        const a = this.extent * 0.3;
        const b = this.extent * 0.34;
        const x = Math.sin(t) * a;
        const z = Math.sin(t) * Math.cos(t) * b;
        // Derivatives of the same curve: the heading is the path's own tangent, so the swimmer can
        // never face anywhere other than where it is going.
        const dx = Math.cos(t) * a;
        const dz = Math.cos(2 * t) * b;

        this.swimmer.position.set(x, -this.objectDepth + Math.sin(t * 3.1) * 0.06, z);
        this.swimmer.rotation.y = Math.atan2(-dz, dx);
        this.swimmer.scale.setScalar(this.objectScale);

        // Tail first, body behind it: the phase offset is what reads as a fish driving itself
        // rather than a model wagging.
        const swish = this.elapsed * 6.5;
        this.tailPivot.rotation.y = Math.sin(swish) * 0.5;
        this.fish.rotation.y = Math.sin(swish - 0.9) * 0.1;
    }

    dispose(): void {
        this.group.removeFromParent();
        this.group.clear();
        this.swimmer.clear();
        this.tailPivot.clear();
        this.fish.clear();
        this.basinGeometry.dispose();
        this.floorGeometry.dispose();
        this.bodyGeometry.dispose();
        this.finGeometry.dispose();
        this.sphereGeometry.dispose();
        this.basinMaterial.dispose();
        this.floorMaterial.dispose();
        this.bodyMaterial.dispose();
        this.finMaterial.dispose();
        this.key.dispose();
        this.fill.dispose();
    }
}
