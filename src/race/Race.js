import { Vector3, Quaternion } from 'three';
import { PHYSICS } from '../config/physics.js';
import { CarPhysics } from '../physics/CarPhysics.js';

/**
 * Race rules, independent of rendering (runs headless in tests):
 * countdown → racing → finished, sequential checkpoints with split times,
 * a tick-accurate timer (interpolated to the sub-tick crossing), respawn at
 * the last checkpoint on falls / flips / missed checkpoints, and a manual
 * reset. Gameplay events are queued for the view, HUD and audio.
 */

export const COUNTDOWN_TICKS = Math.round(PHYSICS.tickRate * 1.5);
const RESPAWN_DELAY = 0.9; // seconds between a fall/miss and the respawn

const _p = new Vector3();
const _seg = new Vector3();
const _f = new Vector3();

export class Race {
  constructor(track, { tickRate = PHYSICS.tickRate } = {}) {
    this.track = track;
    this.tickRate = tickRate;
    this.car = new CarPhysics(track.world);
    this.prevPos = new Vector3();
    this.prevQuat = new Quaternion();
    this.events = [];
    this.restart();
  }

  restart() {
    const s = this.track.start.spawn;
    this.car.reset(s.pos, s.quat);
    this.prevPos.copy(this.car.position);
    this.prevQuat.copy(this.car.quaternion);
    this.state = 'countdown';
    this.stateTicks = 0;
    this.raceTicks = 0; // ticks since GO
    this.nextCheckpoint = 0;
    this.splits = []; // seconds at each checkpoint
    this.finishTime = null;
    this.respawnTimer = 0;
    this.respawnReason = null;
    this.respawns = 0;
    this.lastSpawn = { pos: s.pos.clone(), quat: s.quat.clone(), speed: 0 };
    this.events.length = 0;
    this.emit('restart');
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents(out = []) {
    for (const e of this.events) out.push(e);
    this.events.length = 0;
    return out;
  }

  /** Race clock in seconds (frozen after the finish). */
  get time() {
    if (this.finishTime !== null) return this.finishTime;
    return this.raceTicks / this.tickRate;
  }

  get checkpointCount() {
    return this.track.checkpoints.length;
  }

  /** Put the car back at the last checkpoint (or start) with its entry speed. */
  respawn(reason = 'manual') {
    if (this.state === 'finished') return;
    const sp = this.lastSpawn;
    _f.set(0, 0, 1).applyQuaternion(sp.quat).multiplyScalar(sp.speed);
    this.car.reset(sp.pos, sp.quat, _f);
    this.prevPos.copy(this.car.position);
    this.prevQuat.copy(this.car.quaternion);
    this.respawnTimer = 0;
    this.respawnReason = null;
    this.respawns++;
    this.emit('respawn', { reason });
  }

  /** Schedule an automatic respawn (falls, flips, missed checkpoints). */
  fail(reason) {
    if (this.respawnTimer > 0 || this.state !== 'racing') return;
    this.respawnTimer = RESPAWN_DELAY;
    this.respawnReason = reason;
    this.emit('fail', { reason });
  }

  step(dt, controls) {
    const car = this.car;
    this.prevPos.copy(car.position);
    this.prevQuat.copy(car.quaternion);
    this.stateTicks++;

    if (this.state === 'countdown') {
      const remaining = COUNTDOWN_TICKS - this.stateTicks;
      const beat = Math.ceil(remaining / (COUNTDOWN_TICKS / 3));
      if (beat !== this._lastBeat && remaining > 0) {
        this._lastBeat = beat;
        this.emit('countdown', { n: beat });
      }
      car.step(dt, NO_INPUT); // settle on the suspension, no driving
      if (remaining <= 0) {
        this.state = 'racing';
        this.stateTicks = 0;
        this._lastBeat = null;
        this.emit('go');
      }
      return;
    }

    if (this.state === 'finished') {
      // Coast to a stop after the line.
      car.step(dt, { throttle: 0, brake: 0.35, steer: 0, drift: false });
      return;
    }

    // Racing.
    this.raceTicks++;
    const failing = this.respawnTimer > 0;
    car.step(dt, failing ? NO_INPUT : controls);

    if (failing) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(this.respawnReason);
      return;
    }

    this._checkGates();
    if (this.state !== 'racing') return;

    if (car.position.y < this.track.killY) this.fail('fall');
    else if (car.flippedTime > 1.0) this.fail('flip');
    else if (car.airTime > 6) this.fail('fall');
  }

  _crossing(gate) {
    const a = this.prevPos, b = this.car.position;
    const d0 = _p.subVectors(a, gate.center).dot(gate.forward);
    const d1 = _p.subVectors(b, gate.center).dot(gate.forward);
    if ((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0)) {
      const f = d0 / (d0 - d1);
      _p.copy(_seg.subVectors(b, a)).multiplyScalar(f).add(a).sub(gate.center);
      const lateral = Math.abs(_p.dot(gate.right));
      const h = _p.dot(gate.up);
      if (lateral <= gate.halfWidth && h > -1.5 && h < gate.height) return { f, forward: d1 > d0 };
    }
    return null;
  }

  _checkGates() {
    const cps = this.track.checkpoints;
    // Expected checkpoint.
    if (this.nextCheckpoint < cps.length) {
      const gate = cps[this.nextCheckpoint];
      const hit = this._crossing(gate);
      if (hit) {
        const t = (this.raceTicks - 1 + hit.f) / this.tickRate;
        this.splits.push(t);
        const speed = Math.max(0, this.car.velocity.dot(gate.forward));
        const quat = gate.spawn.quat.clone();
        if (!hit.forward) quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
        this.lastSpawn = { pos: gate.spawn.pos.clone(), quat, speed: Math.min(speed, 45) };
        this.emit('checkpoint', { index: this.nextCheckpoint, time: t });
        this.nextCheckpoint++;
        return;
      }
    }
    // Skipping ahead (later checkpoint or the finish too early) = missed.
    for (let i = this.nextCheckpoint + 1; i < cps.length; i++) {
      if (this._crossing(cps[i])) {
        this.emit('missed', { expected: this.nextCheckpoint });
        this.fail('missed');
        return;
      }
    }
    if (this.track.finish && this._crossing(this.track.finish)) {
      if (this.nextCheckpoint >= cps.length) {
        const hit = this._crossing(this.track.finish);
        this.finishTime = (this.raceTicks - 1 + hit.f) / this.tickRate;
        this.state = 'finished';
        this.emit('finish', { time: this.finishTime, splits: [...this.splits] });
      } else {
        this.emit('missed', { expected: this.nextCheckpoint });
        this.fail('missed');
      }
    }
  }
}

const NO_INPUT = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: false });
