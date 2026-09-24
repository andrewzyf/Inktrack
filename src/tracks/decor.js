import { BoxGeometry, CylinderGeometry, ConeGeometry, IcosahedronGeometry, DodecahedronGeometry, PlaneGeometry, Matrix4, Vector3, Quaternion, Euler } from 'three';
import { TILE, LEVEL, SLAB } from './constants.js';
import { mulberry32, hashString, pick, randRange } from '../core/random.js';

/**
 * Theme scenery. Everything is appended into the track's chunked GeoSet so the
 * whole environment costs a handful of draw calls. Placement is seeded from
 * the track so every visit looks identical.
 *
 * Material keys: decor (vertex-coloured toon), facade (toon + window/stone
 * texture), glow (unlit neon), signs (unlit sign atlas).
 */

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

/** Box whose side UVs are in world units (for tiling facade textures). */
export function facadeBox(w, h, d, unit = 3.2) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x,-x,+y,-y,+z,-z
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    if (face === 2 || face === 3) uv.setXY(i, 0.98, 0.02); // roofs: plain texel
    else uv.setXY(i, (uv.getX(i) * sizes[face][0]) / unit, (uv.getY(i) * sizes[face][1]) / unit);
  }
  return g;
}

function place(builder, geom, x, y, z, color, { ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  builder.append(geom, _m, color);
}

/** Cells occupied by track, keyed "x,z" → lowest road level there. */
function trackCells(build) {
  const cells = new Map();
  for (const [k, list] of build.occupancy) {
    let lvl = Infinity;
    for (const o of list) lvl = Math.min(lvl, o.minLevel);
    cells.set(k, lvl);
  }
  return cells;
}

/** Ring of free cells around the track with distance to nearest track cell. */
function surroundings(cells, maxDist) {
  const out = new Map();
  for (const k of cells.keys()) {
    const [x, z] = k.split(',').map(Number);
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      for (let dz = -maxDist; dz <= maxDist; dz++) {
        const key = `${x + dx},${z + dz}`;
        if (cells.has(key)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        const prev = out.get(key);
        if (!prev || d < prev.dist) out.set(key, { x: x + dx, z: z + dz, dist: d, level: cells.get(k) });
      }
    }
  }
  return out;
}

// ── shared prop builders ────────────────────────────────────────────────
const G = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 10),
  cylLow: new CylinderGeometry(1, 1, 1, 7),
  cone: new ConeGeometry(1, 1, 10),
  cone6: new ConeGeometry(1, 1, 6),
  ico: new IcosahedronGeometry(1, 1),
  rock: new DodecahedronGeometry(1, 0),
};

function waterTower(b, x, y, z, rand) {
  const col = pick(rand, [0xb5553b, 0x9b6a4a, 0x8a4f63]);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) place(b, G.box, x + lx, y + 1.5, z + lz, 0x3b3052, { sx: 0.25, sy: 3, sz: 0.25 });
  place(b, G.cyl, x, y + 4.3, z, col, { sx: 1.7, sy: 2.6, sz: 1.7 });
  place(b, G.cone, x, y + 6.2, z, 0x5c3a4f, { sx: 1.9, sy: 1.2, sz: 1.9 });
}

function chimney(b, x, y, z, rand) {
  const h = randRange(rand, 1.2, 2.6);
  place(b, G.box, x, y + h / 2, z, pick(rand, [0xc0645a, 0xa35d52, 0x8d7aa8]), { sx: 0.9, sy: h, sz: 0.9 });
  place(b, G.box, x, y + h + 0.12, z, 0x3b3052, { sx: 1.15, sy: 0.25, sz: 1.15 });
}

function antenna(b, x, y, z, rand) {
  const h = randRange(rand, 4, 8);
  place(b, G.box, x, y + h / 2, z, 0x2b2640, { sx: 0.16, sy: h, sz: 0.16 });
  place(b, G.box, x, y + h * 0.75, z, 0x2b2640, { sx: 1.6, sy: 0.12, sz: 0.12 });
  place(b, G.box, x, y + h * 0.55, z, 0x2b2640, { sx: 1.1, sy: 0.12, sz: 0.12 });
}

function acUnit(b, x, y, z, rand) {
  place(b, G.box, x, y + 0.5, z, 0xd8d3e6, { sx: 1.8, sy: 1, sz: 1.2, ry: rand() * 0.2 });
}

/** Sign atlas: 4 × 2 cells, see TrackView.signTexture. */
export const SIGN_CELLS = 8;

function neonSign(geo, x, y, z, ry, rand, big = false) {
  const b = geo.get('decor', x, z);
  const w = big ? 9 : 5.5, h = big ? 4.5 : 2.75;
  // Frame + posts (outlined), sign face (unlit texture).
  place(b, G.box, x, y + h / 2 + 1.6, z, 0x2b2640, { sx: w + 0.5, sy: h + 0.5, sz: 0.3, ry });
  const dx = Math.cos(ry), dz = -Math.sin(ry);
  for (const s of [-1, 1]) place(b, G.box, x + dx * s * w * 0.35, y + 0.8, z + dz * s * w * 0.35, 0x2b2640, { sx: 0.25, sy: 1.6, sz: 0.25, ry });
  const cell = Math.floor(rand() * SIGN_CELLS);
  const u0 = (cell % 4) / 4, v0 = cell < 4 ? 0.5 : 0;
  const face = new PlaneGeometry(w, h);
  const uv = face.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 2);
  const sb = geo.get('signs', x, z);
  const nx = Math.sin(ry), nz = Math.cos(ry);
  place(sb, face, x + nx * 0.17, y + h / 2 + 1.6, z + nz * 0.17, 0xffffff, { ry });
  place(sb, face, x - nx * 0.17, y + h / 2 + 1.6, z - nz * 0.17, 0xffffff, { ry: ry + Math.PI });
}

// ── Rooftop Run ─────────────────────────────────────────────────────────
const CITY_COLORS = [0x8f6cc4, 0xb46aa8, 0x6c7fc9, 0xd98b7a, 0x7a5aa6, 0x5f9fb5, 0xc77a9a, 0x9a86c9];

function decorateRooftop(build, rand) {
  const geo = build.geo;
  const cells = trackCells(build);
  const STREET = -70;
  // Buildings holding up the track: roof flush with the road deck.
  for (const [k, lvl] of cells) {
    const [x, z] = k.split(',').map(Number);
    const top = lvl * LEVEL - SLAB;
    const h = top - STREET;
    const b = geo.get('facade', x * TILE, z * TILE);
    place(b, facadeBox(TILE, h, TILE), x * TILE, STREET + h / 2, z * TILE, pick(rand, CITY_COLORS));
  }
  // Surrounding blocks.
  const around = surroundings(cells, 7);
  for (const c of around.values()) {
    if (rand() < (c.dist === 1 ? 0.35 : 0.22)) continue; // streets & plazas
    const trackTop = c.level * LEVEL;
    let top;
    if (c.dist === 1) top = trackTop - randRange(rand, 2, 14);
    else if (c.dist <= 3) top = trackTop + randRange(rand, -18, 8);
    else top = trackTop + randRange(rand, -10, 34);
    const inset = randRange(rand, 0.4, 1.6);
    const w = TILE - inset * 2, d = TILE - randRange(rand, 0.4, 1.6) * 2;
    const h = top - STREET;
    const cx = c.x * TILE, cz = c.z * TILE;
    const b = geo.get('facade', cx, cz);
    const color = pick(rand, CITY_COLORS);
    place(b, facadeBox(w, h, d), cx, STREET + h / 2, cz, color);
    // Parapet / setback crown.
    const db = geo.get('decor', cx, cz);
    if (rand() < 0.5) place(db, G.box, cx, top + 0.3, cz, 0x3b3052, { sx: w + 0.4, sy: 0.6, sz: d + 0.4 });
    if (c.dist >= 3 && rand() < 0.3) {
      const w2 = w * 0.6, d2 = d * 0.6, h2 = randRange(rand, 4, 12);
      place(b, facadeBox(w2, h2, d2), cx, top + h2 / 2, cz, color);
    }
    // Rooftop clutter.
    const n = Math.floor(randRange(rand, 0, 3.5));
    for (let i = 0; i < n; i++) {
      const px = cx + randRange(rand, -w / 3, w / 3), pz = cz + randRange(rand, -d / 3, d / 3);
      const kind = rand();
      if (kind < 0.4) chimney(db, px, top, pz, rand);
      else if (kind < 0.6) acUnit(db, px, top, pz, rand);
      else if (kind < 0.75) antenna(db, px, top, pz, rand);
      else if (kind < 0.88 && c.dist >= 2) waterTower(db, px, top, pz, rand);
    }
    // Neon signs facing the track from nearby roofs.
    if (c.dist <= 2 && rand() < 0.2) {
      const nearest = nearestTrackCell(cells, c.x, c.z);
      const ry = Math.atan2(nearest[0] - c.x, nearest[1] - c.z);
      neonSign(geo, cx, top, cz, ry, rand, c.dist === 2 && rand() < 0.4);
    }
  }
  // Street far below (mostly hidden in fog, gives jumps real depth).
  const bounds = build.bounds;
  const sx = bounds.max.x - bounds.min.x + 200, sz = bounds.max.z - bounds.min.z + 200;
  const ground = geo.get('decor', (bounds.min.x + bounds.max.x) / 2, (bounds.min.z + bounds.max.z) / 2);
  place(ground, G.box, (bounds.min.x + bounds.max.x) / 2, STREET - 0.5, (bounds.min.z + bounds.max.z) / 2, 0x3a2d55, { sx, sy: 1, sz });
}

function nearestTrackCell(cells, x, z) {
  let best = null, bd = Infinity;
  for (const k of cells.keys()) {
    const [tx, tz] = k.split(',').map(Number);
    const d = (tx - x) ** 2 + (tz - z) ** 2;
    if (d < bd) { bd = d; best = [tx, tz]; }
  }
  return best;
}

const DECORATORS = {
  rooftop: decorateRooftop,
};

/** Returns a `decorate(build)` function for TrackBuilder. */
export function decoratorFor(themeId, seedText = '') {
  const fn = DECORATORS[themeId] || DECORATORS.rooftop;
  return (build) => fn(build, mulberry32(hashString(seedText + themeId)));
}

export { G as DECOR_GEOMETRY, place, trackCells, surroundings };
