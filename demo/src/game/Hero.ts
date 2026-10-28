import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, BoxGeometry, type Scene } from "three";
import { PathFollower } from "../vendor/three-path-editor/dist/index.js";
import { route } from "../kit/routes";
import tune from "../resources/editor/tune/game.json";

/**
 * The hero walks the `hero-walk` route from `placements.json`. Edit the route in the editor's Scene
 * section and the walk changes under him — `routes.ts` writes the edit into the same `Path` his
 * follower holds. Speed comes from the Tune section, live.
 */

const ROUTE_ID = "hero-walk";

export class Hero {
    readonly object = new Group();
    private readonly body: Group;
    private follower: PathFollower | null = null;
    private time = 0;

    constructor(scene: Scene) {
        this.body = new Group();
        const cloth = new MeshStandardMaterial({ color: 0x2f8f8a, roughness: 0.7 });
        const skin = new MeshStandardMaterial({ color: 0xf0c49a, roughness: 0.8 });
        const torso = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 10), cloth);
        torso.position.y = 0.6;
        const head = new Mesh(new SphereGeometry(0.17, 16, 12), skin);
        head.position.y = 1.13;
        const pack = new Mesh(new BoxGeometry(0.3, 0.38, 0.16), new MeshStandardMaterial({ color: 0xb5562b, roughness: 0.9 }));
        pack.position.set(0, 0.7, -0.22);
        this.body.add(torso, head, pack);
        this.object.add(this.body);
        this.object.name = "Hero";
        scene.add(this.object);

        const path = route(ROUTE_ID);
        this.object.visible = !!path;
        if (path) {
            this.follower = new PathFollower({
                object: this.object,
                path,
                speed: tune.heroSpeed,
                loop: "loop",
                autoPlay: true,
                // The model faces +Z; only turn him around the vertical.
                orientation: { forward: [0, 0, 1], yawOnly: true },
            });
        }
    }

    update(dt: number): void {
        if (!this.follower) return;
        this.time += dt;
        this.follower.speed = tune.heroSpeed;
        this.follower.update(dt);
        // A small step bob, on game time like everything else that moves.
        this.body.position.y = Math.abs(Math.sin(this.time * tune.heroSpeed * 4)) * 0.06;
    }
}
