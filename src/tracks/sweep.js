import { Vector3, Vector2, Color, ShapeUtils } from 'three';
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

// ── render geometry ─────────────────────────────────────────────────────

/**
 * Road cross-section as a closed polygon in (s = lateral, h = height) space,
 * wound so each edge's outward normal is (-dh, ds). Each edge has a `kind`
 * used for colouring / UVs.
 */
export function roadProfile({ width = 8.4, walls = [true, true], wallHeight = 1.0, wallThickness = 0.5, slab = 0.7 } = {}) {
  const W = width / 2;
  const T = wallThickness;
  const H = wallHeight;
  const pts = [];
  const push = (s, h, kind) => pts.push({ s, h, kind }); // `kind` = edge from this point to the next
  push(-W, 0, 'road');
  if (walls[1] && H > 0) {
    push(W, 0, 'wallInner');
    push(W, H, 'wallTop');
    push(W + T, H, 'wallOuter');
    push(W + T, -slab, 'bottom');
  } else {
    push(W, 0, 'edge');
    push(W, -slab, 'bottom');
  }
  if (walls[0] && H > 0) {
    push(-W - T, -slab, 'wallOuter');
    push(-W - T, H, 'wallTop');
    push(-W, H, 'wallInner');
  } else {
    push(-W, -slab, 'edge');
  }
  // Edge normals and averaged corner normals (for the ink hull).
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ds = b.s - a.s, dh = b.h - a.h;
    const len = Math.hypot(ds, dh) || 1;
    a.ns = -dh / len;
    a.nh = ds / len;
    a.len = len;
  }
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i];
    const s = prev.ns + cur.ns, h = prev.nh + cur.nh;
    const len = Math.hypot(s, h) || 1;
    cur.os = s / len;
    cur.oh = h / len;
  }
  return pts;
}

const _col = new Color();
const _col2 = new Color();
const _P = new Vector3();
const _N = new Vector3();
const _O = new Vector3();

/**
 * Sweep the road profile along `path` into a GeoBuilder.
 * palette: { road, wallInner, wallTop, wallTopAlt, wallOuter, bottom, edge } (hex)
 * The road top gets UVs u ∈ [0, uMax] across and v along (metres / width);
 * every other face samples u = 0.95 — a plain white column of the road atlas.
 */
export function sweepRoadGeometry(builder, path, opts = {}) {
  const {
    width = 8.4,
    walls = [true, true],
    wallHeight = 1.0,
    wallThickness = 0.5,
    slab = 0.7,
    spacing = 2.0,
    samples = Math.max(1, Math.ceil(path.length / spacing)),
    palette = {},
    uMax = 0.86,
    vStart = 0,
    t0 = 0,
    t1 = 1,
    capStart = false,
    capEnd = false,
  } = opts;
  const prof = roadProfile({ width, walls, wallHeight, wallThickness, slab });
  const pal = {
    road: 0xffffff, wallInner: 0xd9d4e8, wallTop: 0xf04a3c, wallTopAlt: 0xffffff,
    wallOuter: 0x8b86a3, bottom: 0x3b3550, edge: 0x6e6888, ...palette,
  };
  const frames = [];
  const dist = [0];
  for (let i = 0; i <= samples; i++) {
    const f = path.frame(t0 + ((t1 - t0) * i) / samples, makeFrame());
    if (i > 0) dist.push(dist[i - 1] + f.pos.distanceTo(frames[i - 1].pos));
    frames.push(f);
  }
  const W = width / 2;
  const vPerMetre = 1 / width;
  const np = prof.length;

  for (let e = 0; e < np; e++) {
    const a = prof[e], b = prof[(e + 1) % np];
    const kind = a.kind;
    const striped = kind === 'wallTop';
    let prevA = -1, prevB = -1;
    for (let i = 0; i <= samples; i++) {
      const f = frames[i];
      _N.copy(f.right).multiplyScalar(a.ns).addScaledVector(f.up, a.nh);
      const color = _col.set(pal[kind] ?? 0xff00ff);
      if (striped && Math.floor(i) % 2 === 1) color.set(pal.wallTopAlt);
      const v = vStart + dist[i] * vPerMetre;
      const ua = kind === 'road' ? ((a.s + W) / (2 * W)) * uMax : 0.95;
      const ub = kind === 'road' ? ((b.s + W) / (2 * W)) * uMax : 0.95;
      const vv = kind === 'road' ? v : 0;
      const pa = _P.copy(f.pos).addScaledVector(f.right, a.s).addScaledVector(f.up, a.h);
      const oa = outlineNormalAt(_O, f, a, i, samples, capStart, capEnd);
      const ia = builder.vertex(pa, _N, color, ua, vv, oa);
      const pb = _P.copy(f.pos).addScaledVector(f.right, b.s).addScaledVector(f.up, b.h);
      const ob = outlineNormalAt(_O, f, b, i, samples, capStart, capEnd);
      const ib = builder.vertex(pb, _N, color, ub, vv, ob);
      if (i > 0) {
        if (striped) {
          // Stripes need their own colour per segment: re-emit the previous ring's pair.
          const fp = frames[i - 1];
          const pa0 = _P.copy(fp.pos).addScaledVector(fp.right, a.s).addScaledVector(fp.up, a.h);
          const n0 = _col2.set(color);
          const na = new Vector3().copy(fp.right).multiplyScalar(a.ns).addScaledVector(fp.up, a.nh);
          const ja = builder.vertex(pa0, na, n0, 0.95, 0, outlineNormalAt(new Vector3(), fp, a, i - 1, samples, capStart, capEnd));
          const pb0 = _P.copy(fp.pos).addScaledVector(fp.right, b.s).addScaledVector(fp.up, b.h);
          const jb = builder.vertex(pb0, na, n0, 0.95, 0, outlineNormalAt(new Vector3(), fp, b, i - 1, samples, capStart, capEnd));
          builder.quad(ja, jb, ib, ia);
        } else {
          builder.quad(prevA, prevB, ib, ia);
        }
      }
      prevA = ia;
      prevB = ib;
    }
  }
  if (capStart) addCap(builder, frames[0], prof, -1, pal.wallOuter, samples, capStart, capEnd);
  if (capEnd) addCap(builder, frames[samples], prof, 1, pal.wallOuter, samples, capStart, capEnd);
  return { length: dist[samples] };
}

function outlineNormalAt(out, f, pt, i, samples, capStart, capEnd) {
  out.copy(f.right).multiplyScalar(pt.os).addScaledVector(f.up, pt.oh);
  if (capStart && i === 0) out.addScaledVector(f.tangent, -0.8);
  if (capEnd && i === samples) out.addScaledVector(f.tangent, 0.8);
  return out.normalize();
}

function addCap(builder, f, prof, sign, color, samples, capStart, capEnd) {
  const contour = prof.map((p) => new Vector2(p.s, p.h));
  const tris = ShapeUtils.triangulateShape(contour, []);
  const n = new Vector3().copy(f.tangent).multiplyScalar(sign);
  const c = _col.set(color);
  const base = [];
  prof.forEach((p, k) => {
    const pos = new Vector3().copy(f.pos).addScaledVector(f.right, p.s).addScaledVector(f.up, p.h);
    const o = outlineNormalAt(new Vector3(), f, p, sign < 0 ? 0 : samples, samples, capStart, capEnd);
    base[k] = builder.vertex(pos, n, c, 0.95, 0, o);
  });
  // Pick the winding per triangle so the cap faces outward along the path.
  const P = builder.pos;
  const e1 = new Vector3(), e2 = new Vector3();
  for (const [a, b, d] of tris) {
    const ia = base[a] * 3, ib = base[b] * 3, id = base[d] * 3;
    e1.set(P[ib] - P[ia], P[ib + 1] - P[ia + 1], P[ib + 2] - P[ia + 2]);
    e2.set(P[id] - P[ia], P[id + 1] - P[ia + 1], P[id + 2] - P[ia + 2]);
    if (e1.cross(e2).dot(n) >= 0) builder.tri(base[a], base[b], base[d]);
    else builder.tri(base[a], base[d], base[b]);
  }
}
