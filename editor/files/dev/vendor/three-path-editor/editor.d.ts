import { Emitter, Path, Vec3, PathFileData, CoordinateSystem, PathDimension, LoopMode, PathCursorEvents, Listener, Waypoint, PathOptions, CoordinateSystemOptions, PathData, SubjectVisualsData, serializeVisuals } from '../../../src/vendor/three-path-editor/dist/core.js';
export { ArcLengthTable, BezierCurve, BezierHandles, CatmullRomCurve, CatmullRomParametrization, Curve, CurveInputPoint, CurveOptions, CurveType, DEFAULT_CURVE, LinearCurve, LinearHeightCurve, MIN_WAYPOINT_SPEED, Metadata, PATH_FORMAT_VERSION, PathCursor, PathCursorOptions, PathEvents, PathFile, PathFormatError, PathKind, Plane2D, PointCurve, SeekOptions, SegmentLocation, SerializeVisualsOptions, SpeedContext, VISUALS_FORMAT_VERSION, VisualsFile, VisualsFileData, VisualsFormatError, WaypointData, WaypointFieldKey, WaypointInit, WaypointInput, WaypointInterpolation, WaypointTarget, WaypointValueKey, createCoordinateSystem, createCurve, defaultCoordinateSystem, emptyVisualsFile, getPathFromFile, locateSegment, locateSegmentInto, normalizeCurveOptions, parsePathFile, readPathFile, readVisualsFile, resolveBezierHandles, serializePaths, stringifyPaths, stringifyVisuals, structuredCloneSafe, vecMath, wornOf } from '../../../src/vendor/three-path-editor/dist/core.js';
import { PathFollower, PathFollowerOptions } from '../../../src/vendor/three-path-editor/dist/index.js';
export { ApplyVisualsResult, FollowerRider, FollowerStart, OrientationOptions, Orienter, PathFollowerEvents, RiderOptions, applyVisuals, forEachSetMesh, meshSetsOf } from '../../../src/vendor/three-path-editor/dist/index.js';
import * as three from 'three';
import { Camera, Group, LineSegments, LineBasicMaterial, Vector3, Raycaster, Object3D, ColorRepresentation, Line } from 'three';

interface EditorViewOptions {
    /** TransformControls gizmo on the selected waypoint. */
    gizmos: boolean;
    /** Path lines and waypoint markers. */
    paths: boolean;
    /** Direction arrows along paths. */
    directions: boolean;
    /** Waypoint index / path name labels. */
    labels: boolean;
    /** Facing arrows on waypoints that carry a `yaw`. */
    facings: boolean;
    /** Sight lines of camera rigs (camera path ↔ what it looks at). */
    sightlines: boolean;
    /** Warning ticks where a path runs below the surface it was authored on. */
    surface: boolean;
    /** Editor grid + axes helpers. */
    grid: boolean;
    /** Control polygon and other debug helpers. */
    debug: boolean;
}
declare const DEFAULT_VIEW: EditorViewOptions;
type HandleKind = 'in' | 'out';
interface EditorSelection {
    pathId: string | null;
    waypointIndex: number | null;
    /** Selected Bezier handle of the selected waypoint. */
    handle: HandleKind | null;
}
interface EditorStateEvents {
    selection: EditorSelection;
    view: EditorViewOptions;
    /** The set of paths changed (added, removed, replaced, renamed). */
    paths: Path[];
    /** A path's content changed. */
    pathchange: Path;
}
/**
 * Three.js-independent editor state: the loaded paths, the selection and the
 * view toggles. The Three.js editor renders whatever this state says.
 */
declare class EditorState {
    readonly events: Emitter<EditorStateEvents>;
    readonly view: EditorViewOptions;
    private readonly _paths;
    private readonly unsubscribers;
    private _selection;
    constructor(view?: Partial<EditorViewOptions>);
    get paths(): Path[];
    get selection(): Readonly<EditorSelection>;
    get selectedPath(): Path | null;
    getPath(id: string): Path | undefined;
    hasPath(id: string): boolean;
    /** Adds a path, replacing any existing path with the same id. */
    addPath(path: Path): void;
    /** Replaces the whole set of paths (in this order) with a single 'paths' event. Used by undo/redo. */
    replacePaths(paths: Path[]): void;
    removePath(id: string): Path | undefined;
    /** Removes all paths. */
    clear(): void;
    renamePath(oldId: string, newId: string): boolean;
    select(pathId: string | null, waypointIndex?: number | null, handle?: HandleKind | null): void;
    setView(options: Partial<EditorViewOptions>): void;
    toggleView(key: keyof EditorViewOptions): boolean;
    private attach;
    private detach;
    /** Keeps the selection valid after waypoints were removed. */
    private clampSelection;
}

interface EditorHistoryEvents {
    change: {
        canUndo: boolean;
        canRedo: boolean;
    };
}
interface EditorHistoryOptions {
    /** Maximum number of undo steps. Default 100. */
    limit?: number;
}
/**
 * Snapshot-based undo/redo for an EditorState. Three.js-independent.
 *
 * - All changes made in the same synchronous task become one step
 *   (e.g. an insert that also adjusts Bezier handles).
 * - `begin()` / `end()` group longer interactions (a gizmo drag) into one step.
 * - Restoring reuses the original Path objects, so external references
 *   (followers, previews) stay valid even for deleted-then-restored paths.
 */
declare class EditorHistory {
    private readonly state;
    readonly events: Emitter<EditorHistoryEvents>;
    limit: number;
    private readonly undoStack;
    private readonly redoStack;
    private current;
    private pending;
    private depth;
    private restoring;
    private batchSelection;
    private readonly unsubscribers;
    constructor(state: EditorState, options?: EditorHistoryOptions);
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** Starts grouping every change until the matching `end()` into one step. Nestable. */
    begin(): void;
    end(): void;
    /** Records pending changes now instead of at the end of the current task. */
    flush(): void;
    undo(): boolean;
    redo(): boolean;
    /** Forgets all steps; the current state becomes the new baseline. */
    clear(): void;
    dispose(): void;
    private onChange;
    private commit;
    private restore;
    private hasUncommittedChanges;
    private capture;
    private emit;
}

/**
 * Point-manipulation helpers shared by the editor, panel and shortcuts.
 * Pure functions over Path, no Three.js.
 */
/** Average distance between consecutive waypoints, or `fallback` for < 2 points. */
declare function averageSpacing(path: Path, fallback?: number): number;
/**
 * Suggests where a new waypoint inserted after `afterIndex` should go:
 * on the curve between two points, or extrapolated past the last point.
 */
declare function suggestWaypointPosition(path: Path, afterIndex: number | null, fallbackSpacing?: number): Vec3;
/** Inserts a waypoint after `afterIndex` (null = append). Returns the new index. */
declare function insertWaypointAfter(path: Path, afterIndex: number | null, position?: ArrayLike<number>): number;
/** Moves a waypoint one step earlier (-1) or later (+1). Returns its new index. */
declare function shiftWaypoint(path: Path, index: number, delta: -1 | 1): number;
/**
 * Inserts a waypoint on the curve at parameter t (e.g. where the user clicked
 * the line). Bezier paths are split exactly (de Casteljau) so the shape is
 * unchanged; speed/roll of the new point are interpolated from its neighbours.
 * Returns the new waypoint index.
 */
declare function insertWaypointAtT(path: Path, t: number): number;

/**
 * Optional keyboard shortcuts for the editor. Kept separate so projects can
 * disable them (e.g. when they clash with game controls) or bind their own.
 *
 *   Delete / Backspace   delete selected waypoint
 *   Escape               clear waypoint selection
 *   + / = / Insert       add waypoint after selection
 *   [ / ]                select previous / next waypoint
 *   Alt + [ / ]          move selected waypoint earlier / later
 *   G                    toggle gizmos
 *   R                    gizmo: move / turn (authors the waypoint's yaw)
 *   Cmd/Ctrl + Z         undo
 *   Cmd/Ctrl + Shift + Z redo (also Ctrl + Y)
 *
 * Keys are matched by physical position (`event.code`), so they work with any
 * keyboard layout (e.g. Ukrainian).
 */
interface ShortcutTarget {
    deleteSelectedWaypoint(): void;
    clearWaypointSelection(): void;
    addWaypoint(): unknown;
    selectAdjacentWaypoint(delta: -1 | 1): void;
    shiftSelectedWaypoint(delta: -1 | 1): void;
    toggleView(key: 'gizmos'): unknown;
    toggleGizmoMode(): unknown;
    undo(): unknown;
    redo(): unknown;
}
declare function bindShortcuts(target: ShortcutTarget, element?: Window | HTMLElement): () => void;

interface SaveToDevServerOptions {
    /** Endpoint of `pathEditorSavePlugin`. Default `/__path-editor/save`. */
    endpoint?: string;
    /** Custom fetch (tests, auth headers...). Default `globalThis.fetch`. */
    fetch?: typeof fetch;
}
/**
 * POSTs a path file (e.g. `editor.exportString()`) to a dev-server endpoint
 * such as `pathEditorSavePlugin` from `three-path-editor/vite`, which writes
 * it into the project. Any server that accepts the JSON body works. Rejects
 * with the server's message when it refuses the file.
 */
declare function saveToDevServer(file: string | PathFileData, options?: SaveToDevServerOptions): Promise<void>;

interface FlyKeyMap {
    forward: string[];
    back: string[];
    left: string[];
    right: string[];
    up: string[];
    down: string[];
    lookLeft: string[];
    lookRight: string[];
    lookUp: string[];
    lookDown: string[];
    boost: string[];
}
interface FlyControlsOptions {
    /** Element that receives the look drag and wheel. Default `window`. */
    domElement?: HTMLElement | Window;
    /** World units per second. Adjust with the mouse wheel at runtime. Default 10. */
    speed?: number;
    /** Speed multiplier while a `boost` key is held. Default 4. */
    boostMultiplier?: number;
    /** Degrees of rotation per dragged pixel. Default 0.2. */
    lookSensitivity?: number;
    /** Degrees per second for the keyboard look keys. Default 90. */
    keyLookSpeed?: number;
    /** Mouse button that drags the view: 0 left, 1 middle, 2 right. Default 2 (left stays free for picking). */
    lookButton?: 0 | 1 | 2;
    /** Wheel speed step factor; 0 disables wheel speed changes. Default 1.2. */
    wheelSpeedFactor?: number;
    /** Override key bindings (KeyboardEvent.code values). */
    keys?: Partial<FlyKeyMap>;
    /** Start enabled. Default true. */
    enabled?: boolean;
}
declare const DEFAULT_FLY_KEYS: FlyKeyMap;
/**
 * Minimal free-fly camera for editing: WASD to move, E/Q (Space/C) up/down,
 * right-drag or arrow keys to look, wheel to change speed, Shift to boost.
 *
 * Framework-agnostic and optional: it moves the camera you pass and nothing
 * else, has no loop of its own (call `update(dt)` from yours), and ignores
 * keys typed into inputs or pressed with Cmd/Ctrl. It has an `enabled` flag,
 * so it can be passed to `PathEditor` as `cameraControls` (look dragging then
 * pauses while a gizmo is dragged).
 *
 * The camera is moved in its parent's space; attach it to the scene (or an
 * untransformed parent) while flying.
 */
declare class FlyControls {
    readonly camera: Camera;
    speed: number;
    boostMultiplier: number;
    lookSensitivity: number;
    keyLookSpeed: number;
    lookButton: 0 | 1 | 2;
    wheelSpeedFactor: number;
    readonly keys: FlyKeyMap;
    private readonly domElement;
    private readonly pressed;
    private _enabled;
    private looking;
    private yawDeg;
    private pitchDeg;
    private disposed;
    constructor(camera: Camera, options?: FlyControlsOptions);
    get enabled(): boolean;
    /** Enabling re-reads the camera's current orientation, so it never snaps. */
    set enabled(value: boolean);
    /** Re-reads yaw/pitch from the camera (call after moving the camera yourself). */
    syncFromCamera(): void;
    /** Moves and turns the camera. Call once per frame while enabled. */
    update(dt: number): void;
    dispose(): void;
    private isDown;
    private attach;
    private detach;
    private readonly onKeyDown;
    private readonly onKeyUp;
    private readonly onBlur;
    private readonly onPointerDown;
    private readonly onPointerMove;
    private readonly onPointerUp;
    private readonly onContextMenu;
    private readonly onWheel;
}

interface CameraRigOptions {
    /** Id of the path the camera travels along. */
    path: string;
    /** Id of the path whose matching point the camera looks at. */
    lookAt: string;
    /** Default: `<path>→<lookAt>`. */
    id?: string;
    /**
     * Flight duration in seconds, used when the two paths carry no authored
     * times. Default 10.
     */
    duration?: number;
}
/**
 * A camera path paired with the path it looks at. The two are sampled at the
 * same point of one shared parameter — authored `time` when both paths carry
 * it, normalized arc length otherwise — because waypoint N of one path has
 * nothing to do with waypoint N of the other.
 *
 * The rig draws sight lines between the matching points and can fly the
 * editor's own camera along it, which is the only way to see the framing
 * without restarting the game.
 */
declare class CameraRig {
    readonly id: string;
    readonly group: Group<three.Object3DEventMap>;
    pathId: string;
    lookAtPathId: string;
    duration: number;
    /** The sight lines themselves; restyle their material if you like. */
    readonly lines: LineSegments;
    private readonly resolve;
    private readonly coordinates;
    private builtFor;
    constructor(options: CameraRigOptions, context: {
        resolve: (id: string) => Path | undefined;
        coordinates: CoordinateSystem;
        material: LineBasicMaterial;
    });
    get path(): Path | undefined;
    get lookAtPath(): Path | undefined;
    /** True when both paths carry authored times, so the rig runs on them. */
    get timed(): boolean;
    /** Seconds the flight takes: the authored time span, or `duration`. */
    get flightTime(): number;
    /**
     * Camera position and aim at `u` in [0, 1] of the rig's shared parameter.
     * False when either path is missing or empty.
     */
    sample(u: number, position: Vector3, lookAt: Vector3): boolean;
    /** Rebuilds the sight lines when either path changed. */
    update(visible: boolean): void;
    dispose(): void;
}

interface PlacementContext {
    /** Ray through the clicked pixel. */
    raycaster: Raycaster;
    /** Path the waypoint will be added to. */
    path: Path;
    /** World position of the selected (or last) waypoint, if any. */
    reference: Vector3 | null;
    /** World-space normal of the 2D path plane (from the coordinate system). */
    planeNormal: Vector3;
    /** World-space origin of 2D paths (includes elevation). */
    planeOrigin: Vector3;
}
/**
 * Decides where a waypoint goes when the user Shift+clicks the scene.
 * Return a world position, or null to cancel.
 */
type PlacementProvider = (ctx: PlacementContext) => Vector3 | null;
interface PlanePlacementOptions {
    /** Plane normal for 3D paths. Default [0, 1, 0]. 2D paths always use the coordinate-system plane. */
    normal?: [number, number, number];
    /**
     * Height of the plane along the normal for 3D paths. Default: through the
     * reference waypoint (keeps the current altitude), or 0 when there is none.
     */
    height?: number;
}
/**
 * World up a path's yaw is measured around: the plane normal for 2D paths, the
 * coordinate system's up for 3D ones.
 */
declare function pathUp(coordinates: CoordinateSystem, dimension: PathDimension, target?: Vector3): Vector3;
/**
 * True for objects the editor itself drew (markers, gizmo, grid, previews).
 * Host raycasts — placement, constraints, a pivot under the cursor — must skip
 * them, and the editor tags only the roots it adds to the scene, so the check
 * walks up the parents.
 */
declare function isEditorObject(object: Object3D | null): boolean;
/** Places waypoints on a mathematical plane. Default provider. */
declare function planePlacement(options?: PlanePlacementOptions): PlacementProvider;
interface ObjectPlacementOptions {
    recursive?: boolean;
    /** Offset along the hit face normal (e.g. 2 = two units above the surface). */
    surfaceOffset?: number;
    /** Used when nothing is hit. Default: plane placement. */
    fallback?: PlacementProvider | null;
}
/**
 * Places waypoints on the first intersected object (terrain, map, floor...).
 * Pass the objects of your project that should accept waypoint clicks.
 */
declare function objectPlacement(objects: Object3D[] | (() => Object3D[]), options?: ObjectPlacementOptions): PlacementProvider;
interface ConstraintContext {
    path: Path;
    /** Index of the waypoint being placed or moved. */
    waypointIndex: number;
    /** Proposed world position. Return a new vector (or mutate and return this one). */
    position: Vector3;
}
/**
 * Adjusts a waypoint's world position whenever the editor places or moves it
 * (gizmo drag, Shift+click, insert, typed coordinates). Return the position to
 * use, or null/undefined to keep the proposal unchanged.
 */
type WaypointConstraint = (ctx: ConstraintContext) => Vector3 | null | undefined | void;
interface SurfaceConstraintOptions {
    /** Distance kept above the surface, along `up`. Default 0. */
    offset?: number;
    /** World up direction. Default [0, 1, 0]. */
    up?: [number, number, number];
    /** How far above the proposal the downward ray starts. Default 10000. */
    castHeight?: number;
    recursive?: boolean;
    /** Only constrain these paths. Default: every path. */
    filter?: (path: Path) => boolean;
}
/**
 * Keeps waypoints on top of the given objects (terrain, floors, roads): the
 * position is dropped straight down (along -up) onto the highest surface
 * under it. Horizontal movement stays free. Positions with nothing below are
 * left unchanged.
 */
declare function surfaceConstraint(objects: Object3D[] | (() => Object3D[]), options?: SurfaceConstraintOptions): WaypointConstraint;

interface SurfaceCheckOptions {
    /** Floors, terrain, roads — whatever the paths are authored on. */
    objects: Object3D[] | (() => Object3D[]);
    /** How far under the surface counts as sagging, in world units. Default 0.05. */
    tolerance?: number;
    /** How far above a sample the downward ray starts. Default 10000. */
    castHeight?: number;
    /** Samples per curve segment. Default 16. */
    samplesPerSegment?: number;
}
/**
 * Marks the spans where a path runs below the surface its waypoints sit on.
 * A spline through points on a floor overshoots in height where a flat stretch
 * meets a climb and dips under it, which is invisible in the editor until
 * something walks the route — `curve.linearHeight` is the fix.
 */
declare class SurfaceCheck {
    readonly group: Group<three.Object3DEventMap>;
    /** The warning ticks themselves; restyle their material if you like. */
    readonly lines: LineSegments;
    private readonly raycaster;
    private readonly coordinates;
    private readonly options;
    private builtFor;
    constructor(options: SurfaceCheckOptions, context: {
        coordinates: CoordinateSystem;
        material: LineBasicMaterial;
    });
    /** Rebuilds the markers when a path changed, the set changed or it was switched on. */
    update(paths: readonly Path[], visible: boolean): void;
    dispose(): void;
    /** A vertical tick from the curve up to the surface for every sample below it. */
    private checkPath;
}

/**
 * Follower options (speed, loop, orientation, `onPlay`/`onPause`/`onReset`/`onComplete`...)
 * minus `object` and `path`. Default loop is 'loop'.
 */
interface PathPreviewOptions extends Partial<Omit<PathFollowerOptions, 'object' | 'path'>> {
    /** Restore the object's original position/rotation on detach. Default true. */
    restoreOnDetach?: boolean;
}
/**
 * Editor-side preview: plays any Object3D along a path with play/pause/reset.
 * Wraps a PathFollower and remembers the object's original transform so the
 * game object is left untouched after the preview ends.
 *
 * Every playback change emits an event, whoever caused it (panel, API, the end
 * of a non-looping path, `detach`): subscribe with `on('play' | 'pause' | 'reset', ...)`
 * instead of polling `isPlaying`.
 */
declare class PathPreview {
    readonly object: Object3D;
    readonly follower: PathFollower;
    private readonly restoreOnDetach;
    private readonly savedPosition;
    private readonly savedQuaternion;
    private detached;
    constructor(object: Object3D, path: Path, options?: PathPreviewOptions);
    get path(): Path;
    get isPlaying(): boolean;
    get speed(): number;
    set speed(value: number);
    get loop(): LoopMode;
    set loop(value: LoopMode);
    get progress(): number;
    /**
     * Subscribes to the follower's events (progress, waypoint, loop, complete,
     * play, pause, reset). Listeners survive `setPath`; `detach` removes them.
     */
    on<K extends keyof PathCursorEvents>(type: K, listener: Listener<PathCursorEvents[K]>): () => void;
    play(): this;
    pause(): this;
    toggle(): this;
    reset(): this;
    setProgress(progress: number): this;
    setPath(path: Path): this;
    update(dt: number): void;
    /**
     * Stops the preview (emitting `pause` if it was playing), removes its
     * listeners and (by default) restores the object's original transform.
     */
    detach(): void;
}

interface PathRenderStyle {
    lineColor: ColorRepresentation;
    selectedLineColor: ColorRepresentation;
    pointColor: ColorRepresentation;
    /** Colour of the first waypoint (shows where the path starts). */
    startPointColor: ColorRepresentation;
    selectedPointColor: ColorRepresentation;
    handleColor: ColorRepresentation;
    arrowColor: ColorRepresentation;
    debugColor: ColorRepresentation;
    labelColor: string;
    /** Waypoint marker diameter in screen pixels. */
    pointSize: number;
    selectedPointSize: number;
    handleSize: number;
    /** Direction arrow length in screen pixels. */
    arrowSize: number;
    /** Bank (roll) indicator width in screen pixels. */
    bankSize: number;
    bankColor: ColorRepresentation;
    /** Facing arrow length in screen pixels (waypoints with a `yaw`). */
    facingSize: number;
    facingColor: ColorRepresentation;
    /** Label height in screen pixels. */
    labelSize: number;
    lineOpacity: number;
    /** false (default) = always drawn on top of the game scene. */
    depthTest: boolean;
    renderOrder: number;
}
declare const DEFAULT_PATH_STYLE: PathRenderStyle;
interface ThreePathRendererOptions {
    coordinates?: CoordinateSystem;
    style?: Partial<PathRenderStyle>;
    showLine?: boolean;
    showPoints?: boolean;
    showArrows?: boolean;
    /** Facing arrows on waypoints that carry a `yaw`. Default true. */
    showFacings?: boolean;
    showLabels?: boolean;
    showDebug?: boolean;
    /** World distance between direction arrows. 'auto' = 12 arrows per path. */
    arrowSpacing?: number | 'auto';
    /** Line samples per curve segment. Default 32. */
    samplesPerSegment?: number;
    /**
     * Text of each waypoint label (when labels are shown). Return `null` or an
     * empty string for no label. Default: `defaultWaypointLabel`.
     */
    labelFormatter?: (context: WaypointLabelContext) => string | null;
}
interface WaypointLabelContext {
    path: Path;
    waypoint: Waypoint;
    index: number;
}
/** Path id on the first point, then the index, plus speed ×/roll ° when set. */
declare function defaultWaypointLabel({ path, waypoint, index }: WaypointLabelContext): string;
/** userData stored on pickable editor objects. */
interface PathPickData {
    pathEditor: true;
    kind: 'waypoint' | 'handle' | 'line';
    pathId: string;
    waypointIndex?: number;
    handle?: HandleKind;
}
/**
 * Draws one Path into its own Group: line, waypoint markers, direction arrows,
 * labels, Bezier handles and debug helpers. Owns (and disposes) every geometry,
 * material and texture it creates; never touches objects of the host scene.
 */
declare class ThreePathRenderer {
    readonly group: Group<three.Object3DEventMap>;
    readonly path: Path;
    coordinates: CoordinateSystem;
    readonly style: PathRenderStyle;
    readonly options: Required<Omit<ThreePathRendererOptions, 'coordinates' | 'style'>>;
    private selected;
    private selectedWaypoint;
    private selectedHandle;
    private builtVersion;
    private dirty;
    private readonly sphere;
    private readonly cone;
    /** "Wing" bar along local X with a small up tick, for roll indicators. */
    private readonly wing;
    private readonly orienter;
    private yawFrame;
    private readonly materials;
    private readonly lineMaterial;
    private readonly auxLineMaterial;
    private readonly line;
    private readonly pointGroup;
    private readonly arrowGroup;
    private readonly labelGroup;
    private readonly handleGroup;
    private readonly debugGroup;
    private readonly bankGroup;
    private readonly facingGroup;
    private readonly labelTextures;
    /** Objects whose scale follows the camera: [object, size in px]. */
    private scaled;
    constructor(path: Path, options?: ThreePathRendererOptions);
    setOptions(options: Partial<ThreePathRendererOptions>): void;
    setSelection(selected: boolean, waypointIndex?: number | null, handle?: HandleKind | null): void;
    /** World position of waypoint `index`. */
    getWaypointWorld(index: number, target?: Vector3): Vector3;
    /** World position of a Bezier handle end of waypoint `index`. */
    getHandleWorld(index: number, handle: HandleKind, target?: Vector3): Vector3;
    /** Objects the editor can raycast against. */
    getPickables(): {
        markers: Object3D[];
        line: Line | null;
    };
    /** Rebuilds if needed and keeps markers at a constant on-screen size. Call every frame. */
    update(camera?: Camera, viewportHeight?: number): void;
    dispose(): void;
    private rebuild;
    private buildArrows;
    /** Wing bars showing the bank angle at waypoints with a roll (and the selected one). */
    private buildBank;
    /** Arrows showing the authored facing (`yaw`) of waypoints that carry one. */
    private buildFacings;
    /** Yaw is measured around the path's up axis, which the 2D plane can change. */
    private yawOrienter;
    private buildHandles;
    private buildLabels;
    private buildDebug;
    private createLabel;
    private setLineGeometry;
    /** Marks an object as editor-owned, overlay-rendered and (optionally) pickable. */
    private tag;
    /** Removes children; disposes their geometry (and sprite materials) when they are not shared. */
    private clearGroup;
}

interface PathEditorOptions {
    /** The application's existing scene (or any Object3D to parent the editor root to). */
    scene: Object3D;
    /** The application's active camera. Update with `setCamera()` if it changes. */
    camera: Camera;
    /** The application's renderer; only `domElement` is used. */
    renderer?: {
        domElement: HTMLElement;
    };
    /** Element that receives pointer input. Defaults to `renderer.domElement`. */
    domElement?: HTMLElement;
    /** Path space <-> world mapping. Default: Y-up, 2D paths on the XZ plane. */
    coordinates?: CoordinateSystem | CoordinateSystemOptions;
    /** Initial view toggles. */
    view?: Partial<EditorViewOptions>;
    /** Rendering options applied to every path (style, arrow spacing...). */
    render?: Omit<ThreePathRendererOptions, 'coordinates'>;
    /** Editor grid helper. Default size 100, 20 divisions. */
    grid?: {
        size?: number;
        divisions?: number;
        color?: number;
        centerColor?: number;
    };
    /**
     * Your camera controls (OrbitControls, MapControls...). The editor suspends
     * them while a gizmo is dragged and releases them afterwards. Host gizmos
     * must go through `suspendCameraControls()` rather than writing `enabled`
     * themselves, so two overlapping drags can't leave the camera switched off.
     */
    cameraControls?: CameraControlsLike | null;
    /**
     * Other gizmos or controls in the scene that may own a pointer press (a host
     * `TransformControls`). While one of them reports an `axis`, the editor
     * leaves the press alone: it neither selects nor clears the selection, so
     * clicking a host gizmo no longer deselects the waypoint it belongs to.
     */
    otherControls?: GizmoLike[];
    /**
     * Called first for every pointer press in the viewport. Return true to tell
     * the editor the press belongs to the host (its own gizmo, a 3D widget): the
     * editor ignores it completely and lets it through.
     */
    claimPointer?: (event: PointerEvent) => boolean;
    /**
     * Keeps the camera controls' pivot (`target`) on the surface under the
     * pointer, on the view axis so the view never jumps. Bare `OrbitControls`
     * scale zoom and pan by the distance to `target`, so both stall near a fixed
     * pivot. Needs controls with a `target` vector. Default false.
     */
    pivotUnderPointer?: boolean | PivotOptions;
    /**
     * While the editor is enabled, hide and block every element on the page
     * except the viewport and elements marked `data-path-editor-ui`, so the
     * game's own UI cannot cover the canvas or swallow presses. Uses
     * `visibility`, so layouts keep their size. Default false.
     */
    isolateUi?: boolean;
    /**
     * Move the camera out of its rig into the scene for the editing session and
     * put it back on `disable()`. Camera controls cannot orbit a camera that a
     * rig drives, so hosts otherwise have to detach it themselves. Implies
     * `restoreCameraOnDisable`. Default false.
     */
    detachCamera?: boolean;
    /** Where Shift+click places new waypoints. Default: `planePlacement()`. */
    placement?: PlacementProvider;
    /**
     * Camera paths paired with what they look at. The editor draws sight lines
     * between the matching points and can fly its own camera along a rig
     * (`playRig`). See `CameraRig`.
     */
    rigs?: CameraRigOptions[];
    /**
     * Floors or terrain the paths are authored on. Spans of a curve that run
     * below them get a warning tick in the view (toggle `surface`), which is how
     * a spline sagging under a floor between two points becomes visible — see
     * `curve.linearHeight`.
     */
    surface?: SurfaceCheckOptions['objects'] | SurfaceCheckOptions;
    /** Enable keyboard shortcuts (see editor/shortcuts). Default true. */
    keyboardShortcuts?: boolean;
    /**
     * What the gizmo does: 'translate' (default) moves the selected waypoint,
     * 'rotate' authors its `yaw` — the facing of whatever stands on it. Toggled
     * with R, or `setGizmoMode()`.
     */
    gizmoMode?: GizmoMode;
    /** Keep Bezier handles of a waypoint collinear while dragging one. Default true. */
    mirrorBezierHandles?: boolean;
    /** Enable immediately. Default false: call `enable()`. */
    enabled?: boolean;
    /** Maximum undo steps. Default 100. */
    historyLimit?: number;
    /**
     * Warn once (console) when a pointer press inside `domElement`'s area lands
     * on another element, i.e. something covers the canvas and the editor never
     * sees the click. The `inputblocked` event fires either way. Default true.
     */
    diagnostics?: boolean;
    /**
     * Remember the camera's position/rotation on `enable()` and put it back on
     * `disable()`, so flying around while editing doesn't leave the game camera
     * somewhere else. Default false.
     */
    restoreCameraOnDisable?: boolean;
    /**
     * Decides which edits the editor (UI, shortcuts and its own methods) may
     * make, e.g. to protect waypoints your code looks up by name, or to keep a
     * path's curve type fixed. Return false to refuse; the editor then emits
     * `denied`. Direct `Path` method calls are not checked. Default: allow all.
     */
    canEdit?: (action: EditorAction, context: EditActionContext) => boolean;
    /**
     * Adjusts every waypoint position the editor places or moves (gizmo drag,
     * Shift+click, insert, typed coordinates), e.g. `surfaceConstraint(...)` to
     * keep ground routes on the terrain. Bezier handles are not constrained.
     */
    constrainWaypoint?: WaypointConstraint;
}
/** What the editor's gizmo edits: the waypoint's position or its `yaw`. */
type GizmoMode = 'translate' | 'rotate';
/** The part of camera controls the editor uses (OrbitControls and friends). */
interface CameraControlsLike {
    enabled: boolean;
    /** Orbit pivot, used by `pivotUnderPointer`. */
    target?: Vector3;
}
/** The part of a `TransformControls` the editor reads to see who owns a press. */
interface GizmoLike {
    /** The axis under the pointer, or being dragged; null when the gizmo is idle. */
    axis: string | null;
    /** True while a drag is in progress (`TransformControls` has it). */
    dragging?: boolean;
}
interface PivotOptions {
    /**
     * Objects the pivot ray tests. Default: everything in the scene except the
     * editor's own objects.
     */
    objects?: Object3D[] | (() => Object3D[]);
    /**
     * Minimum distance kept between the camera and the pivot, so the wheel and
     * pan keep usable steps right at a surface. Default 1.
     */
    minDistance?: number;
}
type EditorAction = 'addWaypoint' | 'deleteWaypoint' | 'moveWaypoint' | 'reorderWaypoint' | 'editWaypointProperties' | 'deletePath' | 'renamePath' | 'editCurve' | 'editMetadata';
interface EditActionContext {
    path: Path;
    /** The waypoint the action targets, or null for path-level actions. */
    waypointIndex: number | null;
}
interface PathEditorEvents {
    /** A path's geometry or settings changed. */
    change: {
        path: Path;
    };
    select: EditorSelection;
    view: EditorViewOptions;
    pathadded: {
        path: Path;
    };
    pathremoved: {
        path: Path;
    };
    import: {
        paths: Path[];
    };
    /**
     * A waypoint was deleted through the editor (UI, shortcut or API), with the
     * waypoint that is gone and the index it sat at. Fires in the same task as
     * the deletion, so edits made in the handler join its undo step.
     */
    waypointremoved: {
        path: Path;
        index: number;
        waypoint: Waypoint;
    };
    /** The gizmo switched between moving a waypoint and turning it. */
    gizmomode: GizmoMode;
    /** A camera rig flight started or stopped (`playRig` / `stopRig`, or the end of the flight). */
    rigstate: {
        rig: CameraRig;
        playing: boolean;
    };
    dragstart: {
        path: Path;
        waypointIndex: number;
    };
    dragend: {
        path: Path;
        waypointIndex: number;
    };
    enabled: boolean;
    /** A preview was attached (or retargeted by `previewPath`), or detached (`null`). */
    preview: PathPreview | null;
    /**
     * The current preview started or stopped playing: panel buttons, API calls,
     * the end of a non-looping path. Also fires after `preview` when an attached
     * preview starts playing, and with `playing: false` when a playing preview is detached.
     */
    previewstate: {
        preview: PathPreview;
        playing: boolean;
    };
    /** Undo/redo availability changed. */
    history: {
        canUndo: boolean;
        canRedo: boolean;
    };
    /**
     * A pointer press inside `domElement`'s area was received by another element
     * (an overlay covering the canvas), so the editor could not handle it.
     */
    inputblocked: {
        target: Element;
        event: PointerEvent;
    };
    /** `canEdit` refused an edit. */
    denied: {
        action: EditorAction;
    } & EditActionContext;
}
interface PickResult {
    kind: 'waypoint' | 'handle' | 'line';
    path: Path;
    waypointIndex: number | null;
    handle: HandleKind | null;
    point: Vector3;
    /** For line hits: curve parameter t of the closest point on the curve. */
    t: number | null;
}
/** What `saveSession()` stores so editing can resume after a page reload. */
interface EditorSessionState {
    version: 1;
    enabled: boolean;
    selection: EditorSelection;
    view: EditorViewOptions;
    camera: {
        position: number[];
        quaternion: number[];
    };
    gizmoMode?: GizmoMode;
}
interface SessionStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
interface RestoreSessionOptions {
    /** Also restore the camera pose. Default true. */
    camera?: boolean;
    /** Keep the stored state instead of consuming it. Default false. */
    keep?: boolean;
    /** Default `sessionStorage`. */
    storage?: SessionStorageLike;
}
declare const DEFAULT_SESSION_KEY = "three-path-editor:session";
interface CreatePathOptions extends PathOptions {
    /** Select the new path. Default true. */
    select?: boolean;
}
interface CreateMarkerOptions extends Omit<CreatePathOptions, 'points' | 'curve' | 'kind'> {
    /** Path-space position. Default: the middle of the view. */
    position?: ArrayLike<number>;
    /** Facing in degrees around the up axis. */
    yaw?: number;
}
/** Elements carrying this attribute (the panel, host dev UI) are never reported as blocking input. */
declare const EDITOR_UI_ATTRIBUTE = "data-path-editor-ui";
/** Set on `domElement` while the editor is enabled; `isolateUi` keeps it visible. */
declare const EDITOR_VIEWPORT_ATTRIBUTE = "data-path-editor-viewport";
/**
 * In-game visual path editor. Plugs into an existing Three.js app: it never
 * creates a scene, camera, renderer or animation loop. Everything it draws
 * lives under `editor.root`, which is added to your scene on `enable()` and
 * removed on `disable()`.
 *
 * Call `editor.update(dt)` from your existing update loop.
 */
declare class PathEditor {
    readonly root: Group<three.Object3DEventMap>;
    readonly state: EditorState;
    /** Undo/redo stack (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z). */
    readonly history: EditorHistory;
    readonly events: Emitter<PathEditorEvents>;
    readonly scene: Object3D;
    readonly domElement: HTMLElement;
    readonly coordinates: CoordinateSystem;
    camera: Camera;
    cameraControls: CameraControlsLike | null;
    placement: PlacementProvider;
    /** See `PathEditorOptions.otherControls`. Host gizmos can be added later. */
    readonly otherControls: GizmoLike[];
    /** See `PathEditorOptions.claimPointer`. Can be replaced at any time. */
    claimPointer: ((event: PointerEvent) => boolean) | null;
    /** See `PathEditorOptions.constrainWaypoint`. Can be replaced at any time. */
    constrainWaypoint: WaypointConstraint | null;
    mirrorBezierHandles: boolean;
    private readonly renderOptions;
    private readonly renderers;
    private readonly raycaster;
    private readonly helpers;
    private readonly rigGroup;
    private readonly rigList;
    private rigMaterial;
    private readonly surfaceCheck;
    private surfaceMaterial;
    private flight;
    private readonly gizmoProxy;
    private readonly keyboardShortcuts;
    private _gizmoMode;
    private readonly yawOrienters;
    private readonly diagnostics;
    private blockedInputWarned;
    private readonly restoreCameraOnDisable;
    private readonly detachCamera;
    private readonly isolateUi;
    private readonly pivot;
    private detachedCamera;
    private readonly canEditOption;
    private savedCameraPose;
    private transformControls;
    private _enabled;
    private dragging;
    private cameraSuspensions;
    private cameraControlsWereEnabled;
    private releaseDragCamera;
    private pointerDown;
    private unbindShortcuts;
    private _preview;
    private ownedPreviewObject;
    /** Unknown top-level keys of the last imported file, preserved on export. */
    private fileExtras;
    private disposed;
    constructor(options: PathEditorOptions);
    get enabled(): boolean;
    get paths(): Path[];
    get selection(): Readonly<EditorSelection>;
    get selectedPath(): Path | null;
    get preview(): PathPreview | null;
    get view(): Readonly<EditorViewOptions>;
    /** See `PathEditorOptions.gizmoMode`. */
    get gizmoMode(): GizmoMode;
    /**
     * Switches the gizmo between moving the selected waypoint and turning it
     * (authoring its `yaw`). Rotating needs the `editWaypointProperties`
     * permission, the same as speed and roll.
     */
    setGizmoMode(mode: GizmoMode): this;
    toggleGizmoMode(): this;
    on<K extends keyof PathEditorEvents>(type: K, listener: Listener<PathEditorEvents[K]>): () => void;
    getPath(id: string): Path | undefined;
    getRenderer(path: Path): ThreePathRenderer | undefined;
    /**
     * Whether `action` is allowed on `path`: a marker never grows points or
     * curve settings, and beyond that whatever `canEdit` says (everything, when
     * no `canEdit` was given).
     */
    can(action: EditorAction, path: Path, waypointIndex?: number | null): boolean;
    /** `can()` that also emits `denied` when refused. */
    private allow;
    /** Attaches the editor root to the scene and starts listening for input. */
    enable(): this;
    /** Detaches everything from the scene and stops listening. Paths are kept. */
    disable(): this;
    toggle(): this;
    /**
     * Switches the host's camera controls off until the returned function is
     * called. Suspensions are counted, so the editor's gizmo and a host gizmo
     * can hold one at the same time without either restoring the other's state
     * — what the controls had before the first suspension is what comes back
     * after the last release. Releasing twice does nothing.
     */
    suspendCameraControls(): () => void;
    /**
     * True while a gizmo owns the pointer: the editor's own is dragging or has an
     * axis under the pointer, or one of `otherControls` has. Host code can ask
     * this before treating a press as its own.
     */
    get gizmoEngaged(): boolean;
    /**
     * The editor's own transform gizmo, as much of it as a host needs to see who
     * owns a press. Null until the first `enable()`.
     */
    get gizmo(): GizmoLike | null;
    /** Disables the editor and releases every GPU resource and listener it created. */
    dispose(): void;
    /** Call once per frame from the host application's loop. */
    update(dt?: number): void;
    /** Switch to a different camera (e.g. when the game changes cameras). */
    setCamera(camera: Camera): void;
    /** Pairs a camera path with the path it looks at. See `CameraRig`. */
    addRig(options: CameraRigOptions): CameraRig;
    removeRig(rig: CameraRig | string): void;
    get rigs(): readonly CameraRig[];
    /** The surface-sag check, when a `surface` was given. See `SurfaceCheck`. */
    get surfaceWarnings(): SurfaceCheck | null;
    getRig(id: string): CameraRig | undefined;
    /** The rig the editor's camera is currently flying, if any. */
    get flyingRig(): CameraRig | null;
    /**
     * Flies the editor's camera along a rig, looking at the matching point of
     * its target path, so the framing can be judged without restarting the game.
     * The camera pose is restored when the flight ends or is stopped, and the
     * host's camera controls are suspended while it runs.
     */
    playRig(rig: CameraRig | string): boolean;
    /** Stops a rig flight and puts the camera back where it was. */
    stopRig(): void;
    private buildSurfaceCheck;
    private advanceFlight;
    private applyFlight;
    /** Creates a path, adds it to the editor and (by default) selects it. */
    createPath(options?: CreatePathOptions): Path;
    /**
     * Creates a path with a few waypoints in front of the camera — handy for
     * "New path" buttons when you don't know the world scale.
     */
    createPathInView(options?: CreatePathOptions & {
        pointCount?: number;
    }): Path;
    /**
     * Creates a marker: one named place, no curve — a spawn point, a prop, a
     * light. It is a `Path` with `kind: 'marker'`, so it is selected, moved,
     * turned, undone and saved exactly like a path, and lives in the same file.
     * Without a position it lands in the middle of the view.
     */
    createMarker(options?: CreateMarkerOptions): Path;
    /** Markers only (`kind: 'marker'`). `paths` holds both. */
    get markers(): Path[];
    /** Routes only, i.e. everything that is not a marker. `paths` holds both. */
    get routes(): Path[];
    /** Adds a Path (or PathData) to the editor, replacing a path with the same id. */
    loadPath(path: Path | PathData): Path;
    removePath(id: string): Path | undefined;
    /** Deletes the selected path entirely. Returns the removed path. */
    deleteSelectedPath(): Path | undefined;
    renamePath(oldId: string, newId: string): boolean;
    /**
     * Loads a path file (object or JSON string). Replaces all paths unless
     * `merge` is true. Unknown fields and metadata are preserved.
     */
    import(data: PathFileData | string | unknown, options?: {
        merge?: boolean;
        clearHistory?: boolean;
    }): Path[];
    /** Exports all paths in the versioned JSON format. */
    export(): PathFileData;
    exportString(indent?: number): string;
    select(pathId: string | null, waypointIndex?: number | null, handle?: HandleKind | null): void;
    clearSelection(): void;
    /** Deselects the waypoint but keeps the path selected. */
    clearWaypointSelection(): void;
    selectAdjacentWaypoint(delta: -1 | 1): void;
    /**
     * Adds a waypoint. Defaults: selected path, after the selected waypoint (or
     * at the end), position suggested from neighbours. Returns the new index.
     */
    addWaypoint(options?: {
        pathId?: string;
        index?: number;
        position?: ArrayLike<number>;
        select?: boolean;
    }): number | null;
    /** Adds a waypoint where the pointer ray hits the placement surface. */
    addWaypointAtScreen(clientX: number, clientY: number): number | null;
    /**
     * Inserts a waypoint on the curve of `pathId` at parameter t (keeps the
     * curve shape; exact for Bezier). Returns the new index.
     */
    insertWaypointAt(pathId: string, t: number, options?: {
        select?: boolean;
    }): number | null;
    /** Inserts a waypoint where the screen position hits a path line. Returns the index or null. */
    insertWaypointAtScreen(clientX: number, clientY: number): number | null;
    deleteSelectedWaypoint(): void;
    removeWaypoint(pathId: string, index: number): void;
    /** Moves a waypoint to a new position (path space). */
    moveWaypoint(pathId: string, index: number, position: ArrayLike<number>): void;
    /**
     * Runs `constrainWaypoint` over every waypoint of `pathId` (default: all
     * paths), e.g. right after `import()` to snap existing routes onto the
     * terrain. Undoes as one step, like any other synchronous change.
     */
    applyConstraints(pathId?: string): void;
    reorderWaypoint(pathId: string, from: number, to: number): void;
    /** Moves the selected waypoint one step earlier (-1) or later (+1). */
    shiftSelectedWaypoint(delta: -1 | 1): void;
    /** Reverts the last change. Returns false if there is nothing to undo. */
    undo(): boolean;
    /** Re-applies the last undone change. */
    redo(): boolean;
    get canUndo(): boolean;
    get canRedo(): boolean;
    setView(options: Partial<EditorViewOptions>): void;
    toggleView(key: keyof EditorViewOptions): boolean;
    /**
     * Plays an object along a path (default: the selected path). Without an
     * object, an editor-owned arrow marker is used. Only one preview at a time.
     */
    attachPreview(object?: Object3D | null, path?: Path | string | null, options?: PathPreviewOptions): PathPreview | null;
    /** Previews `path`: retargets the current preview (keeping its object) or starts one with the marker. */
    previewPath(path: Path | string): PathPreview | null;
    /** Stops the preview; restores the object's original transform by default. */
    detachPreview(): void;
    /**
     * Stores whether the editor is on, the selection, view toggles and the
     * camera pose in `sessionStorage`, so `restoreSession()` can pick up where
     * you were after a reload (e.g. right before saving a path file that makes
     * the dev server reload the page). Returns false if storage is unavailable.
     */
    saveSession(key?: string, storage?: SessionStorageLike | undefined): boolean;
    /**
     * Applies a state stored by `saveSession()`: view toggles, selection (paths
     * that no longer exist are skipped), and, if the editor was on, enables it
     * and restores the camera pose. Consumed by default. Returns false when
     * nothing usable was stored.
     */
    restoreSession(key?: string, options?: RestoreSessionOptions): boolean;
    /** Raycasts editor objects under a screen position (client coordinates). */
    pick(clientX: number, clientY: number, options?: {
        markersOnly?: boolean;
    }): PickResult | null;
    /** Sets up the internal raycaster for a screen position and returns it (e.g. for custom placement). */
    setRayFromScreen(clientX: number, clientY: number): Raycaster;
    /** Point the camera is looking at on the ground plane (or 10 units ahead). */
    getViewCenter(dimension?: 2 | 3): Vector3;
    /**
     * Registered on `window` in the capture phase, so it runs before the
     * listeners TransformControls and the camera controls put on the canvas.
     * Pressing a marker that is not the current gizmo target selects it
     * immediately and stops the event — otherwise gizmo arrows that overlap
     * nearby markers (e.g. Bezier handles) would steal the click.
     */
    private readonly onPointerDown;
    private readonly onPointerUp;
    /** Detects overlays that swallow presses meant for `domElement` (see `diagnostics`). */
    private readonly onWindowPointerDown;
    /** Double-click on a curve inserts a waypoint there. */
    private readonly onDoubleClick;
    /** Yaw is measured around the path's up axis, which the 2D plane can change. */
    private yawOrienter;
    /** A press on a host gizmo is the host's, not a click into empty space. */
    private get otherGizmoEngaged();
    private isInViewport;
    /**
     * Keeps the orbit pivot on the surface under the pointer, at the same depth
     * along the view axis, so the view never jumps while zoom and pan keep
     * usable steps. Runs before the camera controls handle the same event.
     */
    private readonly movePivot;
    /** Ends a TransformControls drag that is in progress, without its event. */
    private stopGizmoDrag;
    /**
     * Camera controls cannot orbit a camera a rig drives, so the camera is moved
     * into the scene for the session, keeping its world pose.
     */
    private takeCameraOutOfRig;
    private putCameraBackInRig;
    /** Hides and blocks everything but the viewport and the editor's own UI. */
    private setUiIsolated;
    private ensureTransformControls;
    private beginDrag;
    private endDrag;
    private onGizmoMoved;
    /** `position` (path space) after `constrainWaypoint`; the same array when unchanged. */
    private constrained;
    private applyConstraint;
    /** Puts the gizmo on the selected waypoint/handle, or hides it. */
    private syncSelection;
    private syncGizmoPosition;
    private syncRenderers;
    private applyView;
    private buildHelpers;
    private createPreviewMarker;
    private assertNotDisposed;
}

/** An object the Visuals tab can dress, under a name the file can address. */
interface VisualsSubject {
    id: string;
    object: Object3D;
}
type VisualsProblemCode = 'no-subjects' | 'no-sets' | 'no-file' | 'file-invalid' | 'unknown-subject' | 'unknown-set';
interface VisualsProblem {
    code: VisualsProblemCode;
    message: string;
    subject?: string;
    set?: string;
}
interface VisualsEditorOptions {
    /**
     * The objects to dress. A function is re-read on `refresh()`, for a host
     * whose cast is not built yet when the editor is created.
     *
     * `'auto'` (the default) takes them from `scene`: every named child that
     * carries more than one named mesh, by its own name. That is a starting
     * point for looking around, not a substitute for naming the objects the
     * game actually dresses.
     */
    subjects?: readonly VisualsSubject[] | (() => readonly VisualsSubject[]) | 'auto';
    /** Scanned by `subjects: 'auto'`. The panel passes the editor's scene. */
    scene?: Object3D;
    /**
     * The visuals file as the host loaded it: an object, a JSON string, or
     * `null`/`undefined` when there is none yet. Anything unreadable becomes a
     * problem in the panel, never a throw.
     */
    data?: unknown;
    /** Where that file lives, named in the panel's setup hint. */
    file?: string;
    /** The model the mesh sets come from (e.g. `Characters.glb`), likewise. */
    source?: string;
    /** The skill that sets this up, named in the setup hint. */
    skill?: string;
    /** Groups of sets that cannot be worn together, e.g. one head cover of four. */
    exclusive?: readonly (readonly string[])[];
}
interface VisualsEditorEvents {
    change: {
        subject: string;
    };
    refresh: void;
}
/**
 * The Visuals tab's state: which mesh sets each subject wears, applied to the
 * live objects as they are ticked (`VisualsPanel` drives it).
 *
 * Nothing here throws. A missing file, a model whose meshes are not loaded, a
 * file naming objects or sets that are not there — each becomes an entry in
 * `problems`, and `setupHint` turns the ones that leave the tab with nothing
 * to show into the one line that says what to run. Whatever *can* be dressed
 * still is.
 */
declare class VisualsEditor extends Emitter<VisualsEditorEvents> {
    private readonly options;
    private readonly worn;
    private readonly sets;
    private readonly initialVisibility;
    private current;
    private file;
    private issues;
    constructor(options: VisualsEditorOptions);
    /** The file the dressing is saved to, as the host named it. */
    get fileName(): string | null;
    /** The model the mesh sets come from, from the options or the file itself. */
    get source(): string | null;
    get skill(): string;
    get subjects(): readonly VisualsSubject[];
    get problems(): readonly VisualsProblem[];
    /** True when the tab has at least one subject with at least one mesh set. */
    get isUsable(): boolean;
    /**
     * What to tell the user when the tab cannot do its job: which skill to
     * apply, which model holds the meshes and where the file belongs. `null`
     * once there is something to dress.
     */
    get setupHint(): string | null;
    /** Re-reads the subjects and the sets they carry, keeping what is worn. */
    refresh(): void;
    /** The mesh sets `id` carries, worn or not. */
    setsOf(id: string): readonly string[];
    isWorn(id: string, set: string): boolean;
    setWorn(id: string, set: string, worn: boolean): void;
    /** Back to what the file (or the model itself) started with. */
    reset(): void;
    /** The dressing as the visuals file, ready for `onSave` or the clipboard. */
    exportString(indent?: number): string;
    toData(): SubjectVisualsData[];
    toJSON(): ReturnType<typeof serializeVisuals>;
    /** Puts every subject's meshes back the way the host had them. */
    restore(): void;
    dispose(): void;
    private readSubjects;
    private readFile;
    private seedWorn;
    private reportUnknownSubjects;
    private isDrawn;
    private rememberVisibility;
    private exclusiveWith;
    private applyAll;
    private apply;
    private report;
}
/**
 * What a scene offers to dress with no configuration: named children that
 * carry more than one named mesh. One mesh is a prop, not a wardrobe.
 */
declare function autoSubjects(scene: Object3D): VisualsSubject[];

interface VisualsPanelOptions {
    /** Tab label. Default 'Visuals'. */
    label?: string;
    /** File name used by the Export button. Default the editor's `file`, else 'visuals.json'. */
    fileName?: string;
    /** Replace the default "download file" export behaviour. */
    onExport?: (json: string) => void;
    /**
     * Shows a Save button that hands the visuals JSON to this function, e.g.
     * `(json) => saveToDevServer(json, { endpoint: VISUALS_SAVE_ENDPOINT })`.
     */
    onSave?: (json: string) => unknown;
}
/**
 * The editor's Visuals tab: draws the mesh sets each subject carries as
 * checkboxes and dresses the live objects as they are ticked.
 *
 * When the tab has nothing to work with — no visuals file yet, no objects, a
 * model whose meshes never arrived — it says so here, in the tab itself,
 * together with the one line that fixes it: which skill to apply and which
 * model file the mesh sets live in. The editor keeps running either way.
 */
declare class VisualsPanel {
    readonly element: HTMLElement;
    private readonly editor;
    private readonly options;
    private readonly unsubscribers;
    private statusText;
    constructor(editor: VisualsEditor, options?: VisualsPanelOptions);
    /** Ready to hand to `PathEditorPanel.addTab`. */
    get tab(): PathEditorPanelTab;
    refresh(): void;
    dispose(): void;
    private renderNote;
    private renderProblems;
    private renderSubject;
    private renderSet;
    private syncChecks;
    private renderActions;
    private button;
    private save;
    private export;
    private copy;
    private status;
}

/** A host panel shown as a further tab of `PathEditorPanel` (`addTab`). */
interface PathEditorPanelTab {
    label: string;
    element: HTMLElement;
}
interface PathEditorPanelOptions {
    /** Where to mount the panel. Default `document.body`. */
    container?: HTMLElement;
    /** Corner of the container. Default 'top-right'. */
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    title?: string;
    /** File name used by the Export button. Default 'paths.json'. */
    fileName?: string;
    /** Replace the default "download file" export behaviour. */
    onExport?: (json: string) => void;
    /**
     * Shows a Save button that hands the exported JSON to this function, e.g.
     * `(json) => saveToDevServer(json)`. A returned promise drives the status
     * line ("Saving…", "Saved.", or the rejection message).
     */
    onSave?: (json: string) => unknown;
    collapsed?: boolean;
    /** Ask before deleting a path. Default true. */
    confirmDelete?: boolean;
    /**
     * Hide the panel while the editor is disabled. Default false, because the
     * panel's own Editor button is then the only way back in; set it when the
     * host toggles the editor with a key.
     */
    hideWhenDisabled?: boolean;
    /** Extra text after `#i x, y, z` in the waypoint list (e.g. a name from metadata). */
    formatWaypoint?: (context: WaypointLabelContext) => string | null;
    /** Label of the editor's own controls once `addTab` puts them behind a tab. Default 'Paths'. */
    tabLabel?: string;
    /**
     * The Visuals tab, which authors which meshes of a model are drawn.
     *
     * It is **on by default**: with nothing configured it reads the scene for
     * objects carrying more than one named mesh, and when there is nothing to
     * dress it says so in the tab, naming the skill that sets visuals up. Pass
     * options to point it at your own objects and file, a `VisualsEditor` you
     * built yourself, or `false` to leave the tab out.
     */
    visuals?: VisualsEditor | (VisualsEditorOptions & VisualsPanelOptions) | false;
}
/**
 * Optional, dependency-free DOM panel for the editor: path list, curve
 * settings, waypoint list/coordinates, view toggles, preview and JSON I/O.
 * Games that have their own dev UI can skip it and call the PathEditor API.
 */
declare class PathEditorPanel {
    readonly element: HTMLDivElement;
    private readonly editor;
    private readonly options;
    private readonly unsubscribers;
    private readonly tabs;
    private visualsEditor;
    private visualsPanel;
    private tab;
    private frame;
    constructor(editor: PathEditor, options?: PathEditorPanelOptions);
    private refreshRigs;
    /**
     * Puts a host panel in this one as a further tab: a dev tool that belongs
     * next to the routes (object visuals, spawn tables, lighting) shares the
     * frame, the corner and the show/hide the editor already drives, instead of
     * stacking a second floating box over it. The element is appended to the
     * panel and shown only while its tab is picked; the editor's own controls
     * become the first tab, labelled by `tabLabel`.
     *
     * The host owns the element: this panel never writes into it.
     */
    addTab(tab: PathEditorPanelTab): void;
    /** The Visuals tab's state, unless it was switched off. */
    get visuals(): VisualsEditor | null;
    private addVisualsTab;
    /** 0 is the editor's own controls, 1.. are the tabs added by the host. */
    get activeTab(): number;
    selectTab(index: number): void;
    private renderTabs;
    /** Shows or hides the panel without disposing it. */
    setVisible(visible: boolean): void;
    dispose(): void;
    private $;
    private scheduleRefresh;
    /** Syncs every control with the editor state. */
    refresh(): void;
    private waypointSuffix;
    private status;
    private readonly onClick;
    private readonly onChange;
    private template;
}

/** World units covered by one screen pixel at `position` (for constant on-screen sizes). */
declare function worldUnitsPerPixel(camera: Camera, position: Vector3, viewportHeight: number): number;

export { type CameraControlsLike, CameraRig, type CameraRigOptions, type ConstraintContext, CoordinateSystem, CoordinateSystemOptions, type CreateMarkerOptions, type CreatePathOptions, DEFAULT_FLY_KEYS, DEFAULT_PATH_STYLE, DEFAULT_SESSION_KEY, DEFAULT_VIEW, EDITOR_UI_ATTRIBUTE, EDITOR_VIEWPORT_ATTRIBUTE, type EditActionContext, type EditorAction, EditorHistory, type EditorHistoryEvents, type EditorHistoryOptions, type EditorSelection, type EditorSessionState, EditorState, type EditorStateEvents, type EditorViewOptions, Emitter, FlyControls, type FlyControlsOptions, type FlyKeyMap, type GizmoLike, type GizmoMode, type HandleKind, Listener, LoopMode, type ObjectPlacementOptions, Path, PathCursorEvents, PathData, PathDimension, PathEditor, type PathEditorEvents, type PathEditorOptions, PathEditorPanel, type PathEditorPanelOptions, type PathEditorPanelTab, PathFileData, PathFollower, PathFollowerOptions, PathOptions, type PathPickData, PathPreview, type PathPreviewOptions, type PathRenderStyle, type PickResult, type PivotOptions, type PlacementContext, type PlacementProvider, type PlanePlacementOptions, type RestoreSessionOptions, type SaveToDevServerOptions, type SessionStorageLike, type ShortcutTarget, SubjectVisualsData, SurfaceCheck, type SurfaceCheckOptions, type SurfaceConstraintOptions, ThreePathRenderer, type ThreePathRendererOptions, Vec3, VisualsEditor, type VisualsEditorEvents, type VisualsEditorOptions, VisualsPanel, type VisualsPanelOptions, type VisualsProblem, type VisualsProblemCode, type VisualsSubject, Waypoint, type WaypointConstraint, type WaypointLabelContext, autoSubjects, averageSpacing, bindShortcuts, defaultWaypointLabel, insertWaypointAfter, insertWaypointAtT, isEditorObject, objectPlacement, pathUp, planePlacement, saveToDevServer, serializeVisuals, shiftWaypoint, suggestWaypointPosition, surfaceConstraint, worldUnitsPerPixel };
