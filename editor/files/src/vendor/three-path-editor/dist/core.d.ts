/** Plain 3-component vector used by the Three.js-independent core. */
type Vec3 = [number, number, number];
declare const EPSILON = 1e-9;
declare function vec3(x?: number, y?: number, z?: number): Vec3;
/** Writes components into `out` and returns it. */
declare function set(out: Vec3, x: number, y: number, z: number): Vec3;
/** Converts a 2- or 3-component array into a Vec3 (missing components become 0). */
declare function toVec3(source: ArrayLike<number>, out?: Vec3): Vec3;
declare function add(a: Vec3, b: Vec3, out?: Vec3): Vec3;
declare function sub(a: Vec3, b: Vec3, out?: Vec3): Vec3;
declare function scale(a: Vec3, s: number, out?: Vec3): Vec3;
declare function addScaled(a: Vec3, b: Vec3, s: number, out?: Vec3): Vec3;
declare function dot(a: Vec3, b: Vec3): number;
declare function cross(a: Vec3, b: Vec3, out?: Vec3): Vec3;
declare function length(a: Vec3): number;
declare function distance(a: Vec3, b: Vec3): number;
/** Returns a unit vector, or [0, 0, 0] for (near) zero-length input. */
declare function normalize(a: Vec3, out?: Vec3): Vec3;
declare function lerp(a: Vec3, b: Vec3, t: number, out?: Vec3): Vec3;
declare function clone(a: Vec3): Vec3;
/** Copies `a` into `out` and returns it. */
declare function copy(out: Vec3, a: Vec3): Vec3;
declare function equals(a: Vec3, b: Vec3, eps?: number): boolean;

declare const vec3$1_EPSILON: typeof EPSILON;
type vec3$1_Vec3 = Vec3;
declare const vec3$1_add: typeof add;
declare const vec3$1_addScaled: typeof addScaled;
declare const vec3$1_clone: typeof clone;
declare const vec3$1_copy: typeof copy;
declare const vec3$1_cross: typeof cross;
declare const vec3$1_distance: typeof distance;
declare const vec3$1_dot: typeof dot;
declare const vec3$1_equals: typeof equals;
declare const vec3$1_length: typeof length;
declare const vec3$1_lerp: typeof lerp;
declare const vec3$1_normalize: typeof normalize;
declare const vec3$1_scale: typeof scale;
declare const vec3$1_set: typeof set;
declare const vec3$1_sub: typeof sub;
declare const vec3$1_toVec3: typeof toVec3;
declare const vec3$1_vec3: typeof vec3;
declare namespace vec3$1 {
  export { vec3$1_EPSILON as EPSILON, type vec3$1_Vec3 as Vec3, vec3$1_add as add, vec3$1_addScaled as addScaled, vec3$1_clone as clone, vec3$1_copy as copy, vec3$1_cross as cross, vec3$1_distance as distance, vec3$1_dot as dot, vec3$1_equals as equals, vec3$1_length as length, vec3$1_lerp as lerp, vec3$1_normalize as normalize, vec3$1_scale as scale, vec3$1_set as set, vec3$1_sub as sub, vec3$1_toVec3 as toVec3, vec3$1_vec3 as vec3 };
}

/** Arbitrary user data. Preserved verbatim on import/export. */
type Metadata = Record<string, unknown>;
type PathDimension = 2 | 3;
/**
 * What a `Path` stands for: a route to travel ('path', the default), or a
 * single named place — a spawn point, a prop, a light, anything an object just
 * stands on ('marker'). A marker holds exactly one waypoint and no curve, so
 * the editor hides curve settings for it and refuses further points.
 */
type PathKind = 'path' | 'marker';
type CurveType = 'linear' | 'catmull-rom' | 'bezier';
/**
 * Catmull-Rom knot spacing, same meaning as THREE.CatmullRomCurve3's curveType:
 * 'uniform' ('catmullrom' in three, uses `tension`), 'centripetal' (avoids
 * cusps and overshoot on uneven spacing), 'chordal'.
 */
type CatmullRomParametrization = 'uniform' | 'centripetal' | 'chordal';
interface CurveOptions {
    type: CurveType;
    /** Connect the last waypoint back to the first. Default `false`. */
    closed: boolean;
    /**
     * Catmull-Rom tension (0.5 = standard Catmull-Rom, 0 = straight segments).
     * Also used to auto-generate Bezier handles that are not set explicitly.
     */
    tension: number;
    /**
     * Catmull-Rom only. Default 'uniform'. Match the parametrization your runtime
     * uses (e.g. THREE.CatmullRomCurve3 'centripetal') so the editor shows the
     * exact curve the game follows. `tension` only applies to 'uniform'.
     */
    parametrization?: CatmullRomParametrization;
    /**
     * Interpolate height (the path-space up component, y) linearly between
     * waypoints while x/z follow the curve. 3D paths with a curved type only.
     * Use it for routes authored on a surface: a spline overshoots in height
     * where a flat stretch meets a climb and dips below the floor the waypoints
     * sit on. Default `false`.
     */
    linearHeight?: boolean;
}
/** JSON representation of a waypoint. Unknown keys are preserved. */
interface WaypointData {
    id?: string;
    /** `[x, y]` for 2D paths, `[x, y, z]` for 3D paths. */
    position: number[];
    /** Bezier handle, relative to `position`. */
    handleIn?: number[];
    /** Bezier handle, relative to `position`. */
    handleOut?: number[];
    /** Speed multiplier at this waypoint (default 1). */
    speed?: number;
    /** Roll/bank angle in degrees at this waypoint (default 0). Positive = bank right. */
    roll?: number;
    /** Facing in degrees around the up axis for an object standing on this point. */
    yaw?: number;
    /** Authored time at this waypoint, in the host's units. See `Path.distanceAtTime`. */
    time?: number;
    metadata?: Metadata;
    [key: string]: unknown;
}
/** JSON representation of a path. Unknown keys are preserved. */
interface PathData {
    id: string;
    name?: string;
    /** 'marker' for a single-point place; omitted for ordinary paths. */
    kind?: PathKind;
    dimension: PathDimension;
    curve: Partial<CurveOptions> & {
        type: CurveType;
    };
    points: WaypointData[];
    metadata?: Metadata;
    [key: string]: unknown;
}
/** Versioned JSON file containing one or more paths. Unknown keys are preserved. */
interface PathFileData {
    version: number;
    paths: PathData[];
    [key: string]: unknown;
}
/**
 * How per-waypoint values (speed, roll) are blended between waypoints:
 * 'smooth' (ease in/out, default), 'linear', or 'step' (value holds until the next waypoint).
 */
type WaypointInterpolation = 'smooth' | 'linear' | 'step';
type WaypointValueKey = 'speed' | 'roll';
/** Plain per-waypoint numbers the editor edits but nothing blends. */
type WaypointFieldKey = 'yaw' | 'time';

interface WaypointInit {
    id?: string;
    position: ArrayLike<number>;
    handleIn?: ArrayLike<number> | null;
    handleOut?: ArrayLike<number> | null;
    /** Speed multiplier at this waypoint (1 = follower speed). */
    speed?: number | null;
    /** Bank/roll angle at this waypoint in degrees. Positive = bank right. */
    roll?: number | null;
    /** Facing in degrees around the up axis for something standing here. */
    yaw?: number | null;
    /** Authored time at this waypoint, in the host's own units. */
    time?: number | null;
    metadata?: Metadata;
}
/**
 * A point on a path, stored in path space. For 2D paths the third component is
 * always 0. Mutate waypoints through `Path` methods so caches stay valid.
 */
declare class Waypoint {
    id?: string;
    position: Vec3;
    /** Bezier handle relative to `position`; `null` = auto-generated. */
    handleIn: Vec3 | null;
    /** Bezier handle relative to `position`; `null` = auto-generated. */
    handleOut: Vec3 | null;
    /**
     * Speed multiplier at this waypoint; `undefined` = 1. Interpolated along the
     * path by PathFollower (see `interpolation`).
     */
    speed?: number;
    /** Roll (bank) angle in degrees at this waypoint; `undefined` = 0. Positive banks right. */
    roll?: number;
    /**
     * Facing in degrees around the up axis, for an object that stands on this
     * point: a unit's spawn heading, a prop's orientation. Authored with the
     * editor's rotate gizmo. Travel along the path ignores it — a follower takes
     * its heading from the curve tangent.
     */
    yaw?: number;
    /**
     * Authored time at this waypoint, in whatever unit the host uses (seconds,
     * beats, normalized progress). Two paths that carry the same times can be
     * sampled at the same time and stay in step — a camera path and what it
     * looks at, for instance. See `Path.distanceAtTime`.
     */
    time?: number;
    metadata: Metadata;
    /** Unknown JSON keys, preserved on export. */
    extras: Record<string, unknown>;
    constructor(init: WaypointInit, extras?: Record<string, unknown>);
    clone(): Waypoint;
    toJSON(dimension?: PathDimension): WaypointData;
    static fromJSON(data: WaypointData): Waypoint;
}
/** Deep copy for JSON-like data (falls back to JSON for older runtimes). */
declare function structuredCloneSafe<T>(value: T): T;

type Listener<T> = (payload: T) => void;
/** Minimal typed event emitter. `on()` returns an unsubscribe function. */
declare class Emitter<Events extends object> {
    private readonly listeners;
    on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void;
    once<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void;
    off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void;
    emit<K extends keyof Events>(type: K, payload: Events[K]): void;
    clear(): void;
}

/**
 * A parametric curve over t in [0, 1]. Segment i spans t in [i / n, (i + 1) / n],
 * so waypoint i always sits exactly at t = i / segmentCount.
 *
 * Both evaluators take an optional output vector: implementations write into it
 * and return it, so sampling a curve every frame allocates nothing. Callers
 * must use the returned value, never assume `out` was written.
 */
interface Curve {
    readonly segmentCount: number;
    getPoint(t: number, out?: Vec3): Vec3;
    /** Derivative dP/dt (not normalized). */
    getDerivative(t: number, out?: Vec3): Vec3;
}
/** Segment index and local parameter inside it. */
interface SegmentLocation {
    index: number;
    t: number;
}
/** Maps global t to a segment index and the parameter inside it, without allocating. */
declare function locateSegmentInto(t: number, segmentCount: number, out: SegmentLocation): SegmentLocation;
/** Maps global t to [segmentIndex, localT]. Allocates; prefer `locateSegmentInto` in hot paths. */
declare function locateSegment(t: number, segmentCount: number): [number, number];
/** Degenerate curve for paths with 0 or 1 waypoints. */
declare class PointCurve implements Curve {
    private readonly point;
    readonly segmentCount = 0;
    constructor(point?: Vec3);
    getPoint(_t?: number, out?: Vec3): Vec3;
    getDerivative(_t?: number, out?: Vec3): Vec3;
}

declare class LinearCurve implements Curve {
    private readonly points;
    readonly closed: boolean;
    readonly segmentCount: number;
    private readonly location;
    constructor(points: readonly Vec3[], closed?: boolean);
    getPoint(t: number, out?: Vec3): Vec3;
    getDerivative(t: number, out?: Vec3): Vec3;
}

/**
 * Cardinal / Catmull-Rom spline through every point. 'uniform' with `tension`
 * 0.5 matches THREE.CatmullRomCurve3 with curveType 'catmullrom'; 'centripetal'
 * and 'chordal' match the curve types of the same name. Open ends are
 * extrapolated so the curve starts and ends exactly on the first/last point.
 */
declare class CatmullRomCurve implements Curve {
    private readonly points;
    private readonly closed;
    private readonly tension;
    private readonly parametrization;
    readonly segmentCount: number;
    private readonly location;
    private readonly control;
    private readonly before;
    private readonly after;
    private readonly m1;
    private readonly m2;
    constructor(points: readonly Vec3[], closed?: boolean, tension?: number, parametrization?: CatmullRomParametrization);
    /** Fills `control` with the 4 control points of segment i (wrapped or extrapolated). */
    private controls;
    private hermite;
    /**
     * Segment end tangents (in segment parameter units) for the control points
     * currently in `control`. Uniform: tension-scaled central differences.
     * Centripetal/chordal: the non-uniform Catmull-Rom of
     * THREE.CatmullRomCurve3, knots spaced by distance^0.5 / distance^1.
     */
    private tangents;
    getPoint(t: number, out?: Vec3): Vec3;
    getDerivative(t: number, out?: Vec3): Vec3;
}

interface BezierHandles {
    /** Offset from the waypoint towards the previous waypoint. */
    handleIn: Vec3;
    /** Offset from the waypoint towards the next waypoint. */
    handleOut: Vec3;
}
/**
 * Resolves the effective handles for every waypoint. Explicit handles win;
 * missing ones are derived from neighbours so that an un-edited Bezier path
 * is identical to a Catmull-Rom path with the same tension.
 */
declare function resolveBezierHandles(points: readonly Vec3[], explicit: readonly {
    handleIn: Vec3 | null;
    handleOut: Vec3 | null;
}[], closed: boolean, tension: number): BezierHandles[];
/** Piecewise cubic Bezier through every waypoint, shaped by per-waypoint handles. */
declare class BezierCurve implements Curve {
    private readonly points;
    private readonly handles;
    readonly closed: boolean;
    readonly segmentCount: number;
    private readonly location;
    private readonly c1;
    private readonly c2;
    constructor(points: readonly Vec3[], handles: readonly BezierHandles[], closed?: boolean);
    /** Resolves the current segment's control points into `c0..c3`; returns the local t. */
    private controls;
    getPoint(t: number, out?: Vec3): Vec3;
    getDerivative(t: number, out?: Vec3): Vec3;
}

/**
 * Wraps a curve and interpolates its up component linearly between waypoints
 * while the other two follow the curve. A spline through points on a surface
 * overshoots in height where a flat stretch runs into a climb (a stair flight,
 * a ramp) and dips below that surface; linear height cannot leave the span
 * between the two waypoints it connects.
 */
declare class LinearHeightCurve implements Curve {
    private readonly base;
    private readonly points;
    readonly segmentCount: number;
    private readonly location;
    constructor(base: Curve, points: readonly Vec3[]);
    getPoint(t: number, out?: Vec3): Vec3;
    getDerivative(t: number, out?: Vec3): Vec3;
}

interface CurveInputPoint {
    position: Vec3;
    handleIn: Vec3 | null;
    handleOut: Vec3 | null;
}
/**
 * Builds the curve implementation for the given options. `linearHeight` only
 * applies to 3D paths, where the second component is the up axis.
 */
declare function createCurve(points: readonly CurveInputPoint[], options: CurveOptions, dimension?: PathDimension): Curve;

type WaypointInput = ArrayLike<number> | WaypointInit | Waypoint;
interface PathOptions {
    id?: string;
    name?: string;
    /** Default 3. */
    dimension?: PathDimension;
    /** 'marker' for a single named place instead of a route. Default 'path'. */
    kind?: PathKind;
    /** Curve type or full options. Default 'catmull-rom'. */
    curve?: CurveType | Partial<CurveOptions>;
    points?: WaypointInput[];
    metadata?: Metadata;
}
interface PathEvents {
    /** Fired after any mutation (points, curve settings, metadata via `markChanged`). */
    change: Path;
}
declare const DEFAULT_CURVE: CurveOptions;
declare function normalizeCurveOptions(curve?: CurveType | Partial<CurveOptions>): CurveOptions;
/**
 * A 2D or 3D path made of waypoints and a curve type. Pure data + math:
 * no Three.js dependency. All positions are in path space.
 */
declare class Path {
    readonly events: Emitter<PathEvents>;
    id: string;
    name?: string;
    /** See `PathKind`. A marker is one point, no curve. */
    kind: PathKind;
    readonly dimension: PathDimension;
    readonly curve: CurveOptions;
    readonly waypoints: Waypoint[];
    metadata: Metadata;
    /** Unknown JSON keys, preserved on export. */
    extras: Record<string, unknown>;
    private _version;
    private cache;
    constructor(options?: PathOptions);
    /** True for a single named place rather than a route to travel. */
    get isMarker(): boolean;
    /** Increments on every change. Useful for cheap dirty checks. */
    get version(): number;
    get length(): number;
    get segmentCount(): number;
    /** Adds a waypoint at `index` (default: end). Returns the new waypoint. */
    addWaypoint(point: WaypointInput, index?: number): Waypoint;
    removeWaypoint(index: number): Waypoint | undefined;
    moveWaypoint(index: number, position: ArrayLike<number>): void;
    /** Sets explicit Bezier handles (relative to the waypoint). `null` restores auto. */
    setWaypointHandles(index: number, handles: {
        handleIn?: ArrayLike<number> | null;
        handleOut?: ArrayLike<number> | null;
    }): void;
    /**
     * Sets per-waypoint speed multiplier, roll, yaw (all degrees for the angles)
     * or authored time. `null` clears the value back to its default (speed 1,
     * roll 0, no yaw, no time); `undefined` leaves it unchanged.
     */
    setWaypointProperties(index: number, props: {
        speed?: number | null;
        roll?: number | null;
        yaw?: number | null;
        time?: number | null;
    }): void;
    /** Replaces the path's metadata (deep-copied). Undoable in the editor. */
    setMetadata(metadata: Metadata): void;
    /** Replaces a waypoint's metadata (deep-copied). Undoable in the editor. */
    setWaypointMetadata(index: number, metadata: Metadata): void;
    /** Moves the waypoint at `from` so it ends up at index `to`. */
    reorderWaypoint(from: number, to: number): void;
    /** Reverses travel direction (also swaps Bezier handles). */
    reverse(): void;
    setCurve(options: CurveType | Partial<CurveOptions>): void;
    /** Call after mutating waypoints or metadata directly. */
    markChanged(): void;
    /**
     * Point at raw curve parameter t in [0, 1] (not constant speed).
     *
     * Every evaluator takes an optional output vector, writes into it and returns
     * it, so per-frame sampling allocates nothing. Without one it returns a new
     * vector.
     */
    getPoint(t: number, out?: Vec3): Vec3;
    /** Point at normalized arc length u in [0, 1] (constant speed). */
    getPointAt(u: number, out?: Vec3): Vec3;
    /** Unit tangent at normalized arc length u in [0, 1]. */
    getTangentAt(u: number, out?: Vec3): Vec3;
    getPointAtDistance(d: number, out?: Vec3): Vec3;
    getTangentAtDistance(d: number, out?: Vec3): Vec3;
    /** Unit tangent at raw curve parameter t. */
    getTangent(t: number, out?: Vec3): Vec3;
    /** Samples the curve by parameter; hits every waypoint exactly. Good for rendering. */
    sample(divisionsPerSegment?: number): Vec3[];
    /** `count` points evenly spaced by arc length (count >= 2). */
    getSpacedPoints(count: number): Vec3[];
    /**
     * Index of the first waypoint whose `metadata.name` equals `target`, or that
     * the predicate accepts. -1 when there is none.
     */
    indexOfWaypoint(target: string | ((waypoint: Waypoint, index: number) => boolean)): number;
    /**
     * Distance along the path of a waypoint, given by index or by
     * `metadata.name`. `undefined` when the path has no such waypoint.
     */
    distanceOfWaypoint(target: number | string): number | undefined;
    /** Distance along the path at which each waypoint is located. */
    getWaypointDistances(): number[];
    /**
     * The authored time span of this path, or null when fewer than two waypoints
     * carry a `time`. See `Waypoint.time`.
     */
    get timeRange(): {
        start: number;
        end: number;
    } | null;
    /** Authored duration (`timeRange` end minus start), or 0 without a timeline. */
    get duration(): number;
    /**
     * Distance along the path at an authored time, interpolated linearly between
     * the waypoints that carry one and clamped to the ends. Without a timeline it
     * returns 0, so sample by distance or progress instead.
     */
    distanceAtTime(time: number): number;
    /** The authored time at a distance along the path; the inverse of `distanceAtTime`. */
    timeAtDistance(distance: number): number;
    /** Point at an authored time. See `distanceAtTime`. */
    getPointAtTime(time: number, out?: Vec3): Vec3;
    /** Unit tangent at an authored time. See `distanceAtTime`. */
    getTangentAtTime(time: number, out?: Vec3): Vec3;
    /** True if any waypoint defines `key` (speed or roll). */
    hasWaypointValues(key: WaypointValueKey): boolean;
    /**
     * Per-waypoint value (speed multiplier or roll in degrees) at a distance
     * along the path, blended between the surrounding waypoints. Waypoints
     * without the value use the default (speed 1, roll 0).
     */
    getWaypointValueAtDistance(key: WaypointValueKey, d: number, interpolation?: WaypointInterpolation): number;
    /**
     * Closest point on the curve to `point` (path space). Returns the curve
     * parameter t, normalized arc length u, the point and its distance.
     */
    getClosestPoint(point: ArrayLike<number>, samplesPerSegment?: number): {
        t: number;
        u: number;
        point: Vec3;
        distance: number;
    };
    /** Effective Bezier handles (explicit or auto) for a waypoint, relative to it. */
    getBezierHandles(index: number): BezierHandles | undefined;
    clone(options?: {
        id?: string;
    }): Path;
    toJSON(): PathData;
    static fromJSON(data: PathData): Path;
    /**
     * Replaces this path's content with `data` in place, keeping the object
     * identity (used by undo/redo so followers keep working). The dimension
     * cannot change.
     */
    setData(data: PathData): void;
    private toWaypoint;
    private sanitize;
    /** Timed waypoints mapped to distances, cached per path version. */
    private getTimeline;
    private getCache;
    private tangentAtT;
}

type LoopMode = 'none' | 'loop' | 'pingpong';
interface SpeedContext {
    path: Path;
    /** Normalized progress in [0, 1]. */
    progress: number;
    distance: number;
    direction: 1 | -1;
}
interface PathCursorOptions {
    path: Path;
    /** World/path units per second. Default 1. */
    speed?: number;
    /** `true` = 'loop'. Default 'none'. */
    loop?: boolean | LoopMode;
    /** Initial normalized progress. Default 0 (or 1 when direction is -1). */
    startProgress?: number;
    /** 1 = forward, -1 = backward. Default 1. */
    direction?: 1 | -1;
    /** Start moving immediately on `advance()`. Default true. */
    autoPlay?: boolean;
    /** Optional speed multiplier evaluated every step (e.g. slow down near the end). */
    speedModifier?: (ctx: SpeedContext) => number;
    /** Apply per-waypoint `speed` multipliers. Default true. */
    useWaypointSpeed?: boolean;
    /** How waypoint values (speed, roll) blend between waypoints. Default 'smooth'. */
    interpolation?: WaypointInterpolation;
}
/** Waypoint speed multipliers are clamped to this so a 0 never stalls the cursor forever. */
declare const MIN_WAYPOINT_SPEED = 0.01;
/** A waypoint by index, or by its `metadata.name`. */
type WaypointTarget = number | string;
interface SeekOptions {
    /**
     * Emit `waypoint` for every waypoint the jump passed over. Off by default:
     * a seek is a cut, not travel, so listeners waiting for a point would
     * otherwise never hear about it.
     */
    emitWaypoints?: boolean;
}
interface PathCursorEvents {
    /** After every `advance()` that moved the cursor. */
    progress: {
        progress: number;
        distance: number;
    };
    /** The cursor reached (or passed) a waypoint. */
    waypoint: {
        index: number;
        waypoint: Waypoint;
        distance: number;
    };
    /** Looped back to start ('loop') or turned around ('pingpong'). */
    loop: {
        count: number;
        direction: 1 | -1;
    };
    /** Reached the end with loop mode 'none'. Followed by `pause`. */
    complete: void;
    /** `playing` went false -> true (`play()`). Not emitted for `autoPlay` at construction. */
    play: void;
    /**
     * `playing` went true -> false: `pause()`, or the automatic stop at the end
     * with loop mode 'none' (emitted right after `complete`, with `playing` already false).
     */
    pause: void;
    /**
     * `reset()` was called (also by `play()` restarting a completed cursor, before `play`).
     * Seeking with `progress`/`distance`/`setPath` does not emit it.
     */
    reset: void;
}
/**
 * Tracks travel along a path by distance (constant speed), handling speed,
 * looping and events. Three.js-independent; `PathFollower` applies it to an Object3D.
 */
declare class PathCursor {
    readonly events: Emitter<PathCursorEvents>;
    path: Path;
    speed: number;
    loop: LoopMode;
    direction: 1 | -1;
    speedModifier?: (ctx: SpeedContext) => number;
    useWaypointSpeed: boolean;
    interpolation: WaypointInterpolation;
    loopCount: number;
    private _distance;
    private _playing;
    private _complete;
    private readonly startProgress;
    private readonly startDirection;
    constructor(options: PathCursorOptions);
    get distance(): number;
    set distance(value: number);
    /** Normalized progress in [0, 1]. */
    get progress(): number;
    set progress(value: number);
    get playing(): boolean;
    get complete(): boolean;
    /** Starts moving. A completed cursor restarts from the beginning. Emits `play` if it was stopped. */
    play(): void;
    /** Stops moving. Emits `pause` if it was playing. */
    pause(): void;
    /** Back to the start position and direction. Keeps play state. Emits `reset`. */
    reset(): void;
    /**
     * Jumps to a distance along the path. With `emitWaypoints` the waypoints
     * between the old and the new position are emitted, in travel order.
     */
    seek(distance: number, options?: SeekOptions): this;
    /** Jumps to normalized progress [0, 1]. See `seek`. */
    seekProgress(progress: number, options?: SeekOptions): this;
    /**
     * Jumps to an authored time on the path (see `Waypoint.time`). Returns false
     * (and does nothing) when the path has no timeline. See `seek`.
     */
    seekTime(time: number, options?: SeekOptions): boolean;
    /** The authored time the cursor currently sits at, or 0 without a timeline. */
    get time(): number;
    /**
     * Jumps to a waypoint, by index or `metadata.name`. Returns false (and does
     * nothing) when the path has no such waypoint. See `seek`.
     */
    seekWaypoint(target: WaypointTarget, options?: SeekOptions): boolean;
    /**
     * True when the cursor sits at or beyond a waypoint in its current travel
     * direction. It describes the current position, not history: a loop or a
     * backward seek makes it false again.
     */
    hasPassed(target: WaypointTarget): boolean;
    /** Switches path while keeping normalized progress. */
    setPath(path: Path): void;
    /** Current speed in units/second (base speed × modifier × waypoint speed). */
    get currentSpeed(): number;
    /** Advances by `dt` seconds. Returns true if the cursor moved. */
    advance(dt: number): boolean;
    private multiplierAt;
    /** Moves `amount` along the path, handling ends/loops. Emits complete. */
    private move;
    private emitProgress;
    /** Emits 'waypoint' for waypoints in (from, to] (forward) or [to, from) (backward). */
    private emitCrossings;
    private emitAt;
    private emitWaypoint;
}

/**
 * Samples a curve to map between distance along the curve and curve parameter t.
 * Enables constant-speed movement regardless of waypoint spacing.
 */
declare class ArcLengthTable {
    readonly totalLength: number;
    private readonly lengths;
    private readonly divisions;
    constructor(curve: Curve, samplesPerSegment?: number);
    /** Curve parameter t for a distance along the curve (clamped). */
    tAtDistance(d: number): number;
    /** Distance along the curve for curve parameter t. */
    distanceAtT(t: number): number;
}

/**
 * Maps between path space (what is stored in JSON) and world space (the
 * coordinates of the Three.js scene / the followed object's reference frame).
 * Implement this interface for custom conventions.
 */
interface CoordinateSystem {
    /**
     * Every converter takes an optional output vector, writes into it and
     * returns it, so per-frame conversion allocates nothing. Without one it
     * returns a new vector.
     */
    toWorld(point: Vec3, dimension: PathDimension, out?: Vec3): Vec3;
    toPath(point: Vec3, dimension: PathDimension, out?: Vec3): Vec3;
    /** Converts a direction (no translation). */
    directionToWorld(direction: Vec3, dimension: PathDimension, out?: Vec3): Vec3;
    /** World-space normal of the plane 2D paths live on. */
    readonly planeNormal: Vec3;
}
/** Plane used for 2D paths: 'xz' = ground plane in Y-up scenes, 'xy' = side view / screen plane. */
type Plane2D = 'xz' | 'xy';
interface CoordinateSystemOptions {
    /** Plane that 2D paths are placed on. Default 'xz' (Y-up ground). */
    plane2D?: Plane2D;
    /** Constant world offset along the plane normal for 2D paths. Default 0. */
    elevation2D?: number;
    /** World position of the path-space origin. Default [0, 0, 0]. */
    origin?: Vec3;
    /** Uniform scale from path units to world units. Default 1. */
    scale?: number;
}
/**
 * Default coordinate system. 3D: world = origin + p * scale.
 * 2D 'xz': path [x, y] -> world (x, elevation, y). 2D 'xy': path [x, y] -> world (x, y, elevation).
 */
declare function createCoordinateSystem(options?: CoordinateSystemOptions): CoordinateSystem;
declare const defaultCoordinateSystem: CoordinateSystem;

declare const PATH_FORMAT_VERSION = 1;
declare class PathFormatError extends Error {
    constructor(message: string);
}
interface PathFile {
    version: number;
    paths: Path[];
    /** Unknown top-level keys, preserved by `serializePaths(paths, file.extras)`. */
    extras: Record<string, unknown>;
}
/** Serializes paths into the versioned JSON format. */
declare function serializePaths(paths: Iterable<Path>, extras?: Record<string, unknown>): PathFileData;
declare function stringifyPaths(paths: Iterable<Path>, indent?: number, extras?: Record<string, unknown>): string;
/**
 * Parses a path file (object or JSON string). Also accepts a single path object
 * or a bare array of paths. Throws `PathFormatError` on invalid input.
 */
declare function readPathFile(input: unknown): PathFile;
/** Convenience: returns just the paths of a path file. */
declare function parsePathFile(input: unknown): Path[];
/** Convenience: parses a file and returns the path with the given id (throws if missing). */
declare function getPathFromFile(input: unknown, id: string): Path;

declare const VISUALS_FORMAT_VERSION = 1;
declare class VisualsFormatError extends Error {
    constructor(message: string);
}
/** What one object wears: the mesh sets drawn on it, by name. */
interface SubjectVisualsData {
    id: string;
    worn: string[];
    /** Unknown keys are preserved on read and write. */
    [extra: string]: unknown;
}
interface VisualsFileData {
    version: number;
    /**
     * The model file the mesh sets come from (e.g. `Characters.glb`). Carried so
     * tooling and the editor can name it when something does not line up.
     */
    source?: string;
    subjects: SubjectVisualsData[];
    [extra: string]: unknown;
}
interface VisualsFile {
    version: number;
    source: string | null;
    subjects: SubjectVisualsData[];
    /** Unknown top-level keys, preserved by `serializeVisuals(…, { extras })`. */
    extras: Record<string, unknown>;
}
interface SerializeVisualsOptions {
    source?: string | null;
    extras?: Record<string, unknown>;
}
/** Serializes a dressing into the versioned JSON format. */
declare function serializeVisuals(subjects: Iterable<SubjectVisualsData>, options?: SerializeVisualsOptions): VisualsFileData;
declare function stringifyVisuals(subjects: Iterable<SubjectVisualsData>, indent?: number, options?: SerializeVisualsOptions): string;
/**
 * Parses a visuals file (object or JSON string). Throws `VisualsFormatError`
 * on invalid input — the editor catches it and reports it in its panel rather
 * than letting a stale or hand-edited file take the tab down.
 */
declare function readVisualsFile(input: unknown): VisualsFile;
/** The mesh sets `id` wears, or `null` when the file says nothing about it. */
declare function wornOf(file: VisualsFile, id: string): string[] | null;
declare function emptyVisualsFile(source?: string): VisualsFileData;

export { ArcLengthTable, BezierCurve, type BezierHandles, CatmullRomCurve, type CatmullRomParametrization, type CoordinateSystem, type CoordinateSystemOptions, type Curve, type CurveInputPoint, type CurveOptions, type CurveType, DEFAULT_CURVE, Emitter, LinearCurve, LinearHeightCurve, type Listener, type LoopMode, MIN_WAYPOINT_SPEED, type Metadata, PATH_FORMAT_VERSION, Path, PathCursor, type PathCursorEvents, type PathCursorOptions, type PathData, type PathDimension, type PathEvents, type PathFile, type PathFileData, PathFormatError, type PathKind, type PathOptions, type Plane2D, PointCurve, type SeekOptions, type SegmentLocation, type SerializeVisualsOptions, type SpeedContext, type SubjectVisualsData, VISUALS_FORMAT_VERSION, type Vec3, type VisualsFile, type VisualsFileData, VisualsFormatError, Waypoint, type WaypointData, type WaypointFieldKey, type WaypointInit, type WaypointInput, type WaypointInterpolation, type WaypointTarget, type WaypointValueKey, createCoordinateSystem, createCurve, defaultCoordinateSystem, emptyVisualsFile, getPathFromFile, locateSegment, locateSegmentInto, normalizeCurveOptions, parsePathFile, readPathFile, readVisualsFile, resolveBezierHandles, serializePaths, serializeVisuals, stringifyPaths, stringifyVisuals, structuredCloneSafe, vec3$1 as vecMath, wornOf };
