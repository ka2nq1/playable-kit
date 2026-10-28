import type { Object3D, Scene } from "three";

/**
 * What the kit's runtime needs from the playable it is dropped into.
 *
 * Every playable has its own `ThreeC`, its own update loop and its own idea of where the authored
 * file lives, so nothing under `src/kit/` imports any of them. The playable describes itself once,
 * with {@link setKitHost}, before the first map effect initialises — usually at the top of
 * `afterResourcesLoadedCb` — and the kit reads everything through here.
 */
export interface KitHost {
    /** Where map effects add their objects. */
    scene: Scene;
    /** Subscribes a per-frame callback with the game's (scaled, zero while paused) delta in seconds. */
    onUpdate(callback: (dt: number) => void): void;
    /**
     * A scene object by the name Blender shows. Effects pin themselves to meshes through this, so
     * the playable decides which containers are searched. `findByName` covers the usual case.
     */
    findObject(name: string): Object3D | null;
    /** The authored placements file for what is being played, already imported. */
    placements(): unknown;
}

let host: KitHost | null = null;

export function setKitHost(value: KitHost): void {
    host = value;
}

export function kitHost(): KitHost {
    if (!host) throw new Error("[kit] setKitHost() has not been called — see playable-kit/editor/INTEGRATION.md");
    return host;
}
