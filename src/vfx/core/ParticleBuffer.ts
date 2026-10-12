/**
 * Struct-of-arrays particle storage with swap-remove recycling.
 *
 * Every field is a preallocated typed array sized to `capacity`, so a running effect allocates
 * nothing: spawning is "take index `count`, increment", killing is "copy the last live particle
 * over the dead one, decrement". Live particles therefore always occupy `[0, count)` contiguously,
 * which is exactly the layout the instanced renderers upload — no compaction pass, no holes.
 *
 * The cost of swap-remove is that a particle's index is not stable across frames. Nothing here
 * may hold an index between frames; effects index by slot only inside a single update loop.
 */

export class ParticleBuffer {
    readonly capacity: number;
    /** Number of live particles, always packed at the front of every channel. */
    count = 0;

    readonly px: Float32Array;
    readonly py: Float32Array;
    readonly pz: Float32Array;
    readonly vx: Float32Array;
    readonly vy: Float32Array;
    readonly vz: Float32Array;
    /** Seconds lived so far, and total lifetime in seconds. */
    readonly age: Float32Array;
    readonly life: Float32Array;
    /** Per-particle random constant in [0,1); lets shaders and sim desynchronise motion cheaply. */
    readonly seed: Float32Array;

    private readonly channels = new Map<string, Float32Array>();

    constructor(capacity: number) {
        this.capacity = Math.max(1, Math.floor(capacity));
        const n = this.capacity;
        this.px = new Float32Array(n);
        this.py = new Float32Array(n);
        this.pz = new Float32Array(n);
        this.vx = new Float32Array(n);
        this.vy = new Float32Array(n);
        this.vz = new Float32Array(n);
        this.age = new Float32Array(n);
        this.life = new Float32Array(n);
        this.seed = new Float32Array(n);
    }

    /** Declares an effect-specific per-particle field (size, rotation, tint, …). */
    channel(name: string): Float32Array {
        let arr = this.channels.get(name);
        if (!arr) {
            arr = new Float32Array(this.capacity);
            this.channels.set(name, arr);
        }
        return arr;
    }

    /**
     * Reserves a slot, or returns -1 when the buffer is full.
     *
     * Full means full: the effect drops the spawn rather than stealing the oldest particle, which
     * would show up as a visible pop. Raise `maxParticles` if drops matter.
     */
    spawn(limit = this.capacity): number {
        const cap = Math.min(limit, this.capacity);
        if (this.count >= cap) return -1;
        return this.count++;
    }

    /** Removes slot `i` by moving the last live particle into it. Returns nothing: re-check `i`. */
    kill(i: number): void {
        const last = --this.count;
        if (i === last) return;
        this.px[i] = this.px[last];
        this.py[i] = this.py[last];
        this.pz[i] = this.pz[last];
        this.vx[i] = this.vx[last];
        this.vy[i] = this.vy[last];
        this.vz[i] = this.vz[last];
        this.age[i] = this.age[last];
        this.life[i] = this.life[last];
        this.seed[i] = this.seed[last];
        for (const arr of this.channels.values()) arr[i] = arr[last];
    }

    /** Drops every live particle. Arrays keep their contents; only slots below `count` are read. */
    clear(): void {
        this.count = 0;
    }

    /**
     * Kills everything above `limit` so a lowered particle cap takes effect immediately instead of
     * waiting for the surplus to age out.
     */
    trimTo(limit: number): void {
        if (this.count > limit) this.count = Math.max(0, Math.floor(limit));
    }
}
