import { Box3, Vector3, type Object3D } from "three";
import { kitHost } from "./host";
import type { Marker } from "./markers";

/**
 * Where a map effect stands relative to its marker.
 *
 * Effects from vfx-lab know nothing about the scene: each is an `Object3D` you put somewhere. The
 * marker is the base point; every effect's config carries one small kit-only section on top:
 *
 *     "anchor": { "mesh": "Circle.001", "offset": [0, 0.05, 0], "fitSize": true }
 *
 * `offset` is added to the marker (the lift that keeps mist clear of the water). `mesh` names a
 * scene object whose horizontal footprint `fitSize` lets the effect take its size from — what "size"
 * means is each effect's own (`areaSize`, `spawnAreaSize`). The controller reads
 * {@link AnchorFit.size} and decides; this module only measures.
 */

export interface VfxAnchorConfig {
    mesh: string;
    offset: [number, number, number];
    fitSize: boolean;
}

export interface AnchorDefaults {
    mesh?: string;
    offset?: [number, number, number];
    fitSize?: boolean;
}

export interface AnchorFit {
    /** Where the effect's object goes, in world space. */
    position: Vector3;
    /** Facing in degrees around Y, from the marker. */
    yaw: number;
    /** The anchor mesh's larger horizontal extent. Zero when there is no mesh to measure. */
    size: number;
    object: Object3D | null;
}

function isVec3(value: unknown): value is [number, number, number] {
    return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Reads an `anchor` section with per-effect defaults; bad fields fall back with a warning. */
export function normalizeAnchor(raw: unknown, effect: string, defaults: AnchorDefaults = {}): VfxAnchorConfig {
    const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const warn = (key: string) => console.warn(`[vfx] ${effect}.anchor.${key} is malformed — using the default`);

    if (root.mesh !== undefined && typeof root.mesh !== "string") warn("mesh");
    if (root.offset !== undefined && !isVec3(root.offset)) warn("offset");
    if (root.fitSize !== undefined && typeof root.fitSize !== "boolean") warn("fitSize");

    return {
        mesh: typeof root.mesh === "string" ? root.mesh : (defaults.mesh ?? ""),
        offset: isVec3(root.offset) ? [...root.offset] : [...(defaults.offset ?? [0, 0, 0])],
        fitSize: typeof root.fitSize === "boolean" ? root.fitSize : (defaults.fitSize ?? false),
    };
}

const _bounds = new Box3();
const _size = new Vector3();
const _offset = new Vector3();

/**
 * Where this instance should sit now. Recomputed on every call rather than cached: the editor moves
 * markers with a gizmo and asks for a refit, and bounds are cheap next to the frame that follows.
 */
export function fitToAnchor(anchor: VfxAnchorConfig, marker: Marker): AnchorFit {
    const [ox, oy, oz] = anchor.offset;
    const object = anchor.mesh ? kitHost().findObject(anchor.mesh) : null;

    let size = 0;
    if (object) {
        // `setFromObject` refreshes the object's own world matrix but not its ancestors', and the
        // first fit runs during bootstrap, before the renderer has walked the graph once.
        object.updateWorldMatrix(true, true);
        _bounds.setFromObject(object);
        if (!_bounds.isEmpty()) {
            _bounds.getSize(_size);
            size = Math.max(_size.x, _size.z);
        }
    }

    const [mx, my, mz] = marker.position;
    return { position: new Vector3(mx + ox, my + oy, mz + oz), yaw: marker.yaw, size, object };
}

/** Where a marker has to stand for the effect not to move: its position less the offset. */
export function markerSpot(object: Object3D | null | undefined, anchor: VfxAnchorConfig | undefined): Vector3 | null {
    if (!object || !anchor) return null;
    const [ox, oy, oz] = anchor.offset;
    return object.position.clone().sub(_offset.set(ox, oy, oz));
}

/** The `anchor` section as it is written back, so a Save keeps the kit half of the config. */
export function exportAnchor(anchor: VfxAnchorConfig): Record<string, unknown> {
    return { mesh: anchor.mesh, offset: [...anchor.offset], fitSize: anchor.fitSize };
}
