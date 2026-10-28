/**
 * The editor: place, drag and tune things in the running game, and save the result into the project.
 *
 * One panel, built from independent tabs:
 *  - **Paths** — three-path-editor: every marker and route, moved with the gizmo. Its Save writes
 *    the placements file.
 *  - **Place** — add map effects and one-shots, see what the scene holds.
 *  - **Tune** — JSON configs the game reads live (`tunables`).
 *  - one tab per map effect in `dev/vfx/registry.ts`, editing one instance at a time.
 *  - the project's own tabs (`tabs`).
 *
 * Nothing here creates a scene, camera, renderer or loop; it borrows the game's, as described by
 * `dev/editor.config.ts`, and hands everything back on exit. The whole module is dev-only by
 * absence: it sits outside `src/` and is reached only from `boot.ts`, which the dev server injects.
 */

import type { Camera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PathEditor, PathEditorPanel, type EditActionContext, type EditorAction, type Path } from "../vendor/three-path-editor/editor.js";
import { kitHost } from "../../src/kit/host";
import { MAP_VFX_CONFIG_KEY, MAP_VFX_KEY, setLiveFile } from "../../src/kit/markers";
import type { MapVfxInstanceBase } from "../../src/kit/MapVfxInstances";
import { ControlPanel } from "./ui/ControlPanel";
import { useTabDropdown } from "./ui/tabSelect";
import "./ui/embed.css";
import type { EditorConfig, EditorContext } from "./config";
import type { VfxDevEntry } from "./registry";
import { defaultsFor, defaultsPath } from "./defaults";
import { saveJsonToProject } from "./devSave";
import { buildPlaceTab } from "./panels/placeTab";
import { buildTuneTab } from "./panels/tuneTab";
import { PanelPopout } from "./popout";
import { NamedPointKeeper } from "./NamedPointKeeper";

/** Live readouts refresh at this interval, in seconds. */
const REFRESH_INTERVAL = 0.25;

export class EditorMode {
    private editor: PathEditor | null = null;
    private orbit: OrbitControls | null = null;
    private panel: PathEditorPanel | null = null;
    private tabs: ControlPanel[] = [];
    private popout: PanelPopout;
    private names: NamedPointKeeper | null = null;

    /** Which point each effect's tab is pointed at, so a rebuild does not lose your place. */
    private readonly selected = new Map<string, string>();

    private active = false;
    private camera: Camera | null = null;
    private lastTime = 0;
    private sinceRefresh = 0;
    /** Set while the pointer is down inside the panel, so a refresh can't fight a drag. */
    private editing = false;

    constructor(private readonly config: EditorConfig) {
        this.popout = new PanelPopout(config.title);
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
        this.panel?.setVisible(true);
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
        console.info("[editor] ON — press the toggle key again to leave");
    }

    disable(): void {
        if (!this.active) return;
        this.active = false;

        this.popout.hide();
        this.editor?.disable();
        this.panel?.setVisible(false);
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
            // Orbit with the mouse; the editor suspends the controls for the length of a gizmo drag.
            cameraControls: this.orbit,
            // Keeps zoom and pan from stalling near a fixed pivot.
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

        this.buildPanel();
        config.onFrame(() => this.update());
    }

    /**
     * The panel and its tabs. Rebuilt rather than patched whenever which controls exist changes
     * (an instance added, another picked): the package's panel appends tabs, it does not replace them.
     */
    private buildPanel(): void {
        const editor = this.editor;
        if (!editor) return;
        const config = this.config;

        const activeTab = this.panel?.activeTab ?? 0;
        this.panel?.dispose();
        this.tabs.length = 0;

        this.panel = new PathEditorPanel(editor, {
            title: config.title,
            tabLabel: "Paths",
            fileName: config.placementsPath().split("/").pop(),
            hideWhenDisabled: true,
            onSave: (json) => saveJsonToProject(config.placementsPath(), json),
            visuals: false,
            ...config.panel,
        });

        this.panel.addTab(
            this.tab("Place", (panel) =>
                buildPlaceTab(panel, editor, config.vfx, config.oneShots, {
                    add: (entry) => this.addInstance(entry),
                    placementsPath: () => config.placementsPath(),
                    nextId: (base) => nextId(editor, base),
                }),
            ),
        );
        if (config.tunables?.length) this.panel.addTab(this.tab("Tune", (panel) => buildTuneTab(panel, config.tunables!)));
        for (const entry of config.vfx) this.panel.addTab(this.tab(entry.label, (panel) => this.buildEntry(entry, panel)));
        const ctx = this.context();
        for (const tab of config.tabs ?? []) this.panel.addTab(this.tab(tab.label, (panel) => tab.build(panel, ctx)));

        const row = useTabDropdown(this.panel);
        if (row) row.appendChild(this.popoutButton());
        if (activeTab) this.panel.selectTab(activeTab);
        this.panel.setVisible(this.active);
        this.popout.attach(this.panel.element);
    }

    private popoutButton(): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        const label = () => {
            button.textContent = this.popout.isOpen ? "Dock" : "Window";
            button.title = this.popout.isOpen ? "Put the panel back over the game" : "Open the panel in a separate window";
        };
        label();
        this.popout.onChange(label);
        button.addEventListener("click", () => this.popout.toggle());
        return button;
    }

    private context(): EditorContext {
        return {
            editor: this.editor!,
            save: (file, json) => saveJsonToProject(file, json),
            saveIntoPath: (pathId, metadata) => {
                const editor = this.editor!;
                const path = editor.getPath(pathId);
                if (!path) return Promise.reject(new Error(`no path "${pathId}" to save into`));
                path.setMetadata({ ...(path.metadata as Record<string, unknown>), ...metadata });
                return saveJsonToProject(this.config.placementsPath(), editor.exportString(2));
            },
            rebuild: () => this.buildPanel(),
        };
    }

    /**
     * One effect's tab: the instance picker, then the controls for the picked instance. An effect
     * with no points at all is a tab that offers to place the first one.
     */
    private buildEntry(entry: VfxDevEntry, panel: ControlPanel): void {
        const instances = entry.instances();
        if (!instances.length) {
            const folder = panel.folder(`No ${entry.label.toLowerCase()} here yet`);
            folder.buttons({ label: `Place ${entry.label.toLowerCase()}`, primary: true, onClick: () => this.addInstance(entry) });
            folder.note("Every effect is a point you can see, drag and delete. Placing one drops it in front of you with the starting settings from src/resources/editor/defaults/.");
            return;
        }

        const instance = instances.find((i) => i.markerId === this.selected.get(entry.id)) ?? instances[0];
        this.selected.set(entry.id, instance.markerId);

        const which = panel.folder(`${entry.label} · ${instance.markerId}`);
        if (instances.length > 1) {
            which.select<string>("Point", instances.map((i) => i.markerId), () => instance.markerId, (v) => {
                this.selected.set(entry.id, v);
                this.editor?.select(v);
                this.buildPanel();
            });
        }
        which.buttons(
            { label: entry.singleton ? "Only one per scene" : "+ Another", onClick: () => this.addInstance(entry) },
            { label: "Duplicate", onClick: () => this.duplicateInstance(entry, instance) },
            { label: "Delete", onClick: () => this.deleteInstance(instance) },
        );

        entry.build(panel, instance, {
            instanceId: instance.markerId,
            save: () => this.saveInstance(entry, instance, panel),
            moveTo: (position) => this.editor?.moveWaypoint(instance.markerId, 0, position.toArray()),
            copy: () => copyToClipboard(JSON.stringify(entry.exportConfig(instance), null, 4), entry.id),
            saveAsDefault: () => this.save(defaultsPath(entry.id), JSON.stringify(entry.exportConfig(instance), null, 4), panel),
        });
    }

    private addInstance(entry: VfxDevEntry): void {
        const editor = this.editor;
        if (!editor) return;
        if (entry.singleton && entry.instances().length) {
            console.warn(`[editor] ${entry.id} is one per scene — move or delete the point it already has`);
            return;
        }
        const spot = entry.spot();
        const created = editor.createMarker({
            id: nextId(editor, entry.id),
            metadata: { [MAP_VFX_KEY]: entry.id, [MAP_VFX_CONFIG_KEY]: defaultsFor(entry.id) },
            position: spot ? spot.toArray() : undefined,
            select: true,
        });
        this.selected.set(entry.id, created.id);
        this.buildPanel();
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
        this.buildPanel();
    }

    private deleteInstance(instance: MapVfxInstanceBase): void {
        this.editor?.removePath(instance.markerId);
        this.buildPanel();
    }

    /** Writes an instance's settings into its own point and saves the placements file. */
    private saveInstance(entry: VfxDevEntry, instance: MapVfxInstanceBase, panel: ControlPanel): void {
        const editor = this.editor;
        const path = editor?.getPath(instance.markerId);
        if (!editor || !path) {
            console.warn(`[editor] ${instance.markerId} is no longer in the editor — nothing saved`);
            return;
        }
        path.setMetadata({ ...(path.metadata as Record<string, unknown>), [MAP_VFX_KEY]: entry.id, [MAP_VFX_CONFIG_KEY]: entry.exportConfig(instance) });
        this.save(this.config.placementsPath(), editor.exportString(2), panel);
    }

    /**
     * Every editor change — a drag, an add, a delete, an import — is pushed into the kit's marker
     * store, which re-seats every effect and route subscribed to it. The export is the whole file
     * each time: a handful of points, and only while the editor is open.
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

    private tab(label: string, build: (panel: ControlPanel) => void): { label: string; element: HTMLElement } {
        const panel = new ControlPanel(label);
        build(panel);
        panel.dom.addEventListener("pointerdown", () => {
            this.editing = true;
            // The pointer comes up in whichever window holds the panel — docked or popped out.
            const win = panel.dom.ownerDocument.defaultView ?? window;
            win.addEventListener("pointerup", () => (this.editing = false), { once: true });
        });
        this.tabs.push(panel);
        return { label, element: panel.dom };
    }

    private save(file: string, json: string, panel: ControlPanel): void {
        saveJsonToProject(file, json)
            .then(() => console.info(`[editor] saved ${file}`))
            .catch((err) => console.warn(`[editor] save failed: ${String(err)}`))
            .finally(() => panel.refresh());
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

        this.sinceRefresh += dt;
        if (this.sinceRefresh >= REFRESH_INTERVAL && !this.editing) {
            this.sinceRefresh = 0;
            for (const panel of this.tabs) panel.refresh();
        }
    }
}

/** `waterfog`, `waterfog-2`, `waterfog-3`… — readable ids that read well in the pickers. */
function nextId(editor: PathEditor, base: string): string {
    if (!editor.getPath(base)) return base;
    for (let i = 2; ; i++) {
        const id = `${base}-${i}`;
        if (!editor.getPath(id)) return id;
    }
}

async function copyToClipboard(text: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        console.info(`[editor] ${what} config copied to clipboard`);
    } catch {
        console.warn("[editor] clipboard unavailable — config printed below instead");
        console.log(text);
    }
}
