import { Vector3, Quaternion, Euler } from 'three';
import { FLIGHT } from '../vehicles/profiles.js';
import { PHYSICS } from '../config/physics.js';

/**
 * Arcade flight: the plane always flies forward at a speed that eases toward
 * a target (cruise, faster in dives and boosts, slower in climbs).
 *
 *   throttle → pull up (climb)      brake → push down (dive)
 *   steer    → bank and turn        drift → hard bank, charges the boost meter
 *
 * Same public surface as CarPhysics (position, quaternion, velocity, speed,
 * boost/drift state, events) so the race, camera, HUD, audio, recorder and
 * autopilot interfaces work unchanged. It never touches the ground: hitting an
 * obstacle sets `crashed`, and the race respawns the plane.
 */

const _f = new Vector3();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();

export class FlightPhysics {
  constructor(obstacles = [], config = FLIGHT) {
    this.cfg = config;
    this.obstacles = obstacles;
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.quaternion = new Quaternion();
    this.groundNormal = new Vector3(0, 1, 0);
    this.wheels = [];
    this.events = [];
    this.hold = false;
    this.reset(new Vector3(), new Quaternion());
  }

  reset(position, quaternion, velocity = null) {
    this.position.copy(position);
    _e.setFromQuaternion(quaternion, 'YXZ');
    this.yaw = _e.y;
    this.pitch = 0;
    this.bank = 0;
    this.airSpeed = velocity ? Math.max(this.cfg.minSpeed, velocity.length()) : this.cfg.cruise * 0.8;
    this.steer = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftMeter = 0;
    this.boostTime = 0;
    this.crashed = false;
    this.grounded = false;
    this.groundDistance = Infinity;
    this.surface = 'air';
    this.slip = 0;
    this.airTime = 0;
    this.flippedTime = 0;
    this.lateralSpeed = 0;
    this.events.length = 0;
    this._orient();
    this.velocity.copy(_f.set(0, 0, 1).applyQuaternion(this.quaternion)).multiplyScalar(this.hold ? 0 : this.airSpeed);
  }

  get speed() {
    return this.airSpeed;
  }

  get forwardSpeed() {
    return this.airSpeed;
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

  /** Boost ring / pad. */
  addBoost(seconds) {
    if (this.boostTime <= 0) this._emit('boostPad');
    this.boostTime = Math.max(this.boostTime, seconds);
  }

  _orient() {
    // Visual bank is part of the attitude; motion follows yaw + pitch only.
    this.quaternion.setFromEuler(_e.set(-this.pitch, this.yaw, this.bank, 'YXZ'));
  }

  step(dt, input) {
    const c = this.cfg;
    if (this.hold) {
      this.velocity.set(0, 0, 0);
      return;
    }
    if (this.crashed) {
      // Tumble down until the race respawns us.
      this.velocity.y -= PHYSICS.gravity * dt;
      this.position.addScaledVector(this.velocity, dt);
      this.bank += dt * 6;
      this._orient();
      return;
    }
    const steerIn = Math.max(-1, Math.min(1, input.steer || 0));
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 7);
    const pitchIn = (input.throttle || 0) - (input.brake || 0);

    // Drift = hard bank: tighter turn, charges the meter like a car drift.
    const wantDrift = !!input.drift && Math.abs(steerIn) > 0.25;
    if (wantDrift && !this.drifting) {
      this.drifting = true;
      this.driftDir = Math.sign(steerIn);
      this.driftMeter = 0;
      this._emit('driftStart', this.driftDir);
    } else if (this.drifting && !input.drift) {
      this.drifting = false;
      const m = this.driftMeter;
      if (m >= 0.2) {
        this.boostTime = Math.max(this.boostTime, 1.4 * m);
        this._emit('driftBoost', m);
      }
      this._emit('driftEnd', m);
      this.driftMeter = 0;
    }
    if (this.drifting) this.driftMeter = Math.min(1, this.driftMeter + dt * 0.55);

    const yawRate = this.drifting ? this.driftDir * c.driftYaw * (0.6 + 0.4 * Math.abs(this.steer)) : this.steer * c.yawRate;
    this.yaw -= yawRate * dt;
    const bankTarget = (this.drifting ? this.driftDir * 1.25 : this.steer) * c.bankAngle;
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * c.bankResponse);
    if (pitchIn) this.pitch += pitchIn * c.pitchRate * dt;
    else this.pitch -= this.pitch * Math.min(1, dt * c.pitchLevel);
    this.pitch = Math.max(-c.pitchLimit, Math.min(c.pitchLimit, this.pitch));
    this.slip = this.drifting ? 0.4 : 0;

    // Speed: dive to gain, climb to lose, boost to rocket.
    this.boostTime = Math.max(0, this.boostTime - dt);
    const target = this.boosting ? c.boostSpeed : Math.min(c.maxSpeed, c.cruise - this.pitch * c.diveGain);
    const rate = this.boosting ? 2.5 : c.speedResponse;
    this.airSpeed += (target - this.airSpeed) * Math.min(1, dt * rate);
    this.airSpeed = Math.max(c.minSpeed, this.airSpeed);

    this._orient();
    _f.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.velocity.copy(_f).multiplyScalar(this.airSpeed);
    this.position.addScaledVector(this.velocity, dt);

    // Obstacles: spheres (rocks, balloons, island cores).
    const r = c.radius;
    for (const o of this.obstacles) {
      const d2 = _p.subVectors(this.position, o.pos).lengthSq();
      const rr = o.radius + r;
      if (d2 < rr * rr) {
        this.crashed = true;
        this.drifting = false;
        this.boostTime = 0;
        this._emit('wall', 30);
        this.velocity.multiplyScalar(0.3);
        break;
      }
    }
  }
}
