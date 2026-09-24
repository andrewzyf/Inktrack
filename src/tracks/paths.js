import { Vector3 } from 'three';

/**
 * Road centre-line paths. A path maps t ∈ [0, 1] to a frame:
 *   pos     — point on the road surface centre line
 *   tangent — unit direction of travel
 *   up      — unit road-surface normal (banking / loops rotate this)
 *   right   — tangent × up (driver's right-hand side)
 * Pieces are built from these, and the same frames drive geometry, collision,
 * checkpoints and the autopilot's racing line, so they always agree.
 */

export function makeFrame() {
  return { pos: new Vector3(), tangent: new Vector3(), up: new Vector3(), right: new Vector3() };
}

const _a = new Vector3();
const _b = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Build a path from a position function and an optional up function.
 * position(t, out) writes the centre point; up(t, pos, tangent, out) writes the
 * desired surface normal (it is re-orthogonalised against the tangent).
 */
export function createPath(position, up = null, length = null) {
  const path = {
    position,
    upFn: up,
    length: 0,
    frame(t, out) {
      const eps = 1e-4;
      position(t, out.pos);
      position(Math.min(1, t + eps), _a);
      position(Math.max(0, t - eps), _b);
      out.tangent.subVectors(_a, _b).normalize();
      if (up) up(t, out.pos, out.tangent, out.up);
      else out.up.copy(WORLD_UP);
      out.up.addScaledVector(out.tangent, -out.up.dot(out.tangent)).normalize();
      out.right.crossVectors(out.tangent, out.up).normalize();
      return out;
    },
  };
  path.length = length ?? measure(position);
  return path;
}

function measure(position, steps = 64) {
  let len = 0;
  const p0 = new Vector3(), p1 = new Vector3();
  position(0, p0);
  for (let i = 1; i <= steps; i++) {
    position(i / steps, p1);
    len += p1.distanceTo(p0);
    p0.copy(p1);
  }
  return len;
}

export const smoothstep = (t) => t * t * (3 - 2 * t);
/** Quintic smoothstep — zero first and second derivative at the ends. */
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Straight segment from `a` to `b` with an optional constant up vector. */
export function linePath(a, b, up = WORLD_UP) {
  const A = a.clone(), B = b.clone(), U = up.clone();
  return createPath(
    (t, out) => out.lerpVectors(A, B, t),
    (t, p, tan, out) => out.copy(U),
    A.distanceTo(B),
  );
}

/**
 * Vertical loop. Starts at `start` heading along `dir`, climbs a circle of
 * `radius` and comes back down shifted sideways by `shift` (along `side`) so
 * the exit clears the entry.
 */
export function loopPath(start, dir, side, radius, shift) {
  const S = start.clone(), D = dir.clone().normalize(), L = side.clone().normalize();
  const center = new Vector3();
  return createPath(
    (t, out) => {
      const th = t * Math.PI * 2;
      out.copy(S)
        .addScaledVector(D, radius * Math.sin(th))
        .addScaledVector(WORLD_UP, radius * (1 - Math.cos(th)))
        .addScaledVector(L, shift * smootherstep(t));
      return out;
    },
    (t, p, tan, out) => {
      center.copy(S).addScaledVector(WORLD_UP, radius).addScaledVector(L, shift * smootherstep(t));
      return out.subVectors(center, p).normalize();
    },
  );
}

/** Wrap a path with a rigid transform (quaternion + offset). */
export function transformPath(path, quaternion, offset) {
  const q = quaternion.clone(), o = offset.clone();
  return {
    length: path.length,
    frame(t, out) {
      path.frame(t, out);
      out.pos.applyQuaternion(q).add(o);
      out.tangent.applyQuaternion(q);
      out.up.applyQuaternion(q);
      out.right.applyQuaternion(q);
      return out;
    },
  };
}

/** Traverse a path backwards (tangent and right flip, up stays). */
export function reversePath(path) {
  return {
    length: path.length,
    frame(t, out) {
      path.frame(1 - t, out);
      out.tangent.negate();
      out.right.negate();
      return out;
    },
  };
}
