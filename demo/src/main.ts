import { Raycaster, Vector2 } from "three";
import { Loop } from "./game/Loop";
import { World } from "./game/World";
import { Hero } from "./game/Hero";
import { Hud } from "./game/Hud";
import { app } from "./game/app";
import { FirePitC, MAP_VFX, WaterRipplesC, WaterSplashC } from "./game/vfx";
import { setKitHost } from "./kit/host";
import { findByName } from "./kit/findByName";
import placements from "./resources/editor/placements.json";

/**
 * Campfire Night — the playable-kit demo. Built the way a template playable is: a loop, a world,
 * the kit host, the map effects' `init()`, gameplay. The editor is not part of the game; see the
 * bottom of this file.
 */

const container = document.getElementById("game")!;
const loop = new Loop();
const world = new World(container);

setKitHost({
    scene: world.scene,
    onUpdate: (tick) => loop.onUpdate(tick),
    findObject: (name) => findByName([world.scene], name),
    placements: () => placements,
});

world.attachProps();
for (const vfx of MAP_VFX) vfx.init();
const hero = new Hero(world.scene);
const hud = new Hud(document.body);
Object.assign(app, { loop, world, hero });

loop.onUpdate((dt) => {
    world.update(dt);
    hero.update(dt);
});

// ---- Gameplay: tap the pond to splash it, tap the clearing to stoke the fire -----------------
const raycaster = new Raycaster();
const pointer = new Vector2();
world.renderer.domElement.addEventListener("pointerdown", (event) => {
    if (loop.paused) return;
    const rect = world.renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, world.camera);

    const pond = raycaster.intersectObject(world.pond, false)[0];
    if (pond) {
        WaterSplashC.burstAt(pond.point);
        WaterRipplesC.burstAt(pond.point);
        hud.say("Splash!");
        return;
    }
    const ground = raycaster.intersectObject(world.ground, false)[0];
    if (ground) {
        for (const fire of FirePitC.all) fire.vfx.burst(null);
        hud.say("Fire stoked");
    }
});

loop.start(() => world.render());

// ---- The editor ------------------------------------------------------------------------------
// In a real playable the dev server injects `dev/boot.ts` (templateLibs/kitEditorPlugin.mjs) and a
// build never contains it. The public demo has no dev server and is *about* the editor, so it loads
// the same file itself.
import("../dev/boot");
