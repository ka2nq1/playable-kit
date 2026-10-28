import type { Path, Waypoint } from "../vendor/three-path-editor/editor.js";

interface NamedPoint {
    waypoint: Waypoint;
    index: number;
}

function nameOf(waypoint: Waypoint | undefined): string | undefined {
    const name = (waypoint?.metadata as { name?: unknown } | undefined)?.name;
    return typeof name === "string" ? name : undefined;
}

/**
 * Games that find route points by `metadata.name` break when a named point is deleted. This hands
 * the deleted point's metadata (name, facing) to the unnamed neighbour that takes its place, and
 * refuses the delete when there is no such neighbour. The hand-over runs inside the delete's change
 * event, so it undoes with it. Enabled by `keepWaypointNames` in `editor.config.ts`.
 */
export class NamedPointKeeper {
    private readonly namedPoints = new Map<string, NamedPoint[]>();

    /** For `canEdit`: the editor asks right before it deletes, so the snapshot is exactly what it removes from. */
    canDelete(path: Path, index: number): boolean {
        this.remember(path);
        if (!nameOf(path.waypoints[index])) return true;
        return this.findHeir(path, index + 1, index - 1) !== null;
    }

    /** For the `change` event. True when a name was handed over; that raises its own change event. */
    restoreMissing(path: Path): boolean {
        const lost = this.namedPoints.get(path.id)?.find(({ waypoint }) => !path.waypoints.includes(waypoint) && !this.hasName(path, nameOf(waypoint)!));
        if (lost) {
            const heir = this.findHeir(path, lost.index, lost.index - 1);
            if (heir !== null) {
                path.setWaypointMetadata(heir, { ...path.waypoints[heir].metadata, ...lost.waypoint.metadata });
                return true;
            }
        }
        this.remember(path);
        return false;
    }

    private remember(path: Path): void {
        const named: NamedPoint[] = [];
        path.waypoints.forEach((waypoint, index) => {
            if (nameOf(waypoint)) named.push({ waypoint, index });
        });
        this.namedPoints.set(path.id, named);
    }

    private findHeir(path: Path, ...candidates: number[]): number | null {
        for (const candidate of candidates) {
            const waypoint = path.waypoints[candidate];
            if (waypoint && !nameOf(waypoint)) return candidate;
        }
        return null;
    }

    private hasName(path: Path, name: string): boolean {
        return path.waypoints.some((waypoint) => nameOf(waypoint) === name);
    }
}
