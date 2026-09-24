import { Vector3, Quaternion } from 'three';
import { CarPhysics } from '../../src/physics/CarPhysics.js';
import { CollisionWorld } from '../../src/physics/CollisionWorld.js';
import { createPath, linePath, loopPath } from '../../src/tracks/paths.js';
import { addRoadCollision } from '../../src/tracks/sweep.js';
const which = process.argv[2];
const world = new CollisionWorld();
let car = new CarPhysics(world);
if (which === 'kick') {
  addRoadCollision(world, linePath(new Vector3(0, 0, -200), new Vector3(0, 0, 0)), { walls: [false, false], width: 12 });
  addRoadCollision(world, createPath((t, o) => o.set(0, 2 * t * t, t * 10)), { walls: [false, false], width: 12, samples: 20 });
  addRoadCollision(world, linePath(new Vector3(0, 0, 40), new Vector3(0, 0, 400)), { walls: [false, false], width: 12 });
  world.build();
  car.reset(new Vector3(0, 0.55, -60), new Quaternion(), new Vector3(0,0,40));
} else {
  addRoadCollision(world, linePath(new Vector3(0, 0, -150), new Vector3(0, 0, 0)), { walls: [false, false] });
  addRoadCollision(world, loopPath(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0), 9, 10), { samples: 96, guided: true });
  addRoadCollision(world, linePath(new Vector3(10, 0, 0), new Vector3(10, 0, 200)), { walls: [false, false] });
  world.build();
  car.reset(new Vector3(0, 0.55, -40), new Quaternion(), new Vector3(0,0,+process.argv[3]||38));
}
const up = new Vector3();
for (let i = 0; i < 600; i++) {
  car.step(1/120, { throttle: which==='kick'||process.argv[3]>20?1:0, brake: 0, steer: 0, drift: false });
  const ev = car.drainEvents().map(e=>e.type+':'+e.value.toFixed(1)).join(',');
  if (i % 6 === 0 || ev) console.log(i, car.position.toArray().map(v=>v.toFixed(2)).join(' '), 'v', car.velocity.length().toFixed(1), 'g', car.grounded, car.contactCount, car.groundDistance.toFixed(2), 'up', car.getUp(up).toArray().map(v=>v.toFixed(2)).join(' '), ev);
  if (car.position.z > +(process.argv[4]||60)) break;
}
