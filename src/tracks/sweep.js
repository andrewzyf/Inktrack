import { Vector3 } from 'three';
import { makeFrame } from './paths.js';
import { DRIVABLE, WALL, SURFACE } from '../physics/CollisionWorld.js';

const _tan = new Vector3();

/**
 * Sweep a road cross-section along a path into collision triangles.
 * The drivable surface gets per-vertex normals from the analytic path frames,
 * so the car feels a perfectly smooth surface even on coarse geometry.
 */
export function addRoadCollision(world, path, opts = {}) {
  const {
    samples = Math.max(2, Math.ceil(path.length / 2)),
    width = 8.4,
    wallHeight = 1.1,
    walls = [true, true], // [left, right]
    surface = SURFACE.ROAD,
    t0 = 0,
    t1 = 1,
    guided = false,
  } = opts;
  const half = width / 2;
  let f0 = makeFrame(), f1 = makeFrame();
  const L0 = new Vector3(), R0 = new Vector3(), L1 = new Vector3(), R1 = new Vector3();
  const L0h = new Vector3(), R0h = new Vector3(), L1h = new Vector3(), R1h = new Vector3();
  const nl0 = new Vector3(), nl1 = new Vector3(), nr0 = new Vector3(), nr1 = new Vector3();

  path.frame(t0, f0);
  for (let i = 1; i <= samples; i++) {
    path.frame(t0 + ((t1 - t0) * i) / samples, f1);
    L0.copy(f0.pos).addScaledVector(f0.right, -half);
    R0.copy(f0.pos).addScaledVector(f0.right, half);
    L1.copy(f1.pos).addScaledVector(f1.right, -half);
    R1.copy(f1.pos).addScaledVector(f1.right, half);
    // Road surface (normal = up).
    const ta = world.addTriangle(L0, R0, R1, DRIVABLE, surface, f0.up, f0.up, f1.up);
    const tb = world.addTriangle(L0, R1, L1, DRIVABLE, surface, f0.up, f1.up, f1.up);
    if (guided) {
      _tan.addVectors(f0.tangent, f1.tangent).normalize();
      world.setGuide(ta, _tan);
      world.setGuide(tb, _tan);
    }

    if (walls[0] && wallHeight > 0) {
      L0h.copy(L0).addScaledVector(f0.up, wallHeight);
      L1h.copy(L1).addScaledVector(f1.up, wallHeight);
      nl0.copy(f0.right);
      nl1.copy(f1.right);
      world.addTriangle(L0, L1, L1h, WALL, 0, nl0, nl1, nl1);
      world.addTriangle(L0, L1h, L0h, WALL, 0, nl0, nl1, nl0);
    }
    if (walls[1] && wallHeight > 0) {
      R0h.copy(R0).addScaledVector(f0.up, wallHeight);
      R1h.copy(R1).addScaledVector(f1.up, wallHeight);
      nr0.copy(f0.right).negate();
      nr1.copy(f1.right).negate();
      world.addTriangle(R0, R0h, R1h, WALL, 0, nr0, nr0, nr1);
      world.addTriangle(R0, R1h, R1, WALL, 0, nr0, nr1, nr1);
    }
    const tmp = f0;
    f0 = f1;
    f1 = tmp;
  }
}
