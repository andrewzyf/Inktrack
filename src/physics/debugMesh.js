import { BufferGeometry, Float32BufferAttribute } from 'three';
import { DRIVABLE, GUIDED, SURFACE } from './CollisionWorld.js';

/** Flat-coloured geometry of a CollisionWorld, for debugging collision shapes. */
export function collisionDebugGeometry(world) {
  const pos = world.pos;
  const colors = new Float32Array(world.count * 9);
  const normals = new Float32Array(world.count * 9);
  for (let t = 0; t < world.count; t++) {
    let c;
    const flags = world.flags[t];
    if (flags & DRIVABLE) {
      if (world.surface[t] === SURFACE.ICE) c = [0.75, 0.9, 1];
      else if (world.surface[t] === SURFACE.BOOST) c = [1, 0.55, 0.1];
      else if (flags & GUIDED) c = [0.55, 0.5, 0.75];
      else c = [0.45, 0.47, 0.52];
    } else c = [0.9, 0.25, 0.25];
    for (let v = 0; v < 3; v++) {
      colors.set(c, t * 9 + v * 3);
      normals.set([world.faceN[t * 3], world.faceN[t * 3 + 1], world.faceN[t * 3 + 2]], t * 9 + v * 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
