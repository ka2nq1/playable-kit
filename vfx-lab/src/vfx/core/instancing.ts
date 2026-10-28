/** Shared plumbing for the instanced particle renderers. */

import { BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry } from "three";

/**
 * A unit quad centred on the origin: positions in [-0.5, 0.5] and uv in [0, 1].
 *
 * Built by hand rather than with `PlaneGeometry` so the renderers can rely on the exact vertex
 * order and on `uv.y` running tail→head, which the streak shader depends on.
 */
export function createQuadGeometry(): InstancedBufferGeometry {
    const geo = new InstancedBufferGeometry();
    // prettier-ignore
    const positions = new Float32Array([
        -0.5, -0.5, 0,
         0.5, -0.5, 0,
         0.5,  0.5, 0,
        -0.5,  0.5, 0,
    ]);
    // prettier-ignore
    const uvs = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
    ]);
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("uv", new BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.instanceCount = 0;
    return geo;
}

export function addInstancedAttribute(
    geo: InstancedBufferGeometry,
    name: string,
    capacity: number,
    itemSize: number,
): { array: Float32Array; attribute: InstancedBufferAttribute } {
    const array = new Float32Array(capacity * itemSize);
    const attribute = new InstancedBufferAttribute(array, itemSize);
    attribute.setUsage(DynamicDrawUsage);
    geo.setAttribute(name, attribute);
    return { array, attribute };
}

/**
 * Marks the first `count` instances dirty.
 *
 * Live particles are packed at the front of every buffer, so uploading a prefix is always correct
 * and keeps the per-frame transfer proportional to what is actually alive rather than to the
 * capacity the effect was sized for.
 */
export function flushPrefix(attribute: InstancedBufferAttribute, count: number): void {
    attribute.clearUpdateRanges();
    if (count > 0) attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
}
