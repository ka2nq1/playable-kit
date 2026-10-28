/**
 * The editor: place, drag and tune things in the running game, and save the result into the project.
 *
 * One window (or a column docked to the game), a menu bar of sections:
 *  - **Scene** — three-path-editor: every marker and route, moved with the gizmo; its Save writes
 *    the placements file.
 *  - **VFX** — the grid of effects with live previews; a click opens one effect's editor.
 *  - **Tune** — JSON configs the game reads live (`tunables`).
 *  - the project's own sections (`tabs`).
 *
 * Nothing here creates a scene, camera, renderer or loop; it borrows the game's, as described by
 * `dev/editor.config.ts`, and hands everything back on exit. The whole module is dev-only by
 * absence: it sits outside `src/` and is reached only from `boot.ts`, which the dev server injects.
 */

import { Vector3, type Camera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PathEditor, PathEditorPanel, type EditActionContext, type EditorAction, type Path } from "../vendor/three-path-editor/editor.js";
import { kitHost } from "../../src/kit/host";
import { MAP_VFX_CONFIG_KEY, MAP_VFX_KEY, readMarkers, setLiveFile } from "../../src/kit/markers";
import type { MapVfxInstanceBase } from "../../src/kit/MapVfxInstances";
import { ControlPanel } from "./ui/ControlPanel";
import { Shell } from "./ui/Shell";
import { columnize } from "./ui/columns";
import type { EditorConfig, EditorContext } from "./config";
import type { VfxDevEntry } from "./registry";
import { defaultsFor, defaultsPath } from "./defaults";
import { disableSaving, saveJsonToProject, savingDisabled } from "./devSave";
import { buildTuneTab } from "./panels/tuneTab";
import { PanelPopout } from "./popout";
import { NamedPointKeeper } from "./NamedPointKeeper";
import { VfxPreviewer } from "./preview";
import { VfxView } from "./views/vfxView";

/** Live readouts refresh at this interval, in seconds. */
const REFRESH_INTERVAL = 0.25;
const ONE_SHOT_KEY = "vfx";

const SHORTCUTS: ReadonlyArray<[string, string]> = [
    ["V", "open / close the editor"],
    ["Click", "select a point"],
    ["Drag", "orbit · right-drag pans · wheel zooms"],
    ["R", "move ↔ rotate gizmo"],
    ["G", "show / hide gizmos"],
    ["Shift+click", "add a point to the selected route"],
    ["Delete", "remove the selected point"],
    ["Ctrl+Z", "undo"],
];

export class EditorMode {
    private editor: PathEditor | null = null;
    private orbit: OrbitControls | null = null;
    private shell: Shell | null = null;
    private scenePanel: PathEditorPanel | null = null;
    private vfxView: VfxView | null = null;
    private readonly previewer = new VfxPreviewer();
    private readonly panels: ControlPanel[] = [];
    private readonly popout: PanelPopout;
    private names: NamedPointKeeper | null = null;

    /** Which point each effect's editor is pointed at, so a rebuild does not lose your place. */
    private readonly selected = new Map<string, string>();

    private active = false;
    private camera: Camera | null = null;
    private lastTime = 0;
    private sinceRefresh = 0;
    /** Set while the pointer is down inside the editor, so a refresh can't fight a drag. */
    private editing = false;

    constructor(private readonly config: EditorConfig) {
        this.popout = new PanelPopout(config.title);
        if (config.saveDisabled) disableSaving(config.saveDisabled);
    }

    get enabled(): boolean {
        return this.active;
    }

    toggle(): void {
        if (this.active) this.disable();
        else this.enable();
    }

    enable(): void {
        if (this.active) return;
        this.build();
        this.active = true;

        this.editor?.enable();
        this.shell?.setVisible(true);
        this.vfxView?.render();
        if (this.orbit) {
            this.orbit.enabled = true;
            // After enable(): `detachCamera` lifts the camera out of its rig there, and orbiting a
            // still-parented camera would be computed against the rig's transform.
            this.orbit.target.copy(this.config.orbitTarget());
            this.orbit.update();
        }

        this.config.setPaused(true);
        this.config.onEnable?.();
        this.popout.show();

        this.lastTime = performance.now();
    }

    disable(): void {
        if (!this.active) return;
        this.active = false;

        this.previewer.stop();
        this.popout.hide();
        this.editor?.disable();
        this.shell?.setVisible(false);
        if (this.orbit) this.orbit.enabled = false;

        this.config.onDisable?.();
        this.config.setPaused(false);
    }

    // ---- Building ---------------------------------------------------------------------------

    private build(): void {
        if (this.editor) return;
        const config = this.config;

        this.camera = config.camera();
        this.orbit = this.buildOrbit(this.camera, config.renderer.domElement);

        if (config.keepWaypointNames) this.names = new NamedPointKeeper();
        const projectCanEdit = config.pathEditor?.canEdit;

        this.editor = new PathEditor({
            scene: config.scene,
            camera: this.camera,
            renderer: config.renderer,
            // The playable's HUD covers the canvas and would swallow every press.
            isolateUi: true,
            cameraControls: this.orbit,
            pivotUnderPointer: true,
            // Game cameras are usually parented to a rig that writes them every frame.
            detachCamera: true,
            grid: { size: 200, divisions: 40 },
            ...config.pathEditor,
            canEdit: (action: EditorAction, context: EditActionContext) => {
                if (this.names && action === "deleteWaypoint" && context.waypointIndex !== null && !this.names.canDelete(context.path, context.waypointIndex)) return false;
                return projectCanEdit ? projectCanEdit(action, context) : true;
            },
        });

        this.editor.import(kitHost().placements());
        this.followPlacements(this.editor);

        // `__editor.moveWaypoint("waterfog", 0, [x, y, z])` is exactly what the gizmo does.
        (window as unknown as { __editor: PathEditor }).__editor = this.editor;

        this.buildShell();
        config.onFrame(() => this.update());
    }

    private buildShell(): void {
        const editor = this.editor!;
        const config = this.config;
        const shell = new Shell(config.title, config.saveDisabled);
        this.shell = shell;
        const saveNote = config.saveDisabled ? "Demo: Save is here to show the flow — it writes files only in a real project under npm start." : undefined;

        // ---- Scene: the path editor's own panel --------------------------------------------------
        const scene = shell.addSection("scene", "Scene");
        scene.append(heading("Scene", "Every marker and route in the placements file. Select a point in the game view and drag it with the gizmo — what stands on it follows in the same frame."));
        scene.appendChild(shortcuts());
        if (saveNote) scene.appendChild(note(saveNote));
        const host = document.createElement("div");
        scene.appendChild(host);
        this.scenePanel = new PathEditorPanel(editor, {
            container: host,
            title: config.placementsPath(),
            fileName: config.placementsPath().split("/").pop(),
            onSave: (json) =>
                saveJsonToProject(config.placementsPath(), json).then(
                    () => shell.setStatus(`Saved ${config.placementsPath()}`, "ok"),
                    (err) => {
                        shell.setStatus(String(err.message ?? err), "error");
                        throw err;
                    },
                ),
            visuals: false,
            ...config.panel,
        });

        // ---- VFX ------------------------------------------------------------------------------
        const vfx = shell.addSection("vfx", "VFX", () => this.vfxView?.render());
        this.vfxView = new VfxView(vfx, {
            entries: config.vfx,
            oneShots: config.oneShots,
            previewer: this.previewer,
            saveNote,
            selectedPoint: (entry) => this.selected.get(entry.id),
            selectPoint: (entry, markerId) => {
                this.selected.set(entry.id, markerId);
                editor.select(markerId);
            },
            add: (entry) => this.addInstance(entry),
            duplicate: (entry, instance) => this.duplicateInstance(entry, instance),
            remove: (instance) => {
                editor.removePath(instance.markerId);
                this.vfxView?.render();
            },
            save: (entry, instance) => this.saveInstance(entry, instance),
            saveAsDefault: (entry, instance) => this.save(defaultsPath(entry.id), JSON.stringify(entry.exportConfig(instance), null, 4)),
            copy: (entry, instance) => copyToClipboard(JSON.stringify(entry.exportConfig(instance), null, 4)).then((ok) => shell.setStatus(ok ? `${entry.label} config copied` : "Clipboard unavailable — the config is in the console", ok ? "ok" : "error")),
            moveTo: (instance, position) => editor.moveWaypoint(instance.markerId, 0, position.toArray()),
            placeOneShot: (id) => editor.createMarker({ id: nextId(editor, id.toLowerCase()), metadata: { [ONE_SHOT_KEY]: id }, select: true }),
            playOneShots: () => this.playOneShots(),
        });

        // ---- Tune -----------------------------------------------------------------------------
        if (config.tunables?.length) {
            const tune = shell.addSection("tune", "Tune");
            tune.append(heading("Tune", "Gameplay numbers the game reads live. Drag and watch; Save writes the JSON back."));
            tune.appendChild(this.panel("Tune", (panel) => buildTuneTab(panel, config.tunables!, saveNote)).dom);
        }

        // ---- Project sections -----------------------------------------------------------------
        const ctx = this.context();
        for (const tab of config.tabs ?? []) {
            const section = shell.addSection(`tab-${tab.label}`, tab.label);
            section.append(heading(tab.label, ""));
            section.appendChild(this.panel(tab.label, (panel) => tab.build(panel, ctx)).dom);
        }

        shell.actions.appendChild(this.windowButton());
        shell.root.addEventListener("pointerdown", () => {
            this.editing = true;
            // The pointer comes up in whichever window holds the editor — docked or popped out.
            const win = shell.root.ownerDocument.defaultView ?? window;
            win.addEventListener("pointerup", () => (this.editing = false), { once: true });
        });

        document.body.appendChild(shell.root);
        shell.setVisible(false);
        shell.restore();
        this.popout.attach(shell.root);
    }

    private panel(label: string, build: (panel: ControlPanel) => void): ControlPanel {
        const panel = new ControlPanel(label);
        build(panel);
        columnize(panel.dom.querySelector<HTMLElement>(".vl-body")!);
        this.panels.push(panel);
        return panel;
    }

    private windowButton(): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "kit-btn kit-ghost";
        const label = () => {
            button.textContent = this.popout.isOpen ? "⇲ Dock" : "⧉ Window";
            button.title = this.popout.isOpen ? "Put the editor back beside the game" : "Open the editor in its own window";
        };
        label();
        this.popout.onChange(() => {
            label();
            this.shell?.setDocked(!this.popout.isOpen);
        });
        button.addEventListener("click", () => this.popout.toggle());
        return button;
    }

    private context(): EditorContext {
        return {
            editor: this.editor!,
            save: (file, json) => this.save(file, json),
            saveIntoPath: (pathId, metadata) => {
                const editor = this.editor!;
                const path = editor.getPath(pathId);
                if (!path) return Promise.reject(new Error(`no path "${pathId}" to save into`));
                path.setMetadata({ ...(path.metadata as Record<string, unknown>), ...metadata });
                return this.save(this.config.placementsPath(), editor.exportString(2));
            },
            rebuild: () => this.vfxView?.render(),
        };
    }

    // ---- Instances ----------------------------------------------------------------------------

    private startingConfig(entry: VfxDevEntry): unknown {
        const saved = defaultsFor(entry.id) as object;
        return Object.keys(saved).length ? saved : (entry.defaultConfig?.() ?? {});
    }

    private addInstance(entry: VfxDevEntry): void {
        const editor = this.editor;
        if (!editor) return;
        if (entry.singleton && entry.instances().length) {
            this.shell?.setStatus(`${entry.label} is one per scene — move or delete the one it has`, "error");
            return;
        }
        const spot = entry.spot();
        const created = editor.createMarker({
            id: nextId(editor, entry.id),
            metadata: { [MAP_VFX_KEY]: entry.id, [MAP_VFX_CONFIG_KEY]: this.startingConfig(entry) },
            position: spot ? spot.toArray() : undefined,
            select: true,
        });
        this.selected.set(entry.id, created.id);
        this.vfxView?.open(entry.id);
        this.shell?.setStatus(`Placed ${created.id} — drag it into place in the game view`, "ok");
    }

    private duplicateInstance(entry: VfxDevEntry, instance: MapVfxInstanceBase): void {
        const editor = this.editor;
        if (!editor || entry.singleton) return;
        const created = editor.createMarker({
            id: nextId(editor, entry.id),
            metadata: { [MAP_VFX_KEY]: entry.id, [MAP_VFX_CONFIG_KEY]: entry.exportConfig(instance) },
            position: [...instance.marker.position],
            yaw: instance.marker.yaw,
            select: true,
        });
        this.selected.set(entry.id, created.id);
        this.vfxView?.render();
    }

    /** Writes an instance's settings into its own point and saves the placements file. */
    private saveInstance(entry: VfxDevEntry, instance: MapVfxInstanceBase): void {
        const editor = this.editor;
        const path = editor?.getPath(instance.markerId);
        if (!editor || !path) {
            this.shell?.setStatus(`${instance.markerId} is no longer in the scene — nothing saved`, "error");
            return;
        }
        path.setMetadata({ ...(path.metadata as Record<string, unknown>), [MAP_VFX_KEY]: entry.id, [MAP_VFX_CONFIG_KEY]: entry.exportConfig(instance) });
        void this.save(this.config.placementsPath(), editor.exportString(2));
    }

    private playOneShots(): void {
        const oneShots = this.config.oneShots;
        if (!oneShots || !this.editor) return;
        const at = new Vector3();
        for (const marker of readMarkers(this.editor.export())) {
            const id = marker.metadata[ONE_SHOT_KEY];
            if (typeof id === "string") oneShots.play(id, at.fromArray(marker.position), marker.yaw);
        }
    }

    /**
     * Every editor change — a drag, an add, a delete, an import — is pushed into the kit's marker
     * store, which re-seats every effect and route subscribed to it.
     */
    private followPlacements(editor: PathEditor): void {
        const sync = () => setLiveFile(editor.export());
        for (const event of ["change", "pathadded", "pathremoved", "import"] as const) editor.on(event, sync);
        if (this.names) {
            const names = this.names;
            editor.on("change", ({ path }: { path: Path }) => names.restoreMissing(path));
        }
        sync();
    }

    private buildOrbit(camera: Camera, domElement: HTMLElement): OrbitControls {
        const orbit = new OrbitControls(camera, domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        orbit.zoomSpeed = 0.8;
        orbit.panSpeed = 0.6;
        orbit.minDistance = 0.3;
        orbit.maxDistance = 500;
        orbit.enabled = false; // switched on with the mode
        return orbit;
    }

    private save(file: string, json: string): Promise<void> {
        return saveJsonToProject(file, json).then(
            () => this.shell?.setStatus(`Saved ${file}`, "ok"),
            (err) => this.shell?.setStatus(savingDisabled() ?? `Save failed: ${String(err?.message ?? err)}`, savingDisabled() ? "info" : "error"),
        );
    }

    private update(): void {
        if (!this.active || !this.editor) return;

        // The game's delta is 0 while paused, so the editor and the effects run off a wall clock —
        // otherwise everything freezes exactly when you sit down to tune it.
        const now = performance.now();
        const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.1);
        this.lastTime = now;

        const camera = this.config.camera();
        if (camera !== this.camera) {
            this.camera = camera;
            this.editor.setCamera(camera);
            if (this.orbit) {
                this.orbit.object = camera;
                this.orbit.update();
            }
        }

        this.orbit?.update();
        this.editor.update(dt);
        for (const entry of this.config.vfx) entry.tick(dt);
        this.previewer.tick(dt);

        this.sinceRefresh += dt;
        if (this.sinceRefresh >= REFRESH_INTERVAL && !this.editing) {
            this.sinceRefresh = 0;
            for (const panel of this.panels) panel.refresh();
            this.vfxView?.refresh();
            const placed = this.vfxView?.placedTotal ?? 0;
            this.shell?.setBadge("vfx", placed ? String(placed) : "");
        }
    }
}

function heading(title: string, lead: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const h = document.createElement("h2");
    h.textContent = title;
    fragment.appendChild(h);
    if (lead) {
        const p = document.createElement("p");
        p.className = "kit-lead";
        p.textContent = lead;
        fragment.appendChild(p);
    }
    return fragment;
}

function shortcuts(): HTMLElement {
    const list = document.createElement("div");
    list.className = "kit-keys";
    for (const [key, what] of SHORTCUTS) {
        const row = document.createElement("div");
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        row.append(kbd, document.createTextNode(what));
        list.appendChild(row);
    }
    return list;
}

function note(text: string): HTMLElement {
    const p = document.createElement("p");
    p.className = "kit-save-note";
    p.textContent = text;
    return p;
}

/** `waterfog`, `waterfog-2`, `waterfog-3`… — readable ids that read well in the pickers. */
function nextId(editor: PathEditor, base: string): string {
    if (!editor.getPath(base)) return base;
    for (let i = 2; ; i++) {
        const id = `${base}-${i}`;
        if (!editor.getPath(id)) return id;
    }
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        console.log(text);
        return false;
    }
}
