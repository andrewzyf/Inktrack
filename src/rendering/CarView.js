import { Mesh, PlaneGeometry, MeshBasicMaterial, Vector3, Quaternion, Matrix4, Color } from 'three';
import { createCarModel, updateWheels } from './CarModel.js';
import { PHYSICS } from '../config/physics.js';
import { DRIVABLE, RayHit } from '../physics/CollisionWorld.js';
import { PUFF, SPARK } from './Particles.js';

const _v = new Vector3();
const _n = new Vector3();
const _up = new Vector3();
const _f = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _down = new Vector3(0, -1, 0);
const _hit = new RayHit();
const _p = new Vector3();

const WHEEL_RADIUS = 0.37;
const DRIFT_TIER_COLORS = [0x6fd6ff, 0xffa53d, 0xff5fd2];

/**
 * Visual side of the player car: interpolated transform, wheel spin/steer,
 * body roll/pitch, landing squash-and-stretch, halftone contact shadow, ink
 * skid marks and smoke/spark particles.
 */
export class CarView {
  constructor({ scene, world, particles, skids }) {
    this.model = createCarModel();
    this.world = world;
    this.particles = particles;
    this.skids = skids;
    scene.add(this.model);

    this.shadow = new Mesh(
      new PlaneGeometry(2.6, 5.2).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    this.spin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.puffTimer = 0;
    this.sparkTimer = 0;
    this.prevSpeed = 0;
  }

  setShadowTexture(tex) {
    this.shadow.material.map = tex;
    this.shadow.material.needsUpdate = true;
  }

  /** Landing / impact → squash (0..~0.4). */
  impulse(amount) {
    this.squashVel -= amount;
  }

  reset() {
    this.squash = this.squashVel = this.roll = this.pitch = 0;
    this.skids.clear();
  }

  update(dt, car, pos, quat) {
    const m = this.model;
    m.position.copy(pos);
    m.quaternion.copy(quat);
    const { body, wheels } = m.userData;

    // Wheels: spin with road speed, front pair steers, suspension droop from rays.
    this.spin += (car.grounded ? car.forwardSpeed : car.forwardSpeed * 0.98) * dt / WHEEL_RADIUS;
    const rh = PHYSICS.car.rideHeight;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      w.spin = this.spin;
      if (w.front) w.steer = -car.steer * 0.42;
      const d = car.wheels[i].contact ? car.wheels[i].distance : rh + 0.28;
      const droop = Math.max(-0.12, Math.min(0.28, d - rh));
      w.y += (w.base.y - droop - w.y) * Math.min(1, dt * 25);
    }
    updateWheels(m);

    // Body roll into turns / slides, pitch under accel & braking.
    const accel = (car.forwardSpeed - this.prevSpeed) / Math.max(dt, 1e-4);
    this.prevSpeed = car.forwardSpeed;
    const rollTarget = car.grounded ? Math.max(-0.12, Math.min(0.12, -car.steer * Math.min(1, Math.abs(car.forwardSpeed) / 30) * 0.06 + car.lateralSpeed * 0.008)) : 0;
    const pitchTarget = car.grounded ? Math.max(-0.06, Math.min(0.06, -accel * 0.0025)) : 0;
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 8);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 6);

    // Squash & stretch spring.
    this.squashVel += (-this.squash * 170 - this.squashVel * 11) * dt;
    this.squash += this.squashVel * dt;
    const s = Math.max(-0.3, Math.min(0.25, this.squash));
    body.scale.set(1 - s * 0.45, 1 + s, 1 - s * 0.3);
    body.position.y = s * 0.35;
    body.rotation.set(this.pitch, 0, this.roll);

    this._updateShadow(car, pos, quat);
    this._updateEffects(dt, car, pos, quat);
  }

  _updateShadow(car, pos, quat) {
    const sh = this.shadow;
    _up.set(0, 1, 0).applyQuaternion(quat);
    let height;
    if (car.grounded) {
      _n.copy(car.groundNormal);
      _p.copy(pos).addScaledVector(_n, -car.groundDistance + 0.03);
      height = 0;
    } else {
      this.world.raycast(pos, _down, 60, DRIVABLE, _hit);
      if (!_hit.hit) { sh.visible = false; return; }
      _n.copy(_hit.normal);
      _p.copy(_hit.point).addScaledVector(_n, 0.03);
      height = _hit.distance;
    }
    sh.visible = true;
    sh.position.copy(_p);
    // Orient: plane Y → surface normal, keep car yaw.
    _f.set(0, 0, 1).applyQuaternion(quat);
    _f.addScaledVector(_n, -_f.dot(_n));
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, 1);
    _f.normalize();
    _v.crossVectors(_n, _f);
    _m.makeBasis(_v, _n, _f);
    sh.quaternion.setFromRotationMatrix(_m);
    const k = Math.min(1, height / 25);
    sh.scale.setScalar(1 + k * 0.8);
    sh.material.opacity = 0.55 * (1 - k * 0.75);
  }

  _updateEffects(dt, car, pos, quat) {
    const hardBrake = car.grounded && car.forwardSpeed > 12 && this.prevBrake;
    const sliding = car.grounded && (car.drifting || car.slip > 0.22 || hardBrake);
    const strength = car.drifting ? 1 : Math.min(1, car.slip * 3);
    // Rear wheels = indices 2, 3.
    for (let k = 0; k < 2; k++) {
      const w = car.wheels[2 + k];
      if (sliding && w.contact) this.skids.update(k, true, w.hit.point, w.hit.normal, strength);
      else this.skids.update(k, false);
    }

    this.puffTimer -= dt;
    if (sliding && this.puffTimer <= 0) {
      this.puffTimer = car.drifting ? 0.045 : 0.07;
      for (let k = 0; k < 2; k++) {
        const w = car.wheels[2 + k];
        if (!w.contact) continue;
        _v.copy(car.velocity).multiplyScalar(-0.15);
        _v.y += 1.5;
        this.particles.spawn({ pos: _p.copy(w.hit.point).addScaledVector(w.hit.normal, 0.3), vel: _v, life: 0.7, size: [0.6, 2.0], color: 0xffffff, drag: 3, rise: 1.4 });
      }
    }

    // Drift sparks, coloured by meter tier.
    this.sparkTimer -= dt;
    if (car.drifting && car.driftMeter > 0.2 && this.sparkTimer <= 0) {
      this.sparkTimer = 0.05;
      const tier = car.driftMeter < 0.5 ? 0 : car.driftMeter < 0.85 ? 1 : 2;
      for (let k = 0; k < 2; k++) {
        const w = car.wheels[2 + k];
        if (!w.contact) continue;
        _v.set((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4).addScaledVector(car.velocity, 0.4);
        this.particles.spawn({ pos: w.hit.point, vel: _v, life: 0.35, size: [0.5, 0.2], color: DRIFT_TIER_COLORS[tier], frame: SPARK, drag: 4, rise: -6, spin: 8 });
      }
    }

    // Boost exhaust puffs.
    if (car.boosting && Math.random() < dt * 40) {
      _f.set(0, 0, 1).applyQuaternion(quat);
      _p.copy(pos).addScaledVector(_f, -2.3).addScaledVector(_up.set(0, 1, 0).applyQuaternion(quat), 0.05);
      // Mostly travel with the car so the flame puffs stay behind it, not in the lens.
      _v.copy(car.velocity).multiplyScalar(0.9).addScaledVector(_f, -3);
      this.particles.spawn({ pos: _p, vel: _v, life: 0.2, size: [0.45, 0.9], color: 0xffb13d, frame: PUFF, drag: 1, rise: 0 });
    }
  }

  /** Called by the race each tick-batch so effects know about braking. */
  setBraking(on) {
    this.prevBrake = on;
  }

  landingPuff(car, pos, impact) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      _v.set(Math.cos(a) * 5, 1, Math.sin(a) * 5);
      this.particles.spawn({ pos: _p.copy(pos).addScaledVector(car.groundNormal, -0.3), vel: _v, life: 0.6, size: [0.8, 2.2 + impact * 0.05], drag: 4, rise: 1 });
    }
  }
}

export { DRIFT_TIER_COLORS, Color };
