/**
 * Preview-only reference scene for judging a sky.
 *
 * The volcanic set the rest of the lab uses is the wrong backdrop here for three reasons: its
 * ground is an unlit shader that no sun can touch, its key light is a fixed orange point light
 * that tints every daytime preset, and it has no directional light for the sky's lighting sync to
 * drive. So this builds a neutral one instead — and `Environment.ts` is not modified at all; the
 * volcanic set is hidden and dimmed on create and handed straight back on dispose.
 *
 * It is deliberately plain. The subject is the sky; everything here exists only so that fog has
 * something to dissolve, the sun has something to cast across, and the horizon has an edge.
 */

import {
    BoxGeometry,
    CircleGeometry,
    ConeGeometry,
    CylinderGeometry,
    DirectionalLight,
    Group,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    SphereGeometry,
    type BufferGeometry,
} from "three";

/**
 * Ground radius.
 *
 * Large enough that its rim sits well past any fog distance the presets use, so the disc reads as
 * a horizon rather than as a circle. It needs the camera's far plane pushed out to match — see
 * `skyLabEffect`, which borrows and restores it.
 */
const GROUND_RADIUS = 900;

export class SkyPreviewRig {
    readonly group = new Group();

    /** The sync targets. Handed to `SkyVfx` by reference; it never replaces them. */
    readonly sun: DirectionalLight;
    readonly ambient: HemisphereLight;

    private readonly geometries: BufferGeometry[] = [];
    private readonly material: MeshStandardMaterial;
    private readonly groundMaterial: MeshStandardMaterial;

    constructor() {
        this.group.name = "lab:sky-rig";

        // Fog has to be ON for both materials — fog dissolving the reference geometry is one of
        // the things this rig exists to show.
        this.groundMaterial = new MeshStandardMaterial({ color: 0x6d7168, roughness: 1, metalness: 0 });
        this.material = new MeshStandardMaterial({ color: 0x9a9690, roughness: 0.85, metalness: 0 });

        const groundGeo = new CircleGeometry(GROUND_RADIUS, 96);
        this.geometries.push(groundGeo);
        const ground = new Mesh(groundGeo, this.groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.renderOrder = -10;
        this.group.add(ground);

        const box = new BoxGeometry(1, 1, 1);
        const sphere = new SphereGeometry(0.5, 20, 14);
        const cone = new ConeGeometry(0.5, 1, 20);
        const pillar = new CylinderGeometry(0.35, 0.45, 1, 18);
        this.geometries.push(box, sphere, cone, pillar);

        // Scattered across a wide depth range on purpose: a fog curve is invisible against
        // objects that are all the same distance away.
        this.add(box, 1.6, -2.2, 1.4, 0.9);
        this.add(sphere, 2.2, 1.9, -1.1, 1.1);
        this.add(cone, 3.2, 4.6, 2.8, 1.6);
        this.add(pillar, 5.5, -7.5, -4.2, 2.6);
        this.add(box, 9, 16, -11, 4.5);
        this.add(cone, 14, -26, 18, 7);

        // Two lights, and only two: this is what the sky's lighting sync is allowed to drive, and
        // a rig with more would hide what the sync is actually doing.
        this.sun = new DirectionalLight(0xffffff, 2);
        this.sun.position.set(40, 60, 20);
        this.ambient = new HemisphereLight(0xa9c4e0, 0x5a5348, 1);
        this.group.add(this.sun, this.ambient);
    }

    private add(geometry: BufferGeometry, height: number, x: number, z: number, scale: number): void {
        const mesh = new Mesh(geometry, this.material);
        mesh.scale.set(scale, height, scale);
        // Every primitive is modelled around its own origin, so half the height puts it on the
        // ground regardless of which one it is.
        mesh.position.set(x, height * 0.5, z);
        this.group.add(mesh);
    }

    dispose(): void {
        this.group.removeFromParent();
        for (const g of this.geometries) g.dispose();
        this.material.dispose();
        this.groundMaterial.dispose();
        this.group.clear();
    }
}
