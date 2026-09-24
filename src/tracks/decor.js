import { BoxGeometry, CylinderGeometry, ConeGeometry, IcosahedronGeometry, DodecahedronGeometry, OctahedronGeometry, PlaneGeometry, Matrix4, Vector3, Quaternion, Euler } from 'three';
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
  cylLow: new CylinderGeometry(1, 1, 1, 6, 1, true), // trunks/posts: ends are never seen
  cone: new ConeGeometry(1, 1, 10),
  coneLow: new ConeGeometry(1, 1, 7, 1, true),
  cone6: new ConeGeometry(1, 1, 6),
  ico: new IcosahedronGeometry(1, 1),
  blob: new IcosahedronGeometry(1, 0),
  rock: new DodecahedronGeometry(1, 0),
  crystal: new OctahedronGeometry(1, 0),
  column: new CylinderGeometry(1, 1, 1, 12),
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
  // Cycle through the atlas (with a random stride) so nearby signs differ.
  geo.signIndex = ((geo.signIndex ?? Math.floor(rand() * SIGN_CELLS)) + 1 + Math.floor(rand() * 2)) % SIGN_CELLS;
  const cell = geo.signIndex;
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
    // Rooftop clutter (only where it can be seen).
    const n = c.dist >= 5 ? 0 : Math.floor(randRange(rand, 0, 3.5));
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

// ── Ruin Rally ──────────────────────────────────────────────────────────
const STONE = [0xd9c49a, 0xc9b184, 0xb8a47c, 0xcfc2a0, 0xa9b58a];
const LEAVES = [0x3f8f45, 0x2f7a3f, 0x58a84a, 0x7cbf4f, 0x3d9e6a];

function jungleTree(b, x, floor, top, z, rand, minBlobs = 2) {
  const trunkTop = top - randRange(rand, 3, 6);
  const h = trunkTop - floor;
  const r = randRange(rand, 0.7, 1.3);
  place(b, G.cylLow, x, floor + h / 2, z, 0x7a5236, { sx: r, sy: h, sz: r });
  const n = minBlobs + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const s = randRange(rand, 3.2, 5.2);
    place(b, G.blob, x + randRange(rand, -2, 2), trunkTop + randRange(rand, -1, 2.5), z + randRange(rand, -2, 2), pick(rand, LEAVES), { sx: s, sy: s * 0.75, sz: s, ry: rand() * 6 });
  }
  if (rand() < 0.3) place(b, G.blob, x, trunkTop + 3, z, 0xff6fa8, { sx: 0.6, sy: 0.6, sz: 0.6 }); // flower
}

function brokenColumn(b, x, y, z, rand) {
  const h = randRange(rand, 3, 9);
  place(b, G.box, x, y + 0.4, z, 0xb8a47c, { sx: 3, sy: 0.8, sz: 3 });
  place(b, G.column, x, y + 0.8 + h / 2, z, pick(rand, STONE), { sx: 1.1, sy: h, sz: 1.1, rx: randRange(rand, -0.08, 0.08), rz: randRange(rand, -0.08, 0.08) });
  if (rand() < 0.5) place(b, G.box, x + 2.5, y + 0.6, z + 1, pick(rand, STONE), { sx: 1.4, sy: 1.2, sz: 2.4, ry: rand() * 3, rz: 0.3 });
}

function arch(b, x, y, z, ry, rand) {
  const c = pick(rand, STONE);
  const dx = Math.cos(ry) * 3.5, dz = -Math.sin(ry) * 3.5;
  place(b, G.box, x + dx, y + 3.5, z + dz, c, { sx: 1.6, sy: 7, sz: 1.6, ry });
  place(b, G.box, x - dx, y + 3.5, z - dz, c, { sx: 1.6, sy: 7, sz: 1.6, ry });
  place(b, G.box, x, y + 7.6, z, c, { sx: 9.2, sy: 1.3, sz: 2, ry });
  place(b, G.blob, x + dx, y + 8.6, z + dz, pick(rand, LEAVES), { sx: 1.8, sy: 1.1, sz: 1.8 });
}

function pyramid(geo, x, floor, z, size, rand) {
  const b = geo.get('facade', x, z);
  const tiers = 5 + Math.floor(rand() * 3);
  for (let t = 0; t < tiers; t++) {
    const w = size * (1 - t / (tiers + 1));
    const h = size * 0.16;
    place(b, facadeBox(w, h, w), x, floor + h * (t + 0.5), z, pick(rand, STONE));
  }
  const top = floor + size * 0.16 * tiers;
  place(b, facadeBox(size * 0.2, size * 0.14, size * 0.2), x, top + size * 0.07, z, 0xb8a47c);
  const g = geo.get('decor', x, z);
  for (let i = 0; i < 6; i++) place(g, G.blob, x + randRange(rand, -size / 3, size / 3), floor + randRange(rand, 2, size * 0.6), z + randRange(rand, -size / 3, size / 3), pick(rand, LEAVES), { sx: 3, sy: 2, sz: 3 });
}

function stoneHead(b, x, y, z, ry) {
  place(b, G.box, x, y + 3, z, 0xa9a283, { sx: 5, sy: 6, sz: 4.4, ry });
  const fx = Math.sin(ry) * 2.25, fz = Math.cos(ry) * 2.25;
  const sx = Math.cos(ry) * 1.1, sz = -Math.sin(ry) * 1.1;
  place(b, G.box, x + fx + sx, y + 4, z + fz + sz, 0x2b2230, { sx: 1, sy: 0.6, sz: 0.3, ry });
  place(b, G.box, x + fx - sx, y + 4, z + fz - sz, 0x2b2230, { sx: 1, sy: 0.6, sz: 0.3, ry });
  place(b, G.box, x + fx * 1.1, y + 3, z + fz * 1.1, 0x9a936f, { sx: 0.9, sy: 1.6, sz: 0.8, ry });
  place(b, G.box, x + fx, y + 1.6, z + fz, 0x2b2230, { sx: 2.2, sy: 0.35, sz: 0.3, ry });
}

function brazier(geo, x, y, z, scale = 1) {
  const s = scale;
  place(geo.get('decor', x, z), G.cylLow, x, y + 0.5 * s, z, 0x5a4a3a, { sx: 0.3 * s, sy: 1.0 * s, sz: 0.3 * s });
  place(geo.get('decor', x, z), G.cone6, x, y + 1.05 * s, z, 0x6b5a45, { sx: 0.55 * s, sy: -0.35 * s, sz: 0.55 * s });
  const g = geo.get('glow', x, z);
  place(g, G.cone6, x, y + 1.5 * s, z, 0xff8a1f, { sx: 0.42 * s, sy: 0.9 * s, sz: 0.42 * s });
  place(g, G.cone6, x, y + 1.4 * s, z, 0xffe066, { sx: 0.22 * s, sy: 0.5 * s, sz: 0.22 * s });
}

function decorateRuins(build, rand) {
  const geo = build.geo;
  const cells = trackCells(build);
  const FLOOR = -40;
  // Stone causeway pillars under every track cell.
  for (const [k, lvl] of cells) {
    const [x, z] = k.split(',').map(Number);
    const cx = x * TILE, cz = z * TILE;
    const top = lvl * LEVEL - SLAB;
    const f = geo.get('facade', cx, cz);
    const d = geo.get('decor', cx, cz);
    place(f, facadeBox(TILE - 0.2, 1.4, TILE - 0.2), cx, top - 0.7, cz, pick(rand, STONE));
    const h = top - 1.4 - FLOOR;
    place(f, facadeBox(5.6, h, 5.6), cx, FLOOR + h / 2, cz, pick(rand, STONE));
    place(d, G.box, cx, FLOOR + 1, cz, 0x9a8a66, { sx: 8, sy: 2, sz: 8 });
    // Hanging vines.
    if (rand() < 0.55) {
      for (let i = 0; i < 3; i++) {
        const len = randRange(rand, 2, 8);
        const side = rand() < 0.5 ? -1 : 1;
        const along = randRange(rand, -4, 4);
        const [vx, vz] = rand() < 0.5 ? [side * 4.9, along] : [along, side * 4.9];
        place(d, G.box, cx + vx, top - 1.4 - len / 2, cz + vz, pick(rand, LEAVES), { sx: 0.35, sy: len, sz: 0.35 });
      }
    }
  }
  // Jungle, ruins and temples around the causeway.
  const around = surroundings(cells, 7);
  let pyramids = 0;
  for (const c of around.values()) {
    const cx = c.x * TILE + randRange(rand, -2, 2), cz = c.z * TILE + randRange(rand, -2, 2);
    const trackTop = c.level * LEVEL;
    const b = geo.get('decor', cx, cz);
    const roll = rand();
    if (c.dist >= 6 && pyramids < 3 && roll < 0.02) {
      pyramid(geo, cx, FLOOR, cz, randRange(rand, 40, 60), rand);
      pyramids++;
      continue;
    }
    if (roll < 0.5) {
      const top = c.dist === 1 ? trackTop - randRange(rand, 1, 6) : c.dist <= 3 ? trackTop + randRange(rand, -6, 8) : trackTop + randRange(rand, -2, 22);
      jungleTree(b, cx, FLOOR, Math.max(FLOOR + 8, top), cz, rand, c.dist >= 5 ? 1 : 2);
    } else if (c.dist >= 5) {
      continue;
    } else if (roll < 0.62) {
      // Ruin plateau with columns / arch / head on top.
      const top = c.dist === 1 ? trackTop - randRange(rand, 3, 10) : trackTop + randRange(rand, -12, 2);
      const h = top - FLOOR;
      place(geo.get('facade', cx, cz), facadeBox(8, h, 8), cx, FLOOR + h / 2, cz, pick(rand, STONE));
      const k = rand();
      if (k < 0.45) brokenColumn(b, cx, top, cz, rand);
      else if (k < 0.7) arch(b, cx, top, cz, rand() * Math.PI, rand);
      else if (k < 0.85 && c.dist >= 2) {
        const n = nearestTrackCell(cells, c.x, c.z);
        stoneHead(b, cx, top, cz, Math.atan2(n[0] - c.x, n[1] - c.z));
      } else brazier(geo, cx, top, cz, 2.2);
      place(b, G.blob, cx + 3, top + 0.5, cz - 2, pick(rand, LEAVES), { sx: 2.2, sy: 1.2, sz: 2.2 });
    } else if (roll < 0.72) {
      place(b, G.cone6, cx, FLOOR + 3, cz, pick(rand, LEAVES), { sx: 3, sy: 6, sz: 3 }); // fern clump
    }
  }
  // Braziers flanking the gates.
  for (const g of [build.start, ...build.checkpoints, build.finish]) {
    if (!g) continue;
    for (const s of [-1, 1]) {
      // On the wall tops just before each gate.
      const p = g.center.clone().addScaledVector(g.right, s * 4.45).addScaledVector(g.forward, -2.5);
      brazier(geo, p.x, p.y + 1.0, p.z);
    }
  }
  groundPlane(build, FLOOR, 0x2f5a34);
}

// ── Frost Peak ──────────────────────────────────────────────────────────
const ROCK = [0x8f9fc4, 0x7d8db5, 0xa0acc9, 0x6f7fa8, 0x9aa6c4];
const PINE = [0x2f6b5a, 0x2a5f58, 0x3b7a63];

function pine(b, x, y, z, rand, scale = 1, tiers = 3) {
  const s = scale * randRange(rand, 0.8, 1.3);
  place(b, G.cylLow, x, y + 0.8 * s, z, 0x6a4a36, { sx: 0.35 * s, sy: 1.6 * s, sz: 0.35 * s });
  const c = pick(rand, PINE);
  for (let i = 0; i < tiers; i++) {
    const r = (2.4 - i * 0.6) * s, h = (2.6 - i * 0.3) * s;
    place(b, G.coneLow, x, y + (1.6 + i * 1.55) * s + h / 2, z, c, { sx: r, sy: h, sz: r });
    if (i === tiers - 1) place(b, G.coneLow, x, y + (1.6 + i * 1.55) * s + h * 0.72, z, 0xffffff, { sx: r * 0.5, sy: h * 0.5, sz: r * 0.5 });
  }
}

function snowman(b, x, y, z, ry) {
  place(b, G.ico, x, y + 1.1, z, 0xffffff, { sx: 1.2, sy: 1.1, sz: 1.2 });
  place(b, G.ico, x, y + 2.7, z, 0xffffff, { sx: 0.85, sy: 0.8, sz: 0.85 });
  place(b, G.ico, x, y + 3.8, z, 0xffffff, { sx: 0.6, sy: 0.6, sz: 0.6 });
  const fx = Math.sin(ry), fz = Math.cos(ry);
  place(b, G.cone6, x + fx * 0.8, y + 3.8, z + fz * 0.8, 0xff7a1a, { sx: 0.15, sy: 0.7, sz: 0.15, rx: Math.PI / 2, ry });
  place(b, G.cylLow, x, y + 4.5, z, 0x2b2640, { sx: 0.5, sy: 0.6, sz: 0.5 });
  place(b, G.box, x, y + 2.2, z, 0xff3d7f, { sx: 1.5, sy: 0.25, sz: 1.5 }); // scarf
}

function decorateFrost(build, rand) {
  const geo = build.geo;
  const cells = trackCells(build);
  const FLOOR = -70;
  for (const [k, lvl] of cells) {
    const [x, z] = k.split(',').map(Number);
    const cx = x * TILE, cz = z * TILE;
    const top = lvl * LEVEL - SLAB;
    const h = top - FLOOR - 0.6;
    place(geo.get('facade', cx, cz), facadeBox(TILE - 0.2, h, TILE - 0.2), cx, FLOOR + h / 2, cz, pick(rand, ROCK));
    place(geo.get('decor', cx, cz), G.box, cx, top - 0.3, cz, 0xffffff, { sx: TILE + 0.4, sy: 0.7, sz: TILE + 0.4 });
  }
  const around = surroundings(cells, 7);
  for (const c of around.values()) {
    const cx = c.x * TILE, cz = c.z * TILE;
    const trackTop = c.level * LEVEL;
    if (rand() < (c.dist === 1 ? 0.25 : 0.12)) continue;
    const far = c.dist >= 5;
    let top;
    if (c.dist === 1) top = trackTop - randRange(rand, 1, 5);
    else if (c.dist <= 3) top = trackTop + randRange(rand, -8, 10);
    else top = trackTop + randRange(rand, 0, 30) + c.dist * 1.5;
    const h = top - FLOOR;
    const w = TILE + randRange(rand, -1, 2), d = TILE + randRange(rand, -1, 2);
    place(geo.get('facade', cx, cz), facadeBox(w, h, d), cx, FLOOR + h / 2, cz, pick(rand, ROCK));
    const b = geo.get('decor', cx, cz);
    place(b, G.box, cx, top + 0.35, cz, 0xffffff, { sx: w + 0.5, sy: 0.7, sz: d + 0.5 }); // snow cap
    const k = rand();
    if (far) {
      if (k < 0.35) pine(b, cx, top + 0.7, cz, rand, 1.3, 2);
    } else if (k < 0.45) {
      const n = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) pine(b, cx + randRange(rand, -3, 3), top + 0.7, cz + randRange(rand, -3, 3), rand, c.dist === 1 ? 0.7 : 1);
    } else if (k < 0.6) {
      place(b, G.rock, cx + randRange(rand, -2, 2), top + 1.5, cz + randRange(rand, -2, 2), pick(rand, ROCK), { sx: 2.5, sy: 2, sz: 2.5, ry: rand() * 6 });
      place(b, G.rock, cx + randRange(rand, -2, 2), top + 2.6, cz + randRange(rand, -2, 2), 0xffffff, { sx: 1.6, sy: 0.7, sz: 1.6, ry: rand() * 6 });
    } else if (k < 0.72) {
      for (let i = 0; i < 3; i++) place(b, G.crystal, cx + randRange(rand, -3, 3), top + 1.6, cz + randRange(rand, -3, 3), pick(rand, [0x9ff3ff, 0x7fd4ff, 0xc9f7ff]), { sx: 0.8, sy: randRange(rand, 1.8, 3.4), sz: 0.8, rz: randRange(rand, -0.3, 0.3) });
    } else if (k < 0.76 && c.dist <= 3) {
      const n = nearestTrackCell(cells, c.x, c.z);
      snowman(b, cx, top + 0.7, cz, Math.atan2(n[0] - c.x, n[1] - c.z));
    }
  }
  groundPlane(build, FLOOR, 0xe8f0ff);
}

function groundPlane(build, y, color) {
  const bounds = build.bounds;
  const cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
  const sx = bounds.max.x - bounds.min.x + 240, sz = bounds.max.z - bounds.min.z + 240;
  place(build.geo.get('decor', cx, cz), G.box, cx, y - 0.5, cz, color, { sx, sy: 1, sz });
}

// ── Red Canyon ──────────────────────────────────────────────────────────
const SANDSTONE = [0xd9784a, 0xc4633d, 0xe08d5c, 0xb8553a, 0xcf7a52];
const CACTUS = 0x3f9a4f;

function cactus(b, x, y, z, rand) {
  const h = randRange(rand, 2.5, 5);
  place(b, G.cyl, x, y + h / 2, z, CACTUS, { sx: 0.45, sy: h, sz: 0.45 });
  place(b, G.ico, x, y + h, z, CACTUS, { sx: 0.45, sy: 0.35, sz: 0.45 });
  for (const s of [-1, 1]) {
    if (rand() < 0.3) continue;
    const ay = y + h * randRange(rand, 0.35, 0.6), ah = randRange(rand, 0.8, 1.6);
    const ry = rand() * Math.PI;
    const dx = Math.cos(ry) * s * 0.8, dz = -Math.sin(ry) * s * 0.8;
    place(b, G.cyl, x + dx * 0.6, ay, z + dz * 0.6, CACTUS, { sx: 0.25, sy: 0.25, sz: 1.2, ry, rx: Math.PI / 2 });
    place(b, G.cyl, x + dx, ay + ah / 2, z + dz, CACTUS, { sx: 0.3, sy: ah, sz: 0.3 });
  }
  if (rand() < 0.3) place(b, G.ico, x, y + h + 0.3, z, 0xff5fa2, { sx: 0.25, sy: 0.25, sz: 0.25 });
}

function rockArch(b, x, y, z, ry, rand) {
  const c = pick(rand, SANDSTONE);
  const dx = Math.cos(ry) * 5, dz = -Math.sin(ry) * 5;
  place(b, G.rock, x + dx, y + 4, z + dz, c, { sx: 2.4, sy: 5, sz: 2.4 });
  place(b, G.rock, x - dx, y + 4, z - dz, c, { sx: 2.4, sy: 5, sz: 2.4 });
  place(b, G.box, x, y + 8.5, z, c, { sx: 13, sy: 2.2, sz: 3, ry, rz: randRange(rand, -0.05, 0.05) });
}

function decorateCanyon(build, rand) {
  const geo = build.geo;
  const cells = trackCells(build);
  const FLOOR = -45;
  for (const [k, lvl] of cells) {
    const [x, z] = k.split(',').map(Number);
    const cx = x * TILE, cz = z * TILE;
    const top = lvl * LEVEL - SLAB;
    const h = top - FLOOR;
    place(geo.get('facade', cx, cz), facadeBox(TILE - 0.1, h, TILE - 0.1), cx, FLOOR + h / 2, cz, pick(rand, SANDSTONE));
  }
  const around = surroundings(cells, 7);
  for (const c of around.values()) {
    const cx = c.x * TILE, cz = c.z * TILE;
    const trackTop = c.level * LEVEL;
    // Canyon walls: low right beside the road, towering cliffs a little further out.
    let top;
    if (c.dist === 1) top = trackTop - randRange(rand, 2, 8);
    else if (c.dist <= 3) {
      if (rand() < 0.35) continue;
      top = trackTop + randRange(rand, 6, 26);
    } else {
      if (rand() < 0.45) continue;
      top = trackTop + randRange(rand, -10, 40);
    }
    const h = top - FLOOR;
    const w = TILE + randRange(rand, -2, 3), d = TILE + randRange(rand, -2, 3);
    place(geo.get('facade', cx, cz), facadeBox(w, h, d), cx, FLOOR + h / 2, cz, pick(rand, SANDSTONE));
    const b = geo.get('decor', cx, cz);
    // Strata band + a flat cap.
    place(b, G.box, cx, top + 0.25, cz, 0xf0a878, { sx: w + 0.3, sy: 0.5, sz: d + 0.3 });
    if (c.dist >= 5) continue;
    const k = rand();
    if (k < 0.3) cactus(b, cx + randRange(rand, -3, 3), top + 0.5, cz + randRange(rand, -3, 3), rand);
    else if (k < 0.42) place(b, G.rock, cx, top + 1.4, cz, pick(rand, SANDSTONE), { sx: 2.6, sy: 1.8, sz: 2.2, ry: rand() * 6 });
    else if (k < 0.47 && c.dist >= 2) rockArch(b, cx, top, cz, rand() * Math.PI, rand);
    else if (k < 0.52) {
      // Wooden signpost.
      place(b, G.box, cx, top + 1.5, cz, 0x7a4a2a, { sx: 0.25, sy: 3, sz: 0.25 });
      place(b, G.box, cx, top + 2.6, cz, 0xe8c79a, { sx: 2.2, sy: 0.6, sz: 0.15, ry: rand() * 3 });
    }
  }
  // Desert floor dotted with cacti.
  groundPlane(build, FLOOR, 0xe9a66e);
  const bounds = build.bounds;
  for (let i = 0; i < 70; i++) {
    const x = randRange(rand, bounds.min.x - 60, bounds.max.x + 60), z = randRange(rand, bounds.min.z - 60, bounds.max.z + 60);
    if (cells.has(`${Math.round(x / TILE)},${Math.round(z / TILE)}`)) continue;
    cactus(geo.get('decor', x, z), x, FLOOR, z, rand);
  }
}

// ── Tropic Bay (ocean) ──────────────────────────────────────────────────
const SEA_LEVEL = -0.35;
const WOOD = [0x8a5a36, 0x7a4e2e, 0x9b6a42];

function palm(b, x, y, z, rand, s = 1) {
  const h = randRange(rand, 5, 8) * s;
  const lean = randRange(rand, -0.25, 0.25);
  place(b, G.cylLow, x, y + h / 2, z, 0x9a6a3e, { sx: 0.3 * s, sy: h, sz: 0.3 * s, rz: lean });
  const tx = x - Math.sin(lean) * h / 2, ty = y + h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand();
    place(b, G.box, tx + Math.cos(a) * 1.6 * s, ty - 0.3 * s, z + Math.sin(a) * 1.6 * s, pick(rand, [0x2f9e57, 0x3fb865, 0x27884a]), { sx: 3.4 * s, sy: 0.12, sz: 0.9 * s, ry: -a, rz: -0.35 });
  }
  place(b, G.ico, tx, ty, z, 0x6b4a2a, { sx: 0.5 * s, sy: 0.5 * s, sz: 0.5 * s });
}

function island(geo, x, z, r, rand) {
  const b = geo.get('decor', x, z);
  place(b, G.cyl, x, SEA_LEVEL - 0.2, z, 0xf2dea0, { sx: r, sy: 1.2, sz: r });
  place(b, G.ico, x, SEA_LEVEL, z, 0x6fbf5a, { sx: r * 0.7, sy: randRange(rand, 1.5, 4), sz: r * 0.7 });
  const n = 1 + Math.floor(r / 5);
  for (let i = 0; i < n; i++) palm(b, x + randRange(rand, -r * 0.5, r * 0.5), SEA_LEVEL + 0.5, z + randRange(rand, -r * 0.5, r * 0.5), rand);
  if (rand() < 0.4) {
    // Beach hut.
    const hx = x + r * 0.4, hz = z - r * 0.3;
    place(b, G.box, hx, SEA_LEVEL + 1.6, hz, 0xe8c79a, { sx: 3, sy: 2.4, sz: 3 });
    place(b, G.cone6, hx, SEA_LEVEL + 3.6, hz, 0xd9a441, { sx: 2.8, sy: 1.8, sz: 2.8 });
  }
}

function lighthouse(geo, x, z) {
  const b = geo.get('decor', x, z);
  place(b, G.rock, x, SEA_LEVEL, z, 0x8f8a9a, { sx: 6, sy: 3, sz: 6 });
  for (let i = 0; i < 5; i++) place(b, G.cyl, x, SEA_LEVEL + 3 + i * 3, z, i % 2 ? 0xffffff : 0xe8343f, { sx: 2.2 - i * 0.2, sy: 3, sz: 2.2 - i * 0.2 });
  place(geo.get('glow', x, z), G.cyl, x, SEA_LEVEL + 18.5, z, 0xfff3a8, { sx: 1.3, sy: 2, sz: 1.3 });
  place(b, G.cone6, x, SEA_LEVEL + 20.5, z, 0x2b2640, { sx: 1.8, sy: 2, sz: 1.8 });
}

function sailboat(b, x, z, ry, rand) {
  place(b, G.box, x, SEA_LEVEL + 0.4, z, 0xffffff, { sx: 1.8, sy: 0.9, sz: 5, ry });
  place(b, G.box, x, SEA_LEVEL + 3.5, z, 0x5a3a2a, { sx: 0.15, sy: 6, sz: 0.15, ry });
  place(b, G.cone6, x, SEA_LEVEL + 4, z, pick(rand, [0xff5a4a, 0xffd23f, 0xffffff]), { sx: 0.2, sy: 5, sz: 2.2, ry });
}

function decorateOcean(build, rand) {
  const geo = build.geo;
  const cells = trackCells(build);
  // Stilts under raised flumes; low lanes float on the sea.
  for (const [k, lvl] of cells) {
    const [x, z] = k.split(',').map(Number);
    const cx = x * TILE, cz = z * TILE;
    const top = lvl * LEVEL - SLAB;
    if (top <= SEA_LEVEL + 0.2) continue;
    const b = geo.get('decor', cx, cz);
    for (const [ox, oz] of [[-3.8, -3.8], [3.8, -3.8], [-3.8, 3.8], [3.8, 3.8]]) {
      const h = top - SEA_LEVEL + 1;
      place(b, G.cylLow, cx + ox, SEA_LEVEL - 1 + h / 2, cz + oz, pick(rand, WOOD), { sx: 0.35, sy: h, sz: 0.35 });
    }
    place(b, G.box, cx, top - 0.2, cz, 0x7a4e2e, { sx: TILE - 0.4, sy: 0.4, sz: 0.6 });
  }
  const around = surroundings(cells, 9);
  let lighthouses = 0;
  for (const c of around.values()) {
    const cx = c.x * TILE + randRange(rand, -3, 3), cz = c.z * TILE + randRange(rand, -3, 3);
    const roll = rand();
    if (c.dist === 1) {
      // Buoys bobbing next to the lanes.
      if (roll < 0.18) {
        const b = geo.get('decor', cx, cz);
        place(b, G.ico, cx, SEA_LEVEL + 0.3, cz, rand() < 0.5 ? 0xff5a4a : 0xffd23f, { sx: 0.8, sy: 0.9, sz: 0.8 });
        place(b, G.box, cx, SEA_LEVEL + 1.4, cz, 0xffffff, { sx: 0.15, sy: 1.6, sz: 0.15 });
      }
      continue;
    }
    if (c.dist >= 3 && roll < 0.06) island(geo, cx, cz, randRange(rand, 5, 12), rand);
    else if (c.dist >= 4 && roll < 0.075 && lighthouses < 2) { lighthouse(geo, cx, cz); lighthouses++; }
    else if (c.dist >= 3 && roll < 0.1) sailboat(geo.get('decor', cx, cz), cx, cz, rand() * 6, rand);
    else if (c.dist >= 2 && roll < 0.13) place(geo.get('decor', cx, cz), G.rock, cx, SEA_LEVEL, cz, 0x8f8a9a, { sx: 2.5, sy: 1.8, sz: 2.5, ry: rand() * 6 });
  }
  // The sea itself: a big animated plane (its own material).
  const bounds = build.bounds;
  const mx = (bounds.min.x + bounds.max.x) / 2, mz = (bounds.min.z + bounds.max.z) / 2;
  const sx = bounds.max.x - bounds.min.x + 900, sz = bounds.max.z - bounds.min.z + 900;
  const sea = new PlaneGeometry(sx, sz, 1, 1).rotateX(-Math.PI / 2);
  const uv = sea.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sx) / 24, (uv.getY(i) * sz) / 24);
  place(geo.get('sea', mx, mz), sea, mx, SEA_LEVEL, mz, 0xffffff);
}

// ── Cloud Kingdom (sky) ─────────────────────────────────────────────────
const GRASS = [0x7fd46a, 0x6cc45f, 0x93dd7a];
const CLIFF = [0xb49ad9, 0x9f86cc, 0xc6b0e6];

function floatingIsland(geo, x, y, z, r, rand, obstacles) {
  const f = geo.get('facade', x, z);
  const b = geo.get('decor', x, z);
  place(f, G.cone6, x, y - r * 0.9, z, pick(rand, CLIFF), { sx: r, sy: r * 1.8, sz: r, rx: Math.PI });
  place(b, G.cyl, x, y, z, pick(rand, GRASS), { sx: r * 1.05, sy: 0.8, sz: r * 1.05 });
  const k = rand();
  if (k < 0.35) {
    // Windmill.
    place(b, G.cyl, x, y + 3, z, 0xfff3e0, { sx: 1.2, sy: 6, sz: 1.2 });
    place(b, G.cone6, x, y + 6.8, z, 0xe8343f, { sx: 1.6, sy: 1.6, sz: 1.6 });
    for (let i = 0; i < 4; i++) place(b, G.box, x, y + 6, z + 1.3, 0xffffff, { sx: 0.5, sy: 6, sz: 0.1, rz: (i * Math.PI) / 2 + 0.3 });
  } else if (k < 0.6) {
    // Little castle.
    place(f, facadeBox(5, 5, 5), x, y + 2.9, z, 0xe6dcf5);
    for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
      place(b, G.cyl, x + ox, y + 4, z + oz, 0xf2ecff, { sx: 1, sy: 8, sz: 1 });
      place(b, G.cone6, x + ox, y + 8.8, z + oz, 0x6f7ef2, { sx: 1.3, sy: 1.8, sz: 1.3 });
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const tx = x + randRange(rand, -r * 0.5, r * 0.5), tz = z + randRange(rand, -r * 0.5, r * 0.5);
      place(b, G.cylLow, tx, y + 1.5, tz, 0x8a5a36, { sx: 0.3, sy: 3, sz: 0.3 });
      place(b, G.ico, tx, y + 3.8, tz, pick(rand, [0xff9ad5, 0x7fd46a, 0xffd23f]), { sx: 1.8, sy: 1.6, sz: 1.8 });
    }
  }
  obstacles?.push({ pos: new Vector3(x, y - r * 0.4, z), radius: r * 0.95 });
}

function cloudPuff(b, x, y, z, s, rand) {
  for (let i = 0; i < 5; i++) place(b, G.ico, x + (i - 2) * s * 0.9, y + (i % 2) * s * 0.4, z + randRange(rand, -s, s) * 0.5, 0xffffff, { sx: s, sy: s * 0.7, sz: s });
}

function decorateSky(build, rand) {
  const geo = build.geo;
  const route = build.route;
  const obstacles = build.obstacles;
  const clearOf = (p, r) => route.every((q) => q.pos.distanceToSquared(p) > (r + 9) ** 2);
  // Floating islands along the course, off to the sides.
  for (let i = 0; i < route.length; i += 45) {
    const p = route[i];
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const r = randRange(rand, 5, 11);
      const pos = p.pos.clone().addScaledVector(p.right, side * randRange(rand, 22, 45)).add(new Vector3(0, randRange(rand, -18, 4), 0));
      if (!clearOf(pos, r)) continue;
      floatingIsland(geo, pos.x, pos.y, pos.z, r, rand, obstacles);
    }
  }
  // Hot-air balloons and rocks close to the line: near misses, not walls.
  for (let i = 60; i < route.length - 60; i += 70) {
    const p = route[i];
    const pos = p.pos.clone().addScaledVector(p.right, (rand() < 0.5 ? -1 : 1) * randRange(rand, 12, 18)).addScaledVector(p.up, randRange(rand, -4, 6));
    if (!clearOf(pos, 3)) continue;
    const b = geo.get('decor', pos.x, pos.z);
    if (rand() < 0.6) {
      place(b, G.ico, pos.x, pos.y + 2, pos.z, pick(rand, [0xff5a4a, 0xffd23f, 0x6f7ef2, 0xff9ad5]), { sx: 3, sy: 3.4, sz: 3 });
      place(b, G.box, pos.x, pos.y - 2.4, pos.z, 0x8a5a36, { sx: 1.4, sy: 1, sz: 1.4 });
      obstacles.push({ pos: pos.clone().add(new Vector3(0, 1.5, 0)), radius: 3 });
    } else {
      place(b, G.rock, pos.x, pos.y, pos.z, pick(rand, CLIFF), { sx: 3, sy: 2.4, sz: 3, ry: rand() * 6 });
      obstacles.push({ pos: pos.clone(), radius: 2.6 });
    }
  }
  // A sea of clouds far below.
  const bounds = build.bounds;
  const floor = build.killY + 8;
  for (let i = 0; i < 90; i++) {
    const x = randRange(rand, bounds.min.x - 150, bounds.max.x + 150), z = randRange(rand, bounds.min.z - 150, bounds.max.z + 150);
    cloudPuff(geo.get('decor', x, z), x, floor + randRange(rand, -6, 6), z, randRange(rand, 6, 14), rand);
  }
  // Big islands in the distance.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand();
    const rx = (bounds.max.x - bounds.min.x) / 2 + randRange(rand, 90, 160), rz = (bounds.max.z - bounds.min.z) / 2 + randRange(rand, 90, 160);
    const x = (bounds.min.x + bounds.max.x) / 2 + Math.cos(a) * rx, z = (bounds.min.z + bounds.max.z) / 2 + Math.sin(a) * rz;
    floatingIsland(geo, x, bounds.min.y + randRange(rand, -20, 30), z, randRange(rand, 16, 28), rand, null);
  }
}

const DECORATORS = {
  rooftop: decorateRooftop,
  ruins: decorateRuins,
  frost: decorateFrost,
  canyon: decorateCanyon,
  ocean: decorateOcean,
  sky: decorateSky,
};

/** Returns a `decorate(build)` function for TrackBuilder. */
export function decoratorFor(themeId, seedText = '') {
  const fn = DECORATORS[themeId] || DECORATORS.rooftop;
  return (build) => fn(build, mulberry32(hashString(seedText + themeId)));
}

export { G as DECOR_GEOMETRY, place, trackCells, surroundings };
