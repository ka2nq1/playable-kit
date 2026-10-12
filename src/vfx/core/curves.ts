/**
 * Keyframed curves and colour gradients, baked to lookup tables.
 *
 * Config files describe "opacity over lifetime" as `[[t, value], ...]`. Evaluating that list
 * per particle per frame would mean a search plus a branch on every sample; baking it once into
 * a small LUT turns it into one multiply and one array read. 64 samples is below the precision
 * of an 8-bit framebuffer for everything these curves drive.
 */

const LUT_SIZE = 64;

export type Keyframe = [time: number, value: number];

export class Curve {
    private readonly lut: Float32Array;

    private constructor(lut: Float32Array) {
        this.lut = lut;
    }

    /** Keyframes are sorted and clamped to [0,1]; an empty list yields a constant 1. */
    static fromKeyframes(keys: readonly Keyframe[]): Curve {
        const lut = new Float32Array(LUT_SIZE);
        if (!keys.length) {
            lut.fill(1);
            return new Curve(lut);
        }
        const sorted = keys.map((k) => [Math.min(1, Math.max(0, k[0])), k[1]] as Keyframe).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < LUT_SIZE; i++) {
            lut[i] = sampleKeys(sorted, i / (LUT_SIZE - 1));
        }
        return new Curve(lut);
    }

    static constant(value: number): Curve {
        const lut = new Float32Array(LUT_SIZE);
        lut.fill(value);
        return new Curve(lut);
    }

    /** `t` is normalized lifetime; values outside [0,1] clamp to the end samples. */
    at(t: number): number {
        const x = t <= 0 ? 0 : t >= 1 ? LUT_SIZE - 1 : t * (LUT_SIZE - 1);
        const i = x | 0;
        const f = x - i;
        const a = this.lut[i];
        const b = this.lut[i + 1 < LUT_SIZE ? i + 1 : i];
        return a + (b - a) * f;
    }
}

function sampleKeys(keys: readonly Keyframe[], t: number): number {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (t >= a[0] && t <= b[0]) {
            const span = b[0] - a[0];
            const f = span <= 1e-6 ? 0 : (t - a[0]) / span;
            return a[1] + (b[1] - a[1]) * f;
        }
    }
    return last[1];
}
