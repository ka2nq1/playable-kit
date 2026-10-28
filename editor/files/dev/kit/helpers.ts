import type { Object3D, PerspectiveCamera } from "three";

/**
 * Small things most playables want from `onEnable`/`onDisable`. Each returns the function that puts
 * back exactly what it changed.
 */

/**
 * Hides an object's visible children — sun flares, scope overlays and screen-space indicators
 * parented to the render camera cover the view once it orbits freely.
 */
export function hideChildren(object: Object3D): () => void {
    const hidden = object.children.filter((child) => child.visible);
    for (const child of hidden) child.visible = false;
    return () => {
        for (const child of hidden) child.visible = true;
    };
}

/** A free-look FOV while editing — a scoped-in game camera is useless for placing things. */
export function setFov(camera: PerspectiveCamera, fov: number): () => void {
    const previous = camera.fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    return () => {
        camera.fov = previous;
        camera.updateProjectionMatrix();
    };
}
