// Prints handling metrics for the current src/config/physics.js — handy when tuning.
// Usage: node scripts/physics-report.mjs
import { Vector3, Quaternion } from 'three';
import { CarPhysics } from '../src/physics/CarPhysics.js';
import { PHYSICS } from '../src/config/physics.js';
import { flatWorld } from '../tests/helpers.js';

const DT = 1 / PHYSICS.tickRate;
const world = flatWorld(6000);
const kmh = (v) => (v * 3.6).toFixed(0) + ' km/h';
function car(speed = 0) {
  const c = new CarPhysics(world);
  c.reset(new Vector3(0, PHYSICS.car.rideHeight, -2800), new Quaternion(), new Vector3(0, 0, speed));
  return c;
}
function until(c, controls, cond, max = 30) {
  let t = 0;
  while (!cond(c) && t < max) { c.step(DT, { throttle: 0, brake: 0, steer: 0, drift: false, ...controls }); t += DT; }
  return t;
}
const rows = [];
let c = car();
rows.push(['0–100 km/h', until(c, { throttle: 1 }, (x) => x.speed >= 100 / 3.6).toFixed(2) + ' s']);
rows.push(['0–200 km/h', (until(c, { throttle: 1 }, (x) => x.speed >= 200 / 3.6) + parseFloat(rows[0][1])).toFixed(2) + ' s']);
c = car(); until(c, { throttle: 1 }, () => false, 20);
rows.push(['Top speed (flat, engine)', kmh(c.speed)]);
c = car(200 / 3.6); const z0 = c.position.z;
rows.push(['Braking 200→0', until(c, { brake: 1 }, (x) => x.speed <= 0.5).toFixed(2) + ' s, ' + (c.position.z - z0).toFixed(1) + ' m']);
for (const v of [15, 30, 45]) {
  c = car(v);
  const yaw0 = 0; let t = 0; const f = new Vector3();
  while (t < 0.8) { c.step(DT, { throttle: 0.4, brake: 0, steer: 1, drift: false }); t += DT; }
  const yawRate = Math.atan2(c.velocity.x, c.velocity.z);
  rows.push([`Grip turn @ ${kmh(v)}: radius`, (c.speed / Math.abs(yawRate / t)).toFixed(1) + ' m, slip ' + (c.slip * 57.3).toFixed(0) + '°']);
  void yaw0; void f;
}
c = car(40); let peak = 0; let t = 0;
while (t < 1.5) { c.step(DT, { throttle: 1, brake: 0, steer: 1, drift: true }); peak = Math.max(peak, c.slip); t += DT; }
rows.push(['Drift @ 144 km/h, 1.5 s', `meter ${(c.driftMeter * 100).toFixed(0)}%, peak slip ${(Math.atan(peak) * 57.3).toFixed(0)}°, speed ${kmh(c.speed)}`]);
c.step(DT, { throttle: 1, brake: 0, steer: 0, drift: false });
rows.push(['  → boost on release', c.boostTime.toFixed(2) + ' s']);
let top = 0; t = 0;
while (t < 3) { c.step(DT, { throttle: 1, brake: 0, steer: 0, drift: false }); top = Math.max(top, c.speed); t += DT; }
rows.push(['  → peak speed after release', kmh(top)]);
const w = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(k.padEnd(w + 2), v);
