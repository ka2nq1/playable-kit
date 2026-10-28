import type { Vector3 } from "three";
import { kitHost } from "./host";
import { markersFor, onPlacementsChanged, type Marker } from "./markers";

/**
 * The live instances of one map effect, kept in step with that effect's markers.
 *
 * A marker claiming the effect (`metadata.mapVfx`) is one instance, carrying its own settings in
 * `metadata.config`. Add a second marker and a second, independently tuned instance appears; delete
 * a marker and its instance is disposed. Nothing else brings one into being, so an effect cannot be
 * somewhere on the map without a point you can select, drag or delete.
 *
 * {@link sync} is keyed by marker id and runs on every editor change — every frame of a gizmo drag.
 * A surviving marker is only re-fitted, never re-created: the live config object belongs to the
 * instance and the panel edits it in place, so dragging a slider must not throw the effect away and
 * read its settings back out of the file. `metadata.config` is written only by Save.
 */

export interface MapVfxInstanceBase {
    /** The marker that owns this instance. Its id names the instance across the editor. */
    readonly markerId: string;
    /**
     * That marker as it stands right now. Re-pointed on every sync, because the editor hands out a
     * fresh set of marker objects each time rather than mutating the old ones.
     */
    marker: Marker;
}

export interface MapVfxKind<T extends MapVfxInstanceBase> {
    /** The effect's id — `WaterFogC.ID` — as a marker claims it. */
    id: string;
    /** One instance per map at most, however many markers claim it (a sky, a sun glare). */
    singleton?: boolean;
    /** Builds one instance from its marker. Null when this scene cannot carry it. */
    create(marker: Marker): T | null;
    /** Re-seats the instance on its marker. False when its anchor mesh is missing. */
    fit(instance: T): boolean;
    /** One frame of this instance. */
    update(instance: T, dt: number): void;
    /** Releases it — the marker is gone. */
    dispose(instance: T): void;
}

export class MapVfxInstances<T extends MapVfxInstanceBase> {
    private readonly live: T[] = [];
    private started = false;

    constructor(private readonly kind: MapVfxKind<T>) {}

    /** Every live instance, in marker order. */
    get all(): readonly T[] {
        return this.live;
    }

    get first(): T | null {
        return this.live[0] ?? null;
    }

    get(markerId: string): T | null {
        return this.live.find((instance) => instance.markerId === markerId) ?? null;
    }

    /** Starts following the markers. One update subscription for the whole kind. */
    init(): void {
        if (this.started) return;
        this.started = true;
        this.sync();
        onPlacementsChanged(() => this.sync());
        kitHost().onUpdate((dt) => this.tick(dt));
    }

    sync(): void {
        let markers = markersFor(this.kind.id);
        if (this.kind.singleton && markers.length > 1) {
            console.warn(`[vfx] ${this.kind.id}: ${markers.length} markers, but this effect is one per map — "${markers[0].id}" wins`);
            markers = markers.slice(0, 1);
        }

        const wanted = new Set(markers.map((marker) => marker.id));
        for (let i = this.live.length - 1; i >= 0; i--) {
            const instance = this.live[i];
            if (wanted.has(instance.markerId)) continue;
            this.kind.dispose(instance);
            this.live.splice(i, 1);
        }

        for (const marker of markers) {
            const existing = this.get(marker.id);
            if (existing) {
                existing.marker = marker;
                this.kind.fit(existing);
                continue;
            }
            const created = this.kind.create(marker);
            if (!created) continue;
            this.live.push(created);
            this.kind.fit(created);
        }

        const order = markers.map((marker) => marker.id);
        this.live.sort((a, b) => order.indexOf(a.markerId) - order.indexOf(b.markerId));
    }

    /**
     * One frame of every instance. Public because the editor pauses the game — the frame delta is 0
     * there — and advances the effects it is tuning off a wall clock instead.
     */
    tick(dt: number): void {
        for (const instance of this.live) this.kind.update(instance, dt);
    }

    fitAll(): void {
        for (const instance of this.live) this.kind.fit(instance);
    }

    /** The instance closest to a world position — which of several patches an event happened in. */
    nearest(worldPosition: Vector3, positionOf: (instance: T) => Vector3): T | null {
        let best: T | null = null;
        let bestDistance = Infinity;
        for (const instance of this.live) {
            const distance = positionOf(instance).distanceToSquared(worldPosition);
            if (distance >= bestDistance) continue;
            bestDistance = distance;
            best = instance;
        }
        return best;
    }
}
