var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/vec3.ts
var vec3_exports = {};
__export(vec3_exports, {
  EPSILON: () => EPSILON,
  add: () => add,
  addScaled: () => addScaled,
  clone: () => clone,
  copy: () => copy,
  cross: () => cross,
  distance: () => distance,
  dot: () => dot,
  equals: () => equals,
  length: () => length,
  lerp: () => lerp,
  normalize: () => normalize,
  scale: () => scale,
  set: () => set,
  sub: () => sub,
  toVec3: () => toVec3,
  vec3: () => vec3
});
var EPSILON = 1e-9;
function vec3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}
function set(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function toVec3(source, out) {
  return set(out ?? [0, 0, 0], num(source[0]), num(source[1]), num(source[2]));
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function add(a, b, out) {
  return set(out ?? [0, 0, 0], a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}
function sub(a, b, out) {
  return set(out ?? [0, 0, 0], a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function scale(a, s, out) {
  return set(out ?? [0, 0, 0], a[0] * s, a[1] * s, a[2] * s);
}
function addScaled(a, b, s, out) {
  return set(out ?? [0, 0, 0], a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s);
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b, out) {
  return set(
    out ?? [0, 0, 0],
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  );
}
function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function normalize(a, out) {
  const len = length(a);
  if (len < EPSILON) return set(out ?? [0, 0, 0], 0, 0, 0);
  return set(out ?? [0, 0, 0], a[0] / len, a[1] / len, a[2] / len);
}
function lerp(a, b, t, out) {
  return set(out ?? [0, 0, 0], a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function clone(a) {
  return [a[0], a[1], a[2]];
}
function copy(out, a) {
  return set(out, a[0], a[1], a[2]);
}
function equals(a, b, eps = EPSILON) {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}

// src/core/Waypoint.ts
var KNOWN_KEYS = /* @__PURE__ */ new Set(["id", "position", "handleIn", "handleOut", "speed", "roll", "yaw", "time", "metadata"]);
var NUMBER_FIELDS = ["speed", "roll", "yaw", "time"];
var Waypoint = class _Waypoint {
  constructor(init, extras = {}) {
    this.id = init.id;
    this.position = toVec3(init.position);
    this.handleIn = init.handleIn ? toVec3(init.handleIn) : null;
    this.handleOut = init.handleOut ? toVec3(init.handleOut) : null;
    for (const key of NUMBER_FIELDS) {
      const value = init[key];
      if (typeof value === "number" && Number.isFinite(value)) this[key] = value;
    }
    this.metadata = init.metadata ? structuredCloneSafe(init.metadata) : {};
    this.extras = structuredCloneSafe(extras);
  }
  clone() {
    return new _Waypoint(this, this.extras);
  }
  toJSON(dimension = 3) {
    const out = { ...structuredCloneSafe(this.extras), position: this.position.slice(0, dimension) };
    if (this.id !== void 0) out.id = this.id;
    if (this.handleIn) out.handleIn = this.handleIn.slice(0, dimension);
    if (this.handleOut) out.handleOut = this.handleOut.slice(0, dimension);
    for (const key of NUMBER_FIELDS) if (this[key] !== void 0) out[key] = this[key];
    if (Object.keys(this.metadata).length > 0) out.metadata = structuredCloneSafe(this.metadata);
    return out;
  }
  static fromJSON(data) {
    const extras = {};
    for (const key of Object.keys(data)) if (!KNOWN_KEYS.has(key)) extras[key] = data[key];
    return new _Waypoint(data, extras);
  }
};
function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// src/utils/Emitter.ts
var Emitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(type, listener) {
    let set2 = this.listeners.get(type);
    if (!set2) {
      set2 = /* @__PURE__ */ new Set();
      this.listeners.set(type, set2);
    }
    set2.add(listener);
    return () => this.off(type, listener);
  }
  once(type, listener) {
    const off = this.on(type, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }
  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type, payload) {
    const set2 = this.listeners.get(type);
    if (!set2) return;
    for (const listener of [...set2]) listener(payload);
  }
  clear() {
    this.listeners.clear();
  }
};

// src/core/ArcLengthTable.ts
var ArcLengthTable = class {
  constructor(curve, samplesPerSegment = 64) {
    this.divisions = Math.min(Math.max(1, curve.segmentCount) * samplesPerSegment, 5e4);
    this.lengths = new Float64Array(this.divisions + 1);
    let prev = curve.getPoint(0);
    let sum = 0;
    for (let i = 1; i <= this.divisions; i++) {
      const p = curve.getPoint(i / this.divisions);
      sum += distance(prev, p);
      this.lengths[i] = sum;
      prev = p;
    }
    this.totalLength = sum;
  }
  /** Curve parameter t for a distance along the curve (clamped). */
  tAtDistance(d) {
    const { lengths, divisions, totalLength } = this;
    if (totalLength <= 0 || d <= 0) return 0;
    if (d >= totalLength) return 1;
    let lo = 0;
    let hi = divisions;
    while (lo < hi - 1) {
      const mid = lo + hi >> 1;
      if (lengths[mid] < d) lo = mid;
      else hi = mid;
    }
    const span = lengths[hi] - lengths[lo];
    const f = span > 0 ? (d - lengths[lo]) / span : 0;
    return (lo + f) / divisions;
  }
  /** Distance along the curve for curve parameter t. */
  distanceAtT(t) {
    const x = Math.min(Math.max(t, 0), 1) * this.divisions;
    const i = Math.min(Math.floor(x), this.divisions - 1);
    const f = x - i;
    return this.lengths[i] + (this.lengths[i + 1] - this.lengths[i]) * f;
  }
};

// src/utils/math.ts
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function wrap(value, max) {
  return (value % max + max) % max;
}

// src/core/curves/Curve.ts
function locateSegmentInto(t, segmentCount, out) {
  const scaled = clamp(t, 0, 1) * segmentCount;
  out.index = Math.min(Math.floor(scaled), segmentCount - 1);
  out.t = scaled - out.index;
  return out;
}
var _location = { index: 0, t: 0 };
function locateSegment(t, segmentCount) {
  locateSegmentInto(t, segmentCount, _location);
  return [_location.index, _location.t];
}
var PointCurve = class {
  constructor(point = [0, 0, 0]) {
    this.point = point;
    this.segmentCount = 0;
  }
  getPoint(_t, out) {
    return set(out ?? [0, 0, 0], this.point[0], this.point[1], this.point[2]);
  }
  getDerivative(_t, out) {
    return set(out ?? [0, 0, 0], 0, 0, 0);
  }
};

// src/core/curves/BezierCurve.ts
function resolveBezierHandles(points, explicit, closed, tension) {
  const n = points.length;
  return points.map((p, i) => {
    let prev;
    let next;
    if (closed) {
      prev = points[(i - 1 + n) % n];
      next = points[(i + 1) % n];
    } else {
      prev = i > 0 ? points[i - 1] : sub(scale(p, 2), points[Math.min(1, n - 1)]);
      next = i < n - 1 ? points[i + 1] : sub(scale(p, 2), points[Math.max(n - 2, 0)]);
    }
    const auto = scale(sub(next, prev), tension / 3);
    return {
      handleIn: explicit[i]?.handleIn ?? scale(auto, -1),
      handleOut: explicit[i]?.handleOut ?? auto
    };
  });
}
var BezierCurve = class {
  constructor(points, handles, closed = false) {
    this.points = points;
    this.handles = handles;
    this.closed = closed;
    this.location = { index: 0, t: 0 };
    // Segment control points: the ends reference `points`, the two inner ones are
    // the handles added to them, built in scratch vectors.
    this.c1 = [0, 0, 0];
    this.c2 = [0, 0, 0];
    this.segmentCount = closed ? points.length : points.length - 1;
  }
  /** Resolves the current segment's control points into `c0..c3`; returns the local t. */
  controls(t) {
    const { index, t: s } = locateSegmentInto(t, this.segmentCount, this.location);
    const j = (index + 1) % this.points.length;
    const c0 = this.points[index];
    const c3 = this.points[j];
    const inner = this.handles[index].handleOut;
    const outer = this.handles[j].handleIn;
    set(this.c1, c0[0] + inner[0], c0[1] + inner[1], c0[2] + inner[2]);
    set(this.c2, c3[0] + outer[0], c3[1] + outer[1], c3[2] + outer[2]);
    return [c0, this.c1, this.c2, c3, s];
  }
  getPoint(t, out) {
    const [c0, c1, c2, c3, s] = this.controls(t);
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    return set(
      out ?? [0, 0, 0],
      a * c0[0] + b * c1[0] + c * c2[0] + d * c3[0],
      a * c0[1] + b * c1[1] + c * c2[1] + d * c3[1],
      a * c0[2] + b * c1[2] + c * c2[2] + d * c3[2]
    );
  }
  getDerivative(t, out) {
    const [c0, c1, c2, c3, s] = this.controls(t);
    const u = 1 - s;
    const a = 3 * u * u * this.segmentCount;
    const b = 6 * u * s * this.segmentCount;
    const c = 3 * s * s * this.segmentCount;
    return set(
      out ?? [0, 0, 0],
      a * (c1[0] - c0[0]) + b * (c2[0] - c1[0]) + c * (c3[0] - c2[0]),
      a * (c1[1] - c0[1]) + b * (c2[1] - c1[1]) + c * (c3[1] - c2[1]),
      a * (c1[2] - c0[2]) + b * (c2[2] - c1[2]) + c * (c3[2] - c2[2])
    );
  }
};

// src/core/curves/CatmullRomCurve.ts
var CatmullRomCurve = class {
  constructor(points, closed = false, tension = 0.5, parametrization = "uniform") {
    this.points = points;
    this.closed = closed;
    this.tension = tension;
    this.parametrization = parametrization;
    this.location = { index: 0, t: 0 };
    // Control points of the current segment: references to `points`, except the
    // extrapolated ends, which are built in the two scratch vectors.
    this.control = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    this.before = [0, 0, 0];
    this.after = [0, 0, 0];
    this.m1 = [0, 0, 0];
    this.m2 = [0, 0, 0];
    this.segmentCount = closed ? points.length : points.length - 1;
  }
  /** Fills `control` with the 4 control points of segment i (wrapped or extrapolated). */
  controls(i) {
    const pts = this.points;
    const n = pts.length;
    const at = (k) => {
      if (this.closed) return pts[(k % n + n) % n];
      if (k < 0) return extrapolate(pts[0], pts[1], this.before);
      if (k >= n) return extrapolate(pts[n - 1], pts[n - 2], this.after);
      return pts[k];
    };
    this.control[0] = at(i - 1);
    this.control[1] = at(i);
    this.control[2] = at(i + 1);
    this.control[3] = at(i + 2);
  }
  hermite(t, derivative, out) {
    const { index, t: s } = locateSegmentInto(t, this.segmentCount, this.location);
    this.controls(index);
    const [, p1, p2] = this.control;
    const [m1, m2] = this.tangents();
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = derivative ? 6 * s2 - 6 * s : 2 * s3 - 3 * s2 + 1;
    const h10 = derivative ? 3 * s2 - 4 * s + 1 : s3 - 2 * s2 + s;
    const h01 = derivative ? -6 * s2 + 6 * s : -2 * s3 + 3 * s2;
    const h11 = derivative ? 3 * s2 - 2 * s : s3 - s2;
    const f = derivative ? this.segmentCount : 1;
    const target = out ?? [0, 0, 0];
    for (let c = 0; c < 3; c++) target[c] = (h00 * p1[c] + h10 * m1[c] + h01 * p2[c] + h11 * m2[c]) * f;
    return target;
  }
  /**
   * Segment end tangents (in segment parameter units) for the control points
   * currently in `control`. Uniform: tension-scaled central differences.
   * Centripetal/chordal: the non-uniform Catmull-Rom of
   * THREE.CatmullRomCurve3, knots spaced by distance^0.5 / distance^1.
   */
  tangents() {
    const [p0, p1, p2, p3] = this.control;
    const { m1, m2 } = this;
    if (this.parametrization === "uniform") {
      const k = this.tension;
      set(m1, (p2[0] - p0[0]) * k, (p2[1] - p0[1]) * k, (p2[2] - p0[2]) * k);
      set(m2, (p3[0] - p1[0]) * k, (p3[1] - p1[1]) * k, (p3[2] - p1[2]) * k);
      return [m1, m2];
    }
    const power = this.parametrization === "chordal" ? 0.5 : 0.25;
    let dt1 = distanceSq(p1, p2) ** power;
    let dt0 = distanceSq(p0, p1) ** power;
    let dt2 = distanceSq(p2, p3) ** power;
    if (dt1 < 1e-4) dt1 = 1;
    if (dt0 < 1e-4) dt0 = dt1;
    if (dt2 < 1e-4) dt2 = dt1;
    for (let c = 0; c < 3; c++) {
      m1[c] = ((p1[c] - p0[c]) / dt0 - (p2[c] - p0[c]) / (dt0 + dt1) + (p2[c] - p1[c]) / dt1) * dt1;
      m2[c] = ((p2[c] - p1[c]) / dt1 - (p3[c] - p1[c]) / (dt1 + dt2) + (p3[c] - p2[c]) / dt2) * dt1;
    }
    return [m1, m2];
  }
  getPoint(t, out) {
    return this.hermite(t, false, out);
  }
  getDerivative(t, out) {
    return this.hermite(t, true, out);
  }
};
function extrapolate(end, inner, out) {
  return set(out, end[0] * 2 - inner[0], end[1] * 2 - inner[1], end[2] * 2 - inner[2]);
}
function distanceSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// src/core/curves/LinearCurve.ts
var LinearCurve = class {
  constructor(points, closed = false) {
    this.points = points;
    this.closed = closed;
    this.location = { index: 0, t: 0 };
    this.segmentCount = closed ? points.length : points.length - 1;
  }
  getPoint(t, out) {
    const { index, t: local } = locateSegmentInto(t, this.segmentCount, this.location);
    return lerp(this.points[index], this.points[(index + 1) % this.points.length], local, out);
  }
  getDerivative(t, out) {
    const { index } = locateSegmentInto(t, this.segmentCount, this.location);
    const a = this.points[index];
    const b = this.points[(index + 1) % this.points.length];
    const f = this.segmentCount;
    return set(out ?? [0, 0, 0], (b[0] - a[0]) * f, (b[1] - a[1]) * f, (b[2] - a[2]) * f);
  }
};

// src/core/curves/LinearHeightCurve.ts
var UP = 1;
var LinearHeightCurve = class {
  constructor(base, points) {
    this.base = base;
    this.points = points;
    this.location = { index: 0, t: 0 };
    this.segmentCount = base.segmentCount;
  }
  getPoint(t, out) {
    const point = this.base.getPoint(t, out);
    const { index, t: local } = locateSegmentInto(t, this.segmentCount, this.location);
    const a = this.points[index][UP];
    const b = this.points[(index + 1) % this.points.length][UP];
    point[UP] = a + (b - a) * local;
    return point;
  }
  getDerivative(t, out) {
    const derivative = this.base.getDerivative(t, out);
    const { index } = locateSegmentInto(t, this.segmentCount, this.location);
    const a = this.points[index][UP];
    const b = this.points[(index + 1) % this.points.length][UP];
    derivative[UP] = (b - a) * this.segmentCount;
    return derivative;
  }
};

// src/core/curves/index.ts
function createCurve(points, options, dimension = 3) {
  if (points.length === 0) return new PointCurve();
  const positions = points.map((p) => p.position);
  if (points.length === 1) return new PointCurve(positions[0]);
  const curve = buildCurve(positions, points, options);
  if (!options.linearHeight || dimension !== 3 || options.type === "linear") return curve;
  return new LinearHeightCurve(curve, positions);
}
function buildCurve(positions, points, options) {
  switch (options.type) {
    case "linear":
      return new LinearCurve(positions, options.closed);
    case "bezier":
      return new BezierCurve(
        positions,
        resolveBezierHandles(positions, points, options.closed, options.tension),
        options.closed
      );
    case "catmull-rom":
    default:
      return new CatmullRomCurve(positions, options.closed, options.tension, options.parametrization);
  }
}

// src/utils/id.ts
var counter = 0;
function createId(prefix = "path") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

// src/core/Path.ts
var DEFAULT_CURVE = { type: "catmull-rom", closed: false, tension: 0.5 };
var KNOWN_KEYS2 = /* @__PURE__ */ new Set(["id", "name", "kind", "dimension", "curve", "points", "metadata"]);
function normalizeCurveOptions(curve) {
  if (typeof curve === "string") return { ...DEFAULT_CURVE, type: curve };
  return { ...DEFAULT_CURVE, ...curve };
}
var _derivative = [0, 0, 0];
var _before = [0, 0, 0];
var _after = [0, 0, 0];
var Path = class _Path {
  constructor(options = {}) {
    this.events = new Emitter();
    this.waypoints = [];
    /** Unknown JSON keys, preserved on export. */
    this.extras = {};
    this._version = 0;
    this.cache = null;
    this.id = options.id ?? createId(options.kind === "marker" ? "marker" : "path");
    this.name = options.name;
    this.kind = options.kind === "marker" ? "marker" : "path";
    this.dimension = options.dimension === 2 ? 2 : 3;
    this.curve = normalizeCurveOptions(options.curve);
    this.metadata = options.metadata ? structuredCloneSafe(options.metadata) : {};
    for (const p of options.points ?? []) this.waypoints.push(this.toWaypoint(p));
  }
  /** True for a single named place rather than a route to travel. */
  get isMarker() {
    return this.kind === "marker";
  }
  /** Increments on every change. Useful for cheap dirty checks. */
  get version() {
    return this._version;
  }
  get length() {
    return this.getCache().table.totalLength;
  }
  get segmentCount() {
    return this.getCache().curve.segmentCount;
  }
  // ---------------------------------------------------------------- mutation
  /** Adds a waypoint at `index` (default: end). Returns the new waypoint. */
  addWaypoint(point, index = this.waypoints.length) {
    const wp = this.toWaypoint(point);
    this.waypoints.splice(clamp(Math.round(index), 0, this.waypoints.length), 0, wp);
    this.markChanged();
    return wp;
  }
  removeWaypoint(index) {
    if (index < 0 || index >= this.waypoints.length) return void 0;
    const [removed] = this.waypoints.splice(index, 1);
    this.markChanged();
    return removed;
  }
  moveWaypoint(index, position) {
    const wp = this.waypoints[index];
    if (!wp) return;
    wp.position = this.sanitize(toVec3(position));
    this.markChanged();
  }
  /** Sets explicit Bezier handles (relative to the waypoint). `null` restores auto. */
  setWaypointHandles(index, handles) {
    const wp = this.waypoints[index];
    if (!wp) return;
    if (handles.handleIn !== void 0) wp.handleIn = handles.handleIn ? this.sanitize(toVec3(handles.handleIn)) : null;
    if (handles.handleOut !== void 0) wp.handleOut = handles.handleOut ? this.sanitize(toVec3(handles.handleOut)) : null;
    this.markChanged();
  }
  /**
   * Sets per-waypoint speed multiplier, roll, yaw (all degrees for the angles)
   * or authored time. `null` clears the value back to its default (speed 1,
   * roll 0, no yaw, no time); `undefined` leaves it unchanged.
   */
  setWaypointProperties(index, props) {
    const wp = this.waypoints[index];
    if (!wp) return;
    for (const key of ["speed", "roll", "yaw", "time"]) {
      const value = props[key];
      if (value === void 0) continue;
      if (value === null || !Number.isFinite(value)) delete wp[key];
      else wp[key] = value;
    }
    this.markChanged();
  }
  /** Replaces the path's metadata (deep-copied). Undoable in the editor. */
  setMetadata(metadata) {
    this.metadata = structuredCloneSafe(metadata);
    this.markChanged();
  }
  /** Replaces a waypoint's metadata (deep-copied). Undoable in the editor. */
  setWaypointMetadata(index, metadata) {
    const wp = this.waypoints[index];
    if (!wp) return;
    wp.metadata = structuredCloneSafe(metadata);
    this.markChanged();
  }
  /** Moves the waypoint at `from` so it ends up at index `to`. */
  reorderWaypoint(from, to) {
    const n = this.waypoints.length;
    if (from < 0 || from >= n) return;
    const target = clamp(to, 0, n - 1);
    if (target === from) return;
    const [wp] = this.waypoints.splice(from, 1);
    this.waypoints.splice(target, 0, wp);
    this.markChanged();
  }
  /** Reverses travel direction (also swaps Bezier handles). */
  reverse() {
    this.waypoints.reverse();
    for (const wp of this.waypoints) [wp.handleIn, wp.handleOut] = [wp.handleOut, wp.handleIn];
    this.markChanged();
  }
  setCurve(options) {
    Object.assign(this.curve, typeof options === "string" ? { type: options } : options);
    this.markChanged();
  }
  /** Call after mutating waypoints or metadata directly. */
  markChanged() {
    this._version++;
    this.cache = null;
    this.events.emit("change", this);
  }
  // -------------------------------------------------------------- evaluation
  /**
   * Point at raw curve parameter t in [0, 1] (not constant speed).
   *
   * Every evaluator takes an optional output vector, writes into it and returns
   * it, so per-frame sampling allocates nothing. Without one it returns a new
   * vector.
   */
  getPoint(t, out) {
    return this.getCache().curve.getPoint(t, out);
  }
  /** Point at normalized arc length u in [0, 1] (constant speed). */
  getPointAt(u, out) {
    return this.getPointAtDistance(clamp(u, 0, 1) * this.length, out);
  }
  /** Unit tangent at normalized arc length u in [0, 1]. */
  getTangentAt(u, out) {
    return this.getTangentAtDistance(clamp(u, 0, 1) * this.length, out);
  }
  getPointAtDistance(d, out) {
    const { curve, table } = this.getCache();
    return curve.getPoint(table.tAtDistance(d), out);
  }
  getTangentAtDistance(d, out) {
    const { curve, table } = this.getCache();
    return this.tangentAtT(curve, table.tAtDistance(d), out);
  }
  /** Unit tangent at raw curve parameter t. */
  getTangent(t, out) {
    return this.tangentAtT(this.getCache().curve, t, out);
  }
  /** Samples the curve by parameter; hits every waypoint exactly. Good for rendering. */
  sample(divisionsPerSegment = 32) {
    const { curve } = this.getCache();
    if (curve.segmentCount === 0) return this.waypoints.length ? [curve.getPoint(0)] : [];
    const per = this.curve.type === "linear" ? 1 : Math.max(1, Math.floor(divisionsPerSegment));
    const total = curve.segmentCount * per;
    const out = [];
    for (let i = 0; i <= total; i++) out.push(curve.getPoint(i / total));
    return out;
  }
  /** `count` points evenly spaced by arc length (count >= 2). */
  getSpacedPoints(count) {
    const n = Math.max(2, Math.floor(count));
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.getPointAt(i / (n - 1)));
    return out;
  }
  /**
   * Index of the first waypoint whose `metadata.name` equals `target`, or that
   * the predicate accepts. -1 when there is none.
   */
  indexOfWaypoint(target) {
    const match = typeof target === "function" ? target : (w) => w.metadata.name === target;
    return this.waypoints.findIndex(match);
  }
  /**
   * Distance along the path of a waypoint, given by index or by
   * `metadata.name`. `undefined` when the path has no such waypoint.
   */
  distanceOfWaypoint(target) {
    const index = typeof target === "number" ? target : this.indexOfWaypoint(target);
    return index >= 0 ? this.getWaypointDistances()[index] : void 0;
  }
  /** Distance along the path at which each waypoint is located. */
  getWaypointDistances() {
    const cache = this.getCache();
    if (!cache.waypointDistances) {
      const segs = cache.curve.segmentCount;
      cache.waypointDistances = this.waypoints.map(
        (_, i) => segs === 0 ? 0 : cache.table.distanceAtT(Math.min(i / segs, 1))
      );
    }
    return cache.waypointDistances;
  }
  /**
   * The authored time span of this path, or null when fewer than two waypoints
   * carry a `time`. See `Waypoint.time`.
   */
  get timeRange() {
    const timeline = this.getTimeline();
    if (!timeline) return null;
    return { start: timeline.times[0], end: timeline.times[timeline.times.length - 1] };
  }
  /** Authored duration (`timeRange` end minus start), or 0 without a timeline. */
  get duration() {
    const range = this.timeRange;
    return range ? range.end - range.start : 0;
  }
  /**
   * Distance along the path at an authored time, interpolated linearly between
   * the waypoints that carry one and clamped to the ends. Without a timeline it
   * returns 0, so sample by distance or progress instead.
   */
  distanceAtTime(time) {
    const timeline = this.getTimeline();
    if (!timeline) return 0;
    return interpolateSorted(timeline.times, timeline.distances, time);
  }
  /** The authored time at a distance along the path; the inverse of `distanceAtTime`. */
  timeAtDistance(distance2) {
    const timeline = this.getTimeline();
    if (!timeline) return 0;
    return interpolateSorted(timeline.distances, timeline.times, distance2);
  }
  /** Point at an authored time. See `distanceAtTime`. */
  getPointAtTime(time, out) {
    return this.getPointAtDistance(this.distanceAtTime(time), out);
  }
  /** Unit tangent at an authored time. See `distanceAtTime`. */
  getTangentAtTime(time, out) {
    return this.getTangentAtDistance(this.distanceAtTime(time), out);
  }
  /** True if any waypoint defines `key` (speed or roll). */
  hasWaypointValues(key) {
    return this.waypoints.some((w) => w[key] !== void 0);
  }
  /**
   * Per-waypoint value (speed multiplier or roll in degrees) at a distance
   * along the path, blended between the surrounding waypoints. Waypoints
   * without the value use the default (speed 1, roll 0).
   */
  getWaypointValueAtDistance(key, d, interpolation = "smooth") {
    const fallback = key === "speed" ? 1 : 0;
    const pts = this.waypoints;
    const n = pts.length;
    const value = (i2) => pts[i2][key] ?? fallback;
    if (n === 0) return fallback;
    if (n === 1) return value(0);
    const ds = this.getWaypointDistances();
    const length2 = this.length;
    const x = clamp(d, 0, length2);
    let i = 0;
    while (i < n - 1 && ds[i + 1] <= x) i++;
    const last = i === n - 1;
    if (last && !this.curve.closed) return value(n - 1);
    const a = ds[i];
    const b = last ? length2 : ds[i + 1];
    const v0 = value(i);
    const v1 = value(last ? 0 : i + 1);
    if (interpolation === "step" || b <= a) return v0;
    let f = (x - a) / (b - a);
    if (interpolation === "smooth") f = f * f * (3 - 2 * f);
    return v0 + (v1 - v0) * f;
  }
  /**
   * Closest point on the curve to `point` (path space). Returns the curve
   * parameter t, normalized arc length u, the point and its distance.
   */
  getClosestPoint(point, samplesPerSegment = 64) {
    const { curve, table } = this.getCache();
    const target = this.sanitize(toVec3(point));
    if (curve.segmentCount === 0) {
      const p2 = curve.getPoint(0);
      return { t: 0, u: 0, point: p2, distance: distance(p2, target) };
    }
    const total = curve.segmentCount * samplesPerSegment;
    let bestT = 0;
    let best = Infinity;
    for (let k = 0; k <= total; k++) {
      const d = distance(curve.getPoint(k / total, _before), target);
      if (d < best) {
        best = d;
        bestT = k / total;
      }
    }
    let lo = Math.max(0, bestT - 1 / total);
    let hi = Math.min(1, bestT + 1 / total);
    for (let iter = 0; iter < 30; iter++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (distance(curve.getPoint(m1, _before), target) < distance(curve.getPoint(m2, _after), target)) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2;
    const p = curve.getPoint(t);
    const length2 = table.totalLength;
    return { t, u: length2 > 0 ? table.distanceAtT(t) / length2 : 0, point: p, distance: distance(p, target) };
  }
  /** Effective Bezier handles (explicit or auto) for a waypoint, relative to it. */
  getBezierHandles(index) {
    if (!this.waypoints[index]) return void 0;
    const positions = this.waypoints.map((w) => w.position);
    return resolveBezierHandles(positions, this.waypoints, this.curve.closed, this.curve.tension)[index];
  }
  // ------------------------------------------------------------ serialization
  clone(options = {}) {
    const copy2 = _Path.fromJSON(this.toJSON());
    if (options.id) copy2.id = options.id;
    return copy2;
  }
  toJSON() {
    const out = {
      ...structuredCloneSafe(this.extras),
      id: this.id,
      dimension: this.dimension,
      curve: { ...this.curve },
      points: this.waypoints.map((w) => w.toJSON(this.dimension)),
      metadata: structuredCloneSafe(this.metadata)
    };
    if (this.name !== void 0) out.name = this.name;
    if (this.kind !== "path") out.kind = this.kind;
    return out;
  }
  static fromJSON(data) {
    const path = new _Path({
      id: data.id,
      name: data.name,
      kind: data.kind,
      dimension: data.dimension,
      curve: data.curve,
      metadata: data.metadata,
      points: (data.points ?? []).map((p) => Waypoint.fromJSON(p))
    });
    path.extras = extrasOf(data);
    return path;
  }
  /**
   * Replaces this path's content with `data` in place, keeping the object
   * identity (used by undo/redo so followers keep working). The dimension
   * cannot change.
   */
  setData(data) {
    if ((data.dimension === 2 ? 2 : 3) !== this.dimension) {
      throw new Error(`Path.setData: dimension ${data.dimension} does not match ${this.dimension}.`);
    }
    this.id = data.id;
    this.name = data.name;
    this.kind = data.kind === "marker" ? "marker" : "path";
    for (const key of Object.keys(this.curve)) delete this.curve[key];
    Object.assign(this.curve, normalizeCurveOptions(data.curve));
    const points = (data.points ?? []).map((p) => this.toWaypoint(Waypoint.fromJSON(p)));
    this.waypoints.splice(0, this.waypoints.length, ...points);
    this.metadata = data.metadata ? structuredCloneSafe(data.metadata) : {};
    this.extras = extrasOf(data);
    this.markChanged();
  }
  // ---------------------------------------------------------------- internal
  toWaypoint(input) {
    let wp;
    if (input instanceof Waypoint) wp = input;
    else if (isWaypointInit(input)) wp = new Waypoint(input);
    else wp = new Waypoint({ position: input });
    wp.position = this.sanitize(wp.position);
    if (wp.handleIn) wp.handleIn = this.sanitize(wp.handleIn);
    if (wp.handleOut) wp.handleOut = this.sanitize(wp.handleOut);
    return wp;
  }
  sanitize(v) {
    return this.dimension === 2 ? [v[0], v[1], 0] : v;
  }
  /** Timed waypoints mapped to distances, cached per path version. */
  getTimeline() {
    const cache = this.getCache();
    if (cache.timeline === void 0) {
      const distances = this.getWaypointDistances();
      const times = [];
      const atDistance = [];
      this.waypoints.forEach((waypoint, index) => {
        const time = waypoint.time;
        if (typeof time !== "number" || !Number.isFinite(time)) return;
        times.push(times.length > 0 ? Math.max(time, times[times.length - 1]) : time);
        atDistance.push(distances[index]);
      });
      cache.timeline = times.length >= 2 ? { times, distances: atDistance } : null;
    }
    return cache.timeline;
  }
  getCache() {
    if (!this.cache || this.cache.version !== this._version) {
      const curve = createCurve(this.waypoints, this.curve, this.dimension);
      this.cache = { version: this._version, curve, table: new ArcLengthTable(curve) };
    }
    return this.cache;
  }
  tangentAtT(curve, t, out = [0, 0, 0]) {
    normalize(curve.getDerivative(t, _derivative), out);
    if (out[0] === 0 && out[1] === 0 && out[2] === 0) {
      const h = 1e-3;
      const a = curve.getPoint(clamp(t - h, 0, 1), _before);
      const b = curve.getPoint(clamp(t + h, 0, 1), _after);
      normalize(sub(b, a, _derivative), out);
    }
    if (Math.abs(out[0]) + Math.abs(out[1]) + Math.abs(out[2]) < EPSILON) {
      if (this.dimension === 2) set(out, 1, 0, 0);
      else set(out, 0, 0, 1);
    }
    return out;
  }
};
function interpolateSorted(from, to, value) {
  const last = from.length - 1;
  if (value <= from[0]) return to[0];
  if (value >= from[last]) return to[last];
  let lo = 0;
  let hi = last;
  while (lo < hi - 1) {
    const mid = lo + hi >> 1;
    if (from[mid] <= value) lo = mid;
    else hi = mid;
  }
  const span = from[hi] - from[lo];
  const f = span > 0 ? (value - from[lo]) / span : 0;
  return to[lo] + (to[hi] - to[lo]) * f;
}
function extrasOf(data) {
  const extras = {};
  for (const key of Object.keys(data)) if (!KNOWN_KEYS2.has(key)) extras[key] = structuredCloneSafe(data[key]);
  return extras;
}
function isWaypointInit(value) {
  return typeof value === "object" && value !== null && "position" in value;
}

// src/core/serialization.ts
var PATH_FORMAT_VERSION = 1;
var PathFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PathFormatError";
  }
};
function serializePaths(paths, extras = {}) {
  return {
    ...structuredCloneSafe(extras),
    version: PATH_FORMAT_VERSION,
    paths: [...paths].map((p) => p.toJSON())
  };
}
function stringifyPaths(paths, indent = 2, extras) {
  return JSON.stringify(serializePaths(paths, extras), null, indent);
}
function readPathFile(input) {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      throw new PathFormatError(`Invalid JSON: ${err.message}`);
    }
  }
  if (Array.isArray(raw)) raw = { version: PATH_FORMAT_VERSION, paths: raw };
  if (!isObject(raw)) throw new PathFormatError("Path file must be an object.");
  if (!("paths" in raw) && "points" in raw) raw = { version: PATH_FORMAT_VERSION, paths: [raw] };
  const file = migrate(raw);
  const { version, paths, ...extras } = file;
  if (!Array.isArray(paths)) throw new PathFormatError('"paths" must be an array.');
  const seen = /* @__PURE__ */ new Set();
  const parsed = paths.map((p, i) => {
    validatePathData(p, `paths[${i}]`);
    if (seen.has(p.id)) throw new PathFormatError(`Duplicate path id "${p.id}".`);
    seen.add(p.id);
    return Path.fromJSON(p);
  });
  return { version, paths: parsed, extras };
}
function parsePathFile(input) {
  return readPathFile(input).paths;
}
function getPathFromFile(input, id) {
  const path = parsePathFile(input).find((p) => p.id === id);
  if (!path) throw new PathFormatError(`Path "${id}" not found.`);
  return path;
}
function migrate(raw) {
  const version = raw.version === void 0 ? PATH_FORMAT_VERSION : raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PathFormatError(`Invalid version: ${String(raw.version)}`);
  }
  if (version > PATH_FORMAT_VERSION) {
    throw new PathFormatError(
      `Path file version ${version} is newer than supported version ${PATH_FORMAT_VERSION}. Update three-path-editor.`
    );
  }
  return { ...raw, version: PATH_FORMAT_VERSION };
}
function validatePathData(p, where) {
  if (!isObject(p)) throw new PathFormatError(`${where} must be an object.`);
  if (typeof p.id !== "string" || !p.id) throw new PathFormatError(`${where}.id must be a non-empty string.`);
  if (p.dimension !== 2 && p.dimension !== 3) throw new PathFormatError(`${where}.dimension must be 2 or 3.`);
  if (p.curve !== void 0) {
    if (!isObject(p.curve)) throw new PathFormatError(`${where}.curve must be an object.`);
    const type = p.curve.type;
    if (type !== "linear" && type !== "catmull-rom" && type !== "bezier") {
      throw new PathFormatError(`${where}.curve.type must be "linear", "catmull-rom" or "bezier".`);
    }
    const parametrization = p.curve.parametrization;
    if (parametrization !== void 0 && parametrization !== "uniform" && parametrization !== "centripetal" && parametrization !== "chordal") {
      throw new PathFormatError(`${where}.curve.parametrization must be "uniform", "centripetal" or "chordal".`);
    }
  }
  if (!Array.isArray(p.points)) throw new PathFormatError(`${where}.points must be an array.`);
  p.points.forEach((pt, j) => {
    const at = `${where}.points[${j}]`;
    if (!isObject(pt)) throw new PathFormatError(`${at} must be an object.`);
    for (const key of ["position", "handleIn", "handleOut"]) {
      const v = pt[key];
      if (key !== "position" && v === void 0) continue;
      if (!Array.isArray(v) || v.length < 2 || v.length > 3 || !v.every((n) => typeof n === "number" && Number.isFinite(n))) {
        throw new PathFormatError(`${at}.${key} must be an array of 2 or 3 finite numbers.`);
      }
    }
    for (const key of ["speed", "roll"]) {
      const v = pt[key];
      if (v !== void 0 && (typeof v !== "number" || !Number.isFinite(v))) {
        throw new PathFormatError(`${at}.${key} must be a finite number.`);
      }
    }
    if (pt.metadata !== void 0 && !isObject(pt.metadata)) throw new PathFormatError(`${at}.metadata must be an object.`);
  });
  if (p.metadata !== void 0 && !isObject(p.metadata)) throw new PathFormatError(`${where}.metadata must be an object.`);
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/core/visuals.ts
var VISUALS_FORMAT_VERSION = 1;
var VisualsFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "VisualsFormatError";
  }
};
function serializeVisuals(subjects, options = {}) {
  const file = {
    ...clone2(options.extras ?? {}),
    version: VISUALS_FORMAT_VERSION,
    subjects: [...subjects].map((subject) => ({ ...clone2(subject), id: subject.id, worn: [...subject.worn] }))
  };
  if (options.source) file.source = options.source;
  return file;
}
function stringifyVisuals(subjects, indent = 2, options) {
  return JSON.stringify(serializeVisuals(subjects, options), null, indent) + "\n";
}
function readVisualsFile(input) {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      throw new VisualsFormatError(`Invalid JSON: ${err.message}`);
    }
  }
  if (!isObject2(raw)) throw new VisualsFormatError("A visuals file must be an object.");
  const { version, source, subjects, ...extras } = migrate2(raw);
  if (!Array.isArray(subjects)) throw new VisualsFormatError('"subjects" must be an array.');
  if (source !== void 0 && typeof source !== "string") {
    throw new VisualsFormatError('"source" must be a string.');
  }
  const seen = /* @__PURE__ */ new Set();
  const parsed = subjects.map((subject, index) => {
    const where = `subjects[${index}]`;
    if (!isObject2(subject)) throw new VisualsFormatError(`${where} must be an object.`);
    const { id, worn } = subject;
    if (typeof id !== "string" || id === "") throw new VisualsFormatError(`${where}.id must be a non-empty string.`);
    if (seen.has(id)) throw new VisualsFormatError(`Duplicate subject id "${id}".`);
    seen.add(id);
    if (!Array.isArray(worn) || worn.some((name) => typeof name !== "string")) {
      throw new VisualsFormatError(`${where}.worn must be an array of mesh set names.`);
    }
    return { ...clone2(subject), id, worn: [...worn] };
  });
  return {
    version: typeof version === "number" ? version : VISUALS_FORMAT_VERSION,
    source: typeof source === "string" ? source : null,
    subjects: parsed,
    extras: clone2(extras)
  };
}
function wornOf(file, id) {
  return file.subjects.find((subject) => subject.id === id)?.worn ?? null;
}
function emptyVisualsFile(source) {
  return serializeVisuals([], { source });
}
function migrate2(file) {
  const version = typeof file.version === "number" ? file.version : VISUALS_FORMAT_VERSION;
  if (version > VISUALS_FORMAT_VERSION) {
    throw new VisualsFormatError(
      `Visuals file version ${version} is newer than this package supports (${VISUALS_FORMAT_VERSION}).`
    );
  }
  return file;
}
function isObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function clone2(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export { ArcLengthTable, BezierCurve, CatmullRomCurve, DEFAULT_CURVE, Emitter, LinearCurve, LinearHeightCurve, PATH_FORMAT_VERSION, Path, PathFormatError, PointCurve, VISUALS_FORMAT_VERSION, VisualsFormatError, Waypoint, add, clamp, createCurve, distance, emptyVisualsFile, getPathFromFile, length, lerp, locateSegment, locateSegmentInto, normalize, normalizeCurveOptions, parsePathFile, readPathFile, readVisualsFile, resolveBezierHandles, scale, serializePaths, serializeVisuals, set, stringifyPaths, stringifyVisuals, structuredCloneSafe, sub, toVec3, vec3_exports, wornOf, wrap };
