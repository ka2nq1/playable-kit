/**
 * The lab host: renderer, camera, orbit controls and the single animation loop.
 *
 * The loop lives here and nowhere else. Effects are advanced by being handed a delta, exactly as
 * a game would — which is the point: if an effect misbehaves because it assumed it owned the
 * clock, it misbehaves here too, before it reaches a playable.
 */

import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type CameraPresetName = "playable" | "close" | "wide" | "top";

interface CameraPreset {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
}

/**
 * `playable` is the default because it approximates the framing these effects actually ship in —
 * a shallow, slightly high three-quarter view. Tuning at `close` produces effects that read as
 * noise at the distance the player will see them.
 */
const CAMERA_PRESETS: Record<CameraPresetName, CameraPreset> = {
    playable: { position: [0, 2.3, 6.6], target: [0, 1.2, 0], fov: 45 },
    close: { position: [0.6, 1.1, 3.1], target: [0, 0.9, 0], fov: 50 },
    wide: { position: [0, 4.6, 12.5], target: [0, 1.6, 0], fov: 42 },
    top: { position: [0, 7.5, 5.5], target: [0, 0.6, 0], fov: 45 },
};

export type FrameCallback = (dt: number, elapsed: number) => void;

export class LabApp {
    readonly renderer: WebGLRenderer;
    readonly scene = new Scene();
    readonly camera: PerspectiveCamera;
    readonly controls: OrbitControls;

    /** Multiplies every delta handed to the frame callbacks; 0 freezes the simulation. */
    timeScale = 1;
    paused = false;

    /** `THREE.Clock` is deprecated, and a timestamp subtraction is all this ever needed. */
    private lastFrameTime = 0;
    private readonly callbacks: FrameCallback[] = [];
    private readonly tmpTarget = new Vector3();
    private rafHandle = 0;
    private elapsed = 0;
    private pixelRatioCap = 2;
    private stepRequested = false;
    private readonly onResize = () => this.resize();

    constructor(container: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.applyPixelRatio();
        container.appendChild(this.renderer.domElement);

        this.camera = new PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 400);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.maxPolarAngle = Math.PI * 0.495;
        this.controls.minDistance = 0.6;
        this.controls.maxDistance = 60;

        this.setCameraPreset("playable");
        window.addEventListener("resize", this.onResize);
    }

    get container(): HTMLElement {
        return this.renderer.domElement.parentElement ?? document.body;
    }

    onFrame(cb: FrameCallback): void {
        this.callbacks.push(cb);
    }

    setCameraPreset(name: CameraPresetName): void {
        const preset = CAMERA_PRESETS[name];
        this.camera.position.set(...preset.position);
        this.camera.fov = preset.fov;
        this.camera.updateProjectionMatrix();
        this.controls.target.set(...preset.target);
        this.controls.update();
    }

    get cameraDistance(): number {
        return this.camera.position.distanceTo(this.controls.target);
    }

    /**
     * Caps device pixel ratio. Dropping it to 1 is the cheapest way to tell whether a frame-rate
     * problem is fill-rate (particle overdraw) or simulation cost.
     */
    setPixelRatioCap(cap: number): void {
        this.pixelRatioCap = cap;
        this.applyPixelRatio();
    }

    getPixelRatioCap(): number {
        return this.pixelRatioCap;
    }

    /** Advances exactly one frame while paused — for inspecting a burst frame by frame. */
    requestStep(): void {
        this.stepRequested = true;
    }

    start(): void {
        if (this.rafHandle) return;
        this.lastFrameTime = performance.now();
        const tick = () => {
            this.rafHandle = requestAnimationFrame(tick);
            this.frame();
        };
        this.rafHandle = requestAnimationFrame(tick);
    }

    stop(): void {
        if (!this.rafHandle) return;
        cancelAnimationFrame(this.rafHandle);
        this.rafHandle = 0;
    }

    dispose(): void {
        this.stop();
        window.removeEventListener("resize", this.onResize);
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.callbacks.length = 0;
    }

    private frame(): void {
        const now = performance.now();
        const raw = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        const stepping = this.paused && this.stepRequested;
        this.stepRequested = false;
        // A paused lab still renders, so orbiting around frozen particles works.
        const dt = this.paused ? (stepping ? 1 / 60 : 0) : raw * this.timeScale;

        this.elapsed += dt;
        this.controls.update();
        for (const cb of this.callbacks) cb(dt, this.elapsed);
        this.renderer.render(this.scene, this.camera);
    }

    private applyPixelRatio(): void {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    }

    private resize(): void {
        const el = this.container;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.applyPixelRatio();
        this.tmpTarget.copy(this.controls.target);
    }
}
