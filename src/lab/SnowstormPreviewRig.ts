/**
 * Preview-only reference scene for judging a snowstorm.
 *
 * The volcanic set is the wrong backdrop for this one in the way that matters most: the whole
 * point of the storm is that dense regions *hide what is behind them*, and you cannot see that
 * against a dark ground with nothing standing on it. So this builds the opposite — a bright ice
 * field, a dark ridge directly behind where the storm sits, and a line of posts marching from
 * well behind the storm to well in front of it.
 *
 * Reading it is the whole method: posts behind the dense core should disappear, posts at the
 * torn edges should half-dissolve, and the post in front of the storm should be untouched. If
 * the near post dims, something in the effect is reaching outside its volume.
 *
 * `Environment.ts` is not modified at all; the volcanic set is hidden and dimmed by the lab
 * wrapper on create and handed straight back on dispose. Two instanced meshes and a ground disc,
 * so the whole rig is three draw calls and never competes with the storm for frame time.
 */

import {
    CircleGeometry,
    ConeGeometry,
    CylinderGeometry,
    DirectionalLight,
    Group,
    HemisphereLight,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type BufferGeometry,
} from "three";
import { createRng } from "../vfx/core/random";

/** Comfortably inside the lab camera's 400-unit far plane, and past the ridge. */
const GROUND_RADIUS = 260;
const RIDGE_COUNT = 11;
const POST_COUNT = 9;

export class SnowstormPreviewRig {
    readonly group = new Group();

    private readonly geometries: BufferGeometry[] = [];
    private readonly materials: MeshStandardMaterial[] = [];
    private readonly instanced: InstancedMesh[] = [];

    constructor() {
        this.group.name = "lab:snowstorm-rig";

        const iceMaterial = new MeshStandardMaterial({ color: 0xdae6f0, roughness: 0.95, metalness: 0 });
        const rockMaterial = new MeshStandardMaterial({ color: 0x2c3642, roughness: 1, metalness: 0 });
        const postMaterial = new MeshStandardMaterial({ color: 0x1a2129, roughness: 0.9, metalness: 0 });
        this.materials.push(iceMaterial, rockMaterial, postMaterial);

        const groundGeo = new CircleGeometry(GROUND_RADIUS, 72);
        const ridgeGeo = new ConeGeometry(1, 1, 5);
        const postGeo = new CylinderGeometry(0.3, 0.3, 1, 10);
        this.geometries.push(groundGeo, ridgeGeo, postGeo);

        const ground = new Mesh(groundGeo, iceMaterial);
        ground.rotation.x = -Math.PI / 2;
        // Behind everything: the ice is the thing the storm has to stay readable against, not a
        // surface anything in the lab stands on.
        ground.renderOrder = -10;
        this.group.add(ground);

        const rng = createRng(31337);
        const m = new Matrix4();
        const pos = new Vector3();
        const scale = new Vector3();
        const rot = new Quaternion();
        const up = new Vector3(0, 1, 0);

        // The ridge sits well behind the storm's default z, so the mountains are what the dense
        // core is measured against.
        const ridge = new InstancedMesh(ridgeGeo, rockMaterial, RIDGE_COUNT);
        for (let i = 0; i < RIDGE_COUNT; i++) {
            const t = i / (RIDGE_COUNT - 1) - 0.5;
            const height = 20 + rng() * 26;
            pos.set(t * 190 + (rng() - 0.5) * 12, height * 0.5, -96 - rng() * 36);
            scale.set(height * (0.45 + rng() * 0.3), height, height * (0.45 + rng() * 0.3));
            rot.setFromAxisAngle(up, rng() * Math.PI * 2);
            ridge.setMatrixAt(i, m.compose(pos, rot, scale));
        }
        ridge.instanceMatrix.needsUpdate = true;
        this.instanced.push(ridge);
        this.group.add(ridge);

        // Posts from behind the ridge line to in front of the camera, so one glance covers
        // "obscured", "half dissolved" and "untouched".
        const posts = new InstancedMesh(postGeo, postMaterial, POST_COUNT);
        for (let i = 0; i < POST_COUNT; i++) {
            const t = i / (POST_COUNT - 1);
            const z = -78 + t * 80;
            const height = 3 + (1 - t) * 13;
            pos.set((i % 2 === 0 ? -1 : 1) * (6 + t * 9), height * 0.5, z);
            scale.set(1 + (1 - t) * 1.6, height, 1 + (1 - t) * 1.6);
            posts.setMatrixAt(i, m.compose(pos, rot.identity(), scale));
        }
        posts.instanceMatrix.needsUpdate = true;
        this.instanced.push(posts);
        this.group.add(posts);

        // Cold key plus a cold bounce off the ice, and nothing that casts a shadow: the rig is
        // reference, not a lighting study, and a shadow map here would cost more than the storm.
        const sun = new DirectionalLight(0xdfeaf6, 1.5);
        sun.position.set(-30, 40, 24);
        const ambient = new HemisphereLight(0xc9dbea, 0x8c99a6, 1.3);
        this.group.add(sun, ambient);
    }

    dispose(): void {
        this.group.removeFromParent();
        for (const i of this.instanced) i.dispose();
        for (const g of this.geometries) g.dispose();
        for (const m of this.materials) m.dispose();
        this.group.clear();
    }
}
