import { Vector3 } from 'three';

/**
 * Static triangle soup with a uniform 3D spatial hash, used for all car
 * collision queries (wheel rays, body spheres, continuous "anti-tunnelling"
 * rays). Deliberately tiny and allocation-free in the hot path so it stays
 * cheap on mobile CPUs.
 */

/** Triangle flags */
export const DRIVABLE = 1; // road surfaces the wheels can stand on
export const WALL = 2; // barriers, pillars, undersides
/** Drivable triangles whose road direction steers the car (loops), see setGuide(). */
export const GUIDED = 4;
export const ANY = DRIVABLE | WALL;

/** Surface types for drivable triangles */
export const SURFACE = Object.freeze({ ROAD: 0, ICE: 1, BOOST: 2 });

const OFFSET = 1024; // grid index offset so negative cells hash to positive keys
const SPAN = 2048;

function cellKey(ix, iy, iz) {
  return ((ix + OFFSET) * SPAN + (iy + OFFSET)) * SPAN + (iz + OFFSET);
}

const _e1 = new Vector3();
const _e2 = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

export class RayHit {
  constructor() {
    this.hit = false;
    this.distance = Infinity;
    this.point = new Vector3();
    this.normal = new Vector3(); // interpolated (smooth) normal
    this.faceNormal = new Vector3();
    this.guide = new Vector3(); // road direction on GUIDED triangles
    this.flags = 0;
    this.surface = 0;
    this.triangle = -1;
  }
  reset() {
    this.hit = false;
    this.distance = Infinity;
    this.triangle = -1;
    return this;
  }
}

export class CollisionWorld {
  constructor(cellSize = 6) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this._pos = [];
    this._nrm = [];
    this._flags = [];
    this._surface = [];
    this._guides = [];
    this.count = 0;
    this.grid = new Map();
    this.built = false;
    this.bounds = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  }

  /**
   * Add a triangle. `na/nb/nc` are optional per-vertex normals used to
   * interpolate a smooth contact normal (keeps loops and curves silky even
   * though the geometry is faceted).
   */
  addTriangle(a, b, c, flags = DRIVABLE, surface = SURFACE.ROAD, na = null, nb = null, nc = null) {
    _e1.subVectors(b, a);
    _e2.subVectors(c, a);
    _p.crossVectors(_e1, _e2);
    const len = _p.length();
    if (len < 1e-9) return -1; // degenerate
    _p.multiplyScalar(1 / len);
    this._pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const n0 = na || _p;
    const n1 = nb || _p;
    const n2 = nc || _p;
    this._nrm.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
    this._flags.push(flags);
    this._surface.push(surface);
    this.built = false;
    return this.count++;
  }

  /**
   * Mark triangle `t` as GUIDED: while the car's wheels are on it, its heading
   * is carried along `tangent` (used by loops so they need no steering).
   */
  setGuide(t, tangent) {
    if (t < 0) return;
    this._flags[t] |= GUIDED;
    this._guides.push(t, tangent.x, tangent.y, tangent.z);
  }

  /** Add an indexed or non-indexed triangle list (positions as flat arrays). */
  addMesh(positions, indices, flags, surface = SURFACE.ROAD, normals = null) {
    const va = new Vector3(), vb = new Vector3(), vc = new Vector3();
    const na = new Vector3(), nb = new Vector3(), nc = new Vector3();
    const triCount = indices ? indices.length / 3 : positions.length / 9;
    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
      va.fromArray(positions, i0 * 3);
      vb.fromArray(positions, i1 * 3);
      vc.fromArray(positions, i2 * 3);
      if (normals) {
        na.fromArray(normals, i0 * 3);
        nb.fromArray(normals, i1 * 3);
        nc.fromArray(normals, i2 * 3);
        this.addTriangle(va, vb, vc, flags, surface, na, nb, nc);
      } else {
        this.addTriangle(va, vb, vc, flags, surface);
      }
    }
  }

  build() {
    this.pos = new Float32Array(this._pos);
    this.nrm = new Float32Array(this._nrm);
    this.flags = new Uint8Array(this._flags);
    this.surface = new Uint8Array(this._surface);
    this.faceN = new Float32Array(this.count * 3);
    this.guide = new Float32Array(this.count * 3);
    for (let i = 0; i < this._guides.length; i += 4) {
      const t = this._guides[i];
      this.guide[t * 3] = this._guides[i + 1];
      this.guide[t * 3 + 1] = this._guides[i + 2];
      this.guide[t * 3 + 2] = this._guides[i + 3];
    }
    this.stamp = new Uint32Array(this.count);
    this.queryId = 0;
    this.grid.clear();
    const inv = this.inv;
    const P = this.pos;
    const min = this.bounds.min.set(Infinity, Infinity, Infinity);
    const max = this.bounds.max.set(-Infinity, -Infinity, -Infinity);
    const cells = new Map();
    for (let t = 0; t < this.count; t++) {
      const o = t * 9;
      _a.set(P[o], P[o + 1], P[o + 2]);
      _b.set(P[o + 3], P[o + 4], P[o + 5]);
      _c.set(P[o + 6], P[o + 7], P[o + 8]);
      _e1.subVectors(_b, _a);
      _e2.subVectors(_c, _a);
      _p.crossVectors(_e1, _e2).normalize();
      this.faceN[t * 3] = _p.x;
      this.faceN[t * 3 + 1] = _p.y;
      this.faceN[t * 3 + 2] = _p.z;
      const x0 = Math.min(_a.x, _b.x, _c.x), x1 = Math.max(_a.x, _b.x, _c.x);
      const y0 = Math.min(_a.y, _b.y, _c.y), y1 = Math.max(_a.y, _b.y, _c.y);
      const z0 = Math.min(_a.z, _b.z, _c.z), z1 = Math.max(_a.z, _b.z, _c.z);
      min.x = Math.min(min.x, x0); min.y = Math.min(min.y, y0); min.z = Math.min(min.z, z0);
      max.x = Math.max(max.x, x1); max.y = Math.max(max.y, y1); max.z = Math.max(max.z, z1);
      const ix0 = Math.floor(x0 * inv), ix1 = Math.floor(x1 * inv);
      const iy0 = Math.floor(y0 * inv), iy1 = Math.floor(y1 * inv);
      const iz0 = Math.floor(z0 * inv), iz1 = Math.floor(z1 * inv);
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iy = iy0; iy <= iy1; iy++)
          for (let iz = iz0; iz <= iz1; iz++) {
            const k = cellKey(ix, iy, iz);
            let list = cells.get(k);
            if (!list) cells.set(k, (list = []));
            list.push(t);
          }
    }
    for (const [k, list] of cells) this.grid.set(k, Int32Array.from(list));
    this._pos = this._nrm = this._flags = this._surface = this._guides = null;
    this.built = true;
    return this;
  }

  _nextQuery() {
    this.queryId = (this.queryId + 1) >>> 0;
    if (this.queryId === 0) {
      this.stamp.fill(0);
      this.queryId = 1;
    }
    return this.queryId;
  }

  /** Ray-triangle test (Möller–Trumbore). Returns t or -1, writes barycentrics. */
  _rayTri(t, ox, oy, oz, dx, dy, dz, maxDist, bary) {
    const P = this.pos;
    const o = t * 9;
    const ax = P[o], ay = P[o + 1], az = P[o + 2];
    const e1x = P[o + 3] - ax, e1y = P[o + 4] - ay, e1z = P[o + 5] - az;
    const e2x = P[o + 6] - ax, e2y = P[o + 7] - ay, e2z = P[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-10 && det < 1e-10) return -1;
    const invDet = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * invDet;
    if (u < -1e-6 || u > 1 + 1e-6) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invDet;
    if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (dist < 0 || dist > maxDist) return -1;
    bary[0] = u;
    bary[1] = v;
    return dist;
  }

  /**
   * Cast a ray (dir must be normalized). `mask` filters triangle flags;
   * if `frontOnly`, triangles facing away from the ray are ignored.
   */
  raycast(origin, dir, maxDist, mask, out, frontOnly = true) {
    out.reset();
    if (!this.built || this.count === 0) return out;
    const q = this._nextQuery();
    const inv = this.inv;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const bary = _bary;
    let best = maxDist;
    let bestTri = -1, bu = 0, bv = 0;

    // 3D DDA through the grid (Amanatides & Woo)
    let ix = Math.floor(ox * inv), iy = Math.floor(oy * inv), iz = Math.floor(oz * inv);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const cs = this.cellSize;
    const tDeltaX = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(cs / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (ix + 1) * cs - ox : ox - ix * cs) / Math.abs(dx)) : Infinity;
    let tMaxY = dy !== 0 ? ((dy > 0 ? (iy + 1) * cs - oy : oy - iy * cs) / Math.abs(dy)) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (iz + 1) * cs - oz : oz - iz * cs) / Math.abs(dz)) : Infinity;
    for (let guard = 0; guard < 512; guard++) {
      const list = this.grid.get(cellKey(ix, iy, iz));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (this.stamp[t] === q) continue;
          this.stamp[t] = q;
          if ((this.flags[t] & mask) === 0) continue;
          if (frontOnly) {
            const f = t * 3;
            if (this.faceN[f] * dx + this.faceN[f + 1] * dy + this.faceN[f + 2] * dz >= 0) continue;
          }
          const d = this._rayTri(t, ox, oy, oz, dx, dy, dz, best, bary);
          if (d >= 0 && d < best) {
            best = d;
            bestTri = t;
            bu = bary[0];
            bv = bary[1];
          }
        }
      }
      // A hit closer than the next cell boundary cannot be beaten.
      const tNext = Math.min(tMaxX, tMaxY, tMaxZ);
      if (bestTri >= 0 && best <= tNext) break;
      if (tNext > maxDist) break;
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDeltaX; } else { iz += stepZ; tMaxZ += tDeltaZ; }
      } else if (tMaxY < tMaxZ) { iy += stepY; tMaxY += tDeltaY; } else { iz += stepZ; tMaxZ += tDeltaZ; }
    }
    if (bestTri < 0) return out;
    this._fillHit(out, bestTri, bu, bv, best, origin, dir);
    return out;
  }

  _fillHit(out, t, u, v, dist, origin, dir) {
    const N = this.nrm;
    const o = t * 9;
    const w = 1 - u - v;
    out.hit = true;
    out.distance = dist;
    out.triangle = t;
    out.flags = this.flags[t];
    out.surface = this.surface[t];
    out.point.copy(dir).multiplyScalar(dist).add(origin);
    out.normal.set(
      N[o] * w + N[o + 3] * u + N[o + 6] * v,
      N[o + 1] * w + N[o + 4] * u + N[o + 7] * v,
      N[o + 2] * w + N[o + 5] * u + N[o + 8] * v,
    ).normalize();
    out.faceNormal.fromArray(this.faceN, t * 3);
    if (out.flags & GUIDED) out.guide.fromArray(this.guide, t * 3);
  }

  /**
   * Visit every triangle (matching `mask`) that intersects a sphere.
   * callback(tri, closestPoint, distance) — closestPoint is reused, copy it.
   */
  sphereQuery(center, radius, mask, callback) {
    if (!this.built || this.count === 0) return 0;
    const q = this._nextQuery();
    const inv = this.inv;
    const ix0 = Math.floor((center.x - radius) * inv), ix1 = Math.floor((center.x + radius) * inv);
    const iy0 = Math.floor((center.y - radius) * inv), iy1 = Math.floor((center.y + radius) * inv);
    const iz0 = Math.floor((center.z - radius) * inv), iz1 = Math.floor((center.z + radius) * inv);
    const r2 = radius * radius;
    let hits = 0;
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iy = iy0; iy <= iy1; iy++)
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = this.grid.get(cellKey(ix, iy, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (this.stamp[t] === q) continue;
            this.stamp[t] = q;
            if ((this.flags[t] & mask) === 0) continue;
            this.closestPointOnTriangle(t, center, _cp);
            const d2 = _cp.distanceToSquared(center);
            if (d2 <= r2) {
              hits++;
              if (callback(t, _cp, Math.sqrt(d2)) === false) return hits;
            }
          }
        }
    return hits;
  }

  getFaceNormal(t, out) {
    return out.fromArray(this.faceN, t * 3);
  }

  /** Closest point on triangle t to point p (Ericson, Real-Time Collision Detection 5.1.5). */
  closestPointOnTriangle(t, p, out) {
    const P = this.pos;
    const o = t * 9;
    _a.set(P[o], P[o + 1], P[o + 2]);
    _b.set(P[o + 3], P[o + 4], P[o + 5]);
    _c.set(P[o + 6], P[o + 7], P[o + 8]);
    _e1.subVectors(_b, _a); // ab
    _e2.subVectors(_c, _a); // ac
    _p.subVectors(p, _a); // ap
    const d1 = _e1.dot(_p), d2 = _e2.dot(_p);
    if (d1 <= 0 && d2 <= 0) return out.copy(_a);
    _q.subVectors(p, _b); // bp
    const d3 = _e1.dot(_q), d4 = _e2.dot(_q);
    if (d3 >= 0 && d4 <= d3) return out.copy(_b);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      return out.copy(_a).addScaledVector(_e1, v);
    }
    _s.subVectors(p, _c); // cp
    const d5 = _e1.dot(_s), d6 = _e2.dot(_s);
    if (d6 >= 0 && d5 <= d6) return out.copy(_c);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      return out.copy(_a).addScaledVector(_e2, w);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return out.copy(_b).addScaledVector(_c.sub(_b), w);
    }
    const denom = 1 / (va + vb + vc);
    const v = vb * denom, w = vc * denom;
    return out.copy(_a).addScaledVector(_e1, v).addScaledVector(_e2, w);
  }
}

const _bary = new Float64Array(2);
const _cp = new Vector3();
