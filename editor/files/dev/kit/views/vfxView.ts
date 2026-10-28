import type { Vector3 } from "three";
import type { MapVfxInstanceBase } from "../../../src/kit/MapVfxInstances";
import type { OneShotEffects } from "../config";
import type { VfxDevEntry } from "../registry";
import type { VfxPreviewer } from "../preview";
import { ControlPanel } from "../ui/ControlPanel";

/**
 * The VFX section: a grid of every effect the playable knows, and one effect's editor.
 *
 * The grid is the catalogue — a live picture of each effect, its name, and how many are placed in
 * this scene; hovering plays it. A click opens the effect: its points as chips, the actions on the
 * picked one, and every control of that instance below, laid out in columns.
 */

export interface VfxViewHost {
    readonly entries: readonly VfxDevEntry[];
    readonly oneShots?: OneShotEffects;
    readonly previewer: VfxPreviewer;
    /** Shown next to the Save buttons when saving is off (the demo). */
    readonly saveNote?: string;
    selectedPoint(entry: VfxDevEntry): string | undefined;
    selectPoint(entry: VfxDevEntry, markerId: string): void;
    add(entry: VfxDevEntry): void;
    duplicate(entry: VfxDevEntry, instance: MapVfxInstanceBase): void;
    remove(instance: MapVfxInstanceBase): void;
    save(entry: VfxDevEntry, instance: MapVfxInstanceBase): void;
    saveAsDefault(entry: VfxDevEntry, instance: MapVfxInstanceBase): void;
    copy(entry: VfxDevEntry, instance: MapVfxInstanceBase): void;
    moveTo(instance: MapVfxInstanceBase, position: Vector3): void;
    placeOneShot(id: string): void;
    playOneShots(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(label: string, onClick: () => void, kind = ""): HTMLButtonElement {
    const b = el("button", `kit-btn ${kind}`.trim(), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}

export class VfxView {
    private openId: string | null = null;
    private panel: ControlPanel | null = null;
    private counts: Array<{ entry: VfxDevEntry; badge: HTMLElement }> = [];

    constructor(
        readonly element: HTMLElement,
        private readonly host: VfxViewHost,
    ) {}

    /** Re-renders whatever is showing — after points were added, removed or picked. */
    render(): void {
        this.host.previewer.stop();
        const entry = this.openId ? this.host.entries.find((e) => e.id === this.openId) : undefined;
        if (entry) this.renderDetail(entry);
        else this.renderGrid();
    }

    open(entryId: string | null): void {
        this.openId = entryId;
        this.render();
        this.element.closest(".kit-content")?.scrollTo({ top: 0 });
    }

    /** Periodic: live readouts in the open editor, placed counts on the tiles. */
    refresh(): void {
        this.panel?.refresh();
        for (const { entry, badge } of this.counts) this.paintCount(entry, badge);
    }

    get placedTotal(): number {
        return this.host.entries.reduce((sum, e) => sum + e.instances().length, 0);
    }

    // ---- Grid ------------------------------------------------------------------------------------

    private renderGrid(): void {
        this.panel = null;
        this.counts = [];
        const root = this.element;
        root.replaceChildren();

        root.append(el("h2", "", "Visual effects"), el("p", "kit-lead", "Hover to preview, click to place and tune. Every effect on the scene is a point you can drag in Scene."));

        if (!this.host.entries.length) {
            root.appendChild(el("div", "kit-empty", "No effects registered yet — /vfx-new adds one to dev/vfx/registry.ts."));
        }

        const groups = new Map<string, VfxDevEntry[]>();
        for (const entry of this.host.entries) {
            const group = entry.group ?? "Effects";
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(entry);
        }

        for (const [group, entries] of groups) {
            if (groups.size > 1) root.appendChild(el("div", "kit-group-title", group));
            const grid = el("div", "kit-grid");
            for (const entry of entries) grid.appendChild(this.tile(entry));
            root.appendChild(grid);
        }

        const oneShots = this.host.oneShots;
        if (oneShots?.ids.length) {
            root.appendChild(el("div", "kit-group-title", "One-shot effects"));
            const row = el("div", "kit-oneshots");
            for (const id of oneShots.ids) row.appendChild(button(`+ ${id}`, () => this.host.placeOneShot(id)));
            row.appendChild(button("Play all one-shots", () => this.host.playOneShots(), "kit-primary"));
            root.appendChild(row);
            root.appendChild(el("p", "kit-lead", "A one-shot marker lands in the middle of the view; drag it in Scene."));
        }
    }

    private tile(entry: VfxDevEntry): HTMLElement {
        const tile = el("button", "kit-tile");
        tile.type = "button";
        const canvas = el("canvas");
        const badge = el("span", "kit-tile-count");
        const body = el("div", "kit-tile-body");
        body.append(el("div", "kit-tile-name", entry.label));
        if (entry.hint) body.append(el("div", "kit-tile-hint", entry.hint));
        tile.append(canvas, badge, body);

        this.counts.push({ entry, badge });
        this.paintCount(entry, badge);
        this.host.previewer.thumbnail(entry, canvas);

        tile.addEventListener("pointerenter", () => this.host.previewer.animate(entry, canvas));
        tile.addEventListener("pointerleave", () => this.host.previewer.stop());
        tile.addEventListener("click", () => this.open(entry.id));
        return tile;
    }

    private paintCount(entry: VfxDevEntry, badge: HTMLElement): void {
        const n = entry.instances().length;
        badge.textContent = n ? `${n} placed` : "not placed";
        badge.classList.toggle("kit-placed", n > 0);
    }

    // ---- Detail ----------------------------------------------------------------------------------

    private renderDetail(entry: VfxDevEntry): void {
        this.counts = [];
        const root = this.element;
        root.replaceChildren();
        const instances = entry.instances();
        const instance = instances.find((i) => i.markerId === this.host.selectedPoint(entry)) ?? instances[0];

        const head = el("div", "kit-detail-head");
        const title = el("div", "kit-detail-title");
        title.append(button("← All effects", () => this.open(null), "kit-ghost"), el("h2", "", entry.label));
        if (entry.hint) title.append(el("span", "kit-tile-hint", entry.hint));
        head.appendChild(title);
        root.appendChild(head);

        if (!instance) {
            const empty = el("div", "kit-empty");
            const canvas = el("canvas");
            empty.append(canvas, el("div", "", `No ${entry.label.toLowerCase()} in this scene yet.`));
            empty.append(button(`+ Place ${entry.label.toLowerCase()}`, () => this.host.add(entry), "kit-primary"));
            empty.append(el("div", "kit-tile-hint", "It lands in front of the camera with its starting settings; drag it into place in Scene."));
            root.appendChild(empty);
            this.host.previewer.thumbnail(entry, canvas);
            this.host.previewer.animate(entry, canvas);
            this.panel = null;
            return;
        }

        if (instance.markerId !== this.host.selectedPoint(entry)) this.host.selectPoint(entry, instance.markerId);

        const points = el("div", "kit-row");
        const chips = el("div", "kit-points");
        for (const i of instances) {
            const chip = el("button", `kit-point${i === instance ? " kit-active" : ""}`, i.markerId);
            chip.type = "button";
            chip.addEventListener("click", () => {
                this.host.selectPoint(entry, i.markerId);
                this.render();
            });
            chips.appendChild(chip);
        }
        points.append(chips, el("span", "kit-spacer"));
        const add = button(entry.singleton ? "One per scene" : "+ Place another", () => this.host.add(entry));
        add.disabled = !!entry.singleton;
        points.append(add, button("Duplicate", () => this.host.duplicate(entry, instance)), button("Delete", () => this.host.remove(instance), "kit-danger"));
        head.appendChild(points);

        const actions = el("div", "kit-row");
        actions.append(button("Save point", () => this.host.save(entry, instance), "kit-primary"), button("Save as default", () => this.host.saveAsDefault(entry, instance)), button("Copy JSON", () => this.host.copy(entry, instance), "kit-ghost"));
        if (entry.burst) actions.append(button("Fire", () => entry.burst!(instance)));
        if (this.host.saveNote) actions.append(el("span", "kit-save-note", this.host.saveNote));
        head.appendChild(actions);

        const panel = new ControlPanel(entry.label);
        entry.build(panel, instance, {
            instanceId: instance.markerId,
            save: () => this.host.save(entry, instance),
            saveAsDefault: () => this.host.saveAsDefault(entry, instance),
            copy: () => this.host.copy(entry, instance),
            moveTo: (position) => this.host.moveTo(instance, position),
        });
        root.appendChild(panel.dom);
        this.panel = panel;
    }
}
