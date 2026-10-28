import { PathCursor, defaultCoordinateSystem } from './chunk-EA5W2OPP.js';
import { Emitter, clamp, wrap } from './chunk-PRIBWOOI.js';
import { Matrix4, Vector3, Quaternion, Euler, Mesh } from 'three';

var _basis = new Matrix4();
var _f = new Vector3();
var _r = new Vector3();
var _u = new Vector3();
var _roll = new Quaternion();
var _frame = new Quaternion();
var _heading = new Vector3();
var Orienter = class {
  constructor(options = {}) {
    /** inverse(model basis) * offset, precomputed. */
    this.modelCorrection = new Quaternion();
    this.modelCorrectionInverse = new Quaternion();
    /** Yaw reference axes: the plane orthogonal to `worldUp`, yaw 0 along `zero`. */
    this.zero = new Vector3();
    this.quarter = new Vector3();
    this.enabled = options.enabled ?? true;
    this.smoothing = options.smoothing ?? 0;
    this.yawOnly = options.yawOnly ?? false;
    this.applyRoll = options.applyRoll ?? true;
    this.rollScale = options.rollScale ?? 1;
    this.worldUp = new Vector3(...options.worldUp ?? [0, 1, 0]).normalize();
    const fm = new Vector3(...options.forward ?? [0, 0, 1]).normalize();
    const um = new Vector3(...options.up ?? [0, 1, 0]);
    const rm = new Vector3().crossVectors(um, fm);
    if (rm.lengthSq() < 1e-12) throw new Error("Orientation: `forward` and `up` must not be parallel.");
    rm.normalize();
    um.crossVectors(fm, rm);
    const modelQ = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(rm, um, fm));
    this.modelCorrection.copy(modelQ).invert();
    if (options.offset) {
      const offsetQ = new Quaternion().setFromEuler(new Euler(...options.offset));
      this.modelCorrection.multiply(offsetQ);
    }
    this.modelCorrectionInverse.copy(this.modelCorrection).invert();
    this.zero.set(0, 0, 1);
    if (Math.abs(this.zero.dot(this.worldUp)) > 0.99) this.zero.set(1, 0, 0);
    this.zero.addScaledVector(this.worldUp, -this.zero.dot(this.worldUp)).normalize();
    this.quarter.crossVectors(this.worldUp, this.zero).normalize();
  }
  /**
   * Heading of a rotation around `worldUp`, in radians, as `yawTo` takes it.
   * Use it instead of reading `object.rotation.y`, which is mirrored for
   * headings outside ±90° (see `yawOnly`).
   */
  yawOf(rotation) {
    _frame.copy(rotation).multiply(this.modelCorrectionInverse);
    _heading.set(0, 0, 1).applyQuaternion(_frame);
    return Math.atan2(_heading.dot(this.quarter), _heading.dot(this.zero));
  }
  /**
   * Writes the rotation for a heading around `worldUp` into `target`, the
   * inverse of `yawOf`. Returns false when the heading is degenerate.
   */
  yawTo(yaw, target) {
    _heading.copy(this.zero).multiplyScalar(Math.cos(yaw)).addScaledVector(this.quarter, Math.sin(yaw));
    return this.compute(_heading, target);
  }
  /**
   * Writes the target world rotation for a travel direction into `target`.
   * Returns false (leaving `target` untouched) when the direction is degenerate,
   * e.g. zero length or parallel to worldUp.
   *
   * `roll` (radians) banks around the travel direction; positive banks right
   * (the object's right side goes down).
   */
  compute(direction, target, roll = 0) {
    _f.copy(direction);
    if (this.yawOnly) _f.addScaledVector(this.worldUp, -_f.dot(this.worldUp));
    if (_f.lengthSq() < 1e-12) return false;
    _f.normalize();
    _r.crossVectors(this.worldUp, _f);
    if (_r.lengthSq() < 1e-12) return false;
    _r.normalize();
    _u.crossVectors(_f, _r);
    target.setFromRotationMatrix(_basis.makeBasis(_r, _u, _f)).multiply(this.modelCorrection);
    if (roll !== 0) target.premultiply(_roll.setFromAxisAngle(_f, roll));
    return true;
  }
};

// src/runtime/FollowerRider.ts
var FollowerRider = class {
  constructor(options, fallback) {
    /** @internal Current rotation, in the object's own frame. */
    this.rotation = new Quaternion();
    /** @internal Whether `rotation` holds a pose smoothing can ease from. */
    this.hasRotation = false;
    this.object = options.object;
    this.offset = options.offset ?? 0;
    this.lateral = options.lateral ?? [0, 0];
    const orientation = options.orientation;
    this.orienter = orientation === void 0 && fallback ? fallback : new Orienter(typeof orientation === "object" ? orientation : { enabled: orientation !== false });
  }
  /**
   * Seeds the rotation smoothing eases from, in the object's own frame.
   * Without it the first frame snaps onto the path's heading.
   */
  seedRotation(rotation) {
    this.rotation.copy(rotation);
    this.hasRotation = true;
    return this;
  }
};

// src/runtime/PathFollower.ts
var _pos = new Vector3();
var _local = new Vector3();
var _dir = new Vector3();
var _right = new Vector3();
var _q = new Quaternion();
var _parentQ = new Quaternion();
var _point = [0, 0, 0];
var _world = [0, 0, 0];
var PathFollower = class {
  constructor(options) {
    this.riderList = [];
    // Leader first, then riders: iterated every frame, so it is kept as a plain
    // array rather than rebuilt per call.
    this.posed = [];
    this.ownEvents = new Emitter();
    this.entry = null;
    this.object = options.object;
    this.cursor = new PathCursor(options);
    this.lead = new FollowerRider({ object: options.object, orientation: options.orientation });
    this.posed.push(this.lead);
    this.coordinates = options.coordinates ?? defaultCoordinateSystem;
    this.space = options.space ?? "world";
    this.faceTravelDirection = options.faceTravelDirection ?? true;
    this.positionOffset = new Vector3(...options.positionOffset ?? [0, 0, 0]);
    const seed = options.initialRotation === "object" ? options.object.quaternion.clone() : null;
    this.start(options.startFrom ?? "path");
    if (seed) this.seedRotation(seed);
    for (const rider of options.riders ?? []) this.addRider(rider);
    if (options.onProgress) this.on("progress", options.onProgress);
    if (options.onWaypoint) this.on("waypoint", options.onWaypoint);
    if (options.onLoop) this.on("loop", options.onLoop);
    if (options.onComplete) this.on("complete", options.onComplete);
    if (options.onPlay) this.on("play", options.onPlay);
    if (options.onPause) this.on("pause", options.onPause);
    if (options.onReset) this.on("reset", options.onReset);
    if (options.onEnter) this.on("enter", options.onEnter);
  }
  /** The leader's orientation settings (shared by riders that don't bring their own). */
  get orienter() {
    return this.lead.orienter;
  }
  // Cursor passthroughs -------------------------------------------------------
  get path() {
    return this.cursor.path;
  }
  get speed() {
    return this.cursor.speed;
  }
  set speed(value) {
    this.cursor.speed = value;
  }
  get loop() {
    return this.cursor.loop;
  }
  set loop(value) {
    this.cursor.loop = value;
  }
  get progress() {
    return this.cursor.progress;
  }
  get distance() {
    return this.cursor.distance;
  }
  get direction() {
    return this.cursor.direction;
  }
  get isPlaying() {
    return this.cursor.playing;
  }
  /** Current speed in units/second, including waypoint speed multipliers. */
  get currentSpeed() {
    return this.cursor.currentSpeed;
  }
  /** Current roll in degrees (from waypoint roll values). */
  get currentRoll() {
    return this.rollAt(this.cursor.distance);
  }
  get isComplete() {
    return this.cursor.complete;
  }
  set speedModifier(fn) {
    this.cursor.speedModifier = fn;
  }
  /** True while the object is still running its lead-in leg onto the path. */
  get isEntering() {
    return this.entry !== null;
  }
  /**
   * Subscribes to a follower event (the cursor's progress, waypoint, loop,
   * complete, play, pause, reset, plus the follower's own enter). Returns an
   * unsubscribe function.
   */
  on(type, listener) {
    if (type === "enter") return this.ownEvents.on("enter", listener);
    const events = this.cursor.events;
    return events.on(type, listener);
  }
  /**
   * Subscribes until the first event `filter` accepts, then unsubscribes, e.g.
   * the next time a named waypoint is reached:
   * `follower.once('waypoint', run, (e) => e.waypoint.metadata.name === 'gate')`.
   */
  once(type, listener, filter) {
    const off = this.on(type, (payload) => {
      if (filter && !filter(payload)) return;
      off();
      listener(payload);
    });
    return off;
  }
  play() {
    this.cursor.play();
    return this;
  }
  pause() {
    this.cursor.pause();
    return this;
  }
  /** Back to the start and snap the object there. Drops a pending lead-in. */
  reset() {
    this.cursor.reset();
    this.entry = null;
    for (const target of this.posed) target.hasRotation = false;
    this.apply();
    return this;
  }
  /** Jump to normalized progress [0, 1] and apply immediately. */
  setProgress(progress, options) {
    this.cursor.seekProgress(progress, options);
    this.apply();
    return this;
  }
  setDistance(distance, options) {
    this.cursor.seek(distance, options);
    this.apply();
    return this;
  }
  /**
   * Jump to a waypoint, by index or `metadata.name`. Returns false (and moves
   * nothing) when the path has no such waypoint. Pass
   * `{ emitWaypoints: true }` to let listeners hear about the points skipped.
   */
  setWaypoint(target, options) {
    if (!this.cursor.seekWaypoint(target, options)) return false;
    this.apply();
    return true;
  }
  /**
   * Jump to an authored time on the path (see `Waypoint.time`). Returns false
   * when the path has no timeline. Two paths authored with the same times stay
   * in step when both are sampled at the same time.
   */
  setTime(time, options) {
    if (!this.cursor.seekTime(time, options)) return false;
    this.apply();
    return true;
  }
  /** The authored time the follower currently sits at. See `Waypoint.time`. */
  get time() {
    return this.cursor.time;
  }
  /** See `PathCursor.hasPassed`. */
  hasPassed(target) {
    return this.cursor.hasPassed(target);
  }
  setPath(path) {
    this.cursor.setPath(path);
    this.apply();
    return this;
  }
  /**
   * Heading of the object around the orientation's world up, in radians, as
   * `setYaw` takes it. Read this instead of `object.rotation.y`, which is
   * mirrored for headings outside ±90°.
   */
  get yaw() {
    return this.orienter.yawOf(this.object.quaternion);
  }
  /** Faces the object at `yaw` (radians) and lets smoothing ease on from there. */
  setYaw(yaw) {
    if (!this.orienter.yawTo(yaw, _q)) return this;
    const parent = this.space === "world" ? this.object.parent : null;
    if (parent) _q.premultiply(parent.getWorldQuaternion(_parentQ).invert());
    this.lead.seedRotation(_q);
    this.object.quaternion.copy(_q);
    return this;
  }
  /**
   * Sets the rotation smoothing eases on from, and puts the object there.
   * Without it the first frame snaps onto the path's heading.
   */
  seedRotation(rotation) {
    this.lead.seedRotation(rotation);
    this.object.quaternion.copy(this.lead.rotation);
    return this;
  }
  // Riders --------------------------------------------------------------------
  /**
   * Carries another object along the same path at an offset (convoy, flock,
   * trailing camera). Riders share this follower's cursor, so speed, loops and
   * events are integrated once.
   */
  addRider(options) {
    const rider = new FollowerRider(options, this.lead.orienter);
    this.riderList.push(rider);
    this.posed.push(rider);
    return rider;
  }
  removeRider(rider) {
    const index = this.riderList.indexOf(rider);
    if (index >= 0) this.riderList.splice(index, 1);
    const posedIndex = this.posed.indexOf(rider);
    if (posedIndex >= 0) this.posed.splice(posedIndex, 1);
  }
  get riders() {
    return this.riderList;
  }
  /** Advance by `dt` seconds and write the pose to the object(s). */
  update(dt) {
    let travel = dt;
    if (this.entry) {
      travel = this.advanceEntry(dt);
      if (this.entry) {
        this.apply(dt);
        return this;
      }
    }
    this.cursor.advance(travel);
    this.apply(dt);
    return this;
  }
  /** Writes the current pose to the object(s) without advancing. */
  apply(dt = 0) {
    if (this.cursor.path.waypoints.length === 0) return this;
    const entry = this.entry;
    for (let i = 0; i < this.posed.length; i++) {
      const target = this.posed[i];
      if (entry) this.applyEntry(target, entry, dt);
      else this.applyPath(target, dt);
    }
    return this;
  }
  /** Removes event listeners and riders. Does not touch the objects. */
  dispose() {
    this.cursor.events.clear();
    this.ownEvents.clear();
    this.riderList.length = 0;
    this.posed.length = 1;
  }
  // Internal ------------------------------------------------------------------
  start(from) {
    if (from === "path") {
      this.apply();
      return;
    }
    const path = this.cursor.path;
    this.object.getWorldPosition(_pos);
    if (from === "closest") {
      if (path.waypoints.length > 0) {
        _pos.sub(this.positionOffset).toArray(_world);
        this.cursor.seekProgress(path.getClosestPoint(this.coordinates.toPath(_world, path.dimension, _point)).u);
      }
      this.apply();
      return;
    }
    const to = new Vector3();
    if (path.waypoints.length > 0) {
      to.fromArray(this.coordinates.toWorld(path.getPointAtDistance(this.cursor.distance, _point), path.dimension, _world)).add(this.positionOffset);
    }
    const length = _pos.distanceTo(to);
    if (length > 1e-6) this.entry = { from: _pos.clone(), to, length, travelled: 0 };
    this.apply();
  }
  /** Advances the lead-in; returns the time left over once it reaches the path. */
  advanceEntry(dt) {
    const entry = this.entry;
    if (!this.cursor.playing || dt <= 0) return 0;
    const speed = this.cursor.currentSpeed;
    entry.travelled += speed * dt;
    if (entry.travelled < entry.length) return 0;
    const overshoot = entry.travelled - entry.length;
    this.entry = null;
    this.ownEvents.emit("enter", { distance: this.cursor.distance });
    return speed > 0 ? Math.min(overshoot / speed, dt) : 0;
  }
  applyEntry(target, entry, dt) {
    const along = clamp(entry.travelled - target.offset, 0, entry.length);
    _pos.lerpVectors(entry.from, entry.to, entry.length > 0 ? along / entry.length : 1).add(this.positionOffset);
    _dir.subVectors(entry.to, entry.from);
    this.offsetLaterally(target, _pos, _dir);
    this.writePose(target, _pos, _dir, target.orienter.enabled, 0, dt);
  }
  applyPath(target, dt) {
    const path = this.cursor.path;
    const d = this.distanceFor(target.offset);
    _pos.fromArray(this.coordinates.toWorld(path.getPointAtDistance(d, _point), path.dimension, _world)).add(this.positionOffset);
    const orient = target.orienter.enabled && path.waypoints.length > 1;
    const lateral = target.lateral[0] !== 0 || target.lateral[1] !== 0;
    let roll = 0;
    if (orient || lateral) {
      _dir.fromArray(this.coordinates.directionToWorld(path.getTangentAtDistance(d, _point), path.dimension, _world));
      const backwards = this.faceTravelDirection && this.cursor.direction < 0;
      if (backwards) _dir.negate();
      roll = this.rollAt(d) * Math.PI / 180 * (backwards ? -1 : 1);
      this.offsetLaterally(target, _pos, _dir);
    }
    this.writePose(target, _pos, _dir, orient, roll, dt);
  }
  /** Writes a world position and heading onto the target, in its own frame. */
  writePose(target, position, direction, orient, roll, dt) {
    const object = target.object;
    const parent = this.space === "world" ? object.parent : null;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      object.position.copy(parent.worldToLocal(_local.copy(position)));
    } else {
      object.position.copy(position);
    }
    if (!orient || !target.orienter.compute(direction, _q, roll)) return;
    if (parent) _q.premultiply(parent.getWorldQuaternion(_parentQ).invert());
    const smoothing = target.orienter.smoothing;
    if (smoothing > 0 && target.hasRotation && dt > 0) {
      target.rotation.slerp(_q, 1 - Math.exp(-smoothing * dt));
    } else {
      target.rotation.copy(_q);
    }
    target.hasRotation = true;
    object.quaternion.copy(target.rotation);
  }
  offsetLaterally(target, position, direction) {
    const [right, up] = target.lateral;
    if (right === 0 && up === 0) return;
    const worldUp = target.orienter.worldUp;
    _right.crossVectors(worldUp, direction);
    if (_right.lengthSq() > 1e-12) position.addScaledVector(_right.normalize(), right);
    position.addScaledVector(worldUp, up);
  }
  /** Where a target sits on the path: `offset` units behind the leader. */
  distanceFor(offset) {
    if (offset === 0) return this.cursor.distance;
    const length = this.cursor.path.length;
    const d = this.cursor.distance - this.cursor.direction * offset;
    return this.cursor.loop === "loop" && length > 0 ? wrap(d, length) : clamp(d, 0, length);
  }
  rollAt(distance) {
    const o = this.lead.orienter;
    const path = this.cursor.path;
    if (!o.applyRoll || !path.hasWaypointValues("roll")) return 0;
    return path.getWaypointValueAtDistance("roll", distance, this.cursor.interpolation) * o.rollScale;
  }
};
function meshSetsOf(object) {
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  forEachSetMesh(object, (mesh) => {
    if (seen.has(mesh.name)) return;
    seen.add(mesh.name);
    names.push(mesh.name);
  });
  return names;
}
function applyVisuals(object, worn) {
  const wanted = new Set(worn);
  const applied = /* @__PURE__ */ new Set();
  forEachSetMesh(object, (mesh) => {
    const visible = wanted.has(mesh.name);
    mesh.visible = visible;
    if (visible) applied.add(mesh.name);
  });
  return {
    applied: [...applied],
    missing: [...wanted].filter((name) => !applied.has(name))
  };
}
function forEachSetMesh(object, visit) {
  object.traverse((child) => {
    if (child instanceof Mesh && child.name !== "" && child.userData.pathEditor !== true) visit(child);
  });
}

export { FollowerRider, Orienter, PathFollower, applyVisuals, forEachSetMesh, meshSetsOf };
