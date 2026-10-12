/**
 * Hex string → `Color`, memoised.
 *
 * Colours live in config as strings so they stay hand-editable, but `new Color(hex)` allocates
 * and does an sRGB→linear conversion. Effects sample colours once per particle per frame, so the
 * cache turns that into a map lookup and keeps the per-frame allocation count at zero — while
 * still picking up a hex the lab's colour picker changed, because the key is the string itself.
 */

import { Color } from "three";

const cache = new Map<string, Color>();

export function resolveColor(hex: string): Color {
    let c = cache.get(hex);
    if (!c) {
        c = new Color(hex);
        cache.set(hex, c);
    }
    return c;
}

/**
 * Writes `lerp(a, b, t)` into `out` without allocating. Both endpoints come from the cache, so
 * this is the standard way effects turn a config colour pair into a per-particle tint.
 */
export function lerpHex(out: Color, hexA: string, hexB: string, t: number): Color {
    const a = resolveColor(hexA);
    const b = resolveColor(hexB);
    out.setRGB(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    return out;
}
