import { readPathFile, type Path } from "../vendor/three-path-editor/dist/index.js";
import { currentPlacements, onPlacementsChanged } from "./markers";

/**
 * Routes: the paths (not markers) of the placements file, as live `Path` objects for `PathFollower`.
 *
 * Importing this module ships the path-editor runtime (~67 KB). Only do it when something really
 * follows a curve — a character walking, a camera flying. Standing things are markers.
 *
 * Each route is one `Path` instance for the whole session. While the editor is open, a change is
 * written into the same instance (`setData`), so a `PathFollower` built on it keeps following the
 * line you are dragging instead of a stale copy.
 */

const routes = new Map<string, Path>();
let loaded = false;

function load(): void {
    const file = readPathFile(currentPlacements());
    const seen = new Set<string>();
    for (const path of file.paths) {
        if (path.isMarker) continue;
        seen.add(path.id);
        const existing = routes.get(path.id);
        if (existing) existing.setData(path.toJSON());
        else routes.set(path.id, path);
    }
    for (const id of [...routes.keys()]) if (!seen.has(id)) routes.delete(id);
}

function ensure(): void {
    if (loaded) return;
    loaded = true;
    load();
    onPlacementsChanged(load);
}

/** The route `id`, or null when the file has none — a missing route is a normal authoring state. */
export function route(id: string): Path | null {
    ensure();
    return routes.get(id) ?? null;
}

/** Every route, in file order. */
export function allRoutes(): Path[] {
    ensure();
    return [...routes.values()];
}

/** Routes whose `metadata[key]` is set — or equals `value` when one is given. */
export function routesWhere(key: string, value?: unknown): Path[] {
    return allRoutes().filter((path) => {
        const v = (path.metadata as Record<string, unknown>)[key];
        return value === undefined ? v !== undefined : v === value;
    });
}
