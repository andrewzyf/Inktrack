import { Vector3, Quaternion } from 'three';
import { PHYSICS } from '../config/physics.js';
import { DRIVABLE, WALL, ANY, GUIDED, SURFACE, RayHit } from './CollisionWorld.js';

/**
 * Arcade car controller.
 *
 * The car is a point mass with a kinematically-controlled orientation:
 * four wheel rays find the road, the chassis is held at ride height along
 * the (smoothly interpolated) surface normal, and driving forces are applied
 * in the road's tangent plane. This is far more stable and tunable than a
 * general rigid-body solver for loops/ramps at 200+ km/h, and costs only a
 * handful of ray casts and sphere tests per tick.
 *
 * Conventions: car forward = local +Z, local +X = driver's left.
 * Input steer: -1 = left, +1 = right.
 */

const _v = new Vector3();
const _n = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _up = new Vector3();
const _g = new Vector3();
const _t = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _origin = new Vector3();
const _dir = new Vector3();
const _center = new Vector3();
const _prev = new Vector3();
const _move = new Vector3();
const _ccdHit = new RayHit();
const _guide = new Vector3();
const IDENTITY = new Quaternion();

const RAY_LIFT = 0.5; // wheel rays start this far above the chassis to survive small penetrations
const SURFACE_NAMES = ['road', 'ice', 'boost'];

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
    this.angularVelocity = new Vector3(); // world space, rad/s

    this.wheels = config.car.wheels.map((w) => ({
      local: new Vector3(w[0], w[1], w[2]),
      hit: new RayHit(),
      contact: false,
      distance: Infinity,
      surface: SURFACE.ROAD,
    }));
    this.wallSpheres = config.car.wallSpheres.map((s) => ({ local: new Vector3(s[0], s[1], s[2]), radius: s[3] }));
    this.bodySpheres = config.car.bodySpheres.map((s) => ({ local: new Vector3(s[0], s[1], s[2]), radius: s[3] }));

    /** Queue of gameplay events since the last `drainEvents()`. */
    this.events = [];
    this.reset(new Vector3(), new Quaternion());
  }

  reset(position, quaternion, velocity = null) {
    this.position.copy(position);
    this.quaternion.copy(quaternion).normalize();
    if (velocity) this.velocity.copy(velocity);
    else this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);

    this.steer = 0; // smoothed steering
    this.grounded = false;
    this.contactCount = 0;
    this.groundNormal = this.groundNormal || new Vector3();
    this.groundNormal.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.groundDistance = Infinity;
    this.surface = 'road';
    this.forwardSpeed = this.velocity.length();
    this.lateralSpeed = 0;
    this.airTime = 0;
    this.groundTime = 0;

    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.driftMeter = 0;
    this.gripRecover = 1; // 0 → just left a drift, 1 → full grip
    this.boostTime = 0;
    this.onBoostPad = false;
    this.flipped = false; // resting on the roof/side
    this.flippedTime = 0;
    this.slip = 0;
    this.guided = false;
    this.guideTangent = this.guideTangent || new Vector3();
    this.guideOffset = 0;
    this.events.length = 0;
  }

  getForward(out) {
    return out.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  getUp(out) {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }

  /** Signed speed along the car's nose when grounded, total speed in the air. */
  get speed() {
    return this.grounded ? this.forwardSpeed : this.velocity.length();
  }

  get boosting() {
    return this.boostTime > 0;
  }

  drainEvents(out = []) {
    for (const e of this.events) out.push(e);
    this.events.length = 0;
    return out;
  }

  _emit(type, value = 0) {
    this.events.push({ type, value });
  }

  // ── ground probing ────────────────────────────────────────────────────
  _probeGround() {
    const cfg = this.cfg.car;
    const up = this.getUp(_up);
    _dir.copy(up).negate();
    let count = 0;
    let dist = 0;
    let boostContact = false;
    let iceCount = 0;
    let guideCount = 0;
    _n.set(0, 0, 0);
    _guide.set(0, 0, 0);
    for (const w of this.wheels) {
      _origin.copy(w.local).applyQuaternion(this.quaternion).add(this.position).addScaledVector(up, RAY_LIFT);
      this.world.raycast(_origin, _dir, cfg.groundProbe + RAY_LIFT, DRIVABLE, w.hit);
      w.contact = w.hit.hit && w.hit.normal.dot(up) > 0.35;
      w.distance = w.contact ? w.hit.distance - RAY_LIFT : Infinity;
      if (w.contact) {
        count++;
        dist += w.distance;
        _n.add(w.hit.normal);
        w.surface = w.hit.surface;
        if (w.distance < cfg.rideHeight + cfg.groundedSlack) {
          if (w.surface === SURFACE.BOOST) boostContact = true;
          if (w.surface === SURFACE.ICE) iceCount++;
          if (w.hit.flags & GUIDED) {
            // Guides are directional; align them with the car so loops work both ways.
            _guide.addScaledVector(w.hit.guide, w.hit.guide.dot(this.getForward(_f)) >= 0 ? 1 : -1);
            guideCount++;
          }
        }
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
    this.surface = iceCount >= 2 ? 'ice' : 'road';
    const wasGuided = this.guided;
    this.guided = this.grounded && guideCount >= 2 && _guide.lengthSq() > 1e-6;
    if (this.guided) this.guideTangent.copy(_guide).normalize();
    if (this.guided && !wasGuided) this.guideOffset = null; // measured on first guided tick

    // Boost pads trigger on first contact only.
    if (boostContact && !this.onBoostPad && this.grounded) {
      const b = this.cfg.boost;
      this.boostTime = Math.max(this.boostTime, b.padDuration);
      this.getForward(_f);
      this.velocity.addScaledVector(_f, b.padImpulse);
      this._emit('boostPad');
    }
    this.onBoostPad = boostContact;
  }

  /** Rotate the chassis so its up axis matches `normal` (fully, or at `rate`). */
  _alignUp(normal, dt, rate) {
    const up = this.getUp(_up);
    _q.setFromUnitVectors(up, normal);
    // Small corrections (curves, loops) apply fully; big ones (landings) ease in.
    const angle = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
    if (rate !== Infinity || angle > 0.3) {
      const t = 1 - Math.exp(-(rate === Infinity ? this.cfg.ground.alignRate : rate) * dt);
      _q.slerp(IDENTITY, 1 - t);
    }
    this.quaternion.premultiply(_q).normalize();
  }

  // ── main tick ─────────────────────────────────────────────────────────
  /**
   * Advance the simulation by one fixed tick.
   * input: { throttle 0..1, brake 0..1, steer -1..1, drift bool }
   */
  step(dt, input) {
    const cfg = this.cfg;
    const st = cfg.steering;
    _q2.copy(this.quaternion); // for angular-velocity tracking
    _prev.copy(this.position);

    // Ease digital steering so tapping keys doesn't jerk the car around.
    const target = input.steer || 0;
    const rate = Math.abs(target) > Math.abs(this.steer) ? st.steerRise : st.steerFall;
    this.steer += (target - this.steer) * Math.min(1, rate * dt);

    const wasGrounded = this.grounded;
    this._probeGround();

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.25) this._emit('airtime', this.airTime);
      this.airTime = 0;
      this.groundTime += dt;
      this._stepGrounded(dt, input);
    } else {
      this.airTime += dt;
      this.groundTime = 0;
      this._stepAir(dt, input);
    }

    if (this.boostTime > 0) this.boostTime = Math.max(0, this.boostTime - dt);

    this.position.addScaledVector(this.velocity, dt);
    this._continuousCollision();
    this._resolveWalls();
    this._resolveBody(dt);

    // Track angular velocity while grounded so take-offs keep their rotation.
    if (this.grounded) {
      _q.copy(this.quaternion).multiply(_q2.invert());
      if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      const angle = 2 * Math.acos(Math.min(1, _q.w));
      const s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
      if (s > 1e-6) _w.set(_q.x / s, _q.y / s, _q.z / s).multiplyScalar(angle / dt);
      else _w.set(0, 0, 0);
      this.angularVelocity.lerp(_w, 0.5);
    }
  }

  _stepGrounded(dt, input) {
    const cfg = this.cfg;
    const eng = cfg.engine;
    const st = cfg.steering;
    const gr = cfg.ground;
    const surf = cfg.surfaces[this.surface] || cfg.surfaces.road;
    const N = this.groundNormal;
    const touching = this.groundDistance <= cfg.car.rideHeight + 0.03;

    // 1. Curvature following / landing. Last tick's velocity was tangent to the
    //    old surface; if the road has curved up into us, redirect without losing
    //    speed (loops, dips). Large into-road speeds are landings and are absorbed.
    let vn = this.velocity.dot(N);
    if (touching && vn < 0) {
      const speed = this.velocity.length();
      if (vn > -gr.smoothFollow && speed > 5) {
        this.velocity.addScaledVector(N, -vn);
        const len = this.velocity.length();
        if (len > 1e-6) this.velocity.multiplyScalar(speed / len);
      } else {
        if (-vn > gr.landEvent) this._emit('land', -vn);
        this.velocity.addScaledVector(N, -vn);
      }
    }

    // 2. Align chassis to the road.
    this._alignUp(N, dt, Infinity);
    if (this.groundDistance < cfg.car.rideHeight) {
      this.position.addScaledVector(N, cfg.car.rideHeight - this.groundDistance);
    }
    if (this.guided) this._applyGuide(N, dt);

    // 3. Gravity (full vector — support is handled below).
    this.velocity.y -= cfg.gravity * dt;

    // 4. Decompose into forward / lateral / normal.
    vn = this.velocity.dot(N);
    _v.copy(this.velocity).addScaledVector(N, -vn);
    this.getForward(_f);
    _f.addScaledVector(N, -_f.dot(N)).normalize();
    _r.crossVectors(_f, N); // car's right-hand side
    let vf = _v.dot(_f);
    let vr = _v.dot(_r);

    // 5. Engine, brakes, reverse.
    const throttle = input.throttle || 0;
    const brake = input.brake || 0;
    if (throttle > 0 && vf > -0.5) {
      vf += sampleCurve(eng.accelCurve, vf) * throttle * surf.accel * dt;
    } else if (throttle > 0) {
      vf = Math.min(0, vf + eng.brakeDecel * throttle * surf.brake * dt); // throttle while rolling back brakes
    }
    if (brake > 0) {
      if (vf > 0.5) vf = Math.max(0, vf - eng.brakeDecel * brake * surf.brake * dt);
      else if (throttle === 0) vf = Math.max(-eng.reverseMaxSpeed, vf - eng.reverseAccel * brake * surf.accel * dt);
    }
    if (this.boostTime > 0 && vf < cfg.boost.maxSpeed) {
      vf = Math.min(cfg.boost.maxSpeed, vf + cfg.boost.accel * dt);
    }

    // Rolling + aerodynamic drag.
    if (throttle === 0 && brake === 0 && this.boostTime <= 0) {
      const roll = eng.rollingDrag * dt;
      vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
    }
    vf -= vf * Math.abs(vf) * eng.airDrag * dt;

    // 6. Drift state machine.
    this._updateDrift(dt, input, vf, vr);

    // 7. Lateral grip. Drifting uses low grip; grip blends back after a drift.
    const dr = cfg.drift;
    const normalGrip = cfg.grip.lateral * surf.grip;
    let grip, transfer;
    if (this.drifting) {
      grip = dr.grip * Math.max(surf.grip, 0.5);
      transfer = dr.transfer;
    } else {
      this.gripRecover = Math.min(1, this.gripRecover + dt / cfg.grip.recoverTime);
      const k = this.gripRecover * this.gripRecover;
      grip = dr.grip + (normalGrip - dr.grip) * k;
      if (surf.grip < 1) grip = Math.min(grip, normalGrip);
      transfer = dr.transfer + (cfg.grip.transfer - dr.transfer) * k;
    }
    const newVr = vr * Math.exp(-grip * dt);
    if (Math.abs(vf) > 1) {
      const conserved = Math.sign(vf) * Math.sqrt(Math.max(0, vf * vf + vr * vr - newVr * newVr));
      vf += (conserved - vf) * transfer;
    }
    vr = newVr;

    // 8. Steering: yaw about the road normal.
    const absVf = Math.abs(vf);
    let yawRate;
    if (this.drifting) {
      const into = this.steer * this.driftDir; // +1 steering into the drift, -1 counter-steering
      yawRate = this.driftDir * (dr.yawBase + dr.yawSteer * into) * Math.min(1, absVf / dr.minSpeed);
    } else {
      const authority =
        Math.min(1, absVf / st.fullSteerSpeed) *
        (1 - (1 - st.highSpeedYawFactor) * Math.min(1, absVf / eng.maxSpeed));
      yawRate = this.steer * st.maxYawRate * authority * surf.steer * Math.sign(vf || 1);
    }
    if (yawRate !== 0) {
      _q.setFromAxisAngle(N, -yawRate * dt);
      this.quaternion.premultiply(_q).normalize();
    }

    // 9. Normal velocity: adhesion resists separation, support cancels pressing in.
    if (vn > 0) {
      const stick = (gr.stick + gr.stickPerSpeed * absVf) * dt;
      vn = Math.max(0, vn - stick);
    } else if (touching) {
      vn = 0;
    }

    this.velocity.copy(_f).multiplyScalar(vf).addScaledVector(_r, vr).addScaledVector(N, vn);
    this.forwardSpeed = vf;
    this.lateralSpeed = vr;
    this.slip = absVf > 2 ? Math.abs(vr) / absVf : 0;
    if (this.guided) this.guideOffset = this._headingOffset(N);
  }

  /** Signed yaw (about N) from the guide tangent to the car's heading. */
  _headingOffset(N) {
    _t.copy(this.guideTangent).addScaledVector(N, -this.guideTangent.dot(N)).normalize();
    this.getForward(_f);
    _f.addScaledVector(N, -_f.dot(N)).normalize();
    const cos = Math.max(-1, Math.min(1, _t.dot(_f)));
    return Math.acos(cos) * Math.sign(_g.crossVectors(_t, _f).dot(N) || 1);
  }

  /**
   * Guided surfaces (loops) carry the car's heading along the road's own
   * direction, keeping whatever angle the player entered with (which slowly
   * self-centres), so a loop needs no steering. Velocity is rotated with it
   * so no speed is scrubbed.
   */
  _applyGuide(N, dt) {
    const current = this._headingOffset(N);
    if (this.guideOffset === null) this.guideOffset = current;
    const desired = this.guideOffset * Math.exp(-this.cfg.ground.guideCentering * dt);
    const correction = desired - current;
    if (Math.abs(correction) < 1e-7) return;
    _q.setFromAxisAngle(N, correction);
    this.quaternion.premultiply(_q).normalize();
    this.velocity.applyQuaternion(_q);
  }

  _updateDrift(dt, input, vf, vr) {
    const dr = this.cfg.drift;
    const wantDrift = !!input.drift;
    if (!this.drifting) {
      if (wantDrift && vf > dr.minSpeed && Math.abs(this.steer) > dr.minSteer) {
        this.drifting = true;
        this.driftDir = Math.sign(this.steer);
        this.driftTime = 0;
        this.driftMeter = 0;
        _q.setFromAxisAngle(this.groundNormal, -this.driftDir * dr.entryKick);
        this.quaternion.premultiply(_q).normalize();
        this._emit('driftStart', this.driftDir);
      }
      return;
    }
    this.driftTime += dt;
    const slipRatio = Math.abs(vr) / Math.max(8, Math.abs(vf));
    this.driftMeter = Math.min(1, this.driftMeter + dr.chargeRate * dt * Math.min(1, slipRatio / dr.fullSlip));

    if (!wantDrift) this._endDrift(true);
    else if (vf < dr.minSpeed * 0.6) this._endDrift(false);
  }

  _endDrift(release) {
    const dr = this.cfg.drift;
    const meter = this.driftMeter;
    this.drifting = false;
    this.driftDir = 0;
    this.gripRecover = 0;
    this.driftMeter = 0;
    if (release && meter >= dr.minCharge) {
      const t = this.cfg.boost.driftDuration * meter;
      this.boostTime = Math.max(this.boostTime, t);
      this._emit('driftBoost', meter);
    } else {
      this._emit('driftEnd', meter);
    }
  }

  _stepAir(dt, input) {
    const cfg = this.cfg;
    const air = cfg.air;
    this.velocity.y -= cfg.gravity * dt;
    this.velocity.multiplyScalar(1 - cfg.engine.airDrag * this.velocity.length() * dt);

    // Drifts survive short hops, but end if we stay airborne.
    if (this.drifting && this.airTime > 0.6) this._endDrift(!!input.drift === false);

    // Air control: steer yaws, throttle/brake pitch the nose. Rotation eases
    // toward the input target, so letting go stabilises the car.
    _w.copy(this.angularVelocity).applyQuaternion(_q.copy(this.quaternion).invert()); // → car space
    const k = 1 - Math.exp(-air.response * dt);
    // Nose gently follows the flight path (forgiving landings); optional manual pitch.
    _v.copy(this.velocity).applyQuaternion(_q); // velocity in car space
    let pitchTarget = 0;
    if (_v.lengthSq() > 25) pitchTarget = -Math.atan2(_v.y, Math.max(1, _v.z)) * air.pitchAlign;
    if (air.pitchControl) pitchTarget += ((input.throttle || 0) - (input.brake || 0)) * air.pitchRate;
    const yawTarget = -(input.steer || 0) * air.yawRate;
    _w.x += (pitchTarget - _w.x) * k;
    _w.y += (yawTarget - _w.y) * k;
    _w.z += (0 - _w.z) * k;
    this.angularVelocity.copy(_w).applyQuaternion(this.quaternion);
    const angle = this.angularVelocity.length() * dt;
    if (angle > 1e-7) {
      _t.copy(this.angularVelocity).normalize();
      _q.setFromAxisAngle(_t, angle);
      this.quaternion.premultiply(_q).normalize();
    }

    // Landing assist: when the road is right below, ease the chassis parallel to it.
    if (this.contactCount >= 1 && this.groundDistance < cfg.car.groundProbe) {
      this._alignUp(this.groundNormal, dt, air.landingAssist);
    }

    this.getForward(_f);
    this.forwardSpeed = this.velocity.dot(_f);
    this.lateralSpeed = 0;
    this.slip = 0;
  }

  // ── collisions ────────────────────────────────────────────────────────
  /** Stop the chassis centre from tunnelling through thin pieces at speed. */
  _continuousCollision() {
    _move.subVectors(this.position, _prev);
    const len = _move.length();
    if (len < 0.25) return;
    _dir.copy(_move).multiplyScalar(1 / len);
    this.world.raycast(_prev, _dir, len + 0.3, ANY, _ccdHit, true);
    if (!_ccdHit.hit) return;
    const n = _ccdHit.faceNormal;
    this.position.copy(_ccdHit.point).addScaledVector(n, _ccdHit.flags & DRIVABLE ? this.cfg.car.rideHeight : 0.6);
    const vn = this.velocity.dot(n);
    if (vn < 0) this.velocity.addScaledVector(n, -vn);
  }

  _resolveWalls() {
    const wl = this.cfg.walls;
    let maxImpact = 0;
    for (const s of this.wallSpheres) {
      _center.copy(s.local).applyQuaternion(this.quaternion).add(this.position);
      this.world.sphereQuery(_center, s.radius, WALL, (tri, cp, dist) => {
        if (dist > 1e-5) _n.subVectors(_center, cp).multiplyScalar(1 / dist);
        else this.world.getFaceNormal(tri, _n);
        const pen = s.radius - dist;
        this.position.addScaledVector(_n, pen);
        _center.addScaledVector(_n, pen);
        const vn = this.velocity.dot(_n);
        if (vn < 0) {
          const impact = -vn;
          maxImpact = Math.max(maxImpact, impact);
          this.velocity.addScaledVector(_n, -vn * (1 + wl.restitution));
          // Scrape: lose some speed along the wall proportional to the impact.
          const tangential = this.velocity.length();
          if (tangential > 1e-3) this.velocity.multiplyScalar(Math.max(0, 1 - wl.friction * impact));
          this._alignAlongWall(_n, impact);
        }
      });
    }
    if (maxImpact > wl.impactEvent) this._emit('wall', maxImpact);
  }

  /** Swing the nose parallel to a wall we hit so the car scrapes instead of sticking. */
  _alignAlongWall(n, impact) {
    const up = this.getUp(_up);
    this.getForward(_f);
    const into = _f.dot(n);
    if (into >= 0) return;
    _t.copy(_f).addScaledVector(n, -into);
    _t.addScaledVector(up, -_t.dot(up));
    if (_t.lengthSq() < 1e-6) return;
    _t.normalize();
    _f.addScaledVector(up, -_f.dot(up)).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, _f.dot(_t))));
    const sign = Math.sign(_g.crossVectors(_f, _t).dot(up)) || 1;
    const amount = angle * Math.min(1, this.cfg.walls.alignFactor * (0.3 + impact / 15));
    _q.setFromAxisAngle(up, sign * amount);
    this.quaternion.premultiply(_q).normalize();
  }

  /** Keep the body out of the road when the car is not on its wheels. */
  _resolveBody(dt) {
    const up = this.getUp(_up);
    let upset = false;
    for (let i = 0; i < this.bodySpheres.length; i++) {
      const s = this.bodySpheres[i];
      _center.copy(s.local).applyQuaternion(this.quaternion).add(this.position);
      this.world.sphereQuery(_center, s.radius, DRIVABLE, (tri, cp, dist) => {
        this.world.getFaceNormal(tri, _n);
        // Wheels handle surfaces we are standing on normally.
        if (this.grounded && _n.dot(up) > 0.5) return;
        if (dist > 1e-5) _n.subVectors(_center, cp).multiplyScalar(1 / dist);
        const pen = s.radius - dist;
        this.position.addScaledVector(_n, pen);
        _center.addScaledVector(_n, pen);
        const vn = this.velocity.dot(_n);
        if (vn < 0) {
          if (-vn > this.cfg.walls.impactEvent) this._emit('wall', -vn);
          this.velocity.addScaledVector(_n, -vn * 1.2);
          this.velocity.multiplyScalar(0.985);
        }
        // Touching the road with the roof or while tipped over = flipped.
        if (i === 0 || _n.dot(up) < 0.5) upset = true;
      });
    }
    this.flipped = upset && !this.grounded;
    this.flippedTime = this.flipped ? this.flippedTime + dt : 0;
  }
}

export { SURFACE_NAMES };
