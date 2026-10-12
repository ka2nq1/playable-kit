/**
 * Deterministic RNG + small sampling helpers.
 *
 * Every effect draws from an injected `Rng` rather than `Math.random()` so a preview can be
 * replayed bit-for-bit while tuning: same seed, same burst, and the only thing that changed
 * between two screenshots is the parameter you just moved.
 */

export type Rng = () => number;

/** mulberry32 — 32 bits of state, fine quality for particle jitter, no allocation per call. */
export function createRng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Range = [number, number];

export function randRange(rng: Rng, r: Range): number {
    return r[0] + (r[1] - r[0]) * rng();
}

export function randSign(rng: Rng): number {
    return rng() < 0.5 ? -1 : 1;
}

/** Symmetric jitter in [-amount, +amount]. */
export function randJitter(rng: Rng, amount: number): number {
    return (rng() * 2 - 1) * amount;
}

/**
 * A direction inside a cone of half-angle `spreadRad` around `axis` (expected normalized),
 * written into `out`. Uniform over the spherical cap, so a wide spread does not clump at the rim.
 */
export function randConeDirection(
    rng: Rng,
    axisX: number,
    axisY: number,
    axisZ: number,
    spreadRad: number,
    out: { x: number; y: number; z: number },
): void {
    const cosTheta = 1 - rng() * (1 - Math.cos(spreadRad));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = rng() * Math.PI * 2;

    // Build an orthonormal basis around the axis without trig: pick the least-aligned world axis.
    let ux = 0;
    let uy = 0;
    let uz = 0;
    if (Math.abs(axisY) < 0.99) {
        // cross(axis, up) with up = (0,1,0)
        ux = axisZ;
        uy = 0;
        uz = -axisX;
    } else {
        ux = 1;
        uy = 0;
        uz = 0;
    }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;

    // v = axis x u
    const vx = axisY * uz - axisZ * uy;
    const vy = axisZ * ux - axisX * uz;
    const vz = axisX * uy - axisY * ux;

    const cp = Math.cos(phi) * sinTheta;
    const sp = Math.sin(phi) * sinTheta;

    out.x = axisX * cosTheta + ux * cp + vx * sp;
    out.y = axisY * cosTheta + uy * cp + vy * sp;
    out.z = axisZ * cosTheta + uz * cp + vz * sp;
}

/** Uniform point on a disc of `radius` in the XZ plane, written into `out`. */
export function randPointOnDisc(rng: Rng, radius: number, out: { x: number; z: number }): void {
    const r = radius * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    out.x = Math.cos(a) * r;
    out.z = Math.sin(a) * r;
}
