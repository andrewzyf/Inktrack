import { encodeFloats } from './codec.js';

export const GHOST_STRIDE = 8; // px, py, pz, qx, qy, qz, qw, flags
export const FLAG_DRIFT = 1;
export const FLAG_BOOST = 2;
export const FLAG_AIR = 4;

/**
 * Records the player's car during a race: position + orientation (+ state
 * flags) every `every` physics ticks, i.e. 30 samples/s at 120 Hz. Sample k is
 * exactly race tick k·every, so playback is frame-rate independent.
 */
export class Recorder {
  constructor(tickRate = 120, every = 4) {
    this.tickRate = tickRate;
    this.every = every;
    this.buf = new Float32Array(GHOST_STRIDE * 2048);
    this.count = 0;
  }

  reset() {
    this.count = 0;
  }

  get rate() {
    return this.tickRate / this.every;
  }

  _push(car) {
    if ((this.count + 1) * GHOST_STRIDE > this.buf.length) {
      const next = new Float32Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    const o = this.count * GHOST_STRIDE;
    const p = car.position, q = car.quaternion;
    this.buf[o] = p.x; this.buf[o + 1] = p.y; this.buf[o + 2] = p.z;
    this.buf[o + 3] = q.x; this.buf[o + 4] = q.y; this.buf[o + 5] = q.z; this.buf[o + 6] = q.w;
    this.buf[o + 7] = (car.drifting ? FLAG_DRIFT : 0) | (car.boosting ? FLAG_BOOST : 0) | (car.grounded ? 0 : FLAG_AIR);
    this.count++;
  }

  /** Call once per racing tick with the race tick counter (0 at GO). */
  capture(raceTicks, car) {
    if (raceTicks % this.every !== 0) return;
    const index = raceTicks / this.every;
    // Fill any gap (shouldn't happen) by repeating the last pose.
    while (this.count < index) this._push(car);
    if (this.count === index) this._push(car);
  }

  /** Final pose at the finish (so the ghost reaches the line). */
  finish(car) {
    this._push(car);
  }

  toGhost({ time, splits = [], trackKey = '' }) {
    return {
      v: 1,
      trackKey,
      time,
      splits,
      rate: this.rate,
      samples: this.count,
      date: Date.now(),
      data: encodeFloats(this.buf.subarray(0, this.count * GHOST_STRIDE)),
    };
  }
}
