import { Vector3 } from 'three';

const _to = new Vector3();

/**
 * Autopilot for planes: aims at a point on the course a speed-scaled
 * distance ahead and turns the heading / climb errors into steer and
 * up/down inputs. Same interface as `Autopilot`.
 */
export class FlightAutopilot {
  constructor(route, { aggression = 1 } = {}) {
    this.route = route;
    this.lookTime = 0.55 / Math.max(0.5, aggression);
    this.index = 0;
    this.car = null;
  }

  attach(car) {
    this.car = car;
    this.relocate();
  }

  relocate() {
    let best = Infinity;
    const p = this.car.position;
    for (let i = 0; i < this.route.length; i++) {
      const d = this.route[i].pos.distanceToSquared(p);
      if (d < best) { best = d; this.index = i; }
    }
  }

  sample(out) {
    const car = this.car;
    const r = this.route;
    const p = car.position;
    let best = Infinity, bi = this.index;
    for (let i = this.index; i < Math.min(r.length, this.index + 80); i++) {
      const d = r[i].pos.distanceToSquared(p);
      if (d < best) { best = d; bi = i; }
    }
    this.index = bi;
    const want = r[bi].dist + Math.max(14, car.speed * this.lookTime);
    let j = bi;
    while (j < r.length - 1 && r[j].dist < want) j++;
    _to.subVectors(r[j].pos, p);
    const yawTo = Math.atan2(_to.x, _to.z);
    let dyaw = yawTo - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const flat = Math.hypot(_to.x, _to.z);
    const pitchTo = Math.atan2(_to.y, Math.max(1, flat));
    const dp = pitchTo - car.pitch;
    out.steer = Math.max(-1, Math.min(1, -dyaw * 3.2));
    const pitchCmd = Math.max(-1, Math.min(1, dp * 4));
    out.throttle = pitchCmd > 0.05 ? pitchCmd : 0;
    out.brake = pitchCmd < -0.05 ? -pitchCmd : 0;
    out.drift = false;
    return out;
  }
}
