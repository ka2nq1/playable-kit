import type { Object3D } from "three";
import type { ControlPanel } from "../ui/ControlPanel";
import { kitHost } from "../../../src/kit/host";
import type { VfxAnchorConfig } from "../../../src/kit/anchor";

/**
 * The **Anchor** folder every map effect gets: where exactly the instance sits relative to its
 * point. The point itself moves with the gizmo; these are the parts a gizmo is bad at and a number
 * is exact — the lift that keeps an effect clear of a surface, and the mesh `fitSize` measures.
 *
 * Every slider calls the controller's own `fit()`, which is also what startup calls: what you tune
 * here is exactly what the next run reproduces from the point.
 */

export interface AnchorFolderOptions {
    markerId: string;
    /** The live anchor section, edited in place. */
    anchor: VfxAnchorConfig;
    /** The effect's object, for the position readout. */
    object3d: Object3D;
    /** The controller's `fit()` for this instance. */
    refit: () => boolean;
    /** What `fitSize` means for this effect, e.g. "spans the mist across the mesh". Empty hides it. */
    fitSizeNote?: string;
    /** Project readouts worth seeing while lifting this effect (e.g. where the water sits). */
    readouts?: ReadonlyArray<[label: string, get: () => string]>;
}

/**
 * A slider track sized to the offset the instance already carries: a lift of a few centimetres
 * needs a fine track, a storm parked sixteen metres off its point needs reach. The number box
 * takes anything beyond it.
 */
function trackFor(value: number) {
    const reach = Math.max(2, Math.ceil(Math.abs(value) * 1.5));
    return { min: -reach, max: reach, step: reach <= 2 ? 0.005 : 0.01 };
}

export function buildAnchorFolder(panel: ControlPanel, options: AnchorFolderOptions): void {
    const { anchor, markerId, object3d, refit } = options;
    const apply = () => {
        refit();
        panel.refresh();
    };

    const place = panel.folder("Anchor", false);
    place.readout("Point", () => `${markerId} — drag it with the gizmo`);
    place.readout("Position", () => {
        const p = object3d.position;
        return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
    });
    place.readout("Measured from", () => {
        if (!anchor.mesh) return "nothing — size is as authored";
        return kitHost().findObject(anchor.mesh) ? anchor.mesh : `${anchor.mesh} — NOT FOUND`;
    });
    for (const [label, get] of options.readouts ?? []) place.readout(label, get);

    const axis = (label: string, i: number) =>
        place.slider(label, trackFor(anchor.offset[i]), () => anchor.offset[i], (v) => {
            anchor.offset[i] = v;
            refit();
        });
    axis("Offset X", 0);
    axis("Offset Y (lift)", 1);
    axis("Offset Z", 2);

    if (options.fitSizeNote) {
        place.toggle("Fit size to mesh", () => anchor.fitSize, (v) => {
            anchor.fitSize = v;
            apply();
        });
    }

    place.buttons({ label: "Refit", onClick: apply });
    place.note(
        "Offsets are world units from the point. Re-open the tab to get a slider track that fits a value typed past it." +
            (options.fitSizeNote ? ` Fit size: ${options.fitSizeNote}.` : ""),
    );
}
