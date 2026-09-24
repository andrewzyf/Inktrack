import { Vector3, Quaternion } from 'three';
import { PHYSICS } from '../config/physics.js';
import { DRIVABLE, RayHit } from './CollisionWorld.js';

/**
 * Arcade car controller.
 *
 * The car is a point mass with a kinematically-controlled orientation:
 * four wheel rays find the road, the chassis is held at ride height along
 * the (smoothly interpolated) surface normal, and driving forces are applied
 * in the road's tangent plane. This is far more stable and tunable than a
 * general rigid-body solver for loops/ramps at 200 km/h, and costs only a
 * handful of ray casts per tick.
 */

const _v = new Vector3();
const _n = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _up = new Vector3();
const _q = new Quaternion();
const _origin = new Vector3();
const _dir = new Vector3();

const RAY_LIFT = 0.5; // wheel rays start this far above the chassis to survive small penetrations

export function sampleCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

export class CarPhysics {
  constructor(world, config = PHYSICS) {
    this.world = world;
    this.cfg = config;
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.quaternion = new Quaternion();
    this.angularVelocity = new Vector3();

    this.steer = 0; // smoothed steering (-1 left … +1 right)
    this.grounded = false;
    this.groundNormal = new Vector3(0, 1, 0);
    this.groundDistance = Infinity;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.wheels = config.car.wheels.map((w) => ({
      local: new Vector3(w[0], w[1], w[2]),
      hit: new RayHit(),
      contact: false,
      distance: Infinity,
    }));
  }

  reset(position, quaternion, velocity = null) {
    this.position.copy(position);
    this.quaternion.copy(quaternion).normalize();
    if (velocity) this.velocity.copy(velocity);
    else this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.steer = 0;
    this.grounded = false;
    this.forwardSpeed = this.velocity.length();
    this.lateralSpeed = 0;
  }

  getForward(out) {
    return out.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  getUp(out) {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }

  /** Signed speed along the car's nose, in m/s. */
  get speed() {
    return this.forwardSpeed;
  }

  _probeGround() {
    const cfg = this.cfg.car;
    const up = this.getUp(_up);
    _dir.copy(up).negate();
    let count = 0;
    let dist = 0;
    _n.set(0, 0, 0);
    for (const w of this.wheels) {
      _origin.copy(w.local).applyQuaternion(this.quaternion).add(this.position).addScaledVector(up, RAY_LIFT);
      this.world.raycast(_origin, _dir, cfg.groundProbe + RAY_LIFT, DRIVABLE, w.hit);
      w.contact = w.hit.hit && w.hit.normal.dot(up) > 0.35;
      w.distance = w.contact ? w.hit.distance - RAY_LIFT : Infinity;
      if (w.contact) {
        count++;
        dist += w.distance;
        _n.add(w.hit.normal);
      }
    }
    if (count > 0) {
      this.groundDistance = dist / count;
      this.groundNormal.copy(_n).normalize();
    } else {
      this.groundDistance = Infinity;
    }
    this.contactCount = count;
    this.grounded = count >= 2 && this.groundDistance <= cfg.rideHeight + cfg.groundedSlack;
  }

  /** Rotate the chassis so its up axis matches the road normal. */
  _alignToGround(dt) {
    const up = this.getUp(_up);
    _q.setFromUnitVectors(up, this.groundNormal);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
    if (angle > 0.3) {
      const t = 1 - Math.exp(-18 * dt);
      _q.slerp(IDENTITY, 1 - t);
    }
    this.quaternion.premultiply(_q).normalize();
  }

  /**
   * Advance the simulation by one fixed tick.
   * input: { throttle 0..1, brake 0..1, steer -1..1 }
   */
  step(dt, input) {
    const cfg = this.cfg;
    const eng = cfg.engine;
    const st = cfg.steering;

    // Ease digital steering so tapping keys doesn't jerk the car around.
    const target = input.steer;
    const rate = Math.abs(target) > Math.abs(this.steer) ? st.steerRise : st.steerFall;
    this.steer += (target - this.steer) * Math.min(1, rate * dt);

    this._probeGround();

    this.velocity.y -= cfg.gravity * dt;

    if (this.grounded) {
      this._alignToGround(dt);
      const N = this.groundNormal;

      // Penetration correction: hold chassis at ride height.
      if (this.groundDistance < cfg.car.rideHeight) {
        this.position.addScaledVector(N, cfg.car.rideHeight - this.groundDistance);
      }

      // Split velocity into normal / forward / lateral components.
      let vn = this.velocity.dot(N);
      _v.copy(this.velocity).addScaledVector(N, -vn);
      this.getForward(_f);
      _f.addScaledVector(N, -_f.dot(N)).normalize();
      _r.crossVectors(_f, N); // car's right-hand side
      let vf = _v.dot(_f);
      let vr = _v.dot(_r);

      // Engine, brakes, reverse.
      const throttle = input.throttle || 0;
      const brake = input.brake || 0;
      if (throttle > 0 && vf > -0.5) {
        vf += sampleCurve(eng.accelCurve, vf) * throttle * dt;
      } else if (throttle > 0) {
        vf = Math.min(0, vf + eng.brakeDecel * throttle * dt); // throttle while rolling backwards brakes
      }
      if (brake > 0) {
        if (vf > 0.5) vf = Math.max(0, vf - eng.brakeDecel * brake * dt);
        else if (throttle === 0) vf = Math.max(-eng.reverseMaxSpeed, vf - eng.reverseAccel * brake * dt);
      }

      // Rolling + aerodynamic drag.
      if (throttle === 0 && brake === 0) {
        const roll = eng.rollingDrag * dt;
        vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
      }
      vf -= vf * Math.abs(vf) * eng.airDrag * dt;

      // Lateral grip: scrub sideways velocity. `transfer` redirects part of it
      // along the nose instead of losing it (never exceeding the old speed).
      const newVr = vr * Math.exp(-cfg.grip.lateral * dt);
      if (Math.abs(vf) > 1) {
        const conserved = Math.sign(vf) * Math.sqrt(Math.max(0, vf * vf + vr * vr - newVr * newVr));
        vf += (conserved - vf) * cfg.grip.transfer;
      }
      vr = newVr;

      // Steering: yaw about the road normal.
      const absVf = Math.abs(vf);
      const authority =
        Math.min(1, absVf / st.fullSteerSpeed) *
        (1 - (1 - st.highSpeedYawFactor) * Math.min(1, absVf / eng.maxSpeed));
      const yaw = -this.steer * st.maxYawRate * authority * Math.sign(vf || 1) * dt;
      if (yaw !== 0) {
        _q.setFromAxisAngle(N, yaw);
        this.quaternion.premultiply(_q).normalize();
      }

      // Never keep velocity pointing into the road.
      if (vn < 0) vn = 0;
      this.velocity.copy(_f).multiplyScalar(vf).addScaledVector(_r, vr).addScaledVector(N, vn);
      this.forwardSpeed = vf;
      this.lateralSpeed = vr;
    } else {
      this.velocity.multiplyScalar(1 - eng.airDrag * this.velocity.length() * dt);
      this.getForward(_f);
      this.forwardSpeed = this.velocity.dot(_f);
      this.lateralSpeed = 0;
    }

    this.position.addScaledVector(this.velocity, dt);
  }
}

const IDENTITY = new Quaternion();
