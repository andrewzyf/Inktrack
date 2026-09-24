import { Vector3, MathUtils } from 'three';

const _fwd = new Vector3();
const _up = new Vector3();
const _desired = new Vector3();
const _look = new Vector3();
const _vel = new Vector3();

function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Third-person chase camera. Follows a smoothed copy of the car's frame so it
 * rolls with the car through loops and banked turns but never snaps.
 */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.distance = 7.0;
    this.height = 2.5;
    this.lookAhead = 4.0;
    this.lookHeight = 0.9;
    this.baseFov = 66;
    this.speedFov = 18;
    this.maxSpeed = 60;
    this.aspect = 16 / 9;
    this.shake = 0;
    this.fwd = new Vector3(0, 0, 1);
    this.up = new Vector3(0, 1, 0);
    this.pos = new Vector3();
    this.fovBoost = 0;
  }

  snap(carPos, carQuat) {
    this.fwd.set(0, 0, 1).applyQuaternion(carQuat);
    this.up.set(0, 1, 0).applyQuaternion(carQuat);
    this._compute(carPos, 0);
    this.pos.copy(_desired);
    this._apply(carPos, 0);
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt, carPos, carQuat, { speed = 0, grounded = true, velocity = null, boosting = false } = {}) {
    // Target forward: car nose on the ground, blend toward travel direction in the air.
    _fwd.set(0, 0, 1).applyQuaternion(carQuat);
    if (!grounded && velocity && velocity.lengthSq() > 4) {
      _vel.copy(velocity).normalize();
      _fwd.lerp(_vel, 0.6).normalize();
    }
    _up.set(0, 1, 0);
    if (grounded) _up.applyQuaternion(carQuat);
    else _up.lerp(_vel.set(0, 1, 0).applyQuaternion(carQuat), 0.35).normalize();

    this.fwd.lerp(_fwd, damp(grounded ? 7 : 3, dt)).normalize();
    this.up.lerp(_up, damp(grounded ? 5 : 2, dt)).normalize();

    const speedN = Math.min(1, Math.abs(speed) / this.maxSpeed);
    this._compute(carPos, speedN);
    this.pos.lerp(_desired, damp(14, dt));

    this.fovBoost += ((speedN * speedN + (boosting ? 0.35 : 0)) * this.speedFov - this.fovBoost) * damp(4, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this._apply(carPos, speedN);
  }

  _compute(carPos, speedN) {
    const dist = this.distance + speedN * 1.4;
    _desired.copy(carPos).addScaledVector(this.fwd, -dist).addScaledVector(this.up, this.height);
  }

  _apply(carPos) {
    const cam = this.camera;
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.up.copy(this.up);
    _look.copy(carPos).addScaledVector(this.fwd, this.lookAhead).addScaledVector(this.up, this.lookHeight);
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
