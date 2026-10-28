import { Vec3, PathCursor, CoordinateSystem, PathCursorOptions, Listener, PathCursorEvents, Path, LoopMode, SpeedContext, SeekOptions, WaypointTarget } from './core.js';
export { ArcLengthTable, BezierCurve, BezierHandles, CatmullRomCurve, CatmullRomParametrization, CoordinateSystemOptions, Curve, CurveInputPoint, CurveOptions, CurveType, DEFAULT_CURVE, Emitter, LinearCurve, LinearHeightCurve, MIN_WAYPOINT_SPEED, Metadata, PATH_FORMAT_VERSION, PathData, PathDimension, PathEvents, PathFile, PathFileData, PathFormatError, PathKind, PathOptions, Plane2D, PointCurve, SegmentLocation, SerializeVisualsOptions, SubjectVisualsData, VISUALS_FORMAT_VERSION, VisualsFile, VisualsFileData, VisualsFormatError, Waypoint, WaypointData, WaypointFieldKey, WaypointInit, WaypointInput, WaypointInterpolation, WaypointValueKey, createCoordinateSystem, createCurve, defaultCoordinateSystem, emptyVisualsFile, getPathFromFile, locateSegment, locateSegmentInto, normalizeCurveOptions, parsePathFile, readPathFile, readVisualsFile, resolveBezierHandles, serializePaths, serializeVisuals, stringifyPaths, stringifyVisuals, structuredCloneSafe, vecMath, wornOf } from './core.js';
import { Vector3, Quaternion, Object3D, Mesh } from 'three';

interface OrientationOptions {
    /** Rotate the object to follow the path tangent. Default true. */
    enabled?: boolean;
    /**
     * The model's local forward axis. Default [0, 0, 1] (+Z, matches Object3D.lookAt).
     * Use e.g. [1, 0, 0] for models that face +X, [0, 0, -1] for models facing -Z.
     */
    forward?: Vec3;
    /** The model's local up axis. Default [0, 1, 0]. */
    up?: Vec3;
    /** World up used to keep the object upright. Default [0, 1, 0]. */
    worldUp?: Vec3;
    /**
     * Ignore pitch: only rotate around `worldUp` (cars, characters). Default false.
     *
     * The follower writes rotations as quaternions, so for a heading outside
     * ±90° the object's Euler reads x/z = ±180° and `rotation.y` is the
     * mirrored angle. Read and write the heading through `PathFollower.yaw` /
     * `setYaw()` (or `Orienter.yawOf` / `yawTo`) instead of `rotation.y`.
     */
    yawOnly?: boolean;
    /** Extra rotation in model space (Euler XYZ, radians), e.g. to compensate a tilted model. */
    offset?: Vec3;
    /**
     * Rotation smoothing rate (1/seconds). 0 = snap instantly (default).
     * Higher values converge faster, e.g. 8.
     */
    smoothing?: number;
    /** Apply per-waypoint `roll` (bank) angles. Default true. */
    applyRoll?: boolean;
    /** Multiplies all waypoint roll angles (e.g. 0.5 for a calmer model, -1 to flip). Default 1. */
    rollScale?: number;
}
/**
 * Computes a world rotation that maps the model's forward axis onto a travel
 * direction, keeping the model's up axis aligned with worldUp.
 */
declare class Orienter {
    enabled: boolean;
    smoothing: number;
    yawOnly: boolean;
    applyRoll: boolean;
    rollScale: number;
    /** World up the object is kept upright against. */
    readonly worldUp: Vector3;
    /** inverse(model basis) * offset, precomputed. */
    private readonly modelCorrection;
    private readonly modelCorrectionInverse;
    /** Yaw reference axes: the plane orthogonal to `worldUp`, yaw 0 along `zero`. */
    private readonly zero;
    private readonly quarter;
    constructor(options?: OrientationOptions);
    /**
     * Heading of a rotation around `worldUp`, in radians, as `yawTo` takes it.
     * Use it instead of reading `object.rotation.y`, which is mirrored for
     * headings outside ±90° (see `yawOnly`).
     */
    yawOf(rotation: Quaternion): number;
    /**
     * Writes the rotation for a heading around `worldUp` into `target`, the
     * inverse of `yawOf`. Returns false when the heading is degenerate.
     */
    yawTo(yaw: number, target: Quaternion): boolean;
    /**
     * Writes the target world rotation for a travel direction into `target`.
     * Returns false (leaving `target` untouched) when the direction is degenerate,
     * e.g. zero length or parallel to worldUp.
     *
     * `roll` (radians) banks around the travel direction; positive banks right
     * (the object's right side goes down).
     */
    compute(direction: Vector3, target: Quaternion, roll?: number): boolean;
}

interface RiderOptions {
    /** Any Object3D: mesh, group, camera, light... */
    object: Object3D;
    /**
     * Distance behind the leader along the path, in path units (negative =
     * ahead). Default 0.
     */
    offset?: number;
    /**
     * Sideways and upwards offset from the path, in world units, in the frame of
     * the rider's own position: `[right, up]`. Default `[0, 0]`.
     */
    lateral?: [number, number];
    /**
     * Orientation settings for this rider, or `false` to only move it. Default:
     * the leader's settings.
     */
    orientation?: OrientationOptions | boolean;
}
/**
 * An object carried along a `PathFollower`'s path at a fixed offset: a convoy
 * car, a flock member, a camera trailing a vehicle. Riders share the leader's
 * cursor — no second integration of speed, loops or events — and are posed
 * from the same path, each at its own distance.
 */
declare class FollowerRider {
    readonly object: Object3D;
    readonly orienter: Orienter;
    offset: number;
    lateral: [number, number];
    /** @internal Current rotation, in the object's own frame. */
    readonly rotation: Quaternion;
    /** @internal Whether `rotation` holds a pose smoothing can ease from. */
    hasRotation: boolean;
    constructor(options: RiderOptions, fallback?: Orienter);
    /**
     * Seeds the rotation smoothing eases from, in the object's own frame.
     * Without it the first frame snaps onto the path's heading.
     */
    seedRotation(rotation: Quaternion): this;
}

/** Where a follower starts. See `PathFollowerOptions.startFrom`. */
type FollowerStart = 'path' | 'closest' | 'object';
interface PathFollowerEvents extends PathCursorEvents {
    /** The lead-in leg (`startFrom: 'object'`) reached the path. */
    enter: {
        distance: number;
    };
}
interface PathFollowerOptions extends PathCursorOptions {
    /** Any Object3D: mesh, group, camera, light... */
    object: Object3D;
    /** Orientation settings, or `false` to only move the object. Default: enabled, +Z forward. */
    orientation?: OrientationOptions | boolean;
    /** Face the current travel direction (flips when moving backwards). Default true. */
    faceTravelDirection?: boolean;
    /** Path space -> world space mapping. Default: Y-up, 2D paths on the XZ plane. */
    coordinates?: CoordinateSystem;
    /**
     * 'world' (default): path coordinates are world coordinates; the follower
     * compensates for the object's parent transform. 'parent': path coordinates
     * are written directly to object.position (cheaper, parent-local).
     */
    space?: 'world' | 'parent';
    /** Offset added to the path position, in world units (e.g. hover height). */
    positionOffset?: [number, number, number];
    /**
     * Where the follower starts:
     * - 'path' (default): at `startProgress` on the path.
     * - 'closest': at the point on the path nearest the object's current
     *   position, so picking a path up mid-scene does not jump the object.
     * - 'object': the object stays where it is and runs a straight lead-in leg
     *   onto the path, at the speed the path opens with. `enter` fires when it
     *   arrives, and travel along the path starts from `startProgress`.
     */
    startFrom?: FollowerStart;
    /**
     * What rotation smoothing eases from on the first frame: 'path' (default,
     * snaps onto the path's heading) or 'object' (the object's current rotation,
     * so an object that starts on another heading turns instead of flicking).
     */
    initialRotation?: 'path' | 'object';
    /** Objects carried along the same path at an offset. See `addRider`. */
    riders?: RiderOptions[];
    onProgress?: Listener<PathCursorEvents['progress']>;
    onWaypoint?: Listener<PathCursorEvents['waypoint']>;
    onLoop?: Listener<PathCursorEvents['loop']>;
    onComplete?: Listener<void>;
    /** Playback started (`play()`). See `PathCursorEvents.play`. */
    onPlay?: Listener<void>;
    /** Playback stopped (`pause()` or the end with loop 'none'). See `PathCursorEvents.pause`. */
    onPause?: Listener<void>;
    /** `reset()` was called. See `PathCursorEvents.reset`. */
    onReset?: Listener<void>;
    /** The lead-in leg reached the path. See `PathFollowerEvents.enter`. */
    onEnter?: Listener<PathFollowerEvents['enter']>;
}
/**
 * Moves (and optionally rotates) an Object3D along a Path. Call `update(dt)`
 * from your existing render/update loop — the follower has no loop of its own.
 */
declare class PathFollower {
    readonly object: Object3D;
    readonly cursor: PathCursor;
    coordinates: CoordinateSystem;
    space: 'world' | 'parent';
    faceTravelDirection: boolean;
    positionOffset: Vector3;
    private readonly lead;
    private readonly riderList;
    private readonly posed;
    private readonly ownEvents;
    private entry;
    constructor(options: PathFollowerOptions);
    /** The leader's orientation settings (shared by riders that don't bring their own). */
    get orienter(): FollowerRider['orienter'];
    get path(): Path;
    get speed(): number;
    set speed(value: number);
    get loop(): LoopMode;
    set loop(value: LoopMode);
    get progress(): number;
    get distance(): number;
    get direction(): 1 | -1;
    get isPlaying(): boolean;
    /** Current speed in units/second, including waypoint speed multipliers. */
    get currentSpeed(): number;
    /** Current roll in degrees (from waypoint roll values). */
    get currentRoll(): number;
    get isComplete(): boolean;
    set speedModifier(fn: ((ctx: SpeedContext) => number) | undefined);
    /** True while the object is still running its lead-in leg onto the path. */
    get isEntering(): boolean;
    /**
     * Subscribes to a follower event (the cursor's progress, waypoint, loop,
     * complete, play, pause, reset, plus the follower's own enter). Returns an
     * unsubscribe function.
     */
    on<K extends keyof PathFollowerEvents>(type: K, listener: Listener<PathFollowerEvents[K]>): () => void;
    /**
     * Subscribes until the first event `filter` accepts, then unsubscribes, e.g.
     * the next time a named waypoint is reached:
     * `follower.once('waypoint', run, (e) => e.waypoint.metadata.name === 'gate')`.
     */
    once<K extends keyof PathFollowerEvents>(type: K, listener: Listener<PathFollowerEvents[K]>, filter?: (payload: PathFollowerEvents[K]) => boolean): () => void;
    play(): this;
    pause(): this;
    /** Back to the start and snap the object there. Drops a pending lead-in. */
    reset(): this;
    /** Jump to normalized progress [0, 1] and apply immediately. */
    setProgress(progress: number, options?: SeekOptions): this;
    setDistance(distance: number, options?: SeekOptions): this;
    /**
     * Jump to a waypoint, by index or `metadata.name`. Returns false (and moves
     * nothing) when the path has no such waypoint. Pass
     * `{ emitWaypoints: true }` to let listeners hear about the points skipped.
     */
    setWaypoint(target: WaypointTarget, options?: SeekOptions): boolean;
    /**
     * Jump to an authored time on the path (see `Waypoint.time`). Returns false
     * when the path has no timeline. Two paths authored with the same times stay
     * in step when both are sampled at the same time.
     */
    setTime(time: number, options?: SeekOptions): boolean;
    /** The authored time the follower currently sits at. See `Waypoint.time`. */
    get time(): number;
    /** See `PathCursor.hasPassed`. */
    hasPassed(target: WaypointTarget): boolean;
    setPath(path: Path): this;
    /**
     * Heading of the object around the orientation's world up, in radians, as
     * `setYaw` takes it. Read this instead of `object.rotation.y`, which is
     * mirrored for headings outside ±90°.
     */
    get yaw(): number;
    /** Faces the object at `yaw` (radians) and lets smoothing ease on from there. */
    setYaw(yaw: number): this;
    /**
     * Sets the rotation smoothing eases on from, and puts the object there.
     * Without it the first frame snaps onto the path's heading.
     */
    seedRotation(rotation: Quaternion): this;
    /**
     * Carries another object along the same path at an offset (convoy, flock,
     * trailing camera). Riders share this follower's cursor, so speed, loops and
     * events are integrated once.
     */
    addRider(options: RiderOptions): FollowerRider;
    removeRider(rider: FollowerRider): void;
    get riders(): readonly FollowerRider[];
    /** Advance by `dt` seconds and write the pose to the object(s). */
    update(dt: number): this;
    /** Writes the current pose to the object(s) without advancing. */
    apply(dt?: number): this;
    /** Removes event listeners and riders. Does not touch the objects. */
    dispose(): void;
    private start;
    /** Advances the lead-in; returns the time left over once it reaches the path. */
    private advanceEntry;
    private applyEntry;
    private applyPath;
    /** Writes a world position and heading onto the target, in its own frame. */
    private writePose;
    private offsetLaterally;
    /** Where a target sits on the path: `offset` units behind the leader. */
    private distanceFor;
    private rollAt;
}

/**
 * A **mesh set** is one named mesh on an object. A model that carries several
 * interchangeable pieces — a rig with four head covers, a car with three
 * bumpers — is dressed by drawing some of its meshes and hiding the rest; the
 * visuals file records which, and the editor's Visuals tab authors it.
 *
 * Only names are used, never indices, so adding or reordering meshes in the
 * model does not move anyone's clothes.
 */
declare function meshSetsOf(object: Object3D): string[];
interface ApplyVisualsResult {
    /** Sets that were drawn. */
    applied: string[];
    /** Names the dressing asked for that this object does not carry. */
    missing: string[];
}
/**
 * Draws `worn` on `object` and hides every other mesh set it carries. Names
 * the object does not have are reported rather than thrown, so a dressing
 * written against an older model still puts on everything it can.
 */
declare function applyVisuals(object: Object3D, worn: Iterable<string>): ApplyVisualsResult;
/** Every mesh of `object` the visuals system owns, in traversal order. */
declare function forEachSetMesh(object: Object3D, visit: (mesh: Mesh) => void): void;

export { type ApplyVisualsResult, CoordinateSystem, FollowerRider, type FollowerStart, Listener, LoopMode, type OrientationOptions, Orienter, Path, PathCursor, PathCursorEvents, PathCursorOptions, PathFollower, type PathFollowerEvents, type PathFollowerOptions, type RiderOptions, SeekOptions, SpeedContext, Vec3, WaypointTarget, applyVisuals, forEachSetMesh, meshSetsOf };
