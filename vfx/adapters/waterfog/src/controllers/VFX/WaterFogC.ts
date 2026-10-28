import { WaterFogVfx } from "../../vfx/effects/waterfog";
import { kitHost } from "../../kit/host";
import { exportAnchor, fitToAnchor, normalizeAnchor, type AnchorDefaults, type VfxAnchorConfig } from "../../kit/anchor";
import { MapVfxInstances, type MapVfxInstanceBase } from "../../kit/MapVfxInstances";
import { markerConfig } from "../../kit/markers";

/**
 * Low mist drifting over water, one patch per marker claiming `waterfog`.
 *
 * The effect ({@link WaterFogVfx}, copied from vfx-lab) is a stack of noise-cut quads that knows
 * nothing about the scene; this controller puts one on each marker. Its settings live in the marker
 * (`metadata.config`), so a second marker is a second patch with its own density and size.
 *
 * Layers are the cost: each is another full transparent pass. Two or three ship.
 */

/**
 * How much of the anchor's width the mist spans when fitted — under 1, because the shader fades
 * the fog out well inside `areaSize` and a stack cut exactly at the rim reads as a sheet with an edge.
 */
const FIT_COVERAGE = 0.96;

const ANCHOR_DEFAULTS: AnchorDefaults = { mesh: "", offset: [0, 0.08, 0], fitSize: false };

export interface WaterFogInstance extends MapVfxInstanceBase {
    readonly vfx: WaterFogVfx;
    anchor: VfxAnchorConfig;
}

export default class WaterFogC {
    /** What a marker's `mapVfx` says to claim this effect, and its tab id in the editor. */
    static readonly ID = "waterfog";

    private static readonly instances = new MapVfxInstances<WaterFogInstance>({
        id: WaterFogC.ID,
        create: (marker) => {
            const raw = markerConfig(marker);
            const vfx = new WaterFogVfx(raw);
            kitHost().scene.add(vfx.object3d);
            return {
                markerId: marker.id,
                marker,
                vfx,
                anchor: normalizeAnchor((raw as { anchor?: unknown }).anchor, WaterFogC.ID, ANCHOR_DEFAULTS),
            };
        },
        fit: (instance) => WaterFogC.fit(instance),
        update: (instance, dt) => instance.vfx.update(dt),
        dispose: (instance) => {
            instance.vfx.object3d.removeFromParent();
            instance.vfx.dispose();
        },
    });

    static get all(): readonly WaterFogInstance[] {
        return this.instances.all;
    }

    static init(): void {
        this.instances.init();
    }

    /** Public because the editor advances effects off a wall clock while the game is paused. */
    static tick(dt: number): void {
        this.instances.tick(dt);
    }

    static fit(instance: WaterFogInstance): boolean {
        const fit = fitToAnchor(instance.anchor, instance.marker);
        instance.vfx.object3d.position.copy(fit.position);
        instance.vfx.object3d.rotation.y = (fit.yaw * Math.PI) / 180;
        if (instance.anchor.fitSize && fit.size > 0) instance.vfx.config.areaSize = fit.size * FIT_COVERAGE;
        instance.vfx.applyConfig();
        return true;
    }

    /** The anchor section plus the lab's config, so neither half can drop the other's keys. */
    static exportConfig(instance: WaterFogInstance): Record<string, unknown> {
        return { anchor: exportAnchor(instance.anchor), ...instance.vfx.config };
    }
}
