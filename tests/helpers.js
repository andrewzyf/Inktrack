import { Vector3, Quaternion } from 'three';
import { CollisionWorld, DRIVABLE } from '../src/physics/CollisionWorld.js';

/** Flat drivable plane made of 10 m tiles, centred on the origin. */
export function flatWorld(size = 600) {
  const world = new CollisionWorld();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3();
  for (let x = -size / 2; x < size / 2; x += 10) {
    for (let z = -size / 2; z < size / 2; z += 10) {
      a.set(x, 0, z); b.set(x, 0, z + 10); c.set(x + 10, 0, z + 10); d.set(x + 10, 0, z);
      world.addTriangle(a, b, c, DRIVABLE);
      world.addTriangle(a, c, d, DRIVABLE);
    }
  }
  return world.build();
}

export function drive(car, seconds, controls, dt = 1 / 120) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) car.step(dt, { throttle: 0, brake: 0, steer: 0, drift: false, ...controls });
}

export function heading(car) {
  const f = new Vector3(0, 0, 1).applyQuaternion(car.quaternion);
  return Math.atan2(f.x, f.z);
}

export { Vector3, Quaternion };
