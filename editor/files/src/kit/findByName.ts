import { PropertyBinding, type Object3D } from "three";

/**
 * Finds `name` under any of `roots`, as written first and then the way `GLTFLoader` stores it.
 *
 * The loader runs node names through `PropertyBinding.sanitizeNodeName`, so Blender's `Circle.001`
 * is `Circle001` in the scene. A config naming the mesh the way the artist sees it would otherwise
 * never find it.
 */
export function findByName(roots: readonly Object3D[], name: string): Object3D | null {
    if (!name) return null;
    const sanitized = PropertyBinding.sanitizeNodeName(name);
    for (const root of roots) {
        const found = root.getObjectByName(name) ?? root.getObjectByName(sanitized);
        if (found) return found;
    }
    return null;
}
