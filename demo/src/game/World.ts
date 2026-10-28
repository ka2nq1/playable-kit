import {
    ACESFilmicToneMapping,
    CanvasTexture,
    CircleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    DirectionalLight,
    DodecahedronGeometry,
    DoubleSide,
    FogExp2,
    Group,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PointLight,
    Scene,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
    type Object3D,
} from "three";
import { markerById, onPlacementsChanged } from "../kit/markers";
import tune from "../resources/editor/tune/game.json";

/**
 * "Campfire Night": a clearing with a fire, a tent and a pond, at dusk. Everything a designer would
 * move is a marker in `placements.json` — the effects, the fire, the tent — and the hero walks a
 * route from the same file. This class builds the static set and puts the props on their markers.
 */

const LOOK_AT = new Vector3(1.6, 0.4, -0.6);
/** Props that stand on a marker of the same id; drag the marker in the editor and they follow. */
const PROPS = ["campfire", "tent"] as const;

export class World {
    readonly renderer: WebGLRenderer;
    readonly scene = new Scene();
    readonly camera = new PerspectiveCamera(48, 1, 0.1, 4000);
    readonly ground: Mesh;
    readonly pond: Mesh;
    private readonly fireLight = new PointLight(0xff8a3d, 1.8, 14, 1.6);
    private readonly props = new Map<string, Object3D>();
    private time = 0;

    constructor(private readonly container: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.outputColorSpace = SRGBColorSpace;
        this.renderer.toneMapping = ACESFilmicToneMapping;
        container.appendChild(this.renderer.domElement);

        this.scene.background = new Color(tune.fogColor);
        this.scene.fog = new FogExp2(tune.fogColor, 0.035);

        this.scene.add(new HemisphereLight(0x8aa0ff, 0x1a120c, 0.55));
        const moon = new DirectionalLight(0xa8b8ff, 0.6);
        moon.position.set(-8, 14, 6);
        this.scene.add(moon);

        this.ground = new Mesh(new CircleGeometry(40, 64), new MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.name = "Ground";
        this.scene.add(this.ground);

        // The pond the water effects are fitted to (`anchor.mesh: "Pond"`).
        this.pond = new Mesh(new CircleGeometry(3, 48), new MeshStandardMaterial({ color: 0x0c1a24, roughness: 0.3 }));
        this.pond.rotation.x = -Math.PI / 2;
        this.pond.position.set(5, 0.015, -2.5);
        this.pond.name = "Pond";
        this.scene.add(this.pond);

        this.scatter();
        this.props.set("campfire", campfire(this.fireLight));
        this.props.set("tent", tent());
        for (const prop of this.props.values()) this.scene.add(prop);

        this.resize();
        window.addEventListener("resize", () => this.resize());
    }

    update(dt: number): void {
        this.time += dt;
        // The fire flickers on game time, so it holds still while the editor pauses the game.
        const flicker = Math.sin(this.time * 13) * 0.5 + Math.sin(this.time * 7.3) * 0.5;
        this.fireLight.intensity = tune.fireLight * (1 + flicker * tune.fireFlicker);
        this.scene.background = (this.scene.background as Color).set(tune.fogColor);
        (this.scene.fog as FogExp2).color.set(tune.fogColor);

        // Only while playing: the editor owns the camera while it is open, and dt is 0 then.
        if (dt > 0) {
            const sway = Math.sin(this.time * 0.35) * tune.cameraSway;
            this.camera.position.set(-1.5 + sway, tune.cameraHeight, 11.5);
            this.camera.lookAt(LOOK_AT);
        }
    }

    render(): void {
        this.renderer.render(this.scene, this.camera);
    }

    /** Puts the props on their markers and keeps them there. After `setKitHost`, which reads the file. */
    attachProps(): void {
        this.placeProps();
        onPlacementsChanged(() => this.placeProps());
    }

    private placeProps(): void {
        for (const id of PROPS) {
            const prop = this.props.get(id)!;
            const marker = markerById(id);
            prop.visible = !!marker;
            if (!marker) continue;
            prop.position.fromArray(marker.position);
            prop.rotation.y = (marker.yaw * Math.PI) / 180;
        }
    }

    private resize(): void {
        const { clientWidth: w, clientHeight: h } = this.container;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        // Portrait phones need a wider view to keep the clearing in frame.
        this.camera.fov = w < h ? 64 : 48;
        this.camera.updateProjectionMatrix();
    }

    /** Trees and rocks on a deterministic scatter, so the demo looks the same on every load. */
    private scatter(): void {
        let seed = 7;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const trunk = new MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 });
        const leaves = [0x1f3b2c, 0x24452f, 0x1a3326].map((color) => new MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
        for (let i = 0; i < 46; i++) {
            const angle = rand() * Math.PI * 2;
            const radius = 11 + rand() * 16;
            const height = 2.4 + rand() * 2.6;
            const tree = new Group();
            const stem = new Mesh(new CylinderGeometry(0.12, 0.18, 0.9, 6), trunk);
            stem.position.y = 0.45;
            const crown = new Mesh(new ConeGeometry(0.9 + rand() * 0.6, height, 7), leaves[i % 3]);
            crown.position.y = 0.9 + height / 2;
            tree.add(stem, crown);
            tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 4);
            this.scene.add(tree);
        }
        const stone = new MeshStandardMaterial({ color: 0x5a5651, roughness: 0.9, flatShading: true });
        for (let i = 0; i < 14; i++) {
            const angle = (i / 14) * Math.PI * 2 + rand() * 0.2;
            const rock = new Mesh(new DodecahedronGeometry(0.25 + rand() * 0.35, 0), stone);
            rock.position.set(5 + Math.cos(angle) * 3.3, 0.08, -2.5 + Math.sin(angle) * 3.3);
            rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
            this.scene.add(rock);
        }
    }
}

function campfire(light: PointLight): Group {
    const fire = new Group();
    fire.name = "Campfire";
    const wood = new MeshStandardMaterial({ color: 0x4a2f1d, roughness: 1 });
    for (let i = 0; i < 4; i++) {
        const log = new Mesh(new CylinderGeometry(0.08, 0.1, 1.1, 6), wood);
        log.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI * 2, 0, "YXZ");
        log.position.y = 0.18;
        fire.add(log);
    }
    const stone = new MeshStandardMaterial({ color: 0x4d4a46, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rock = new Mesh(new DodecahedronGeometry(0.16, 0), stone);
        rock.position.set(Math.cos(a) * 0.72, 0.08, Math.sin(a) * 0.72);
        fire.add(rock);
    }
    light.position.y = 0.8;
    fire.add(light);
    return fire;
}

function tent(): Group {
    const group = new Group();
    group.name = "Tent";
    const cloth = new Mesh(new ConeGeometry(1.6, 1.9, 4, 1, true), new MeshStandardMaterial({ color: 0xc8652e, roughness: 0.9, side: DoubleSide, flatShading: true }));
    cloth.position.y = 0.95;
    cloth.rotation.y = Math.PI / 4;
    group.add(cloth);
    return group;
}

function groundTexture(): CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "#3a3a22");
    g.addColorStop(0.18, "#2c3b23");
    g.addColorStop(0.6, "#1d2a1b");
    g.addColorStop(1, "#141b14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(${120 + Math.random() * 60}, ${140 + Math.random() * 60}, 90, ${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}
