import { kitHost } from "./host";

/**
 * Markers: the one thing in the placements file every runtime reader shares.
 *
 * The placements file is a three-path-editor file. A **marker** in it is one point with a facing
 * plus free-form `metadata`, and the metadata says what the point is:
 *
 *  - `mapVfx: "<id>"` + `config: {...}` — a map effect. The marker *is* the effect: one marker, one
 *    live instance running on the settings in `config` (see `MapVfxInstances`).
 *  - anything else the playable defines — `character: "Guard"`, `vfx: "confetti"`, `spawn: true` —
 *    read with {@link markerById} or {@link markersWhere}.
 *
 * Look markers up by id or metadata, never by index: the editor reorders and renames freely.
 *
 * The parser is hand-written on purpose. The game needs four fields out of a file the editor has
 * already validated, and importing `three-path-editor` here would ship its runtime for nothing.
 * Routes, which do need it, are in `routes.ts`.
 */

/** The metadata key a marker carries to claim a map effect, e.g. `{ "mapVfx": "waterfog" }`. */
export const MAP_VFX_KEY = "mapVfx";

/** The metadata key holding that instance's own settings. */
export const MAP_VFX_CONFIG_KEY = "config";

export interface Marker {
    /** The marker's own id in the path file. */
    id: string;
    metadata: Record<string, unknown>;
    /** World position, as stored in the file. */
    position: [number, number, number];
    /** Facing in degrees around Y. */
    yaw: number;
}

interface RawPath {
    id?: unknown;
    kind?: unknown;
    metadata?: Record<string, unknown>;
    points?: Array<{ position?: unknown; yaw?: unknown }>;
}

function isVec3(value: unknown): value is [number, number, number] {
    return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n));
}

/**
 * Every marker in a path file. Routes and markers without a point are skipped silently: a
 * half-authored file is a normal state while placing things, not an error the game should die on.
 */
export function readMarkers(file: unknown): Marker[] {
    const paths = (file as { paths?: RawPath[] } | null)?.paths;
    if (!Array.isArray(paths)) return [];

    const markers: Marker[] = [];
    for (const path of paths) {
        if (path?.kind !== "marker") continue;
        const point = path.points?.[0];
        if (!point || !isVec3(point.position)) continue;
        markers.push({
            id: typeof path.id === "string" ? path.id : "marker",
            metadata: path.metadata ?? {},
            position: [point.position[0], point.position[1], point.position[2]],
            yaw: typeof point.yaw === "number" ? point.yaw : 0,
        });
    }
    return markers;
}

/** The map effect a marker claims, matching that effect's controller `ID`. Empty when none. */
export function markerEffect(marker: Marker): string {
    const effect = marker.metadata[MAP_VFX_KEY];
    return typeof effect === "string" ? effect : "";
}

/**
 * The settings an instance runs on, straight out of its marker. An empty object when it carries
 * none: every effect's own normalizer fills its defaults in.
 */
export function markerConfig(marker: Marker): unknown {
    const config = marker.metadata[MAP_VFX_CONFIG_KEY];
    return config && typeof config === "object" ? config : {};
}

/**
 * The markers in play: the saved file, read once, or — while the editor is open — the editor's
 * live state, pushed on every change by {@link setLiveFile}. That push is what makes dragging a
 * point move the thing standing on it in the same frame.
 */
let live: Marker[] | null = null;
let liveFile: unknown = null;
const listeners = new Set<() => void>();

function current(): Marker[] {
    if (!live) live = readMarkers(kitHost().placements());
    return live;
}

export function allMarkers(): readonly Marker[] {
    return current();
}

export function markerById(id: string): Marker | null {
    return current().find((marker) => marker.id === id) ?? null;
}

/** Markers whose `metadata[key]` is set — or equals `value` when one is given. */
export function markersWhere(key: string, value?: unknown): Marker[] {
    return current().filter((marker) => (value === undefined ? marker.metadata[key] !== undefined : marker.metadata[key] === value));
}

/** Every marker claiming map effect `effect`, in file order — one live instance each. */
export function markersFor(effect: string): Marker[] {
    return current().filter((marker) => markerEffect(marker) === effect);
}

/** The placements file as a whole: the saved one, or the editor's live state while it is open. */
export function currentPlacements(): unknown {
    return liveFile ?? kitHost().placements();
}

/**
 * Editor only: adopt the editor's current file and tell every subscriber to re-seat itself.
 * Nothing in a build calls this, so the runtime reads the saved file and nothing else.
 */
export function setLiveFile(file: unknown): void {
    liveFile = file;
    live = readMarkers(file);
    for (const listener of listeners) listener();
}

/**
 * Runs `listener` whenever the placements change — a point dragged, added or deleted in the
 * editor. In a build nothing ever fires it.
 */
export function onPlacementsChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
