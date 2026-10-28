import {
    CanvasTexture,
    CircleGeometry,
    Color,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
    type Object3D,
} from "three";
import type { PreviewSubject, VfxDevEntry } from "./registry";

/**
 * Pictures for the VFX grid, made from the effects themselves.
 *
 * No thumbnail files: each tile is rendered from a standalone copy of its effect, so a change to an
 * effect is in its tile the next time the grid opens. One small offscreen renderer serves every tile —
 * it renders a subject, and the frame is copied into the tile's own 2D canvas straight away (which
 * also works when the tile lives in the pop-out window). A hovered tile is re-rendered every frame.
 *
 * Subjects are created on first use and kept until the editor closes; event effects are fired on a
 * loop so their tile is never empty.
 */

const WIDTH = 384;
const HEIGHT = 240;
const STEP = 1 / 30;
const EVENT_PERIOD = 1.4;
const DEFAULT_CAMERA = { position: [0, 1.7, 5.2] as [number, number, number], target: [0, 0.8, 0] as [number, number, number], fov: 45 };

interface Live {
    subject: PreviewSubject;
    sinceBurst: number;
}

export class VfxPreviewer {
    private renderer: WebGLRenderer | null = null;
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(45, WIDTH / HEIGHT, 0.05, 4000);
    private readonly live = new Map<string, Live>();
    private readonly queue: Array<{ entry: VfxDevEntry; canvas: HTMLCanvasElement }> = [];
    private draining = false;
    private animated: { entry: VfxDevEntry; canvas: HTMLCanvasElement } | null = null;

    constructor() {
        this.scene.background = new Color(0x15110f);
        this.scene.add(new HemisphereLight(0xffe6cc, 0x221a14, 1.4));
        this.scene.add(stage());
    }

    /** Queues a still for `canvas`. Cheap to call for every tile: stills are taken one per task. */
    thumbnail(entry: VfxDevEntry, canvas: HTMLCanvasElement): void {
        if (!entry.preview) return;
        this.queue.push({ entry, canvas });
        if (!this.draining) this.drain();
    }

    /** Plays `entry` live in `canvas` until `stop()` (hover). */
    animate(entry: VfxDevEntry, canvas: HTMLCanvasElement): void {
        if (!entry.preview) return;
        this.animated = { entry, canvas };
    }

    stop(): void {
        this.animated = null;
    }

    /** Called from the editor's frame. */
    tick(dt: number): void {
        const target = this.animated;
        if (!target) return;
        const live = this.subject(target.entry);
        if (!live) return;
        this.advance(target.entry, live, dt);
        this.draw(target.entry, live.subject.object3d, target.canvas);
    }

    dispose(): void {
        for (const { subject } of this.live.values()) subject.dispose();
        this.live.clear();
        this.renderer?.dispose();
        this.renderer = null;
    }

    private drain(): void {
        const next = this.queue.shift();
        if (!next) {
            this.draining = false;
            return;
        }
        this.draining = true;
        try {
            const live = this.subject(next.entry);
            if (live) {
                const warmup = next.entry.preview?.warmup ?? 2.5;
                for (let t = 0; t < warmup; t += STEP) this.advance(next.entry, live, STEP);
                this.draw(next.entry, live.subject.object3d, next.canvas);
            }
        } catch (err) {
            console.warn(`[editor] preview of ${next.entry.id} failed`, err);
        }
        setTimeout(() => this.drain(), 16);
    }

    private subject(entry: VfxDevEntry): Live | null {
        const existing = this.live.get(entry.id);
        if (existing) return existing;
        try {
            const subject = entry.preview!.create();
            const live = { subject, sinceBurst: EVENT_PERIOD };
            this.live.set(entry.id, live);
            return live;
        } catch (err) {
            console.warn(`[editor] could not create a preview of ${entry.id}`, err);
            return null;
        }
    }

    private advance(entry: VfxDevEntry, live: Live, dt: number): void {
        if (entry.preview?.event) {
            live.sinceBurst += dt;
            if (live.sinceBurst >= EVENT_PERIOD) {
                live.sinceBurst = 0;
                live.subject.burst?.(null);
            }
        }
        live.subject.update(dt);
    }

    private draw(entry: VfxDevEntry, object: Object3D, canvas: HTMLCanvasElement): void {
        const renderer = this.ensureRenderer();
        const view = entry.preview?.camera ?? DEFAULT_CAMERA;
        this.camera.fov = view.fov ?? DEFAULT_CAMERA.fov;
        this.camera.position.fromArray(view.position);
        this.camera.lookAt(new Vector3().fromArray(view.target));
        this.camera.updateProjectionMatrix();

        this.scene.add(object);
        renderer.render(this.scene, this.camera);
        this.scene.remove(object);

        // Copied in the same task as the render: the drawing buffer is not preserved.
        if (canvas.width !== WIDTH) {
            canvas.width = WIDTH;
            canvas.height = HEIGHT;
        }
        canvas.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
    }

    private ensureRenderer(): WebGLRenderer {
        if (!this.renderer) {
            this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(WIDTH, HEIGHT, false);
            this.renderer.outputColorSpace = SRGBColorSpace;
        }
        return this.renderer;
    }
}

/** A dark disc with a soft warm centre and a faint grid — enough to read height, scale and refraction. */
function stage(): Mesh {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, "#3a2f28");
    glow.addColorStop(0.6, "#211a16");
    glow.addColorStop(1, "#15110f");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255, 200, 160, 0.07)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += size / 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const disc = new Mesh(new CircleGeometry(14, 48), new MeshBasicMaterial({ map: texture }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.01;
    return disc;
}
