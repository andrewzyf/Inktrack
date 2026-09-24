import { Vector3 } from 'three';

const _to = new Vector3();
const _f = new Vector3();
const _up = new Vector3();
const _c = new Vector3();

/**
 * Drives a car along a track's route (racing line). Used by the headless
 * lap tests, the menu's attract mode and as a debugging aid (`?autopilot`).
 * Steering: pure-pursuit on a speed-scaled lookahead. Speed: brakes for the
 * tightest upcoming corner using the route's geodesic curvature (so loops,
 * which curve vertically, don't count as corners).
 */
export class Autopilot {
  constructor(route, { maxLatAccel = 44, steerGain = 2.6, aggression = 1 } = {}) {
    this.route = route;
    this.maxLatAccel = maxLatAccel * aggression;
    this.steerGain = steerGain;
    this.index = 0;
    this.car = null;
    // Pre-compute signed road-plane curvature per route point.
    this.curv = new Float32Array(route.length);
    for (let i = 1; i < route.length - 1; i++) {
      const a = route[i - 1], b = route[i + 1];
      const ds = b.dist - a.dist;
      if (ds <= 1e-3 || b.gap || a.gap) continue;
      _c.subVectors(b.tangent, a.tangent);
      this.curv[i] = Math.abs(_c.dot(route[i].right)) / ds;
    }
  }

  attach(car) {
    this.car = car;
    this.relocate();
  }

  /** Re-find the nearest route point (after a respawn). */
  relocate() {
    let best = Infinity;
    const p = this.car.position;
    for (let i = 0; i < this.route.length; i++) {
      const d = this.route[i].pos.distanceToSquared(p);
      if (d < best) { best = d; this.index = i; }
    }
  }

  _advance() {
    const p = this.car.position;
    const r = this.route;
    let best = r[this.index].pos.distanceToSquared(p);
    let bestI = this.index;
    for (let i = this.index + 1; i < Math.min(r.length, this.index + 60); i++) {
      const d = r[i].pos.distanceToSquared(p);
      if (d < best) { best = d; bestI = i; }
    }
    if (best > 400) this.relocate();
    else this.index = bestI;
  }

  _pointAhead(dist) {
    const r = this.route;
    const target = r[this.index].dist + dist;
    let i = this.index;
    while (i < r.length - 1 && r[i].dist < target) i++;
    return i;
  }

  /** Fill a controls object for this tick. */
  sample(out) {
    const car = this.car;
    out.throttle = 0; out.brake = 0; out.steer = 0; out.drift = false;
    if (!car) return out;
    this._advance();
    const speed = Math.max(0, car.forwardSpeed);
    const r = this.route;

    // Steering toward a lookahead point, in the car's own plane.
    const ti = this._pointAhead(5 + speed * 0.28);
    const tp = r[ti].pos;
    car.getUp(_up);
    car.getForward(_f);
    _to.subVectors(tp, car.position);
    _to.addScaledVector(_up, -_to.dot(_up));
    _f.addScaledVector(_up, -_f.dot(_up)).normalize();
    if (_to.lengthSq() > 1e-4) {
      _to.normalize();
      const cross = _c.crossVectors(_f, _to).dot(_up); // + → target is to the left
      const angle = Math.atan2(cross, _f.dot(_to));
      out.steer = Math.max(-1, Math.min(1, -angle * this.steerGain));
    }

    // Speed: plan for the tightest corner within braking reach.
    const horizon = this._pointAhead(12 + speed * 1.1);
    let limit = Infinity;
    for (let i = this.index; i <= horizon; i++) {
      const k = this.curv[i];
      if (k < 1e-3) continue;
      const radius = 1 / k;
      const v = Math.min(Math.sqrt(this.maxLatAccel * radius), radius * 2.35);
      const d = Math.max(0, r[i].dist - r[this.index].dist);
      // v² = v_corner² + 2·a·d with a ≈ braking decel
      limit = Math.min(limit, Math.sqrt(v * v + 2 * 30 * d));
    }
    if (speed > limit + 1.5) out.brake = 1;
    else if (speed < limit - 0.5 || !car.grounded) out.throttle = 1;
    else out.throttle = 0.5;
    return out;
  }
}
