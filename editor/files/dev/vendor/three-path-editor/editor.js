import { PathFollower, Orienter, forEachSetMesh, meshSetsOf, applyVisuals } from '../../../src/vendor/three-path-editor/dist/chunk-XG3YY6ST.js';
export { FollowerRider, Orienter, PathFollower, applyVisuals, forEachSetMesh, meshSetsOf } from '../../../src/vendor/three-path-editor/dist/chunk-XG3YY6ST.js';
import { defaultCoordinateSystem, createCoordinateSystem } from '../../../src/vendor/three-path-editor/dist/chunk-EA5W2OPP.js';
export { MIN_WAYPOINT_SPEED, PathCursor, createCoordinateSystem, defaultCoordinateSystem } from '../../../src/vendor/three-path-editor/dist/chunk-EA5W2OPP.js';
import { Emitter, Path, distance, lerp, add, normalize, sub, scale, locateSegment, readPathFile, serializePaths, stringifyPaths, toVec3, length, stringifyVisuals, serializeVisuals, readVisualsFile, wornOf } from '../../../src/vendor/three-path-editor/dist/chunk-PRIBWOOI.js';
export { ArcLengthTable, BezierCurve, CatmullRomCurve, DEFAULT_CURVE, Emitter, LinearCurve, LinearHeightCurve, PATH_FORMAT_VERSION, Path, PathFormatError, PointCurve, VISUALS_FORMAT_VERSION, VisualsFormatError, Waypoint, createCurve, emptyVisualsFile, getPathFromFile, locateSegment, locateSegmentInto, normalizeCurveOptions, parsePathFile, readPathFile, readVisualsFile, resolveBezierHandles, serializePaths, serializeVisuals, stringifyPaths, stringifyVisuals, structuredCloneSafe, vec3_exports as vecMath, wornOf } from '../../../src/vendor/three-path-editor/dist/chunk-PRIBWOOI.js';
import { Vector3, Euler, Quaternion, Matrix4, Vector2, MathUtils, Group, LineSegments, BufferGeometry, Float32BufferAttribute, Plane, Raycaster, SphereGeometry, ConeGeometry, BoxGeometry, LineBasicMaterial, Line, Sprite, Mesh, CanvasTexture, SpriteMaterial, Object3D, GridHelper, AxesHelper, MeshBasicMaterial } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// src/editor/EditorState.ts
var DEFAULT_VIEW = {
  gizmos: true,
  paths: true,
  directions: true,
  labels: false,
  facings: true,
  sightlines: true,
  surface: true,
  grid: false,
  debug: false
};
var EditorState = class {
  constructor(view = {}) {
    this.events = new Emitter();
    this._paths = /* @__PURE__ */ new Map();
    this.unsubscribers = /* @__PURE__ */ new Map();
    this._selection = { pathId: null, waypointIndex: null, handle: null };
    this.view = { ...DEFAULT_VIEW, ...view };
  }
  get paths() {
    return [...this._paths.values()];
  }
  get selection() {
    return this._selection;
  }
  get selectedPath() {
    return this._selection.pathId ? this._paths.get(this._selection.pathId) ?? null : null;
  }
  getPath(id) {
    return this._paths.get(id);
  }
  hasPath(id) {
    return this._paths.has(id);
  }
  /** Adds a path, replacing any existing path with the same id. */
  addPath(path) {
    const existing = this._paths.get(path.id);
    if (existing === path) return;
    if (existing) this.detach(existing);
    this._paths.set(path.id, path);
    this.attach(path);
    this.events.emit("paths", this.paths);
    this.clampSelection();
  }
  /** Replaces the whole set of paths (in this order) with a single 'paths' event. Used by undo/redo. */
  replacePaths(paths) {
    const keep = new Set(paths);
    const previous = new Set(this._paths.values());
    for (const path of previous) if (!keep.has(path)) this.detach(path);
    this._paths.clear();
    for (const path of paths) {
      this._paths.set(path.id, path);
      if (!previous.has(path)) this.attach(path);
    }
    this.events.emit("paths", this.paths);
    this.clampSelection();
  }
  removePath(id) {
    const path = this._paths.get(id);
    if (!path) return void 0;
    this.detach(path);
    this._paths.delete(id);
    if (this._selection.pathId === id) this.select(null);
    this.events.emit("paths", this.paths);
    return path;
  }
  /** Removes all paths. */
  clear() {
    for (const path of this._paths.values()) this.detach(path);
    this._paths.clear();
    this.select(null);
    this.events.emit("paths", []);
  }
  renamePath(oldId, newId) {
    const path = this._paths.get(oldId);
    if (!path || !newId || newId !== oldId && this._paths.has(newId)) return false;
    if (newId === oldId) return true;
    const entries = [...this._paths.entries()].map(([id, p]) => [id === oldId ? newId : id, p]);
    this._paths.clear();
    for (const [id, p] of entries) this._paths.set(id, p);
    path.id = newId;
    if (this._selection.pathId === oldId) this._selection = { ...this._selection, pathId: newId };
    this.events.emit("paths", this.paths);
    path.markChanged();
    return true;
  }
  select(pathId, waypointIndex = null, handle = null) {
    const path = pathId ? this._paths.get(pathId) : void 0;
    const next = path ? {
      pathId: path.id,
      waypointIndex: waypointIndex !== null && waypointIndex >= 0 && waypointIndex < path.waypoints.length ? waypointIndex : null,
      handle: null
    } : { pathId: null, waypointIndex: null, handle: null };
    if (next.waypointIndex !== null) next.handle = handle;
    const cur = this._selection;
    if (cur.pathId === next.pathId && cur.waypointIndex === next.waypointIndex && cur.handle === next.handle) return;
    this._selection = next;
    this.events.emit("selection", next);
  }
  setView(options) {
    let changed = false;
    for (const key of Object.keys(options)) {
      const value = options[key];
      if (typeof value === "boolean" && this.view[key] !== value) {
        this.view[key] = value;
        changed = true;
      }
    }
    if (changed) this.events.emit("view", { ...this.view });
  }
  toggleView(key) {
    this.setView({ [key]: !this.view[key] });
    return this.view[key];
  }
  attach(path) {
    this.unsubscribers.set(
      path,
      path.events.on("change", () => {
        this.events.emit("pathchange", path);
        this.clampSelection();
      })
    );
  }
  detach(path) {
    this.unsubscribers.get(path)?.();
    this.unsubscribers.delete(path);
  }
  /** Keeps the selection valid after waypoints were removed. */
  clampSelection() {
    const { pathId, waypointIndex, handle } = this._selection;
    const path = this.selectedPath;
    if (!path) {
      if (pathId) this.select(null);
      return;
    }
    if (waypointIndex !== null && waypointIndex >= path.waypoints.length) {
      this.select(path.id, path.waypoints.length ? path.waypoints.length - 1 : null, handle);
    }
  }
};

// src/editor/EditorHistory.ts
var EditorHistory = class {
  constructor(state, options = {}) {
    this.state = state;
    this.events = new Emitter();
    this.undoStack = [];
    this.redoStack = [];
    this.pending = false;
    this.depth = 0;
    this.restoring = false;
    this.batchSelection = null;
    this.limit = options.limit ?? 100;
    this.current = this.capture();
    const onChange = () => this.onChange();
    this.unsubscribers = [state.events.on("pathchange", onChange), state.events.on("paths", onChange)];
  }
  get canUndo() {
    return this.undoStack.length > 0 || this.depth === 0 && this.hasUncommittedChanges();
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  /** Starts grouping every change until the matching `end()` into one step. Nestable. */
  begin() {
    if (this.depth++ === 0) {
      this.commit();
      this.batchSelection = { ...this.state.selection };
    }
  }
  end() {
    if (this.depth === 0) return;
    if (--this.depth === 0) this.commit();
  }
  /** Records pending changes now instead of at the end of the current task. */
  flush() {
    if (this.depth === 0) this.commit();
  }
  undo() {
    this.flush();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.restore(entry.before, entry.selectionBefore);
    this.redoStack.push(entry);
    this.emit();
    return true;
  }
  redo() {
    this.flush();
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.restore(entry.after, entry.selectionAfter);
    this.undoStack.push(entry);
    this.emit();
    return true;
  }
  /** Forgets all steps; the current state becomes the new baseline. */
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.batchSelection = null;
    this.current = this.capture();
    this.emit();
  }
  dispose() {
    for (const off of this.unsubscribers) off();
    this.events.clear();
  }
  onChange() {
    if (this.restoring) return;
    if (!this.batchSelection) this.batchSelection = { ...this.state.selection };
    if (this.depth > 0 || this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (this.depth === 0) this.commit();
    });
  }
  commit() {
    const selectionBefore = this.batchSelection ?? { ...this.state.selection };
    this.batchSelection = null;
    const next = this.capture();
    if (next.key === this.current.key) return;
    this.undoStack.push({ before: this.current, after: next, selectionBefore, selectionAfter: { ...this.state.selection } });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.current = next;
    this.emit();
  }
  restore(snapshot, selection) {
    this.restoring = true;
    try {
      const paths = snapshot.paths.map(({ path, data }) => {
        if (path.dimension !== data.dimension) return Path.fromJSON(data);
        if (JSON.stringify(path.toJSON()) !== JSON.stringify(data)) path.setData(data);
        return path;
      });
      this.state.replacePaths(paths);
      this.state.select(selection.pathId, selection.waypointIndex, selection.handle);
      this.current = this.capture();
    } finally {
      this.restoring = false;
    }
  }
  hasUncommittedChanges() {
    return this.pending && this.capture().key !== this.current.key;
  }
  capture() {
    const paths = this.state.paths.map((path) => ({ path, data: path.toJSON() }));
    return { paths, key: JSON.stringify(paths.map((p) => p.data)) };
  }
  emit() {
    this.events.emit("change", { canUndo: this.canUndo, canRedo: this.canRedo });
  }
};

// src/editor/operations.ts
function averageSpacing(path, fallback = 10) {
  const pts = path.waypoints;
  if (pts.length < 2) return fallback;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += distance(pts[i - 1].position, pts[i].position);
  return sum / (pts.length - 1) || fallback;
}
function suggestWaypointPosition(path, afterIndex, fallbackSpacing = 10) {
  const pts = path.waypoints;
  const n = pts.length;
  if (n === 0) return [0, 0, 0];
  const index = afterIndex === null ? n - 1 : Math.min(Math.max(afterIndex, 0), n - 1);
  const isLast = index === n - 1;
  if (!isLast || path.curve.closed && n >= 3) {
    const segments = path.segmentCount;
    if (segments > 0) return path.getPoint((index + 0.5) / segments);
    return lerp(pts[index].position, pts[(index + 1) % n].position, 0.5);
  }
  if (n === 1) return add(pts[0].position, [fallbackSpacing, 0, 0]);
  const dir = normalize(sub(pts[n - 1].position, pts[n - 2].position));
  const spacing = averageSpacing(path, fallbackSpacing);
  return add(pts[n - 1].position, scale(dir[0] || dir[1] || dir[2] ? dir : [1, 0, 0], spacing));
}
function insertWaypointAfter(path, afterIndex, position) {
  const index = afterIndex === null ? path.waypoints.length : Math.min(afterIndex + 1, path.waypoints.length);
  path.addWaypoint(position ?? suggestWaypointPosition(path, afterIndex), index);
  return index;
}
function shiftWaypoint(path, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= path.waypoints.length) return index;
  path.reorderWaypoint(index, target);
  return target;
}
function insertWaypointAtT(path, t) {
  const pts = path.waypoints;
  const n = pts.length;
  const segments = path.segmentCount;
  if (segments === 0) return insertWaypointAfter(path, null);
  const [seg, s] = locateSegment(t, segments);
  const a = pts[seg];
  const b = pts[(seg + 1) % n];
  const position = path.getPoint(t);
  const init = { position };
  for (const key of ["speed", "roll"]) {
    if (a[key] !== void 0 || b[key] !== void 0) {
      const fallback = key === "speed" ? 1 : 0;
      init[key] = (a[key] ?? fallback) + ((b[key] ?? fallback) - (a[key] ?? fallback)) * s;
    }
  }
  if (path.curve.type === "bezier") {
    const ha = path.getBezierHandles(seg);
    const hb = path.getBezierHandles((seg + 1) % n);
    const c0 = a.position;
    const c1 = add(c0, ha.handleOut);
    const c3 = b.position;
    const c2 = add(c3, hb.handleIn);
    const q0 = lerp(c0, c1, s);
    const q1 = lerp(c1, c2, s);
    const q2 = lerp(c2, c3, s);
    const r0 = lerp(q0, q1, s);
    const r1 = lerp(q1, q2, s);
    a.handleIn = ha.handleIn;
    a.handleOut = sub(q0, c0);
    b.handleIn = sub(q2, c3);
    b.handleOut = hb.handleOut;
    init.handleIn = sub(r0, position);
    init.handleOut = sub(r1, position);
  }
  const index = seg + 1;
  path.addWaypoint(init, index);
  return index;
}

// src/editor/shortcuts.ts
function bindShortcuts(target, element = window) {
  const onKeyDown = (event) => {
    const e = event;
    if (e.defaultPrevented || isTyping(e.target)) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.altKey) return;
      if (e.code === "KeyZ") {
        if (e.shiftKey) target.redo();
        else target.undo();
      } else if (e.code === "KeyY" && e.ctrlKey) {
        target.redo();
      } else {
        return;
      }
      e.preventDefault();
      return;
    }
    let handled = true;
    switch (e.code) {
      case "Delete":
      case "Backspace":
        target.deleteSelectedWaypoint();
        break;
      case "Escape":
        target.clearWaypointSelection();
        break;
      case "Insert":
      case "Equal":
      case "NumpadAdd":
        target.addWaypoint();
        break;
      case "BracketLeft":
      case "BracketRight": {
        const delta = e.code === "BracketLeft" ? -1 : 1;
        if (e.altKey) target.shiftSelectedWaypoint(delta);
        else target.selectAdjacentWaypoint(delta);
        break;
      }
      case "KeyG":
        target.toggleView("gizmos");
        break;
      case "KeyR":
        target.toggleGizmoMode();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
  element.addEventListener("keydown", onKeyDown);
  return () => element.removeEventListener("keydown", onKeyDown);
}
function isTyping(target) {
  const el = target;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

// src/editor/devServer.ts
var DEFAULT_ENDPOINT = "/__path-editor/save";
async function saveToDevServer(file, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (!doFetch) throw new Error("saveToDevServer: fetch is not available.");
  const response = await doFetch(options.endpoint ?? DEFAULT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof file === "string" ? file : JSON.stringify(file)
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Saving failed with HTTP ${response.status}.`);
  }
}
var DEFAULT_FLY_KEYS = {
  forward: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  up: ["KeyE", "Space"],
  down: ["KeyQ", "KeyC"],
  lookLeft: ["ArrowLeft"],
  lookRight: ["ArrowRight"],
  lookUp: ["ArrowUp"],
  lookDown: ["ArrowDown"],
  boost: ["ShiftLeft", "ShiftRight"]
};
var PITCH_LIMIT_DEG = 89;
var _forward = new Vector3();
var _right = new Vector3();
var _move = new Vector3();
var _euler = new Euler(0, 0, 0, "YXZ");
var FlyControls = class {
  constructor(camera, options = {}) {
    this.pressed = /* @__PURE__ */ new Set();
    this._enabled = false;
    this.looking = false;
    this.yawDeg = 0;
    this.pitchDeg = 0;
    this.disposed = false;
    this.onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping2(e.target)) return;
      this.pressed.add(e.code);
    };
    this.onKeyUp = (e) => {
      this.pressed.delete(e.code);
    };
    this.onBlur = () => {
      this.pressed.clear();
      this.looking = false;
    };
    this.onPointerDown = (e) => {
      if (e.button === this.lookButton) this.looking = true;
    };
    this.onPointerMove = (e) => {
      if (!this.looking) return;
      this.yawDeg -= e.movementX * this.lookSensitivity;
      this.pitchDeg = MathUtils.clamp(this.pitchDeg - e.movementY * this.lookSensitivity, -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG);
    };
    this.onPointerUp = (e) => {
      if (e.button === this.lookButton) this.looking = false;
    };
    this.onContextMenu = (e) => {
      if (this.lookButton === 2) e.preventDefault();
    };
    this.onWheel = (e) => {
      if (!this.wheelSpeedFactor || e.deltaY === 0) return;
      this.speed *= e.deltaY < 0 ? this.wheelSpeedFactor : 1 / this.wheelSpeedFactor;
    };
    this.camera = camera;
    this.domElement = options.domElement ?? window;
    this.speed = options.speed ?? 10;
    this.boostMultiplier = options.boostMultiplier ?? 4;
    this.lookSensitivity = options.lookSensitivity ?? 0.2;
    this.keyLookSpeed = options.keyLookSpeed ?? 90;
    this.lookButton = options.lookButton ?? 2;
    this.wheelSpeedFactor = options.wheelSpeedFactor ?? 1.2;
    this.keys = { ...DEFAULT_FLY_KEYS, ...options.keys };
    this.enabled = options.enabled ?? true;
  }
  get enabled() {
    return this._enabled;
  }
  /** Enabling re-reads the camera's current orientation, so it never snaps. */
  set enabled(value) {
    if (this.disposed || value === this._enabled) return;
    this._enabled = value;
    if (value) {
      this.syncFromCamera();
      this.attach();
    } else {
      this.detach();
    }
  }
  /** Re-reads yaw/pitch from the camera (call after moving the camera yourself). */
  syncFromCamera() {
    _euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yawDeg = MathUtils.radToDeg(_euler.y);
    this.pitchDeg = MathUtils.clamp(MathUtils.radToDeg(_euler.x), -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG);
  }
  /** Moves and turns the camera. Call once per frame while enabled. */
  update(dt) {
    if (!this._enabled) return;
    const look = this.keyLookSpeed * dt;
    if (this.isDown("lookLeft")) this.yawDeg += look;
    if (this.isDown("lookRight")) this.yawDeg -= look;
    if (this.isDown("lookUp")) this.pitchDeg += look;
    if (this.isDown("lookDown")) this.pitchDeg -= look;
    this.pitchDeg = MathUtils.clamp(this.pitchDeg, -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG);
    _euler.set(MathUtils.degToRad(this.pitchDeg), MathUtils.degToRad(this.yawDeg), 0, "YXZ");
    this.camera.quaternion.setFromEuler(_euler);
    const yaw = MathUtils.degToRad(this.yawDeg);
    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(-_forward.z, 0, _forward.x);
    _move.set(0, 0, 0);
    if (this.isDown("forward")) _move.add(_forward);
    if (this.isDown("back")) _move.sub(_forward);
    if (this.isDown("right")) _move.add(_right);
    if (this.isDown("left")) _move.sub(_right);
    if (this.isDown("up")) _move.y += 1;
    if (this.isDown("down")) _move.y -= 1;
    if (_move.lengthSq() === 0) return;
    const speed = this.speed * (this.isDown("boost") ? this.boostMultiplier : 1);
    this.camera.position.addScaledVector(_move.normalize(), speed * dt);
  }
  dispose() {
    this.enabled = false;
    this.disposed = true;
  }
  isDown(action) {
    return this.keys[action].some((code) => this.pressed.has(code));
  }
  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("contextmenu", this.onContextMenu);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: true });
  }
  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("contextmenu", this.onContextMenu);
    this.domElement.removeEventListener("wheel", this.onWheel);
    this.pressed.clear();
    this.looking = false;
  }
};
function isTyping2(target) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
var _point = [0, 0, 0];
var _from = new Vector3();
var _to = new Vector3();
var CameraRig = class {
  constructor(options, context) {
    this.group = new Group();
    this.builtFor = "";
    this.pathId = options.path;
    this.lookAtPathId = options.lookAt;
    this.id = options.id ?? `${options.path}\u2192${options.lookAt}`;
    this.duration = options.duration ?? 10;
    this.resolve = context.resolve;
    this.coordinates = context.coordinates;
    this.group.name = `PathEditor:rig:${this.id}`;
    this.group.userData.pathEditor = true;
    this.lines = new LineSegments(new BufferGeometry(), context.material);
    this.lines.userData.pathEditor = true;
    this.group.add(this.lines);
  }
  get path() {
    return this.resolve(this.pathId);
  }
  get lookAtPath() {
    return this.resolve(this.lookAtPathId);
  }
  /** True when both paths carry authored times, so the rig runs on them. */
  get timed() {
    return this.path?.timeRange != null && this.lookAtPath?.timeRange != null;
  }
  /** Seconds the flight takes: the authored time span, or `duration`. */
  get flightTime() {
    const authored = this.timed ? this.path.duration : 0;
    return authored > 0 ? authored : this.duration;
  }
  /**
   * Camera position and aim at `u` in [0, 1] of the rig's shared parameter.
   * False when either path is missing or empty.
   */
  sample(u, position, lookAt) {
    const path = this.path;
    const aim = this.lookAtPath;
    if (!path?.waypoints.length || !aim?.waypoints.length) return false;
    const range = this.timed ? path.timeRange : null;
    if (range) {
      const time = range.start + (range.end - range.start) * u;
      position.fromArray(this.coordinates.toWorld(path.getPointAtTime(time, _point), path.dimension));
      lookAt.fromArray(this.coordinates.toWorld(aim.getPointAtTime(time, _point), aim.dimension));
    } else {
      position.fromArray(this.coordinates.toWorld(path.getPointAt(u, _point), path.dimension));
      lookAt.fromArray(this.coordinates.toWorld(aim.getPointAt(u, _point), aim.dimension));
    }
    return true;
  }
  /** Rebuilds the sight lines when either path changed. */
  update(visible) {
    this.group.visible = visible;
    const path = this.path;
    const aim = this.lookAtPath;
    const signature = visible ? `${path?.version ?? -1}:${aim?.version ?? -1}` : "";
    if (signature === this.builtFor) return;
    this.builtFor = signature;
    const positions = [];
    if (visible && path && aim) {
      const count = path.waypoints.length;
      for (let i = 0; i < count; i++) {
        const u = count > 1 ? i / (count - 1) : 0;
        if (!this.sample(u, _from, _to)) break;
        positions.push(_from.x, _from.y, _from.z, _to.x, _to.y, _to.z);
      }
    }
    const geometry = this.lines.geometry;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
  }
  dispose() {
    this.lines.geometry.dispose();
    this.group.removeFromParent();
  }
};
var _hit = new Vector3();
function pathUp(coordinates, dimension, target = new Vector3()) {
  if (dimension === 2) return target.fromArray(coordinates.planeNormal).normalize();
  return target.fromArray(coordinates.directionToWorld([0, 1, 0], 3)).normalize();
}
function isEditorObject(object) {
  for (let o = object; o; o = o.parent) if (o.userData.pathEditor) return true;
  return false;
}
function planePlacement(options = {}) {
  return ({ raycaster, path, reference, planeNormal, planeOrigin }) => {
    const plane = new Plane();
    if (path.dimension === 2) {
      plane.setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);
    } else {
      const normal = new Vector3(...options.normal ?? [0, 1, 0]).normalize();
      if (options.height !== void 0) plane.set(normal, -options.height);
      else plane.setFromNormalAndCoplanarPoint(normal, reference ?? new Vector3());
    }
    return raycaster.ray.intersectPlane(plane, _hit) ? _hit.clone() : null;
  };
}
function objectPlacement(objects, options = {}) {
  const fallback = options.fallback === void 0 ? planePlacement() : options.fallback;
  return (ctx) => {
    const targets = typeof objects === "function" ? objects() : objects;
    const hits = ctx.raycaster.intersectObjects(targets, options.recursive ?? true);
    const hit = hits.find((h) => !isEditorObject(h.object));
    if (hit) {
      const point = hit.point.clone();
      if (options.surfaceOffset && hit.face) {
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        point.addScaledVector(normal, options.surfaceOffset);
      }
      return point;
    }
    return fallback ? fallback(ctx) : null;
  };
}
function surfaceConstraint(objects, options = {}) {
  const up = new Vector3(...options.up ?? [0, 1, 0]).normalize();
  const down = up.clone().negate();
  const castHeight = options.castHeight ?? 1e4;
  const raycaster = new Raycaster();
  return ({ path, position }) => {
    if (options.filter && !options.filter(path)) return null;
    const targets = typeof objects === "function" ? objects() : objects;
    raycaster.set(position.clone().addScaledVector(up, castHeight), down);
    raycaster.far = castHeight * 2;
    const hit = raycaster.intersectObjects(targets, options.recursive ?? true).find((h) => !isEditorObject(h.object));
    if (!hit) return null;
    return hit.point.clone().addScaledVector(up, options.offset ?? 0);
  };
}
var _from2 = new Vector3();
var _sample = new Vector3();
var SurfaceCheck = class {
  constructor(options, context) {
    this.group = new Group();
    this.raycaster = new Raycaster();
    this.builtFor = "";
    this.coordinates = context.coordinates;
    this.options = {
      objects: options.objects,
      tolerance: options.tolerance ?? 0.05,
      castHeight: options.castHeight ?? 1e4,
      samplesPerSegment: options.samplesPerSegment ?? 16
    };
    this.group.name = "PathEditorSurfaceCheck";
    this.group.userData.pathEditor = true;
    this.lines = new LineSegments(new BufferGeometry(), context.material);
    this.lines.userData.pathEditor = true;
    this.group.add(this.lines);
  }
  /** Rebuilds the markers when a path changed, the set changed or it was switched on. */
  update(paths, visible) {
    this.group.visible = visible;
    const signature = visible ? paths.map((path) => `${path.id}:${path.version}`).join("|") : "";
    if (signature === this.builtFor) return;
    this.builtFor = signature;
    const positions = [];
    if (visible) for (const path of paths) this.checkPath(path, positions);
    const geometry = this.lines.geometry;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
  }
  dispose() {
    this.lines.geometry.dispose();
    this.group.removeFromParent();
  }
  /** A vertical tick from the curve up to the surface for every sample below it. */
  checkPath(path, positions) {
    if (path.isMarker || path.waypoints.length < 2) return;
    const { tolerance, castHeight, samplesPerSegment } = this.options;
    const objects = typeof this.options.objects === "function" ? this.options.objects() : this.options.objects;
    if (objects.length === 0) return;
    const up = pathUp(this.coordinates, path.dimension, _from2).clone();
    const down = up.clone().negate();
    const steps = Math.max(1, path.segmentCount) * samplesPerSegment;
    this.raycaster.far = castHeight * 2;
    for (let i = 0; i <= steps; i++) {
      _sample.fromArray(this.coordinates.toWorld(path.getPoint(i / steps), path.dimension));
      this.raycaster.set(_from2.copy(_sample).addScaledVector(up, castHeight), down);
      const hit = this.raycaster.intersectObjects(objects, true).find((candidate) => !isEditorObject(candidate.object));
      if (!hit) continue;
      const depth = hit.point.clone().sub(_sample).dot(up);
      if (depth <= tolerance) continue;
      positions.push(_sample.x, _sample.y, _sample.z, hit.point.x, hit.point.y, hit.point.z);
    }
  }
};

// src/three/PathPreview.ts
var PathPreview = class {
  constructor(object, path, options = {}) {
    this.detached = false;
    this.object = object;
    this.restoreOnDetach = options.restoreOnDetach ?? true;
    this.savedPosition = object.position.clone();
    this.savedQuaternion = object.quaternion.clone();
    this.follower = new PathFollower({
      loop: "loop",
      // Default: traverse the path in ~10 s regardless of world scale.
      speed: path.length > 0 ? path.length / 10 : 1,
      ...options,
      object,
      path
    });
    this.follower.apply();
  }
  get path() {
    return this.follower.path;
  }
  get isPlaying() {
    return this.follower.isPlaying;
  }
  get speed() {
    return this.follower.speed;
  }
  set speed(value) {
    this.follower.speed = value;
  }
  get loop() {
    return this.follower.loop;
  }
  set loop(value) {
    this.follower.loop = value;
  }
  get progress() {
    return this.follower.progress;
  }
  /**
   * Subscribes to the follower's events (progress, waypoint, loop, complete,
   * play, pause, reset). Listeners survive `setPath`; `detach` removes them.
   */
  on(type, listener) {
    return this.follower.on(type, listener);
  }
  play() {
    this.follower.play();
    return this;
  }
  pause() {
    this.follower.pause();
    return this;
  }
  toggle() {
    return this.isPlaying ? this.pause() : this.play();
  }
  reset() {
    this.follower.reset();
    return this;
  }
  setProgress(progress) {
    this.follower.setProgress(progress);
    return this;
  }
  setPath(path) {
    this.follower.setPath(path);
    return this;
  }
  update(dt) {
    if (!this.detached) this.follower.update(dt);
  }
  /**
   * Stops the preview (emitting `pause` if it was playing), removes its
   * listeners and (by default) restores the object's original transform.
   */
  detach() {
    if (this.detached) return;
    this.detached = true;
    this.follower.pause();
    this.follower.dispose();
    if (this.restoreOnDetach) {
      this.object.position.copy(this.savedPosition);
      this.object.quaternion.copy(this.savedQuaternion);
    }
  }
};
var _v = new Vector3();
function worldUnitsPerPixel(camera, position, viewportHeight) {
  const h = Math.max(1, viewportHeight);
  if (camera.isOrthographicCamera) {
    const c2 = camera;
    return (c2.top - c2.bottom) / c2.zoom / h;
  }
  const c = camera;
  const fov = typeof c.fov === "number" ? c.fov : 50;
  const dist = Math.max(1e-6, _v.setFromMatrixPosition(camera.matrixWorld).distanceTo(position));
  return 2 * dist * Math.tan(fov * Math.PI / 360) / (c.zoom || 1) / h;
}
var DEFAULT_PATH_STYLE = {
  lineColor: 4171775,
  selectedLineColor: 16763187,
  pointColor: 16777215,
  startPointColor: 5046152,
  selectedPointColor: 16731501,
  handleColor: 12946687,
  arrowColor: 4171775,
  debugColor: 8947848,
  labelColor: "#ffffff",
  pointSize: 12,
  selectedPointSize: 17,
  handleSize: 9,
  arrowSize: 14,
  bankSize: 34,
  bankColor: 16763187,
  facingSize: 26,
  facingColor: 5046152,
  labelSize: 16,
  lineOpacity: 1,
  depthTest: false,
  renderOrder: 1e3
};
function defaultWaypointLabel({ path, waypoint, index }) {
  let text = index === 0 ? `${path.name ?? path.id} \xB7 0` : String(index);
  if (waypoint.speed !== void 0) text += ` \xD7${+waypoint.speed.toFixed(2)}`;
  if (waypoint.roll) text += ` \u21BB${+waypoint.roll.toFixed(1)}\xB0`;
  if (waypoint.yaw !== void 0) text += ` \u2220${+waypoint.yaw.toFixed(1)}\xB0`;
  if (waypoint.time !== void 0) text += ` @${+waypoint.time.toFixed(2)}`;
  return text;
}
var Z_AXIS = new Vector3(0, 0, 1);
var _bankQ = new Quaternion();
var _v2 = new Vector3();
var _dir = new Vector3();
var _up = new Vector3();
var ThreePathRenderer = class {
  constructor(path, options = {}) {
    this.group = new Group();
    this.selected = false;
    this.selectedWaypoint = null;
    this.selectedHandle = null;
    this.builtVersion = -1;
    this.dirty = true;
    this.sphere = new SphereGeometry(0.5, 16, 12);
    this.cone = new ConeGeometry(0.3, 1, 12).rotateX(Math.PI / 2);
    /** "Wing" bar along local X with a small up tick, for roll indicators. */
    this.wing = new BoxGeometry(1, 0.05, 0.05);
    this.orienter = new Orienter();
    this.yawFrame = null;
    this.pointGroup = new Group();
    this.arrowGroup = new Group();
    this.labelGroup = new Group();
    this.handleGroup = new Group();
    this.debugGroup = new Group();
    this.bankGroup = new Group();
    this.facingGroup = new Group();
    this.labelTextures = /* @__PURE__ */ new Map();
    /** Objects whose scale follows the camera: [object, size in px]. */
    this.scaled = [];
    this.path = path;
    this.coordinates = options.coordinates ?? defaultCoordinateSystem;
    this.style = { ...DEFAULT_PATH_STYLE, ...options.style };
    this.options = {
      showLine: options.showLine ?? true,
      showPoints: options.showPoints ?? true,
      showArrows: options.showArrows ?? true,
      showFacings: options.showFacings ?? true,
      showLabels: options.showLabels ?? false,
      showDebug: options.showDebug ?? false,
      arrowSpacing: options.arrowSpacing ?? "auto",
      samplesPerSegment: options.samplesPerSegment ?? 32,
      labelFormatter: options.labelFormatter ?? defaultWaypointLabel
    };
    const s = this.style;
    const mesh = (color) => new MeshBasicMaterial({ color, depthTest: s.depthTest, depthWrite: false, transparent: true });
    this.materials = {
      point: mesh(s.pointColor),
      start: mesh(s.startPointColor),
      selectedPoint: mesh(s.selectedPointColor),
      handle: mesh(s.handleColor),
      arrow: mesh(s.arrowColor),
      bank: mesh(s.bankColor),
      facing: mesh(s.facingColor)
    };
    this.lineMaterial = new LineBasicMaterial({
      color: s.lineColor,
      transparent: true,
      opacity: s.lineOpacity,
      depthTest: s.depthTest,
      depthWrite: false
    });
    this.auxLineMaterial = new LineBasicMaterial({
      color: s.debugColor,
      transparent: true,
      opacity: 0.7,
      depthTest: s.depthTest,
      depthWrite: false
    });
    this.line = new Line(new BufferGeometry(), this.lineMaterial);
    this.tag(this.line, { kind: "line" });
    this.group.name = `PathEditor:path:${path.id}`;
    this.group.userData.pathEditor = true;
    this.group.add(
      this.debugGroup,
      this.line,
      this.arrowGroup,
      this.bankGroup,
      this.facingGroup,
      this.pointGroup,
      this.handleGroup,
      this.labelGroup
    );
  }
  setOptions(options) {
    for (const [key, value] of Object.entries(options)) {
      if (value === void 0) continue;
      if (key === "coordinates") this.coordinates = value;
      else if (key === "style") Object.assign(this.style, value);
      else this.options[key] = value;
    }
    this.dirty = true;
  }
  setSelection(selected, waypointIndex = null, handle = null) {
    if (this.selected === selected && this.selectedWaypoint === waypointIndex && this.selectedHandle === handle) return;
    this.selected = selected;
    this.selectedWaypoint = waypointIndex;
    this.selectedHandle = handle;
    this.dirty = true;
  }
  /** World position of waypoint `index`. */
  getWaypointWorld(index, target = new Vector3()) {
    const wp = this.path.waypoints[index];
    return wp ? target.fromArray(this.coordinates.toWorld(wp.position, this.path.dimension)) : target.set(0, 0, 0);
  }
  /** World position of a Bezier handle end of waypoint `index`. */
  getHandleWorld(index, handle, target = new Vector3()) {
    const wp = this.path.waypoints[index];
    const h = this.path.getBezierHandles(index);
    if (!wp || !h) return target.set(0, 0, 0);
    const offset = handle === "in" ? h.handleIn : h.handleOut;
    return target.fromArray(this.coordinates.toWorld(add(wp.position, offset), this.path.dimension));
  }
  /** Objects the editor can raycast against. */
  getPickables() {
    return {
      markers: [...this.handleGroup.children, ...this.pointGroup.children].filter((o) => o.userData.kind),
      line: this.line.visible ? this.line : null
    };
  }
  /** Rebuilds if needed and keeps markers at a constant on-screen size. Call every frame. */
  update(camera, viewportHeight = 800) {
    if (this.dirty || this.builtVersion !== this.path.version) this.rebuild();
    if (!camera) return;
    for (const [object, px] of this.scaled) {
      object.getWorldPosition(_v2);
      const s = worldUnitsPerPixel(camera, _v2, viewportHeight) * px;
      if (object instanceof Sprite) {
        const aspect = object.userData.aspect ?? 1;
        object.scale.set(s * aspect, s, 1);
      } else {
        object.scale.setScalar(s);
      }
    }
  }
  dispose() {
    this.group.removeFromParent();
    this.clearGroup(this.debugGroup, true);
    this.clearGroup(this.handleGroup, true);
    this.line.geometry.dispose();
    this.sphere.dispose();
    this.cone.dispose();
    this.wing.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.lineMaterial.dispose();
    this.auxLineMaterial.dispose();
    this.clearGroup(this.labelGroup, false);
    for (const t of this.labelTextures.values()) t.dispose();
    this.labelTextures.clear();
  }
  // ---------------------------------------------------------------- building
  rebuild() {
    const { path, options, style } = this;
    this.dirty = false;
    this.builtVersion = path.version;
    this.scaled = [];
    const toWorld = (p) => this.coordinates.toWorld(p, path.dimension);
    this.lineMaterial.color.set(this.selected ? style.selectedLineColor : style.lineColor);
    this.setLineGeometry(this.line, path.sample(options.samplesPerSegment).map(toWorld));
    this.line.visible = options.showLine && path.waypoints.length > 1;
    this.line.userData.pathId = path.id;
    const markers = this.pointGroup.children;
    while (markers.length > path.waypoints.length) this.pointGroup.remove(markers[markers.length - 1]);
    while (markers.length < path.waypoints.length) {
      const m = new Mesh(this.sphere, this.materials.point);
      this.pointGroup.add(m);
    }
    this.pointGroup.visible = options.showPoints;
    path.waypoints.forEach((wp, i) => {
      const m = markers[i];
      const isSelected = this.selected && this.selectedWaypoint === i;
      m.material = isSelected ? this.materials.selectedPoint : i === 0 ? this.materials.start : this.materials.point;
      m.position.fromArray(toWorld(wp.position));
      this.tag(m, { kind: "waypoint", waypointIndex: i });
      this.scaled.push([m, isSelected ? style.selectedPointSize : style.pointSize]);
    });
    this.buildArrows(toWorld);
    this.buildBank(toWorld);
    this.buildFacings(toWorld);
    this.buildHandles(toWorld);
    this.buildLabels(toWorld);
    this.buildDebug(toWorld);
  }
  buildArrows(toWorld) {
    const { path, options } = this;
    const length2 = path.length;
    let count = 0;
    if (options.showArrows && path.waypoints.length > 1 && length2 > 0) {
      count = options.arrowSpacing === "auto" ? 12 : Math.floor(length2 / Math.max(options.arrowSpacing, 1e-6));
      count = Math.min(Math.max(count, 1), 200);
    }
    const arrows = this.arrowGroup.children;
    while (arrows.length > count) this.arrowGroup.remove(arrows[arrows.length - 1]);
    while (arrows.length < count) this.arrowGroup.add(this.tag(new Mesh(this.cone, this.materials.arrow), {}));
    for (let i = 0; i < count; i++) {
      const d = (i + 0.5) / count * length2;
      const a = arrows[i];
      a.position.fromArray(toWorld(path.getPointAtDistance(d)));
      _dir.fromArray(this.coordinates.directionToWorld(path.getTangentAtDistance(d), path.dimension)).normalize();
      a.quaternion.setFromUnitVectors(Z_AXIS, _dir);
      this.scaled.push([a, this.style.arrowSize]);
    }
  }
  /** Wing bars showing the bank angle at waypoints with a roll (and the selected one). */
  buildBank(toWorld) {
    const { path } = this;
    this.bankGroup.clear();
    if (!this.options.showPoints || path.waypoints.length < 2) return;
    const distances = path.getWaypointDistances();
    path.waypoints.forEach((wp, i) => {
      const selected = this.selected && this.selectedWaypoint === i;
      if (!selected && !wp.roll) return;
      _dir.fromArray(this.coordinates.directionToWorld(path.getTangentAtDistance(distances[i]), path.dimension));
      if (!this.orienter.compute(_dir, _bankQ, (wp.roll ?? 0) * Math.PI / 180)) return;
      const bar = this.tag(new Mesh(this.wing, this.materials.bank), {});
      bar.position.fromArray(toWorld(wp.position));
      bar.quaternion.copy(_bankQ);
      this.bankGroup.add(bar);
      this.scaled.push([bar, this.style.bankSize]);
    });
  }
  /** Arrows showing the authored facing (`yaw`) of waypoints that carry one. */
  buildFacings(toWorld) {
    const { path } = this;
    this.facingGroup.clear();
    if (!this.options.showFacings || !this.options.showPoints) return;
    for (const [i, wp] of path.waypoints.entries()) {
      if (wp.yaw === void 0) continue;
      if (!this.yawOrienter().yawTo(wp.yaw * Math.PI / 180, _bankQ)) continue;
      const arrow = this.tag(new Mesh(this.cone, this.materials.facing), { kind: "waypoint", waypointIndex: i });
      arrow.position.fromArray(toWorld(wp.position));
      arrow.quaternion.copy(_bankQ);
      this.facingGroup.add(arrow);
      this.scaled.push([arrow, this.style.facingSize]);
    }
  }
  /** Yaw is measured around the path's up axis, which the 2D plane can change. */
  yawOrienter() {
    const up = pathUp(this.coordinates, this.path.dimension, _up);
    if (!this.yawFrame || !this.yawFrame.up.equals(up)) {
      this.yawFrame = { up: up.clone(), orienter: new Orienter({ worldUp: up.toArray(), yawOnly: true }) };
    }
    return this.yawFrame.orienter;
  }
  buildHandles(toWorld) {
    this.clearGroup(this.handleGroup, true);
    const i = this.selectedWaypoint;
    if (!this.selected || i === null || this.path.curve.type !== "bezier" || !this.options.showPoints) return;
    const wp = this.path.waypoints[i];
    const handles = this.path.getBezierHandles(i);
    if (!wp || !handles) return;
    const center = toWorld(wp.position);
    for (const kind of ["in", "out"]) {
      const end = toWorld(add(wp.position, kind === "in" ? handles.handleIn : handles.handleOut));
      const line = new Line(new BufferGeometry(), this.auxLineMaterial);
      this.setLineGeometry(line, [center, end]);
      this.handleGroup.add(this.tag(line, {}));
      const marker = new Mesh(this.sphere, this.selectedHandle === kind ? this.materials.selectedPoint : this.materials.handle);
      marker.position.fromArray(end);
      this.handleGroup.add(this.tag(marker, { kind: "handle", waypointIndex: i, handle: kind }));
      this.scaled.push([marker, this.style.handleSize]);
    }
  }
  buildLabels(toWorld) {
    this.clearGroup(this.labelGroup, false);
    if (!this.options.showLabels || typeof document === "undefined") return;
    const { path, style } = this;
    path.waypoints.forEach((wp, i) => {
      const text = this.options.labelFormatter({ path, waypoint: wp, index: i });
      if (!text) return;
      const sprite = this.createLabel(text);
      sprite.position.fromArray(toWorld(wp.position));
      sprite.center.set(-0.15, -0.3);
      this.labelGroup.add(sprite);
      this.scaled.push([sprite, style.labelSize]);
    });
  }
  buildDebug(toWorld) {
    this.clearGroup(this.debugGroup, true);
    if (!this.options.showDebug || this.path.waypoints.length < 2) return;
    const pts = this.path.waypoints.map((w) => toWorld(w.position));
    if (this.path.curve.closed) pts.push(pts[0]);
    const polygon = new Line(new BufferGeometry(), this.auxLineMaterial);
    this.setLineGeometry(polygon, pts);
    this.debugGroup.add(this.tag(polygon, {}));
  }
  createLabel(text) {
    let texture = this.labelTextures.get(text);
    if (!texture) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const font = "bold 32px system-ui, sans-serif";
      if (ctx) ctx.font = font;
      const width = Math.ceil((ctx?.measureText(text).width ?? text.length * 18) + 16);
      canvas.width = width;
      canvas.height = 44;
      if (ctx) {
        ctx.font = font;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = this.style.labelColor;
        ctx.textBaseline = "middle";
        ctx.fillText(text, 8, canvas.height / 2);
      }
      texture = new CanvasTexture(canvas);
      texture.userData.aspect = canvas.width / canvas.height;
      this.labelTextures.set(text, texture);
    }
    const sprite = this.tag(
      new Sprite(new SpriteMaterial({ map: texture, depthTest: this.style.depthTest, depthWrite: false, transparent: true })),
      {}
    );
    sprite.userData.aspect = texture.userData.aspect;
    return sprite;
  }
  setLineGeometry(line, points) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
    line.geometry.dispose();
    line.geometry = geometry;
  }
  /** Marks an object as editor-owned, overlay-rendered and (optionally) pickable. */
  tag(object, pick) {
    object.renderOrder = this.style.renderOrder;
    object.userData = { pathEditor: true, pathId: this.path.id, ...pick };
    return object;
  }
  /** Removes children; disposes their geometry (and sprite materials) when they are not shared. */
  clearGroup(group, disposeGeometry) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (disposeGeometry && child instanceof Line) child.geometry.dispose();
      if (child instanceof Sprite) child.material.dispose();
    }
  }
};

// src/three/PathEditor.ts
var DEFAULT_SESSION_KEY = "three-path-editor:session";
var MARKER_DENIED = /* @__PURE__ */ new Set(["addWaypoint", "editCurve"]);
var CLICK_TOLERANCE_PX = 5;
var EDITOR_UI_ATTRIBUTE = "data-path-editor-ui";
var EDITOR_VIEWPORT_ATTRIBUTE = "data-path-editor-viewport";
var ISOLATED_CLASS = "path-editor-isolated-ui";
var ISOLATION_STYLE_ID = "three-path-editor-isolation-style";
var ISOLATION_CSS = `
html.${ISOLATED_CLASS} body * { visibility: hidden !important; pointer-events: none !important; }
html.${ISOLATED_CLASS} [${EDITOR_VIEWPORT_ATTRIBUTE}],
html.${ISOLATED_CLASS} [${EDITOR_UI_ATTRIBUTE}],
html.${ISOLATED_CLASS} [${EDITOR_UI_ATTRIBUTE}] * { visibility: visible !important; pointer-events: auto !important; }
`;
function injectIsolationStyle() {
  if (document.getElementById(ISOLATION_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ISOLATION_STYLE_ID;
  style.textContent = ISOLATION_CSS;
  document.head.appendChild(style);
}
function roundAngle(degrees) {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Number(wrapped.toFixed(1));
}
var _v3 = new Vector3();
var _target = new Vector3();
var _camera = new Vector3();
var _forward2 = new Vector3();
var _matrix = new Matrix4();
var _hits = [];
var _ndc = new Vector2();
var PathEditor = class {
  constructor(options) {
    this.root = new Group();
    this.events = new Emitter();
    this.renderers = /* @__PURE__ */ new Map();
    this.raycaster = new Raycaster();
    this.helpers = new Group();
    this.rigGroup = new Group();
    this.rigList = [];
    this.rigMaterial = null;
    this.surfaceMaterial = null;
    this.flight = null;
    this.gizmoProxy = new Object3D();
    this._gizmoMode = "translate";
    this.yawOrienters = /* @__PURE__ */ new Map();
    this.blockedInputWarned = false;
    this.detachedCamera = null;
    this.savedCameraPose = null;
    this.transformControls = null;
    this._enabled = false;
    this.dragging = false;
    this.cameraSuspensions = 0;
    this.cameraControlsWereEnabled = true;
    this.releaseDragCamera = null;
    this.pointerDown = null;
    this.unbindShortcuts = null;
    this._preview = null;
    this.ownedPreviewObject = null;
    /** Unknown top-level keys of the last imported file, preserved on export. */
    this.fileExtras = {};
    this.disposed = false;
    // ---------------------------------------------------------------- internal
    /**
     * Registered on `window` in the capture phase, so it runs before the
     * listeners TransformControls and the camera controls put on the canvas.
     * Pressing a marker that is not the current gizmo target selects it
     * immediately and stops the event — otherwise gizmo arrows that overlap
     * nearby markers (e.g. Bezier handles) would steal the click.
     */
    this.onPointerDown = (e) => {
      if (e.button !== 0 || !this.isInViewport(e.target)) return;
      if (this.claimPointer?.(e)) {
        this.pointerDown = null;
        return;
      }
      const tc = this.transformControls;
      if (!e.shiftKey && !this.dragging && !this.otherGizmoEngaged) {
        const hit = this.pick(e.clientX, e.clientY, { markersOnly: true });
        const sel = this.selection;
        const isGizmoTarget = hit !== null && hit.path.id === sel.pathId && hit.waypointIndex === sel.waypointIndex && hit.handle === sel.handle;
        if (hit && !isGizmoTarget) {
          e.stopImmediatePropagation();
          this.pointerDown = null;
          this.state.select(hit.path.id, hit.waypointIndex, hit.handle);
          return;
        }
      }
      this.pointerDown = {
        x: e.clientX,
        y: e.clientY,
        gizmo: this.dragging || (tc?.axis ?? null) !== null || this.otherGizmoEngaged
      };
    };
    this.onPointerUp = (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || e.button !== 0 || down.gizmo) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (e.shiftKey) {
        if (hit?.kind === "line" && hit.t !== null) this.insertWaypointAt(hit.path.id, hit.t);
        else if (hit) this.state.select(hit.path.id, hit.waypointIndex, hit.handle);
        else this.addWaypointAtScreen(e.clientX, e.clientY);
        return;
      }
      if (!hit) this.clearWaypointSelection();
      else if (hit.kind === "line") this.state.select(hit.path.id);
      else this.state.select(hit.path.id, hit.waypointIndex, hit.handle);
    };
    /** Detects overlays that swallow presses meant for `domElement` (see `diagnostics`). */
    this.onWindowPointerDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element) || this.domElement.contains(target)) return;
      if (target.closest(`[${EDITOR_UI_ATTRIBUTE}]`)) return;
      const rect = this.domElement.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside || rect.width === 0 || rect.height === 0) return;
      this.events.emit("inputblocked", { target, event: e });
      if (!this.diagnostics || this.blockedInputWarned) return;
      this.blockedInputWarned = true;
      console.warn(
        `three-path-editor: a click inside the editor area went to ${describeElement(target)} instead of ${describeElement(this.domElement)}, so the editor never saw it. Something covers the canvas. Give the covering element \`pointer-events: none\` while editing, or pass an element that does receive the input (and covers the canvas exactly) as the \`domElement\` option. Add the \`${EDITOR_UI_ATTRIBUTE}\` attribute to your own dev UI to exclude it from this check.`
      );
    };
    /** Double-click on a curve inserts a waypoint there. */
    this.onDoubleClick = (e) => {
      if (this.dragging) return;
      this.insertWaypointAtScreen(e.clientX, e.clientY);
    };
    /**
     * Keeps the orbit pivot on the surface under the pointer, at the same depth
     * along the view axis, so the view never jumps while zoom and pan keep
     * usable steps. Runs before the camera controls handle the same event.
     */
    this.movePivot = (e) => {
      const controls = this.cameraControls;
      const pivot = this.pivot;
      if (!pivot || !controls?.target || controls.enabled === false || !this.isInViewport(e.target)) return;
      this.camera.updateMatrixWorld();
      this.camera.getWorldPosition(_camera);
      this.camera.getWorldDirection(_forward2);
      this.setRayFromScreen(e.clientX, e.clientY);
      const targets = typeof pivot.objects === "function" ? pivot.objects() : pivot.objects ?? this.scene.children;
      _hits.length = 0;
      this.raycaster.intersectObjects(targets, true, _hits);
      const hit = _hits.find((candidate) => !isEditorObject(candidate.object));
      _hits.length = 0;
      const depth = hit ? _v3.subVectors(hit.point, _camera).dot(_forward2) : _camera.distanceTo(controls.target);
      controls.target.copy(_camera).addScaledVector(_forward2, Math.max(depth, pivot.minDistance ?? 1));
    };
    const domElement = options.domElement ?? options.renderer?.domElement;
    if (!domElement) throw new Error("PathEditor: pass `renderer` or `domElement`.");
    this.scene = options.scene;
    this.camera = options.camera;
    this.domElement = domElement;
    this.coordinates = isCoordinateSystem(options.coordinates) ? options.coordinates : createCoordinateSystem(options.coordinates);
    this.cameraControls = options.cameraControls ?? null;
    this.otherControls = options.otherControls ?? [];
    this.claimPointer = options.claimPointer ?? null;
    this.placement = options.placement ?? planePlacement();
    this.constrainWaypoint = options.constrainWaypoint ?? null;
    this.keyboardShortcuts = options.keyboardShortcuts ?? true;
    this._gizmoMode = options.gizmoMode ?? "translate";
    this.mirrorBezierHandles = options.mirrorBezierHandles ?? true;
    this.diagnostics = options.diagnostics ?? true;
    this.detachCamera = options.detachCamera ?? false;
    this.restoreCameraOnDisable = (options.restoreCameraOnDisable ?? false) || this.detachCamera;
    this.isolateUi = options.isolateUi ?? false;
    this.pivot = options.pivotUnderPointer ? typeof options.pivotUnderPointer === "object" ? options.pivotUnderPointer : {} : null;
    this.canEditOption = options.canEdit;
    this.renderOptions = options.render ?? {};
    this.state = new EditorState(options.view);
    this.history = new EditorHistory(this.state, { limit: options.historyLimit });
    this.history.events.on("change", (e) => this.events.emit("history", e));
    this.root.name = "PathEditorRoot";
    this.root.userData.pathEditor = true;
    this.gizmoProxy.name = "PathEditorGizmoTarget";
    this.rigGroup.name = "PathEditorRigs";
    this.rigGroup.userData.pathEditor = true;
    this.buildHelpers(options.grid ?? {});
    this.root.add(this.helpers, this.gizmoProxy, this.rigGroup);
    for (const rig of options.rigs ?? []) this.addRig(rig);
    this.surfaceCheck = options.surface ? this.buildSurfaceCheck(options.surface) : null;
    if (this.surfaceCheck) this.root.add(this.surfaceCheck.group);
    this.state.events.on("paths", () => this.syncRenderers());
    this.state.events.on("pathchange", (path) => this.events.emit("change", { path }));
    this.state.events.on("selection", (selection) => {
      this.syncSelection();
      this.events.emit("select", { ...selection });
    });
    this.state.events.on("view", (view) => {
      this.applyView();
      this.events.emit("view", view);
    });
    this.applyView();
    if (options.enabled) this.enable();
  }
  // ------------------------------------------------------------------ status
  get enabled() {
    return this._enabled;
  }
  get paths() {
    return this.state.paths;
  }
  get selection() {
    return this.state.selection;
  }
  get selectedPath() {
    return this.state.selectedPath;
  }
  get preview() {
    return this._preview;
  }
  get view() {
    return this.state.view;
  }
  /** See `PathEditorOptions.gizmoMode`. */
  get gizmoMode() {
    return this._gizmoMode;
  }
  /**
   * Switches the gizmo between moving the selected waypoint and turning it
   * (authoring its `yaw`). Rotating needs the `editWaypointProperties`
   * permission, the same as speed and roll.
   */
  setGizmoMode(mode) {
    if (mode === this._gizmoMode) return this;
    this._gizmoMode = mode;
    this.transformControls?.setMode(mode);
    this.syncSelection();
    this.events.emit("gizmomode", mode);
    return this;
  }
  toggleGizmoMode() {
    return this.setGizmoMode(this._gizmoMode === "translate" ? "rotate" : "translate");
  }
  on(type, listener) {
    return this.events.on(type, listener);
  }
  getPath(id) {
    return this.state.getPath(id);
  }
  getRenderer(path) {
    return this.renderers.get(path);
  }
  /**
   * Whether `action` is allowed on `path`: a marker never grows points or
   * curve settings, and beyond that whatever `canEdit` says (everything, when
   * no `canEdit` was given).
   */
  can(action, path, waypointIndex = null) {
    if (path.isMarker && MARKER_DENIED.has(action)) return false;
    return this.canEditOption?.(action, { path, waypointIndex }) ?? true;
  }
  /** `can()` that also emits `denied` when refused. */
  allow(action, path, waypointIndex = null) {
    if (this.can(action, path, waypointIndex)) return true;
    this.events.emit("denied", { action, path, waypointIndex });
    return false;
  }
  // --------------------------------------------------------------- lifecycle
  /** Attaches the editor root to the scene and starts listening for input. */
  enable() {
    this.assertNotDisposed();
    if (this._enabled) return this;
    this._enabled = true;
    if (this.restoreCameraOnDisable) {
      this.savedCameraPose = {
        camera: this.camera,
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone()
      };
    }
    if (this.detachCamera) this.takeCameraOutOfRig();
    this.scene.add(this.root);
    const tc = this.ensureTransformControls();
    tc.enabled = true;
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.onPointerDown, { capture: true });
      window.addEventListener("pointerdown", this.onWindowPointerDown, { capture: true });
      if (this.pivot) {
        window.addEventListener("pointerdown", this.movePivot, { capture: true });
        window.addEventListener("wheel", this.movePivot, { capture: true, passive: true });
      }
    }
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("dblclick", this.onDoubleClick);
    this.domElement.setAttribute(EDITOR_VIEWPORT_ATTRIBUTE, "");
    if (this.isolateUi) this.setUiIsolated(true);
    if (this.keyboardShortcuts && typeof window !== "undefined") this.unbindShortcuts = bindShortcuts(this);
    this.syncSelection();
    this.events.emit("enabled", true);
    return this;
  }
  /** Detaches everything from the scene and stops listening. Paths are kept. */
  disable() {
    if (!this._enabled) return this;
    this._enabled = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.onPointerDown, { capture: true });
      window.removeEventListener("pointerdown", this.onWindowPointerDown, { capture: true });
      window.removeEventListener("pointerdown", this.movePivot, { capture: true });
      window.removeEventListener("wheel", this.movePivot, { capture: true });
    }
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("dblclick", this.onDoubleClick);
    this.domElement.removeAttribute(EDITOR_VIEWPORT_ATTRIBUTE);
    if (this.isolateUi) this.setUiIsolated(false);
    this.unbindShortcuts?.();
    this.unbindShortcuts = null;
    if (this.transformControls) {
      this.stopGizmoDrag();
      this.transformControls.detach();
      this.transformControls.enabled = false;
    }
    this.endDrag();
    this.root.removeFromParent();
    if (this.detachedCamera) this.putCameraBackInRig();
    if (this.savedCameraPose) {
      const { camera, position, quaternion } = this.savedCameraPose;
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      camera.updateMatrixWorld();
      this.savedCameraPose = null;
    }
    this.events.emit("enabled", false);
    return this;
  }
  toggle() {
    return this._enabled ? this.disable() : this.enable();
  }
  /**
   * Switches the host's camera controls off until the returned function is
   * called. Suspensions are counted, so the editor's gizmo and a host gizmo
   * can hold one at the same time without either restoring the other's state
   * — what the controls had before the first suspension is what comes back
   * after the last release. Releasing twice does nothing.
   */
  suspendCameraControls() {
    const controls = this.cameraControls;
    if (this.cameraSuspensions++ === 0 && controls) {
      this.cameraControlsWereEnabled = controls.enabled;
      controls.enabled = false;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.cameraSuspensions > 0) return;
      const current = this.cameraControls;
      if (current) current.enabled = this.cameraControlsWereEnabled;
    };
  }
  /**
   * True while a gizmo owns the pointer: the editor's own is dragging or has an
   * axis under the pointer, or one of `otherControls` has. Host code can ask
   * this before treating a press as its own.
   */
  get gizmoEngaged() {
    return this.dragging || (this.transformControls?.axis ?? null) !== null || this.otherGizmoEngaged;
  }
  /**
   * The editor's own transform gizmo, as much of it as a host needs to see who
   * owns a press. Null until the first `enable()`.
   */
  get gizmo() {
    return this.transformControls;
  }
  /** Disables the editor and releases every GPU resource and listener it created. */
  dispose() {
    if (this.disposed) return;
    this.disable();
    this.detachPreview();
    for (const rig of this.rigList.splice(0)) rig.dispose();
    this.rigMaterial?.dispose();
    this.rigMaterial = null;
    this.surfaceCheck?.dispose();
    this.surfaceMaterial?.dispose();
    this.surfaceMaterial = null;
    this.history.dispose();
    for (const renderer of this.renderers.values()) renderer.dispose();
    this.renderers.clear();
    this.state.clear();
    const tc = this.transformControls;
    if (tc) {
      (tc.getHelper?.() ?? tc).removeFromParent();
      tc.dispose();
    }
    this.helpers.traverse((o) => {
      const helper = o;
      helper.geometry?.dispose();
      helper.dispose?.();
    });
    this.events.clear();
    this.disposed = true;
  }
  /** Call once per frame from the host application's loop. */
  update(dt = 0) {
    if (!this._enabled) return;
    const height = this.domElement.clientHeight || 800;
    for (const renderer of this.renderers.values()) renderer.update(this.camera, height);
    if (!this.dragging) this.syncGizmoPosition();
    this._preview?.update(dt);
    for (const rig of this.rigList) rig.update(this.state.view.sightlines);
    this.surfaceCheck?.update(this.state.paths, this.state.view.surface);
    this.advanceFlight(dt);
  }
  /** Switch to a different camera (e.g. when the game changes cameras). */
  setCamera(camera) {
    this.camera = camera;
    if (this.transformControls) this.transformControls.camera = camera;
  }
  // -------------------------------------------------------------- camera rigs
  /** Pairs a camera path with the path it looks at. See `CameraRig`. */
  addRig(options) {
    if (!this.rigMaterial) {
      this.rigMaterial = new LineBasicMaterial({
        color: 9167103,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
        depthWrite: false
      });
    }
    const rig = new CameraRig(options, {
      resolve: (id) => this.getPath(id),
      coordinates: this.coordinates,
      material: this.rigMaterial
    });
    this.rigList.push(rig);
    this.rigGroup.add(rig.group);
    return rig;
  }
  removeRig(rig) {
    const found = typeof rig === "string" ? this.rigList.find((r) => r.id === rig) : rig;
    if (!found) return;
    if (this.flight?.rig === found) this.stopRig();
    this.rigList.splice(this.rigList.indexOf(found), 1);
    found.dispose();
  }
  get rigs() {
    return this.rigList;
  }
  /** The surface-sag check, when a `surface` was given. See `SurfaceCheck`. */
  get surfaceWarnings() {
    return this.surfaceCheck;
  }
  getRig(id) {
    return this.rigList.find((rig) => rig.id === id);
  }
  /** The rig the editor's camera is currently flying, if any. */
  get flyingRig() {
    return this.flight?.rig ?? null;
  }
  /**
   * Flies the editor's camera along a rig, looking at the matching point of
   * its target path, so the framing can be judged without restarting the game.
   * The camera pose is restored when the flight ends or is stopped, and the
   * host's camera controls are suspended while it runs.
   */
  playRig(rig) {
    const found = typeof rig === "string" ? this.getRig(rig) : rig;
    if (!found || !found.sample(0, _v3, _target)) return false;
    this.stopRig();
    this.flight = {
      rig: found,
      elapsed: 0,
      release: this.suspendCameraControls(),
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone()
    };
    this.applyFlight(0);
    this.events.emit("rigstate", { rig: found, playing: true });
    return true;
  }
  /** Stops a rig flight and puts the camera back where it was. */
  stopRig() {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    flight.release();
    this.camera.position.copy(flight.position);
    this.camera.quaternion.copy(flight.quaternion);
    this.camera.updateMatrixWorld();
    this.events.emit("rigstate", { rig: flight.rig, playing: false });
  }
  buildSurfaceCheck(surface) {
    const options = Array.isArray(surface) || typeof surface === "function" ? { objects: surface } : surface;
    this.surfaceMaterial = new LineBasicMaterial({
      color: 16731501,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    return new SurfaceCheck(options, { coordinates: this.coordinates, material: this.surfaceMaterial });
  }
  advanceFlight(dt) {
    const flight = this.flight;
    if (!flight) return;
    flight.elapsed += dt;
    const time = flight.rig.flightTime;
    const u = time > 0 ? flight.elapsed / time : 1;
    this.applyFlight(Math.min(u, 1));
    if (u >= 1) this.stopRig();
  }
  applyFlight(u) {
    const flight = this.flight;
    if (!flight.rig.sample(u, _v3, _target)) return;
    this.camera.position.copy(_v3);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_target);
    this.camera.updateMatrixWorld();
  }
  // ------------------------------------------------------------------- paths
  /** Creates a path, adds it to the editor and (by default) selects it. */
  createPath(options = {}) {
    const { select = true, ...pathOptions } = options;
    const path = new Path(pathOptions);
    this.loadPath(path);
    if (select) this.state.select(path.id);
    return path;
  }
  /**
   * Creates a path with a few waypoints in front of the camera — handy for
   * "New path" buttons when you don't know the world scale.
   */
  createPathInView(options = {}) {
    const dimension = options.dimension ?? 3;
    const center = this.getViewCenter(dimension);
    const camPos = _v3.setFromMatrixPosition(this.camera.matrixWorld).clone();
    const spacing = Math.max(camPos.distanceTo(center) * 0.15, 1e-3);
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const normal = dimension === 2 ? new Vector3(...this.coordinates.planeNormal) : new Vector3(0, 1, 0);
    right.addScaledVector(normal, -right.dot(normal));
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const count = Math.max(2, options.pointCount ?? 3);
    const points = Array.from({ length: count }, (_, i) => {
      const world = center.clone().addScaledVector(right, (i - (count - 1) / 2) * spacing);
      return this.coordinates.toPath(world.toArray(), dimension);
    });
    return this.createPath({ ...options, dimension, points: options.points ?? points });
  }
  /**
   * Creates a marker: one named place, no curve — a spawn point, a prop, a
   * light. It is a `Path` with `kind: 'marker'`, so it is selected, moved,
   * turned, undone and saved exactly like a path, and lives in the same file.
   * Without a position it lands in the middle of the view.
   */
  createMarker(options = {}) {
    const dimension = options.dimension ?? 3;
    const position = options.position ?? this.coordinates.toPath(this.getViewCenter(dimension).toArray(), dimension);
    const marker = this.createPath({
      ...options,
      kind: "marker",
      dimension,
      points: [{ position, yaw: options.yaw }]
    });
    return marker;
  }
  /** Markers only (`kind: 'marker'`). `paths` holds both. */
  get markers() {
    return this.state.paths.filter((path) => path.isMarker);
  }
  /** Routes only, i.e. everything that is not a marker. `paths` holds both. */
  get routes() {
    return this.state.paths.filter((path) => !path.isMarker);
  }
  /** Adds a Path (or PathData) to the editor, replacing a path with the same id. */
  loadPath(path) {
    const instance = path instanceof Path ? path : Path.fromJSON(path);
    this.state.addPath(instance);
    return instance;
  }
  removePath(id) {
    const path = this.getPath(id);
    if (!path || !this.allow("deletePath", path)) return void 0;
    return this.state.removePath(id);
  }
  /** Deletes the selected path entirely. Returns the removed path. */
  deleteSelectedPath() {
    const path = this.selectedPath;
    return path ? this.removePath(path.id) : void 0;
  }
  renamePath(oldId, newId) {
    const path = this.getPath(oldId);
    if (!path || !this.allow("renamePath", path)) return false;
    return this.state.renamePath(oldId, newId);
  }
  /**
   * Loads a path file (object or JSON string). Replaces all paths unless
   * `merge` is true. Unknown fields and metadata are preserved.
   */
  import(data, options = {}) {
    const file = readPathFile(data);
    if (!options.merge) {
      this.detachPreview();
      this.state.clear();
    }
    this.fileExtras = { ...options.merge ? this.fileExtras : {}, ...file.extras };
    for (const path of file.paths) this.state.addPath(path);
    if (file.paths[0]) this.state.select(file.paths[0].id);
    if (options.clearHistory ?? !options.merge) this.history.clear();
    else this.history.flush();
    this.events.emit("import", { paths: file.paths });
    return file.paths;
  }
  /** Exports all paths in the versioned JSON format. */
  export() {
    return serializePaths(this.state.paths, this.fileExtras);
  }
  exportString(indent = 2) {
    return stringifyPaths(this.state.paths, indent, this.fileExtras);
  }
  // --------------------------------------------------------------- selection
  select(pathId, waypointIndex = null, handle = null) {
    this.state.select(pathId, waypointIndex, handle);
  }
  clearSelection() {
    this.state.select(null);
  }
  /** Deselects the waypoint but keeps the path selected. */
  clearWaypointSelection() {
    this.state.select(this.state.selection.pathId);
  }
  selectAdjacentWaypoint(delta) {
    const path = this.selectedPath;
    if (!path || path.waypoints.length === 0) return;
    const n = path.waypoints.length;
    const current = this.selection.waypointIndex;
    const next = current === null ? delta > 0 ? 0 : n - 1 : (current + delta + n) % n;
    this.state.select(path.id, next);
  }
  // ---------------------------------------------------------------- editing
  /**
   * Adds a waypoint. Defaults: selected path, after the selected waypoint (or
   * at the end), position suggested from neighbours. Returns the new index.
   */
  addWaypoint(options = {}) {
    const path = options.pathId ? this.getPath(options.pathId) : this.selectedPath;
    if (!path || !this.allow("addWaypoint", path)) return null;
    let index;
    if (options.index !== void 0) {
      index = Math.min(Math.max(options.index, 0), path.waypoints.length);
      path.addWaypoint(options.position ?? insertPositionAt(path, index), index);
    } else {
      const after = this.selection.pathId === path.id ? this.selection.waypointIndex : null;
      index = insertWaypointAfter(path, after, options.position);
    }
    this.applyConstraint(path, index);
    if (options.select ?? true) this.state.select(path.id, index);
    return index;
  }
  /** Adds a waypoint where the pointer ray hits the placement surface. */
  addWaypointAtScreen(clientX, clientY) {
    const path = this.selectedPath;
    if (!path || !this.allow("addWaypoint", path)) return null;
    this.setRayFromScreen(clientX, clientY);
    const refIndex = this.selection.waypointIndex ?? path.waypoints.length - 1;
    const renderer = this.renderers.get(path);
    const reference = refIndex >= 0 && renderer ? renderer.getWaypointWorld(refIndex) : null;
    const world = this.placement({
      raycaster: this.raycaster,
      path,
      reference,
      planeNormal: new Vector3(...this.coordinates.planeNormal),
      planeOrigin: new Vector3(...this.coordinates.toWorld([0, 0, 0], 2))
    });
    if (!world) return null;
    return this.addWaypoint({ position: this.coordinates.toPath(world.toArray(), path.dimension) });
  }
  /**
   * Inserts a waypoint on the curve of `pathId` at parameter t (keeps the
   * curve shape; exact for Bezier). Returns the new index.
   */
  insertWaypointAt(pathId, t, options = {}) {
    const path = this.getPath(pathId);
    if (!path || !this.allow("addWaypoint", path)) return null;
    const index = insertWaypointAtT(path, t);
    this.applyConstraint(path, index);
    if (options.select ?? true) this.state.select(path.id, index);
    return index;
  }
  /** Inserts a waypoint where the screen position hits a path line. Returns the index or null. */
  insertWaypointAtScreen(clientX, clientY) {
    const hit = this.pick(clientX, clientY);
    if (!hit || hit.kind !== "line" || hit.t === null) return null;
    return this.insertWaypointAt(hit.path.id, hit.t);
  }
  deleteSelectedWaypoint() {
    const { pathId, waypointIndex } = this.selection;
    if (pathId === null || waypointIndex === null) return;
    this.removeWaypoint(pathId, waypointIndex);
  }
  removeWaypoint(pathId, index) {
    const path = this.getPath(pathId);
    if (!path || !path.waypoints[index] || !this.allow("deleteWaypoint", path, index)) return;
    const waypoint = path.removeWaypoint(index);
    const n = path.waypoints.length;
    this.state.select(path.id, n === 0 ? null : Math.min(index, n - 1));
    this.events.emit("waypointremoved", { path, index, waypoint });
  }
  /** Moves a waypoint to a new position (path space). */
  moveWaypoint(pathId, index, position) {
    const path = this.getPath(pathId);
    if (!path || !path.waypoints[index] || !this.allow("moveWaypoint", path, index)) return;
    path.moveWaypoint(index, this.constrained(path, index, position));
  }
  /**
   * Runs `constrainWaypoint` over every waypoint of `pathId` (default: all
   * paths), e.g. right after `import()` to snap existing routes onto the
   * terrain. Undoes as one step, like any other synchronous change.
   */
  applyConstraints(pathId) {
    if (!this.constrainWaypoint) return;
    const paths = pathId ? [this.getPath(pathId)].filter((p) => !!p) : this.paths;
    for (const path of paths) path.waypoints.forEach((_, i) => this.applyConstraint(path, i));
  }
  reorderWaypoint(pathId, from, to) {
    const path = this.getPath(pathId);
    if (!path || !this.allow("reorderWaypoint", path, from)) return;
    path.reorderWaypoint(from, to);
    if (this.selection.pathId === pathId && this.selection.waypointIndex === from) {
      this.state.select(pathId, Math.min(Math.max(to, 0), path.waypoints.length - 1));
    }
  }
  /** Moves the selected waypoint one step earlier (-1) or later (+1). */
  shiftSelectedWaypoint(delta) {
    const path = this.selectedPath;
    const index = this.selection.waypointIndex;
    if (!path || index === null || !this.allow("reorderWaypoint", path, index)) return;
    this.state.select(path.id, shiftWaypoint(path, index, delta));
  }
  // ----------------------------------------------------------------- history
  /** Reverts the last change. Returns false if there is nothing to undo. */
  undo() {
    return this.history.undo();
  }
  /** Re-applies the last undone change. */
  redo() {
    return this.history.redo();
  }
  get canUndo() {
    return this.history.canUndo;
  }
  get canRedo() {
    return this.history.canRedo;
  }
  // -------------------------------------------------------------------- view
  setView(options) {
    this.state.setView(options);
  }
  toggleView(key) {
    return this.state.toggleView(key);
  }
  // ----------------------------------------------------------------- preview
  /**
   * Plays an object along a path (default: the selected path). Without an
   * object, an editor-owned arrow marker is used. Only one preview at a time.
   */
  attachPreview(object, path, options = {}) {
    const target = typeof path === "string" ? this.getPath(path) : path ?? this.selectedPath ?? this.paths[0];
    if (!target) return null;
    this.detachPreview();
    let subject = object ?? null;
    if (!subject) {
      subject = this.ownedPreviewObject = this.createPreviewMarker(target);
      this.root.add(subject);
    }
    const preview = this._preview = new PathPreview(subject, target, { coordinates: this.coordinates, ...options });
    preview.on("play", () => this.events.emit("previewstate", { preview, playing: true }));
    preview.on("pause", () => this.events.emit("previewstate", { preview, playing: false }));
    this.events.emit("preview", preview);
    if (preview.isPlaying) this.events.emit("previewstate", { preview, playing: true });
    return preview;
  }
  /** Previews `path`: retargets the current preview (keeping its object) or starts one with the marker. */
  previewPath(path) {
    const target = typeof path === "string" ? this.getPath(path) : path;
    if (!target) return null;
    if (this._preview) {
      this._preview.setPath(target).reset().play();
      this.events.emit("preview", this._preview);
      return this._preview;
    }
    return this.attachPreview(null, target);
  }
  /** Stops the preview; restores the object's original transform by default. */
  detachPreview() {
    if (!this._preview) return;
    this._preview.detach();
    this._preview = null;
    if (this.ownedPreviewObject) {
      this.ownedPreviewObject.removeFromParent();
      this.ownedPreviewObject.geometry.dispose();
      this.ownedPreviewObject.material.dispose();
      this.ownedPreviewObject = null;
    }
    this.events.emit("preview", null);
  }
  // ----------------------------------------------------------------- session
  /**
   * Stores whether the editor is on, the selection, view toggles and the
   * camera pose in `sessionStorage`, so `restoreSession()` can pick up where
   * you were after a reload (e.g. right before saving a path file that makes
   * the dev server reload the page). Returns false if storage is unavailable.
   */
  saveSession(key = DEFAULT_SESSION_KEY, storage = defaultSessionStorage()) {
    if (!storage) return false;
    const state = {
      version: 1,
      enabled: this._enabled,
      selection: { ...this.selection },
      view: { ...this.view },
      camera: { position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray() },
      gizmoMode: this._gizmoMode
    };
    try {
      storage.setItem(key, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Applies a state stored by `saveSession()`: view toggles, selection (paths
   * that no longer exist are skipped), and, if the editor was on, enables it
   * and restores the camera pose. Consumed by default. Returns false when
   * nothing usable was stored.
   */
  restoreSession(key = DEFAULT_SESSION_KEY, options = {}) {
    const storage = options.storage ?? defaultSessionStorage();
    if (!storage) return false;
    let state = null;
    try {
      const raw = storage.getItem(key);
      if (!options.keep) storage.removeItem(key);
      state = raw ? JSON.parse(raw) : null;
    } catch {
      return false;
    }
    if (!state || state.version !== 1) return false;
    if (state.view) this.setView(state.view);
    if (state.gizmoMode === "rotate" || state.gizmoMode === "translate") this.setGizmoMode(state.gizmoMode);
    const selection = state.selection;
    if (selection?.pathId && this.getPath(selection.pathId)) {
      const path = this.getPath(selection.pathId);
      const index = selection.waypointIndex !== null && selection.waypointIndex < path.waypoints.length ? selection.waypointIndex : null;
      this.select(path.id, index, index === null ? null : selection.handle);
    }
    if (state.enabled) {
      this.enable();
      const camera = state.camera;
      if ((options.camera ?? true) && camera?.position?.length === 3 && camera.quaternion?.length === 4) {
        this.camera.position.fromArray(camera.position);
        this.camera.quaternion.fromArray(camera.quaternion);
        this.camera.updateMatrixWorld();
      }
    }
    return true;
  }
  // ---------------------------------------------------------------- picking
  /** Raycasts editor objects under a screen position (client coordinates). */
  pick(clientX, clientY, options = {}) {
    this.setRayFromScreen(clientX, clientY);
    const height = this.domElement.clientHeight || 800;
    const candidates = [];
    for (const [path, renderer] of this.renderers) {
      if (!renderer.group.visible) continue;
      const { markers, line } = renderer.getPickables();
      for (const hit of this.raycaster.intersectObjects(markers, false)) {
        const data = hit.object.userData;
        candidates.push({ hit, data, path, priority: data.kind === "handle" ? 0 : 1 });
      }
      if (line && !options.markersOnly) {
        line.geometry.computeBoundingSphere();
        const center = line.geometry.boundingSphere?.center ?? _v3.set(0, 0, 0);
        this.raycaster.params.Line = { threshold: worldUnitsPerPixel(this.camera, center, height) * 6 };
        for (const hit of this.raycaster.intersectObject(line, false)) {
          candidates.push({ hit, data: line.userData, path, priority: 2 });
        }
      }
    }
    candidates.sort((a, b) => a.priority - b.priority || a.hit.distance - b.hit.distance);
    const best = candidates[0];
    if (!best) return null;
    let t = null;
    let point = best.hit.point.clone();
    if (best.data.kind === "line") {
      const onLine = best.hit.pointOnLine ?? best.hit.point;
      const closest = best.path.getClosestPoint(this.coordinates.toPath(onLine.toArray(), best.path.dimension));
      t = closest.t;
      point = new Vector3().fromArray(this.coordinates.toWorld(closest.point, best.path.dimension));
    }
    return {
      kind: best.data.kind,
      path: best.path,
      waypointIndex: best.data.waypointIndex ?? null,
      handle: best.data.handle ?? null,
      point,
      t
    };
  }
  /** Sets up the internal raycaster for a screen position and returns it (e.g. for custom placement). */
  setRayFromScreen(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    _ndc.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(_ndc, this.camera);
    return this.raycaster;
  }
  /** Point the camera is looking at on the ground plane (or 10 units ahead). */
  getViewCenter(dimension = 3) {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(_ndc.set(0, 0), this.camera);
    const normal = dimension === 2 ? new Vector3(...this.coordinates.planeNormal) : new Vector3(0, 1, 0);
    const origin = new Vector3(...this.coordinates.toWorld([0, 0, 0], 2));
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = this.raycaster.ray.intersectPlane(plane, new Vector3());
    const camPos = this.raycaster.ray.origin;
    if (hit && hit.distanceTo(camPos) < (this.camera.far ?? Infinity) * 0.5) return hit;
    return this.raycaster.ray.at(10, new Vector3());
  }
  /** Yaw is measured around the path's up axis, which the 2D plane can change. */
  yawOrienter(dimension) {
    let orienter = this.yawOrienters.get(dimension);
    if (!orienter) {
      orienter = new Orienter({ worldUp: pathUp(this.coordinates, dimension).toArray(), yawOnly: true });
      this.yawOrienters.set(dimension, orienter);
    }
    return orienter;
  }
  /** A press on a host gizmo is the host's, not a click into empty space. */
  get otherGizmoEngaged() {
    return this.otherControls.some((controls) => controls.axis !== null || controls.dragging === true);
  }
  isInViewport(target) {
    return target instanceof Node && this.domElement.contains(target);
  }
  /** Ends a TransformControls drag that is in progress, without its event. */
  stopGizmoDrag() {
    const tc = this.transformControls;
    if (!tc?.dragging) return;
    tc.axis = null;
    tc.dragging = false;
  }
  /**
   * Camera controls cannot orbit a camera a rig drives, so the camera is moved
   * into the scene for the session, keeping its world pose.
   */
  takeCameraOutOfRig() {
    const camera = this.camera;
    const parent = camera.parent;
    if (!parent || parent === this.scene) return;
    this.scene.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    _matrix.copy(this.scene.matrixWorld).invert().multiply(camera.matrixWorld);
    this.detachedCamera = { parent, camera };
    this.scene.add(camera);
    _matrix.decompose(camera.position, camera.quaternion, camera.scale);
    camera.updateMatrixWorld();
  }
  putCameraBackInRig() {
    const { parent, camera } = this.detachedCamera;
    this.detachedCamera = null;
    parent.add(camera);
    camera.updateMatrixWorld();
  }
  /** Hides and blocks everything but the viewport and the editor's own UI. */
  setUiIsolated(isolated) {
    if (typeof document === "undefined") return;
    if (isolated) injectIsolationStyle();
    document.documentElement.classList.toggle(ISOLATED_CLASS, isolated);
  }
  ensureTransformControls() {
    if (this.transformControls) return this.transformControls;
    const tc = new TransformControls(this.camera, this.domElement);
    tc.setMode("translate");
    const helper = typeof tc.getHelper === "function" ? tc.getHelper() : tc;
    helper.userData.pathEditor = true;
    this.root.add(helper);
    tc.addEventListener("dragging-changed", (event) => {
      if (event.value) this.beginDrag();
      else this.endDrag();
    });
    tc.addEventListener("objectChange", () => this.onGizmoMoved());
    this.transformControls = tc;
    return tc;
  }
  beginDrag() {
    if (this.dragging) return;
    this.dragging = true;
    this.history.begin();
    this.releaseDragCamera = this.suspendCameraControls();
    const { waypointIndex } = this.selection;
    const path = this.selectedPath;
    if (path && waypointIndex !== null) this.events.emit("dragstart", { path, waypointIndex });
  }
  endDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.history.end();
    this.releaseDragCamera?.();
    this.releaseDragCamera = null;
    const { waypointIndex } = this.selection;
    const path = this.selectedPath;
    if (path && waypointIndex !== null) this.events.emit("dragend", { path, waypointIndex });
  }
  onGizmoMoved() {
    const path = this.selectedPath;
    const { waypointIndex, handle } = this.selection;
    if (!path || waypointIndex === null) return;
    if (this._gizmoMode === "rotate") {
      const radians = this.yawOrienter(path.dimension).yawOf(this.gizmoProxy.quaternion);
      path.setWaypointProperties(waypointIndex, { yaw: roundAngle(radians * 180 / Math.PI) });
      this.syncGizmoPosition();
      return;
    }
    const p = this.coordinates.toPath(this.gizmoProxy.position.toArray(), path.dimension);
    if (!handle) {
      const constrained = this.constrained(path, waypointIndex, p);
      path.moveWaypoint(waypointIndex, constrained);
      if (constrained !== p) this.gizmoProxy.position.fromArray(this.coordinates.toWorld(toVec3(constrained), path.dimension));
      return;
    }
    const wp = path.waypoints[waypointIndex];
    const current = path.getBezierHandles(waypointIndex);
    const moved = sub(p, wp.position);
    const other = handle === "in" ? current.handleOut : current.handleIn;
    let mirrored = other;
    if (this.mirrorBezierHandles && length(moved) > 1e-9) {
      mirrored = scale(normalize(moved), -(length(other) || length(moved)));
    }
    path.setWaypointHandles(
      waypointIndex,
      handle === "in" ? { handleIn: moved, handleOut: mirrored } : { handleOut: moved, handleIn: mirrored }
    );
  }
  /** `position` (path space) after `constrainWaypoint`; the same array when unchanged. */
  constrained(path, waypointIndex, position) {
    if (!this.constrainWaypoint) return position;
    const world = new Vector3().fromArray(this.coordinates.toWorld(toVec3(position), path.dimension));
    const result = this.constrainWaypoint({ path, waypointIndex, position: world });
    if (!result) return position;
    return this.coordinates.toPath(result.toArray(), path.dimension);
  }
  applyConstraint(path, index) {
    const wp = path.waypoints[index];
    if (!wp || !this.constrainWaypoint) return;
    const next = this.constrained(path, index, wp.position);
    if (next !== wp.position && Array.from(next).some((v, c) => Math.abs(v - wp.position[c]) > 1e-9)) path.moveWaypoint(index, next);
  }
  /** Puts the gizmo on the selected waypoint/handle, or hides it. */
  syncSelection() {
    const { pathId, waypointIndex, handle } = this.selection;
    for (const [path2, renderer] of this.renderers) {
      renderer.setSelection(path2.id === pathId, path2.id === pathId ? waypointIndex : null, handle);
    }
    const tc = this.transformControls;
    if (!tc) return;
    const path = this.selectedPath;
    const rotating = this._gizmoMode === "rotate";
    const action = rotating ? "editWaypointProperties" : "moveWaypoint";
    const usable = rotating ? waypointIndex !== null && !handle : waypointIndex !== null;
    if (!this._enabled || !this.state.view.gizmos || !path || !usable || !this.can(action, path, waypointIndex)) {
      tc.detach();
      return;
    }
    tc.setMode(this._gizmoMode);
    this.syncGizmoPosition();
    if (rotating) {
      const up = pathUp(this.coordinates, path.dimension, _v3);
      const axisAligned = Math.max(Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)) > 0.99;
      tc.showX = !axisAligned || Math.abs(up.x) > 0.99;
      tc.showY = !axisAligned || Math.abs(up.y) > 0.99;
      tc.showZ = !axisAligned || Math.abs(up.z) > 0.99;
    } else {
      const n = this.coordinates.planeNormal;
      const is2D = path.dimension === 2;
      tc.showX = !(is2D && Math.abs(n[0]) > 0.99);
      tc.showY = !(is2D && Math.abs(n[1]) > 0.99);
      tc.showZ = !(is2D && Math.abs(n[2]) > 0.99);
    }
    if (tc.object !== this.gizmoProxy) tc.attach(this.gizmoProxy);
  }
  syncGizmoPosition() {
    const path = this.selectedPath;
    const { waypointIndex, handle } = this.selection;
    const renderer = path ? this.renderers.get(path) : void 0;
    if (!renderer || waypointIndex === null) return;
    if (handle) renderer.getHandleWorld(waypointIndex, handle, this.gizmoProxy.position);
    else renderer.getWaypointWorld(waypointIndex, this.gizmoProxy.position);
    if (path && this._gizmoMode === "rotate") {
      const yaw = path.waypoints[waypointIndex]?.yaw ?? 0;
      this.yawOrienter(path.dimension).yawTo(yaw * Math.PI / 180, this.gizmoProxy.quaternion);
    }
    this.gizmoProxy.updateMatrixWorld();
  }
  syncRenderers() {
    const paths = new Set(this.state.paths);
    for (const [path, renderer] of this.renderers) {
      if (!paths.has(path)) {
        renderer.dispose();
        this.renderers.delete(path);
        if (this._preview?.path === path) this.detachPreview();
        this.events.emit("pathremoved", { path });
      }
    }
    for (const path of paths) {
      if (this.renderers.has(path)) continue;
      const renderer = new ThreePathRenderer(path, { ...this.renderOptions, coordinates: this.coordinates });
      this.renderers.set(path, renderer);
      this.root.add(renderer.group);
      this.events.emit("pathadded", { path });
    }
    this.applyView();
    this.syncSelection();
  }
  applyView() {
    const view = this.state.view;
    this.helpers.visible = view.grid;
    for (const renderer of this.renderers.values()) {
      renderer.group.visible = view.paths;
      renderer.setOptions({
        showArrows: view.directions,
        showFacings: view.facings,
        showLabels: view.labels,
        showDebug: view.debug
      });
    }
    this.syncSelection();
  }
  buildHelpers(grid) {
    const size = grid.size ?? 100;
    const gridHelper = new GridHelper(size, grid.divisions ?? 20, grid.centerColor ?? 7043728, grid.color ?? 3818064);
    const axes = new AxesHelper(size * 0.05);
    for (const helper of [gridHelper, axes]) {
      helper.userData.pathEditor = true;
      helper.renderOrder = 999;
    }
    const n = this.coordinates.planeNormal;
    if (Math.abs(n[2]) > 0.99) gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.fromArray(this.coordinates.toWorld([0, 0, 0], 2));
    this.helpers.name = "PathEditorHelpers";
    this.helpers.add(gridHelper, axes);
  }
  createPreviewMarker(path) {
    const geometry = new ConeGeometry(0.5, 1.6, 4).rotateX(Math.PI / 2).scale(1.4, 0.25, 1);
    const size = Math.max(averageSpacing(path, 10) * 0.15, 1e-3);
    geometry.scale(size, size, size);
    const marker = new Mesh(geometry, new MeshBasicMaterial({ color: 16742938, depthTest: false, transparent: true }));
    marker.name = "PathEditorPreviewMarker";
    marker.renderOrder = 1001;
    marker.userData.pathEditor = true;
    return marker;
  }
  assertNotDisposed() {
    if (this.disposed) throw new Error("PathEditor has been disposed.");
  }
};
function defaultSessionStorage() {
  try {
    return typeof sessionStorage === "undefined" ? void 0 : sessionStorage;
  } catch {
    return void 0;
  }
}
function describeElement(el) {
  const id = el.id ? `#${el.id}` : "";
  const classes = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
  return `<${el.tagName.toLowerCase()}${id}${classes}>`;
}
function isCoordinateSystem(value) {
  return typeof value === "object" && value !== null && typeof value.toWorld === "function";
}
function insertPositionAt(path, index) {
  const pts = path.waypoints;
  if (pts.length === 0) return [0, 0, 0];
  if (index >= pts.length) return [...add(pts[pts.length - 1].position, [averageSpacing(path), 0, 0])];
  if (index === 0) return [...sub(pts[0].position, pts.length > 1 ? sub(pts[1].position, pts[0].position) : [averageSpacing(path), 0, 0])];
  return [...toVec3(path.getPoint((index - 0.5) / path.segmentCount))];
}

// src/three/VisualsEditor.ts
var DEFAULT_SKILL = "three-path-editor-visuals";
var VisualsEditor = class extends Emitter {
  constructor(options) {
    super();
    this.worn = /* @__PURE__ */ new Map();
    this.sets = /* @__PURE__ */ new Map();
    this.initialVisibility = /* @__PURE__ */ new Map();
    this.current = [];
    this.file = null;
    this.issues = [];
    this.options = options;
    this.refresh();
  }
  /** The file the dressing is saved to, as the host named it. */
  get fileName() {
    return this.options.file ?? null;
  }
  /** The model the mesh sets come from, from the options or the file itself. */
  get source() {
    return this.options.source ?? this.file?.source ?? null;
  }
  get skill() {
    return this.options.skill ?? DEFAULT_SKILL;
  }
  get subjects() {
    return this.current;
  }
  get problems() {
    return this.issues;
  }
  /** True when the tab has at least one subject with at least one mesh set. */
  get isUsable() {
    return this.current.some((subject) => this.setsOf(subject.id).length > 0);
  }
  /**
   * What to tell the user when the tab cannot do its job: which skill to
   * apply, which model holds the meshes and where the file belongs. `null`
   * once there is something to dress.
   */
  get setupHint() {
    if (this.isUsable && this.file) return null;
    const source = this.source;
    const file = this.fileName;
    return `Apply the \`${this.skill}\` skill to set up visuals` + (source ? `: the mesh sets live in \`${source}\`` : " for this project") + (file ? `, and the dressing belongs in \`${file}\`.` : ".");
  }
  /** Re-reads the subjects and the sets they carry, keeping what is worn. */
  refresh() {
    this.current = safely(() => this.readSubjects(), []);
    this.issues = [];
    this.readFile();
    this.sets.clear();
    for (const subject of this.current) {
      const names = safely(() => meshSetsOf(subject.object), []);
      this.sets.set(subject.id, names);
      if (names.length === 0) {
        this.report({
          code: "no-sets",
          subject: subject.id,
          message: `"${subject.id}" carries no named meshes to dress it with.`
        });
        continue;
      }
      this.rememberVisibility(subject.object);
      this.seedWorn(subject, names);
    }
    if (this.current.length === 0) {
      this.report({
        code: "no-subjects",
        message: this.options.subjects === void 0 || this.options.subjects === "auto" ? "Nothing in the scene carries more than one named mesh, and no objects were configured." : "No objects were handed to the Visuals tab."
      });
    }
    this.reportUnknownSubjects();
    this.applyAll();
    this.emit("refresh", void 0);
  }
  /** The mesh sets `id` carries, worn or not. */
  setsOf(id) {
    return this.sets.get(id) ?? [];
  }
  isWorn(id, set) {
    return this.worn.get(id)?.has(set) ?? false;
  }
  setWorn(id, set, worn) {
    const current = this.worn.get(id);
    if (!current || !this.setsOf(id).includes(set)) return;
    if (worn) {
      current.add(set);
      for (const other of this.exclusiveWith(set)) current.delete(other);
    } else {
      current.delete(set);
    }
    this.apply(id);
    this.emit("change", { subject: id });
  }
  /** Back to what the file (or the model itself) started with. */
  reset() {
    this.refresh();
  }
  /** The dressing as the visuals file, ready for `onSave` or the clipboard. */
  exportString(indent = 2) {
    return stringifyVisuals(this.toData(), indent, { source: this.source, extras: this.file?.extras });
  }
  toData() {
    return this.current.map((subject) => ({
      ...this.file?.subjects.find((entry) => entry.id === subject.id) ?? {},
      id: subject.id,
      worn: this.setsOf(subject.id).filter((set) => this.isWorn(subject.id, set))
    }));
  }
  toJSON() {
    return serializeVisuals(this.toData(), { source: this.source, extras: this.file?.extras });
  }
  /** Puts every subject's meshes back the way the host had them. */
  restore() {
    for (const [mesh, visible] of this.initialVisibility) mesh.visible = visible;
    this.initialVisibility.clear();
  }
  dispose() {
    this.restore();
    this.clear();
  }
  readSubjects() {
    const { subjects, scene } = this.options;
    if (typeof subjects === "function") return subjects();
    if (Array.isArray(subjects)) return subjects;
    return scene ? autoSubjects(scene) : [];
  }
  readFile() {
    const { data } = this.options;
    this.file = null;
    if (data === void 0 || data === null || data === "") {
      this.report({
        code: "no-file",
        message: this.fileName ? `No visuals file at ${this.fileName} yet.` : "No visuals file was loaded."
      });
      return;
    }
    try {
      this.file = readVisualsFile(data);
    } catch (err) {
      this.report({ code: "file-invalid", message: err.message });
    }
  }
  // A subject with no entry in the file keeps what the model itself draws, so
  // a cast that grows does not come up naked.
  seedWorn(subject, names) {
    const saved = this.file ? wornOf(this.file, subject.id) : null;
    if (!saved) {
      this.worn.set(subject.id, new Set(names.filter((name) => this.isDrawn(subject.object, name))));
      return;
    }
    const known = saved.filter((name) => {
      if (names.includes(name)) return true;
      this.report({
        code: "unknown-set",
        subject: subject.id,
        set: name,
        message: `"${subject.id}" has no mesh set "${name}" \u2014 the file is older than the model.`
      });
      return false;
    });
    this.worn.set(subject.id, new Set(known));
  }
  reportUnknownSubjects() {
    if (!this.file) return;
    for (const entry of this.file.subjects) {
      if (this.current.some((subject) => subject.id === entry.id)) continue;
      this.report({
        code: "unknown-subject",
        subject: entry.id,
        message: `The file dresses "${entry.id}", which is not in the scene.`
      });
    }
  }
  isDrawn(object, name) {
    let drawn = false;
    forEachSetMesh(object, (mesh) => {
      if (mesh.name === name && mesh.visible) drawn = true;
    });
    return drawn;
  }
  rememberVisibility(object) {
    forEachSetMesh(object, (mesh) => {
      if (!this.initialVisibility.has(mesh)) this.initialVisibility.set(mesh, mesh.visible);
    });
  }
  exclusiveWith(set) {
    const groups = this.options.exclusive ?? [];
    return groups.filter((group) => group.includes(set)).flatMap((group) => group.filter((name) => name !== set));
  }
  applyAll() {
    for (const subject of this.current) this.apply(subject.id);
  }
  apply(id) {
    const subject = this.current.find((entry) => entry.id === id);
    const worn = this.worn.get(id);
    if (!subject || !worn) return;
    safely(() => applyVisuals(subject.object, worn), null);
  }
  report(problem) {
    this.issues.push(problem);
  }
};
function autoSubjects(scene) {
  return scene.children.filter((child) => child.name !== "" && child.userData.pathEditor !== true).map((object) => ({ id: object.name, object })).filter((subject) => meshSetsOf(subject.object).length > 1);
}
function safely(run, fallback) {
  try {
    return run();
  } catch {
    return fallback;
  }
}

// src/three/VisualsPanel.ts
var STYLE_ID = "three-path-editor-visuals-style";
var CSS = `
.tpe-visuals details{margin:2px 0}
.tpe-visuals summary{cursor:pointer;color:#cdd6e4;padding:2px 0}
.tpe-visuals .tpe-sets{padding:2px 0 4px 12px}
.tpe-visuals .tpe-sets label{display:block;font-family:ui-monospace,monospace;font-size:11px}
.tpe-visuals .tpe-note{border:1px solid #7a5a2a;background:#3a2e18;border-radius:4px;padding:6px 8px;margin-bottom:6px;color:#f0d9a8}
.tpe-visuals .tpe-note code{background:rgba(0,0,0,.3);border-radius:3px;padding:0 3px}
.tpe-visuals .tpe-note ul{margin:4px 0 0;padding-left:16px}
.tpe-visuals .tpe-note li{margin:1px 0}
`;
var VisualsPanel = class {
  constructor(editor, options = {}) {
    this.unsubscribers = [];
    this.statusText = "";
    this.editor = editor;
    this.options = options;
    injectStyle();
    const element = this.element = document.createElement("div");
    element.className = "tpe-visuals";
    for (const type of ["pointerdown", "wheel", "keydown", "click", "change"]) {
      element.addEventListener(type, (event) => event.stopPropagation());
    }
    this.unsubscribers.push(editor.on("refresh", () => this.refresh()));
    this.refresh();
  }
  /** Ready to hand to `PathEditorPanel.addTab`. */
  get tab() {
    return { label: this.options.label ?? "Visuals", element: this.element };
  }
  refresh() {
    this.element.replaceChildren(
      ...this.renderNote(),
      ...this.editor.subjects.map((subject) => this.renderSubject(subject.id)),
      this.renderActions()
    );
  }
  dispose() {
    for (const off of this.unsubscribers) off();
    this.element.remove();
  }
  renderNote() {
    const problems = this.editor.problems;
    const hint = this.editor.setupHint;
    if (problems.length === 0 && !hint) return [];
    const section = document.createElement("section");
    const note = document.createElement("div");
    note.className = "tpe-note";
    if (hint) note.appendChild(markup(hint));
    if (problems.length > 0) note.appendChild(this.renderProblems(problems));
    section.appendChild(note);
    return [section];
  }
  renderProblems(problems) {
    const list = document.createElement("ul");
    for (const problem of problems) {
      const item = document.createElement("li");
      item.textContent = problem.message;
      list.appendChild(item);
    }
    return list;
  }
  renderSubject(id) {
    const section = document.createElement("section");
    const sets = this.editor.setsOf(id);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${id} (${sets.length})`;
    details.appendChild(summary);
    const box = document.createElement("div");
    box.className = "tpe-sets";
    for (const set of sets) {
      box.appendChild(this.renderSet(id, set));
    }
    if (sets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tpe-hint";
      empty.textContent = "No named meshes on this object.";
      box.appendChild(empty);
    }
    details.appendChild(box);
    section.appendChild(details);
    return section;
  }
  renderSet(id, set) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.editor.isWorn(id, set);
    input.addEventListener("change", () => {
      this.editor.setWorn(id, set, input.checked);
      this.syncChecks();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${set}`));
    label.dataset.subject = id;
    label.dataset.set = set;
    return label;
  }
  syncChecks() {
    for (const label of this.element.querySelectorAll("label[data-set]")) {
      const input = label.firstElementChild;
      const { subject, set } = label.dataset;
      if (input && subject && set) input.checked = this.editor.isWorn(subject, set);
    }
  }
  renderActions() {
    const section = document.createElement("section");
    const row = document.createElement("div");
    row.className = "tpe-row";
    if (this.options.onSave) row.appendChild(this.button("Save", () => this.save()));
    row.appendChild(this.button("Export", () => this.export()));
    row.appendChild(this.button("Copy", () => this.copy()));
    row.appendChild(this.button("Reset", () => this.editor.reset()));
    section.appendChild(row);
    const status = document.createElement("div");
    status.className = "tpe-status";
    status.textContent = this.statusText;
    status.dataset.el = "visuals-status";
    section.appendChild(status);
    return section;
  }
  button(text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }
  save() {
    const save = this.options.onSave;
    if (!save) return;
    this.status("Saving\u2026");
    Promise.resolve().then(() => save(this.editor.exportString())).then(() => this.status("Saved.")).catch((err) => this.status(`Save failed: ${err instanceof Error ? err.message : String(err)}`));
  }
  export() {
    const json = this.editor.exportString();
    if (this.options.onExport) this.options.onExport(json);
    else download(json, this.options.fileName ?? baseName(this.editor.fileName) ?? "visuals.json");
    this.status("Exported.");
  }
  copy() {
    navigator.clipboard?.writeText(this.editor.exportString()).then(() => this.status("JSON copied to clipboard.")).catch(() => this.status("Clipboard not available."));
  }
  status(text) {
    this.statusText = text;
    const status = this.element.querySelector('[data-el="visuals-status"]');
    if (status) status.textContent = text;
  }
};
function markup(text) {
  const line = document.createElement("div");
  text.split("`").forEach((part, index) => {
    if (index % 2 === 0) {
      line.appendChild(document.createTextNode(part));
      return;
    }
    const code = document.createElement("code");
    code.textContent = part;
    line.appendChild(code);
  });
  return line;
}
function baseName(file) {
  return file ? file.slice(file.lastIndexOf("/") + 1) : null;
}
function download(json, fileName) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// src/three/PathEditorPanel.ts
var VIEW_LABELS = [
  ["gizmos", "Gizmos"],
  ["paths", "Paths"],
  ["directions", "Arrows"],
  ["labels", "Labels"],
  ["facings", "Facings"],
  ["sightlines", "Sight lines"],
  ["surface", "Below floor"],
  ["grid", "Grid"],
  ["debug", "Debug"]
];
var STYLE_ID2 = "three-path-editor-panel-style";
var CSS2 = `
.tpe-panel{position:absolute;z-index:10000;width:280px;max-height:calc(100% - 20px);overflow:auto;background:rgba(18,22,30,.92);color:#e6e9ef;font:12px/1.4 system-ui,sans-serif;border:1px solid #2c3442;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.4);user-select:none}
.tpe-panel.top-right{top:10px;right:10px}.tpe-panel.top-left{top:10px;left:10px}.tpe-panel.bottom-right{bottom:10px;right:10px}.tpe-panel.bottom-left{bottom:10px;left:10px}
.tpe-panel header{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #2c3442;font-weight:600;cursor:pointer}
.tpe-panel.collapsed .tpe-body{display:none}
.tpe-panel section{padding:8px 10px;border-bottom:1px solid #232a36}
.tpe-panel h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b95a7}
.tpe-row{display:flex;gap:4px;align-items:center;margin:4px 0;flex-wrap:wrap}
.tpe-panel button,.tpe-panel select,.tpe-panel input{font:inherit;color:inherit;background:#252d3a;border:1px solid #364052;border-radius:4px;padding:2px 6px}
.tpe-panel button{cursor:pointer}.tpe-panel button:hover{background:#2f3a4b}.tpe-panel button:disabled{opacity:.4;cursor:default}
.tpe-panel input[type=number]{width:62px}.tpe-panel input[type=text]{flex:1;min-width:0}.tpe-panel select{flex:1;min-width:0}
.tpe-panel label{display:inline-flex;align-items:center;gap:3px}
.tpe-points{max-height:140px;overflow:auto;border:1px solid #2c3442;border-radius:4px}
.tpe-points div{padding:2px 6px;cursor:pointer;font-family:ui-monospace,monospace;font-size:11px;white-space:nowrap}
.tpe-points div:hover{background:#252d3a}.tpe-points div.sel{background:#5a2330}
.tpe-panel button.tpe-danger{border-color:#7a2a36;color:#ff9aa8}.tpe-panel button.tpe-danger:hover{background:#4a1c24}
.tpe-panel input[data-el=speed-wp],.tpe-panel input[data-el=roll],.tpe-panel input[data-el=yaw],.tpe-panel input[data-el=time]{width:54px}
.tpe-panel button.tpe-on{border-color:#5a7ea8;background:#2d3d52}
.tpe-tabs{display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #2c3442}
.tpe-tabs button{flex:1}
.tpe-panel.collapsed .tpe-tabs,.tpe-panel.collapsed [data-tpe-tab]{display:none}
.tpe-panel textarea{font:11px/1.35 ui-monospace,monospace;color:inherit;background:#252d3a;border:1px solid #364052;border-radius:4px;padding:3px 5px;width:100%;box-sizing:border-box;min-height:44px;resize:vertical}
.tpe-panel textarea.tpe-invalid{border-color:#b04454}
.tpe-hint{color:#8b95a7;font-size:11px}.tpe-status{color:#9fd49f;min-height:14px}
`;
var PathEditorPanel = class {
  constructor(editor, options = {}) {
    this.unsubscribers = [];
    this.tabs = [];
    this.visualsEditor = null;
    this.visualsPanel = null;
    this.tab = 0;
    this.frame = 0;
    this.onClick = (e) => {
      const target = e.target;
      const editor = this.editor;
      const path = editor.selectedPath;
      const row = target.closest("[data-idx]");
      if (row && path) {
        editor.select(path.id, Number(row.dataset.idx));
        return;
      }
      const act = target.closest("[data-act]");
      switch (act?.getAttribute("data-act")) {
        case "tab":
          this.selectTab(Number(act.getAttribute("data-tab")));
          break;
        case "collapse":
          this.element.classList.toggle("collapsed");
          break;
        case "enabled":
          editor.toggle();
          break;
        case "gizmomode":
          editor.toggleGizmoMode();
          break;
        case "undo":
          editor.undo();
          break;
        case "redo":
          editor.redo();
          break;
        case "new3d":
          editor.createPathInView({ dimension: 3, id: uniqueId(editor, "route") });
          break;
        case "new2d":
          editor.createPathInView({ dimension: 2, id: uniqueId(editor, "route2d") });
          break;
        case "newmarker":
          editor.createMarker({ id: uniqueId(editor, "marker") });
          break;
        case "delpath":
          if (!path) break;
          if ((this.options.confirmDelete ?? true) && !confirm(`Delete path "${path.id}"? This cannot be undone.`)) break;
          editor.removePath(path.id);
          this.status(`Deleted path "${path.id}".`);
          break;
        case "reverse":
          if (path && editor.can("editCurve", path)) path.reverse();
          break;
        case "add":
          editor.addWaypoint();
          break;
        case "del":
          editor.deleteSelectedWaypoint();
          break;
        case "up":
          editor.shiftSelectedWaypoint(-1);
          break;
        case "down":
          editor.shiftSelectedWaypoint(1);
          break;
        case "rig": {
          if (editor.flyingRig) editor.stopRig();
          else editor.playRig(this.$("rig").value);
          break;
        }
        case "preview":
          if (path) editor.previewPath(path);
          break;
        case "play":
          editor.preview?.toggle();
          this.refresh();
          break;
        case "reset":
          editor.preview?.reset();
          break;
        case "stop":
          editor.detachPreview();
          break;
        case "save": {
          const save = this.options.onSave;
          if (!save) break;
          this.status("Saving\u2026");
          Promise.resolve().then(() => save(editor.exportString())).then(() => this.status(`Saved ${editor.paths.length} path(s).`)).catch((err) => this.status(`Save failed: ${err instanceof Error ? err.message : String(err)}`));
          break;
        }
        case "export": {
          const json = editor.exportString();
          if (this.options.onExport) this.options.onExport(json);
          else download2(json, this.options.fileName ?? "paths.json");
          this.status(`Exported ${editor.paths.length} path(s).`);
          break;
        }
        case "copy":
          navigator.clipboard?.writeText(editor.exportString()).then(() => this.status("JSON copied to clipboard.")).catch(() => this.status("Clipboard not available."));
          break;
        case "import":
          this.$("file").click();
          break;
      }
    };
    this.onChange = (e) => {
      const target = e.target;
      const editor = this.editor;
      const path = editor.selectedPath;
      const name = target.dataset.el ?? "";
      if (name === "path") editor.select(target.value || null);
      else if (name === "pathId" && path) {
        if (!editor.renamePath(path.id, target.value.trim())) {
          this.status("Id is empty or already used.");
          target.value = path.id;
        }
      } else if ((name === "curve" || name === "closed" || name === "tension" || name === "param") && path) {
        if (!editor.can("editCurve", path)) return;
        if (name === "curve") path.setCurve({ type: target.value });
        else if (name === "param") path.setCurve({ parametrization: target.value });
        else if (name === "closed") path.setCurve({ closed: target.checked });
        else if (target.value !== "") path.setCurve({ tension: Number(target.value) });
      } else if ((name === "speed-wp" || name === "roll" || name === "yaw" || name === "time") && path) {
        const index = editor.selection.waypointIndex;
        if (index === null) return;
        const value = target.value === "" ? null : Number(target.value);
        if (!editor.can("editWaypointProperties", path, index)) return;
        if (name === "speed-wp") path.setWaypointProperties(index, { speed: value === null ? null : Math.max(0, value) });
        else if (name === "roll") path.setWaypointProperties(index, { roll: value });
        else if (name === "yaw") path.setWaypointProperties(index, { yaw: value });
        else path.setWaypointProperties(index, { time: value });
      } else if ((name === "x" || name === "y" || name === "z") && path) {
        const index = editor.selection.waypointIndex;
        if (index === null || target.value === "") return;
        const pos = [...path.waypoints[index].position];
        pos["xyz".indexOf(name)] = Number(target.value);
        editor.moveWaypoint(path.id, index, pos);
      } else if ((name === "meta-wp" || name === "meta-path") && path) {
        const index = editor.selection.waypointIndex;
        const waypointIndex = name === "meta-wp" ? index : null;
        if (name === "meta-wp" && index === null || !editor.can("editMetadata", path, waypointIndex)) return;
        const metadata = parseMetadata(target.value);
        target.classList.toggle("tpe-invalid", metadata === null);
        if (metadata === null) {
          this.status('Metadata must be a JSON object, e.g. {"name": "start"}.');
          return;
        }
        if (waypointIndex === null) path.setMetadata(metadata);
        else path.setWaypointMetadata(waypointIndex, metadata);
      } else if (name.startsWith("view-")) editor.setView({ [name.slice(5)]: target.checked });
      else if (name === "speed" && editor.preview && target.value !== "") editor.preview.speed = Math.max(0, Number(target.value));
      else if (name === "loop" && editor.preview) editor.preview.loop = target.value;
      else if (name === "file" && target.files?.[0]) {
        const file = target.files[0];
        file.text().then((text) => {
          const paths = editor.import(text);
          this.status(`Imported ${paths.length} path(s) from ${file.name}.`);
        }).catch((err) => this.status(`Import failed: ${err.message}`)).finally(() => target.value = "");
      }
    };
    this.editor = editor;
    this.options = options;
    injectStyle2();
    const el = this.element = document.createElement("div");
    el.className = `tpe-panel ${options.position ?? "top-right"}${options.collapsed ? " collapsed" : ""}`;
    el.setAttribute(EDITOR_UI_ATTRIBUTE, "");
    el.innerHTML = this.template();
    const container = options.container ?? document.body;
    if (container !== document.body && getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(el);
    for (const type of ["pointerdown", "wheel", "keydown"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("click", this.onClick);
    el.addEventListener("change", this.onChange);
    for (const type of ["change", "select", "view", "pathadded", "pathremoved", "preview", "previewstate", "enabled", "history", "gizmomode", "rigstate"]) {
      this.unsubscribers.push(editor.on(type, () => this.scheduleRefresh()));
    }
    this.addVisualsTab();
    if (options.hideWhenDisabled) {
      this.unsubscribers.push(editor.on("enabled", (enabled) => this.setVisible(enabled)));
      this.setVisible(editor.enabled);
    }
    this.refresh();
  }
  refreshRigs() {
    const { editor } = this;
    const row = this.$("rig-row");
    row.style.display = editor.rigs.length > 0 ? "" : "none";
    if (editor.rigs.length === 0) return;
    const select = this.$("rig");
    const ids = editor.rigs.map((rig) => rig.id);
    if (select.dataset.ids !== ids.join("|")) {
      select.dataset.ids = ids.join("|");
      select.innerHTML = ids.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
    }
    const flying = editor.flyingRig;
    if (flying) select.value = flying.id;
    this.$("rig-play").textContent = flying ? "Stop" : "Fly";
  }
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
  addTab(tab) {
    this.tabs.push(tab);
    tab.element.setAttribute("data-tpe-tab", "");
    this.element.appendChild(tab.element);
    this.renderTabs();
    this.selectTab(this.tab);
  }
  /** The Visuals tab's state, unless it was switched off. */
  get visuals() {
    return this.visualsEditor;
  }
  // Built here rather than left to the host: a project that installs the
  // package gets the tab, and the tab itself says what to do when there is
  // nothing in it yet.
  addVisualsTab() {
    const option = this.options.visuals;
    if (option === false) return;
    const config = option instanceof VisualsEditor ? null : option ?? {};
    this.visualsEditor = config ? new VisualsEditor({ scene: this.editor.scene, ...config }) : option;
    this.visualsPanel = new VisualsPanel(this.visualsEditor, config ?? {});
    this.addTab(this.visualsPanel.tab);
  }
  /** 0 is the editor's own controls, 1.. are the tabs added by the host. */
  get activeTab() {
    return this.tab;
  }
  selectTab(index) {
    this.tab = Math.max(0, Math.min(index, this.tabs.length));
    this.$("body").style.display = this.tab === 0 ? "" : "none";
    this.tabs.forEach((tab, i) => tab.element.style.display = this.tab === i + 1 ? "" : "none");
    this.$("tabs").querySelectorAll("button").forEach((button, i) => button.classList.toggle("tpe-on", i === this.tab));
  }
  renderTabs() {
    const strip = this.$("tabs");
    strip.style.display = this.tabs.length > 0 ? "" : "none";
    strip.innerHTML = [this.options.tabLabel ?? "Paths", ...this.tabs.map((tab) => tab.label)].map((label, i) => `<button data-act="tab" data-tab="${i}">${esc(label)}</button>`).join("");
  }
  /** Shows or hides the panel without disposing it. */
  setVisible(visible) {
    this.element.style.display = visible ? "" : "none";
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    for (const off of this.unsubscribers) off();
    this.visualsPanel?.dispose();
    if (!(this.options.visuals instanceof VisualsEditor)) this.visualsEditor?.dispose();
    this.element.remove();
  }
  $(name) {
    return this.element.querySelector(`[data-el="${name}"]`);
  }
  scheduleRefresh() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.refresh();
    });
  }
  /** Syncs every control with the editor state. */
  refresh() {
    const editor = this.editor;
    const path = editor.selectedPath;
    const index = editor.selection.waypointIndex;
    this.$("enabled").textContent = editor.enabled ? "Editor: ON" : "Editor: OFF";
    this.$("undo").disabled = !editor.canUndo;
    this.$("redo").disabled = !editor.canRedo;
    const pathSelect = this.$("path");
    pathSelect.innerHTML = `<option value="">\u2014 none \u2014</option>` + editor.paths.map((p) => `<option value="${esc(p.id)}">${p.isMarker ? "\u25C6 " : ""}${esc(p.id)} (${p.dimension}D)</option>`).join("");
    pathSelect.value = path?.id ?? "";
    const denied = (action, waypointIndex = null) => !path || !editor.can(action, path, waypointIndex);
    this.$("preview").disabled = !path;
    this.refreshRigs();
    this.$("pathId").disabled = denied("renamePath");
    this.$("delpath").disabled = denied("deletePath");
    this.$("add").disabled = denied("addWaypoint");
    for (const name of ["curve", "closed", "tension", "reverse"]) this.$(name).disabled = denied("editCurve");
    const param = this.$("param");
    param.disabled = denied("editCurve") || path?.curve.type !== "catmull-rom";
    param.value = path?.curve.parametrization ?? "uniform";
    setValue(this.$("pathId"), path?.id ?? "");
    this.$("curve").value = path?.curve.type ?? "catmull-rom";
    this.$("closed").checked = path?.curve.closed ?? false;
    setValue(this.$("tension"), path ? String(path.curve.tension) : "");
    this.$("count").textContent = path ? path.isMarker ? "(marker)" : `(${path.waypoints.length}, ${path.length.toFixed(1)} u)` : "";
    this.$("points").innerHTML = path ? path.waypoints.map(
      (w, i) => `<div data-idx="${i}" class="${i === index ? "sel" : ""}">#${i}  ${w.position.slice(0, path.dimension).map((v) => v.toFixed(2)).join(", ")}${this.waypointSuffix(path, i)}</div>`
    ).join("") : "";
    const wp = path && index !== null ? path.waypoints[index] : null;
    ["x", "y", "z"].forEach((axis, c) => {
      const input = this.$(axis);
      input.disabled = !wp || c === 2 && path?.dimension === 2 || denied("moveWaypoint", index);
      setValue(input, wp && !(c === 2 && path?.dimension === 2) ? String(round(wp.position[c])) : "");
    });
    this.$("del").disabled = !wp || denied("deleteWaypoint", index);
    for (const name of ["up", "down"]) this.$(name).disabled = !wp || denied("reorderWaypoint", index);
    const speedInput = this.$("speed-wp");
    const rollInput = this.$("roll");
    const yawInput = this.$("yaw");
    const timeInput = this.$("time");
    const propsDenied = !wp || denied("editWaypointProperties", index);
    speedInput.disabled = rollInput.disabled = yawInput.disabled = timeInput.disabled = propsDenied;
    setValue(speedInput, wp?.speed !== void 0 ? String(round(wp.speed)) : "");
    setValue(rollInput, wp?.roll !== void 0 ? String(round(wp.roll)) : "");
    setValue(yawInput, wp?.yaw !== void 0 ? String(round(wp.yaw)) : "");
    setValue(timeInput, wp?.time !== void 0 ? String(round(wp.time)) : "");
    const modeButton = this.$("gizmomode");
    modeButton.disabled = propsDenied;
    modeButton.classList.toggle("tpe-on", editor.gizmoMode === "rotate");
    const pointMeta = this.$("meta-wp");
    pointMeta.disabled = !wp || denied("editMetadata", index);
    setValue(pointMeta, wp ? stringifyMetadata(wp.metadata) : "");
    const pathMeta = this.$("meta-path");
    pathMeta.disabled = denied("editMetadata");
    setValue(pathMeta, path ? stringifyMetadata(path.metadata) : "");
    if (document.activeElement !== pointMeta) pointMeta.classList.remove("tpe-invalid");
    if (document.activeElement !== pathMeta) pathMeta.classList.remove("tpe-invalid");
    for (const [key] of VIEW_LABELS) this.$(`view-${key}`).checked = editor.view[key];
    const preview = editor.preview;
    this.$("play").disabled = !preview;
    this.$("reset").disabled = !preview;
    this.$("stop").disabled = !preview;
    this.$("play").textContent = preview?.isPlaying ? "Pause" : "Play";
    setValue(this.$("speed"), preview ? String(round(preview.speed)) : "");
    this.$("loop").value = preview?.loop ?? "loop";
  }
  waypointSuffix(path, index) {
    const text = this.options.formatWaypoint?.({ path, waypoint: path.waypoints[index], index });
    return text ? `  ${esc(text)}` : "";
  }
  status(text) {
    this.$("status").textContent = text;
  }
  template() {
    const view = VIEW_LABELS.map(
      ([key, label]) => `<label><input type="checkbox" data-el="view-${key}">${label}</label>`
    ).join("");
    return `
<header data-act="collapse"><span>${esc(this.options.title ?? "Path Editor")}</span><span>\u25BE</span></header>
<nav class="tpe-tabs" data-el="tabs" style="display:none"></nav>
<div class="tpe-body" data-el="body">
  <section>
    <div class="tpe-row">
      <button data-act="enabled" data-el="enabled">Editor</button>
      <button data-act="undo" data-el="undo" title="Undo (Cmd/Ctrl+Z)">\u21B6 Undo</button>
      <button data-act="redo" data-el="redo" title="Redo (Cmd/Ctrl+Shift+Z)">\u21B7 Redo</button>
    </div>
    <h4>Path</h4>
    <div class="tpe-row"><select data-el="path"></select></div>
    <div class="tpe-row"><button data-act="new3d">+ 3D path</button><button data-act="new2d">+ 2D path</button><button data-act="newmarker" title="A single named place: spawn point, prop, light">+ Marker</button><button data-act="reverse" data-el="reverse">Reverse</button></div>
    <div class="tpe-row"><button class="tpe-danger" data-act="delpath" data-el="delpath">\u{1F5D1} Delete path</button></div>
    <div class="tpe-row"><label style="flex:1">Id <input type="text" data-el="pathId"></label></div>
    <div class="tpe-row">
      <select data-el="curve"><option value="linear">Linear</option><option value="catmull-rom">Catmull-Rom</option><option value="bezier">Bezier</option></select>
      <label><input type="checkbox" data-el="closed">Closed</label>
      <label title="Tension">T <input type="number" step="0.05" min="0" max="1" data-el="tension"></label>
    </div>
    <div class="tpe-row"><label style="flex:1" title="Catmull-Rom knot spacing; match your runtime curve (e.g. THREE.CatmullRomCurve3 'centripetal')">Spacing <select data-el="param"><option value="uniform">Uniform</option><option value="centripetal">Centripetal</option><option value="chordal">Chordal</option></select></label></div>
  </section>
  <section>
    <h4>Waypoints <span data-el="count"></span></h4>
    <div class="tpe-points" data-el="points"></div>
    <div class="tpe-row">
      <label>X <input type="number" step="0.1" data-el="x"></label>
      <label>Y <input type="number" step="0.1" data-el="y"></label>
      <label>Z <input type="number" step="0.1" data-el="z"></label>
    </div>
    <div class="tpe-row">
      <label title="Speed multiplier at this point (empty = \xD71). Blended between points.">Speed \xD7 <input type="number" step="0.1" min="0" placeholder="1" data-el="speed-wp"></label>
      <label title="Bank/roll angle in degrees (positive = bank right, empty = 0).">Roll \xB0 <input type="number" step="5" placeholder="0" data-el="roll"></label>
    </div>
    <div class="tpe-row">
      <label title="Facing in degrees for an object standing on this point. The rotate gizmo (R) writes it.">Yaw \xB0 <input type="number" step="5" placeholder="\u2014" data-el="yaw"></label>
      <label title="Authored time at this point, in your own units. Two paths with the same times stay in step.">Time <input type="number" step="0.1" placeholder="\u2014" data-el="time"></label>
      <button data-act="gizmomode" data-el="gizmomode" title="Gizmo: move or turn the point (R)">Turn</button>
    </div>
    <div class="tpe-row"><label style="flex:1;display:block">Point metadata (JSON)<textarea data-el="meta-wp" spellcheck="false"></textarea></label></div>
    <div class="tpe-row">
      <button data-act="add" data-el="add">+ Add</button><button data-act="del" data-el="del">Delete</button>
      <button data-act="up" data-el="up" title="Move earlier">\u25B2</button><button data-act="down" data-el="down" title="Move later">\u25BC</button>
    </div>
    <div class="tpe-row"><label style="flex:1;display:block">Path metadata (JSON)<textarea data-el="meta-path" spellcheck="false"></textarea></label></div>
  </section>
  <section><h4>View</h4><div class="tpe-row">${view}</div></section>
  <section>
    <h4>Preview</h4>
    <div class="tpe-row"><button data-act="preview" data-el="preview">Preview path</button><button data-act="play" data-el="play">Play</button><button data-act="reset" data-el="reset">Reset</button><button data-act="stop" data-el="stop">Stop</button></div>
    <div class="tpe-row">
      <label>Speed <input type="number" step="0.5" min="0" data-el="speed"></label>
      <select data-el="loop"><option value="none">Once</option><option value="loop">Loop</option><option value="pingpong">Ping-pong</option></select>
    </div>
    <div class="tpe-row" data-el="rig-row" style="display:none">
      <select data-el="rig" title="Camera path and what it looks at"></select>
      <button data-act="rig" data-el="rig-play" title="Fly the editor camera along the rig">Fly</button>
    </div>
  </section>
  <section>
    <h4>JSON</h4>
    <div class="tpe-row">${this.options.onSave ? '<button data-act="save" data-el="save">Save</button>' : ""}<button data-act="export">Export</button><button data-act="copy">Copy</button><button data-act="import">Import\u2026</button>
    <input type="file" accept=".json,application/json" data-el="file" style="display:none"></div>
    <div class="tpe-status" data-el="status"></div>
    <div class="tpe-hint">Click: select \xB7 Shift+click empty: add point \xB7 Shift+click / double-click curve: insert point \xB7 Del: delete \xB7 [ ]: prev/next \xB7 Alt+[ ]: reorder \xB7 G: gizmo \xB7 Cmd/Ctrl+Z: undo \xB7 Shift+Cmd/Ctrl+Z: redo</div>
  </section>
</div>`;
  }
};
function injectStyle2() {
  if (document.getElementById(STYLE_ID2)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID2;
  style.textContent = CSS2;
  document.head.appendChild(style);
}
function setValue(input, value) {
  if (document.activeElement !== input) input.value = value;
}
function stringifyMetadata(metadata) {
  return Object.keys(metadata).length ? JSON.stringify(metadata, null, 1) : "";
}
function parseMetadata(text) {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function round(v) {
  return Math.round(v * 1e3) / 1e3;
}
function esc(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function uniqueId(editor, base) {
  let i = editor.paths.length + 1;
  while (editor.getPath(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
function download2(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}

export { CameraRig, DEFAULT_FLY_KEYS, DEFAULT_PATH_STYLE, DEFAULT_SESSION_KEY, DEFAULT_VIEW, EDITOR_UI_ATTRIBUTE, EDITOR_VIEWPORT_ATTRIBUTE, EditorHistory, EditorState, FlyControls, PathEditor, PathEditorPanel, PathPreview, SurfaceCheck, ThreePathRenderer, VisualsEditor, VisualsPanel, autoSubjects, averageSpacing, bindShortcuts, defaultWaypointLabel, insertWaypointAfter, insertWaypointAtT, isEditorObject, objectPlacement, pathUp, planePlacement, saveToDevServer, shiftWaypoint, suggestWaypointPosition, surfaceConstraint, worldUnitsPerPixel };
