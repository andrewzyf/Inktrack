import { Vector3, Quaternion } from 'three';
import { decodeFloats } from './codec.js';
import { GHOST_STRIDE } from './Recorder.js';

const _a = new Quaternion();
const _b = new Quaternion();
const P = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

/**
 * Plays back a recorded ghost: Catmull-Rom interpolation for position (keeps
 * the racing line round at 30 Hz) and slerp for orientation.
 */
export class GhostPlayer {
  constructor(ghost) {
    this.ghost = ghost;
    this.data = decodeFloats(ghost.data);
    this.count = Math.floor(this.data.length / GHOST_STRIDE);
    this.rate = ghost.rate;
    this.time = ghost.time;
    this.flags = 0;
  }

  get duration() {
    return (this.count - 1) / this.rate;
  }

  _pos(i, out) {
    const k = Math.max(0, Math.min(this.count - 1, i)) * GHOST_STRIDE;
    return out.set(this.data[k], this.data[k + 1], this.data[k + 2]);
  }

  _quat(i, out) {
    const k = Math.max(0, Math.min(this.count - 1, i)) * GHOST_STRIDE;
    return out.set(this.data[k + 3], this.data[k + 4], this.data[k + 5], this.data[k + 6]).normalize();
  }

  /** Pose at race time `t` (seconds since GO). Returns false past the end. */
  sample(t, outPos, outQuat) {
    if (this.count === 0) return false;
    const f = Math.max(0, t) * this.rate;
    const i = Math.floor(f);
    const u = f - i;
    if (i >= this.count - 1) {
      this._pos(this.count - 1, outPos);
      this._quat(this.count - 1, outQuat);
      this.flags = this.data[(this.count - 1) * GHOST_STRIDE + 7];
      return false;
    }
    this._pos(i - 1, P[0]);
    this._pos(i, P[1]);
    this._pos(i + 1, P[2]);
    this._pos(i + 2, P[3]);
    // Respawns teleport the car: never interpolate across a jump.
    const JUMP = 144; // (12 m)²
    if (P[1].distanceToSquared(P[2]) > JUMP) {
      outPos.copy(u < 0.5 ? P[1] : P[2]);
      this._quat(u < 0.5 ? i : i + 1, outQuat);
      this.flags = this.data[i * GHOST_STRIDE + 7];
      return true;
    }
    if (P[0].distanceToSquared(P[1]) > JUMP) P[0].copy(P[1]);
    if (P[3].distanceToSquared(P[2]) > JUMP) P[3].copy(P[2]);
    // Uniform Catmull-Rom.
    const u2 = u * u, u3 = u2 * u;
    const c0 = -0.5 * u3 + u2 - 0.5 * u;
    const c1 = 1.5 * u3 - 2.5 * u2 + 1;
    const c2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
    const c3 = 0.5 * u3 - 0.5 * u2;
    outPos.set(0, 0, 0).addScaledVector(P[0], c0).addScaledVector(P[1], c1).addScaledVector(P[2], c2).addScaledVector(P[3], c3);
    this._quat(i, _a);
    this._quat(i + 1, _b);
    if (_a.dot(_b) < 0) _b.set(-_b.x, -_b.y, -_b.z, -_b.w);
    outQuat.slerpQuaternions(_a, _b, u);
    this.flags = this.data[i * GHOST_STRIDE + 7];
    return true;
  }
}
