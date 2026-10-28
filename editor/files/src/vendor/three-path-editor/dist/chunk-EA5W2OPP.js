import { set, Emitter, clamp } from './chunk-PRIBWOOI.js';

// src/core/PathCursor.ts
var MIN_WAYPOINT_SPEED = 0.01;
var MAX_SUBSTEP = 1 / 60;
var DISTANCE_EPSILON = 1e-9;
var PathCursor = class {
  constructor(options) {
    this.events = new Emitter();
    this.loopCount = 0;
    this._distance = 0;
    this._complete = false;
    this.path = options.path;
    this.speed = options.speed ?? 1;
    this.loop = options.loop === true ? "loop" : options.loop === false || options.loop === void 0 ? "none" : options.loop;
    this.direction = options.direction ?? 1;
    this.startDirection = this.direction;
    this.speedModifier = options.speedModifier;
    this.useWaypointSpeed = options.useWaypointSpeed ?? true;
    this.interpolation = options.interpolation ?? "smooth";
    this._playing = options.autoPlay ?? true;
    this.startProgress = options.startProgress ?? (this.direction === 1 ? 0 : 1);
    this._distance = clamp(this.startProgress, 0, 1) * this.path.length;
  }
  get distance() {
    return clamp(this._distance, 0, this.path.length);
  }
  set distance(value) {
    this._distance = clamp(value, 0, this.path.length);
    this._complete = false;
  }
  /** Normalized progress in [0, 1]. */
  get progress() {
    const length = this.path.length;
    return length > 0 ? this.distance / length : 0;
  }
  set progress(value) {
    this.distance = clamp(value, 0, 1) * this.path.length;
  }
  get playing() {
    return this._playing;
  }
  get complete() {
    return this._complete;
  }
  /** Starts moving. A completed cursor restarts from the beginning. Emits `play` if it was stopped. */
  play() {
    if (this._complete) this.reset();
    if (this._playing) return;
    this._playing = true;
    this.events.emit("play", void 0);
  }
  /** Stops moving. Emits `pause` if it was playing. */
  pause() {
    if (!this._playing) return;
    this._playing = false;
    this.events.emit("pause", void 0);
  }
  /** Back to the start position and direction. Keeps play state. Emits `reset`. */
  reset() {
    this.direction = this.startDirection;
    this.loopCount = 0;
    this._complete = false;
    this._distance = clamp(this.startProgress, 0, 1) * this.path.length;
    this.events.emit("reset", void 0);
  }
  /**
   * Jumps to a distance along the path. With `emitWaypoints` the waypoints
   * between the old and the new position are emitted, in travel order.
   */
  seek(distance, options = {}) {
    const from = this._distance;
    this.distance = distance;
    if (options.emitWaypoints) this.emitCrossings(from, this._distance);
    return this;
  }
  /** Jumps to normalized progress [0, 1]. See `seek`. */
  seekProgress(progress, options) {
    return this.seek(clamp(progress, 0, 1) * this.path.length, options);
  }
  /**
   * Jumps to an authored time on the path (see `Waypoint.time`). Returns false
   * (and does nothing) when the path has no timeline. See `seek`.
   */
  seekTime(time, options) {
    if (!this.path.timeRange) return false;
    this.seek(this.path.distanceAtTime(time), options);
    return true;
  }
  /** The authored time the cursor currently sits at, or 0 without a timeline. */
  get time() {
    return this.path.timeAtDistance(this.distance);
  }
  /**
   * Jumps to a waypoint, by index or `metadata.name`. Returns false (and does
   * nothing) when the path has no such waypoint. See `seek`.
   */
  seekWaypoint(target, options) {
    const distance = this.path.distanceOfWaypoint(target);
    if (distance === void 0) return false;
    this.seek(distance, options);
    return true;
  }
  /**
   * True when the cursor sits at or beyond a waypoint in its current travel
   * direction. It describes the current position, not history: a loop or a
   * backward seek makes it false again.
   */
  hasPassed(target) {
    const distance = this.path.distanceOfWaypoint(target);
    if (distance === void 0) return false;
    return this.direction > 0 ? this.distance >= distance - DISTANCE_EPSILON : this.distance <= distance + DISTANCE_EPSILON;
  }
  /** Switches path while keeping normalized progress. */
  setPath(path) {
    const progress = this.progress;
    this.path = path;
    this._distance = progress * path.length;
  }
  /** Current speed in units/second (base speed × modifier × waypoint speed). */
  get currentSpeed() {
    return Math.abs(this.speed * this.multiplierAt());
  }
  /** Advances by `dt` seconds. Returns true if the cursor moved. */
  advance(dt) {
    const length = this.path.length;
    if (!this._playing || this._complete || length <= 0 || dt <= 0) return false;
    this._distance = clamp(this._distance, 0, length);
    const variable = this.useWaypointSpeed && this.path.hasWaypointValues("speed");
    const steps = variable ? Math.min(Math.ceil(dt / MAX_SUBSTEP), 600) : 1;
    const h = dt / steps;
    let moved = false;
    for (let i = 0; i < steps && this._playing && !this._complete; i++) {
      const step = Math.abs(this.speed * this.multiplierAt() * h);
      if (step > 0) moved = this.move(step, length) || moved;
    }
    if (!moved) return false;
    if (!this._complete) this.emitProgress();
    return true;
  }
  multiplierAt() {
    let m = this.speedModifier ? this.speedModifier({ path: this.path, progress: this.progress, distance: this.distance, direction: this.direction }) : 1;
    if (this.useWaypointSpeed && this.path.hasWaypointValues("speed")) {
      m *= Math.max(MIN_WAYPOINT_SPEED, this.path.getWaypointValueAtDistance("speed", this.distance, this.interpolation));
    }
    return m;
  }
  /** Moves `amount` along the path, handling ends/loops. Emits complete. */
  move(amount, length) {
    let remaining = amount;
    for (let guard = 0; remaining > 0 && guard < 1e4; guard++) {
      const end = this.direction > 0 ? length : 0;
      const room = Math.abs(end - this._distance);
      if (remaining < room) {
        const from = this._distance;
        this._distance += this.direction * remaining;
        this.emitCrossings(from, this._distance);
        break;
      }
      this.emitCrossings(this._distance, end);
      this._distance = end;
      remaining -= room;
      if (this.loop === "none") {
        this._complete = true;
        this._playing = false;
        this.emitProgress();
        this.events.emit("complete", void 0);
        if (!this._playing) this.events.emit("pause", void 0);
        return true;
      }
      this.loopCount++;
      if (this.loop === "loop") {
        this._distance = this.direction > 0 ? 0 : length;
        this.emitAt(this._distance);
      } else {
        this.direction = this.direction > 0 ? -1 : 1;
      }
      this.events.emit("loop", { count: this.loopCount, direction: this.direction });
    }
    return true;
  }
  emitProgress() {
    this.events.emit("progress", { progress: this.progress, distance: this.distance });
  }
  /** Emits 'waypoint' for waypoints in (from, to] (forward) or [to, from) (backward). */
  emitCrossings(from, to) {
    const distances = this.path.getWaypointDistances();
    const eps = DISTANCE_EPSILON;
    const forward = to >= from;
    const n = distances.length;
    for (let k = 0; k < n; k++) {
      const i = forward ? k : n - 1 - k;
      const d = distances[i];
      const crossed = forward ? d > from + eps && d <= to + eps : d < from - eps && d >= to - eps;
      if (crossed) this.emitWaypoint(i, d);
    }
  }
  emitAt(position) {
    const distances = this.path.getWaypointDistances();
    for (let i = 0; i < distances.length; i++) {
      if (Math.abs(distances[i] - position) < DISTANCE_EPSILON) this.emitWaypoint(i, distances[i]);
    }
  }
  emitWaypoint(index, distance) {
    this.events.emit("waypoint", { index, waypoint: this.path.waypoints[index], distance });
  }
};

// src/core/coordinates.ts
function createCoordinateSystem(options = {}) {
  const plane = options.plane2D ?? "xz";
  const elevation = options.elevation2D ?? 0;
  const origin = options.origin ?? [0, 0, 0];
  const s = options.scale ?? 1;
  const dirToWorld = (d, dim, out) => {
    const target = out ?? [0, 0, 0];
    if (dim === 3) return set(target, d[0] * s, d[1] * s, d[2] * s);
    return plane === "xz" ? set(target, d[0] * s, 0, d[1] * s) : set(target, d[0] * s, d[1] * s, 0);
  };
  return {
    planeNormal: plane === "xz" ? [0, 1, 0] : [0, 0, 1],
    directionToWorld: dirToWorld,
    toWorld(p, dim, out) {
      const target = dirToWorld(p, dim, out);
      set(target, origin[0] + target[0], origin[1] + target[1], origin[2] + target[2]);
      if (dim === 2) target[plane === "xz" ? 1 : 2] += elevation;
      return target;
    },
    toPath(w, dim, out) {
      const x = (w[0] - origin[0]) / s;
      const y = (w[1] - origin[1]) / s;
      const z = (w[2] - origin[2]) / s;
      const target = out ?? [0, 0, 0];
      if (dim === 3) return set(target, x, y, z);
      return plane === "xz" ? set(target, x, z, 0) : set(target, x, y, 0);
    }
  };
}
var defaultCoordinateSystem = createCoordinateSystem();

export { MIN_WAYPOINT_SPEED, PathCursor, createCoordinateSystem, defaultCoordinateSystem };
