/**
 * The Place tab: put effects into the scene and see what is already there.
 *
 * Every placed thing is a path-editor **marker** — one named point with a facing — whose metadata
 * says what it is. The gizmo moves and turns it, R switches to turning, Delete removes it.
 *
 *  - `metadata.mapVfx` — a map effect. One marker is one live instance with its own settings
 *    (`metadata.config`), tuned in that effect's tab.
 *  - `metadata.vfx` — a one-shot effect from `oneShots`, played where it stands.
 */

import { Vector3 } from "three";
import type { PathEditor } from "../../vendor/three-path-editor/editor.js";
import type { ControlPanel } from "../ui/ControlPanel";
import type { OneShotEffects } from "../config";
import type { VfxDevEntry } from "../registry";
import { MAP_VFX_KEY, markerEffect, readMarkers, type Marker } from "../../../src/kit/markers";

const ONE_SHOT_KEY = "vfx";

const _position = new Vector3();

export interface PlaceActions {
    add(entry: VfxDevEntry): void;
    placementsPath(): string;
    nextId(base: string): string;
}

function oneShotMarkers(editor: PathEditor): Marker[] {
    return readMarkers(editor.export()).filter((m) => typeof m.metadata[ONE_SHOT_KEY] === "string");
}

function mapMarkers(editor: PathEditor): Marker[] {
    return readMarkers(editor.export()).filter((m) => markerEffect(m) !== "");
}

function play(oneShots: OneShotEffects, marker: Marker): void {
    _position.set(...marker.position);
    oneShots.play(marker.metadata[ONE_SHOT_KEY] as string, _position, marker.yaw);
}

export function buildPlaceTab(panel: ControlPanel, editor: PathEditor, entries: readonly VfxDevEntry[], oneShots: OneShotEffects | undefined, actions: PlaceActions): void {
    const scope = panel.folder("This scene");
    scope.readout("Saves into", () => actions.placementsPath());
    scope.readout("Effects placed", () => {
        const markers = mapMarkers(editor);
        if (!markers.length) return "nothing yet";
        return `${markers.length} point${markers.length === 1 ? "" : "s"} · ${new Set(markers.map(markerEffect)).size} kind(s)`;
    });
    scope.note("Everything placed is a point in one file. Delete a point and the effect is gone; duplicate it and you have a second one to tune separately. Paths → Save writes every point at once.");

    if (entries.length) {
        let effect = entries[0];
        const map = panel.folder("Add a map effect");
        map.select<string>("Effect", entries.map((e) => e.id), () => effect.id, (v) => {
            effect = entries.find((e) => e.id === v) ?? entries[0];
            panel.refresh();
        });
        map.readout("Already here", () => {
            const instances = effect.instances();
            if (!instances.length) return "none";
            return `${instances.length} · ${instances.map((i) => i.markerId).join(", ")}${effect.singleton ? " (one per scene)" : ""}`;
        });
        map.buttons({ label: "+ Place it", primary: true, onClick: () => actions.add(effect) });
        map.note("The point lands in front of you with the effect's starting settings (src/resources/editor/defaults/). Tune it in its own tab; that tab's Save writes the settings into the point.");
    } else {
        panel.folder("No map effects yet").note("Add one with /vfx-new — it lands in dev/vfx/registry.ts and shows up here.");
    }

    if (oneShots?.ids.length) {
        let vfx = oneShots.ids[0];
        const place = panel.folder("One-shot effects", false);
        place.select<string>("Effect", oneShots.ids, () => vfx, (v) => (vfx = v));
        place.buttons({
            label: "+ Marker in view",
            onClick: () => editor.createMarker({ id: actions.nextId(vfx.toLowerCase()), metadata: { [ONE_SHOT_KEY]: vfx }, select: true }),
        });
        place.buttons(
            {
                label: "Play selected",
                primary: true,
                onClick: () => {
                    const marker = oneShotMarkers(editor).find((m) => m.id === editor.selectedPath?.id);
                    if (marker) play(oneShots, marker);
                    else console.warn("[editor] select a one-shot marker first");
                },
            },
            { label: "Play all", onClick: () => oneShotMarkers(editor).forEach((m) => play(oneShots, m)) },
        );
    }

    const selection = panel.folder("Selected", false);
    selection.readout("Point", () => {
        const path = editor.selectedPath;
        if (!path) return "—";
        const marker = readMarkers(editor.export()).find((m) => m.id === path.id);
        if (!marker) return `${path.id} · route`;
        const [x, y, z] = marker.position;
        const what = markerEffect(marker) || (marker.metadata[ONE_SHOT_KEY] as string | undefined) || Object.keys(marker.metadata).join(", ") || "plain marker";
        return `${marker.id} · ${what} · ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
    });
    selection.note(`A marker whose metadata names nothing known (no ${MAP_VFX_KEY}, no ${ONE_SHOT_KEY}) is ignored by the effects, so a half-authored file never crashes the game.`);
}
