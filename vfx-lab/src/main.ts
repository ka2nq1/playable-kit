/**
 * Lab entry point: wires the host, the preview environment, the control panel and whichever
 * effect is selected in the registry.
 */

import { LabApp, type CameraPresetName } from "./lab/LabApp";
import { Environment } from "./lab/Environment";
import { ControlPanel } from "./lab/ui/ControlPanel";
import { StatsOverlay } from "./lab/ui/StatsOverlay";
import { EFFECTS, type LabEffectHandle } from "./lab/registry";

const container = document.getElementById("app");
if (!container) throw new Error("vfx-lab: #app container is missing from index.html");

const app = new LabApp(container);
const environment = new Environment(app.scene);

const panel = new ControlPanel("VFX Lab", "three.js");
document.body.appendChild(panel.dom);

const stats = new StatsOverlay();
document.body.appendChild(stats.dom);

let currentEntryId = EFFECTS[0].id;
let current: LabEffectHandle | null = null;

function loadEffect(id: string): void {
    const entry = EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];
    currentEntryId = entry.id;

    if (current) {
        app.scene.remove(current.object3d);
        current.dispose();
    }
    current = entry.create({ app, environment, rebuildPanel: buildPanel });
    app.scene.add(current.object3d);

    buildPanel();
}

function buildPanel(): void {
    panel.clear();

    const effects = panel.folder("Effect");
    effects.list(
        EFFECTS.map((e) => ({ value: e.id, label: e.label, hint: e.hint, group: e.group })),
        () => currentEntryId,
        (v) => loadEffect(v),
    );

    const lab = panel.folder("Lab");
    lab.select(
        "Camera",
        ["playable", "close", "wide", "top"] as const satisfies readonly CameraPresetName[],
        () => cameraPreset,
        (v) => {
            cameraPreset = v;
            app.setCameraPreset(v);
        },
    );
    lab.slider("Time scale", { min: 0, max: 2, step: 0.01 }, () => app.timeScale, (v) => (app.timeScale = v));
    lab.toggle("Paused", () => app.paused, (v) => (app.paused = v));
    lab.buttons({ label: "Step frame", onClick: () => app.requestStep() });
    lab.slider("Pixel ratio cap", { min: 0.5, max: 3, step: 0.25 }, () => app.getPixelRatioCap(), (v) => app.setPixelRatioCap(v));
    lab.slider("Scene glow", { min: 0, max: 1.5, step: 0.01 }, () => environment.glow, (v) => (environment.glow = v));
    lab.toggle("Grid", () => environment.gridVisible, (v) => (environment.gridVisible = v));
    lab.note("H hides the panel · Space pauses · Right-drag pans");

    current?.buildControls(panel);
}

let cameraPreset: CameraPresetName = "playable";

loadEffect(currentEntryId);

app.onFrame((dt) => {
    environment.update(dt);
    current?.update(dt);
    stats.setExtra(current?.statsLine() ?? "");
});

// The stats overlay reports wall-clock frame rate, so it must not see the scaled/paused delta.
let lastTime = performance.now();
app.onFrame(() => {
    const now = performance.now();
    stats.update(app.renderer, (now - lastTime) / 1000);
    lastTime = now;
});

window.addEventListener("keydown", (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    if (ev.code === "KeyH") panel.visible = !panel.visible;
    else if (ev.code === "Space") {
        ev.preventDefault();
        app.paused = !app.paused;
        panel.refresh();
    } else if (ev.code === "Period") app.requestStep();
});

app.start();

/**
 * Console handle. Tuning by slider covers most of it, but anything the panel does not expose —
 * curve keyframes, a scripted burst sequence, a screenshot harness — is reachable from here:
 *
 *     __vfxLab.effect.statsLine()
 *     __vfxLab.app.paused = true
 */
declare global {
    interface Window {
        __vfxLab: {
            app: LabApp;
            environment: Environment;
            panel: ControlPanel;
            readonly effect: LabEffectHandle | null;
            load(id: string): void;
        };
    }
}

window.__vfxLab = {
    app,
    environment,
    panel,
    get effect() {
        return current;
    },
    load: loadEffect,
};

// Vite keeps module state across hot updates, which would leave a second renderer and a second
// loop running behind the first. Tear the lab down explicitly instead.
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        current?.dispose();
        environment.dispose();
        app.dispose();
        panel.dom.remove();
        stats.dom.remove();
    });
}
