import { Vector3, MathUtils } from 'three';
import { ANY, RayHit } from '../physics/CollisionWorld.js';

const _fwd = new Vector3();
const _up = new Vector3();
const _desired = new Vector3();
const _desiredUp = new Vector3();
const _look = new Vector3();
const _vel = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _hit = new RayHit();

function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

const TRAIL_MAX = 160;

/**
 * Third-person chase camera that rides the car's own trail, like the next
 * carriage of a train: it sits a fixed distance back *along the path the car
 * actually drove*. That keeps it inside loops, swings it naturally through
 * corners, and shows the car's angle during drifts. A ray against the track
 * pulls it in if a wall or deck would block the view.
 */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.distance = 7.0;
    this.height = 2.4;
    this.lookAhead = 4.0;
    this.lookHeight = 0.9;
    this.baseFov = 66;
    this.speedFov = 18;
    this.maxSpeed = 60;
    this.aspect = 16 / 9;
    this.shake = 0;
    this.world = null;
    this.fwd = new Vector3(0, 0, 1);
    this.up = new Vector3(0, 1, 0);
    this.pos = new Vector3();
    this.fovBoost = 0;
    this.trail = [];
    this._pool = [];
  }

  snap(carPos, carQuat) {
    this.fwd.set(0, 0, 1).applyQuaternion(carQuat);
    this.up.set(0, 1, 0).applyQuaternion(carQuat);
    this._clearTrail();
    this._offsetPosition(carPos, 0, _desired);
    this.pos.copy(_desired);
    this._apply(carPos);
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  _clearTrail() {
    for (const p of this.trail) this._pool.push(p);
    this.trail.length = 0;
  }

  _record(carPos, carUp) {
    const last = this.trail[this.trail.length - 1];
    if (last && last.pos.distanceToSquared(carPos) < 0.09) return;
    const p = this._pool.pop() || { pos: new Vector3(), up: new Vector3() };
    p.pos.copy(carPos);
    p.up.copy(carUp);
    this.trail.push(p);
    if (this.trail.length > TRAIL_MAX) this._pool.push(this.trail.shift());
  }

  /** Point `dist` metres back along the trail (falls back to the nose axis). */
  _trailPosition(carPos, dist, outPos, outUp) {
    let remaining = dist;
    let prev = carPos;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      const seg = prev.distanceTo(p.pos);
      if (seg >= remaining && seg > 1e-6) {
        const t = remaining / seg;
        outPos.lerpVectors(prev, p.pos, t);
        outUp.copy(p.up);
        return true;
      }
      remaining -= seg;
      prev = p.pos;
    }
    // Not enough trail yet (just spawned / crawling): extend backwards along the nose.
    outPos.copy(prev).addScaledVector(this.fwd, -remaining);
    outUp.copy(this.up);
    return false;
  }

  _offsetPosition(carPos, speedN, out) {
    out.copy(carPos).addScaledVector(this.fwd, -(this.distance + speedN * 1.4)).addScaledVector(this.up, this.height);
  }

  update(dt, carPos, carQuat, { speed = 0, grounded = true, velocity = null, boosting = false } = {}) {
    _fwd.set(0, 0, 1).applyQuaternion(carQuat);
    if (!grounded && velocity && velocity.lengthSq() > 4) {
      _vel.copy(velocity).normalize();
      _fwd.lerp(_vel, 0.6).normalize();
    }
    _up.set(0, 1, 0);
    if (grounded) _up.applyQuaternion(carQuat);
    else _up.lerp(_a.set(0, 1, 0).applyQuaternion(carQuat), 0.35).normalize();

    this.fwd.lerp(_fwd, damp(grounded ? 7 : 3, dt)).normalize();
    this.up.lerp(_up, damp(grounded ? 5 : 2, dt)).normalize();

    const speedN = Math.min(1, Math.abs(speed) / this.maxSpeed);
    const dist = this.distance + speedN * 1.4;
    if (speed < -1) {
      // Reversing: the trail points the wrong way — hang off the nose axis instead.
      this._clearTrail();
      this._offsetPosition(carPos, speedN, _desired);
    } else {
      this._record(carPos, _up);
      this._trailPosition(carPos, dist, _desired, _desiredUp);
      // Keep a little height above the path, measured in the path's own frame.
      _desiredUp.lerp(this.up, 0.5).normalize();
      _desired.addScaledVector(_desiredUp, this.height);
    }
    this.pos.lerp(_desired, damp(16, dt));
    this.fovBoost += ((speedN * speedN + (boosting ? 0.35 : 0)) * this.speedFov - this.fovBoost) * damp(4, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this._apply(carPos);
  }

  _apply(carPos) {
    const cam = this.camera;
    _look.copy(carPos).addScaledVector(this.fwd, this.lookAhead).addScaledVector(this.up, this.lookHeight);
    cam.position.copy(this.pos);
    // Pull in if track geometry sits between the car and the lens.
    if (this.world) {
      _a.copy(carPos).addScaledVector(this.up, this.lookHeight);
      _dir.subVectors(this.pos, _a);
      const len = _dir.length();
      if (len > 0.5) {
        _dir.multiplyScalar(1 / len);
        this.world.raycast(_a, _dir, len + 0.3, ANY, _hit, false);
        if (_hit.hit) cam.position.copy(_a).addScaledVector(_dir, Math.max(0.8, _hit.distance - 0.45));
      }
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.up.copy(this.up);
    cam.lookAt(_look);
    cam.fov = fitFov(this.baseFov + this.fovBoost, this.aspect);
    cam.updateProjectionMatrix();
  }
}

/**
 * Keep horizontal field-of-view sensible on tall (portrait) screens by
 * widening the vertical FOV when the aspect drops below 1.3.
 */
export function fitFov(vFov, aspect, minAspect = 1.3) {
  if (aspect >= minAspect) return vFov;
  const h = Math.tan(MathUtils.degToRad(vFov) / 2) * minAspect;
  return Math.min(105, MathUtils.radToDeg(2 * Math.atan(h / aspect)));
}
