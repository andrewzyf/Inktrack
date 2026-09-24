import { Vector3, Quaternion, Matrix4, BoxGeometry } from 'three';
import { CollisionWorld, SURFACE } from '../physics/CollisionWorld.js';
import { TILE, LEVEL, DIRS, opposite, rotateCell, ROAD_WIDTH, WALL_HEIGHT, WALL_COLLISION_HEIGHT, WALL_THICKNESS, SLAB } from './constants.js';
import { getPiece, pieceSegments } from './pieces.js';
import { transformPath, reversePath, makeFrame } from './paths.js';
import { addRoadCollision, sweepRoadGeometry } from './sweep.js';
import { GeoSet } from './GeoSet.js';
import { PHYSICS } from '../config/physics.js';

/**
 * Turns track data (a list of piece placements) into everything a race
 * needs: collision, chunked render geometry, the ordered route (racing line),
 * checkpoint gates, spawn, and kill height. Runs in Node too (no DOM), so
 * tests can drive every track headlessly.
 *
 * Track data: { name, theme, pieces: [{ t, x, y, z, r, s? }] }
 *   t type · x/z grid cell · y level · r quarter-turns · s: 'ice' surface
 */

const UP = new Vector3(0, 1, 0);
const SURFACE_IDS = { road: SURFACE.ROAD, ice: SURFACE.ICE, boost: SURFACE.BOOST };

export function edgeKey(cx, cz, dir, level) {
  const [dx, dz] = DIRS[dir];
  return `${2 * cx + dx},${2 * cz + dz},${level}`;
}

/** Resolve a placement into world-space transform, cells and connectors. */
export function resolvePlacement(p, index = 0) {
  const def = getPiece(p.t);
  const r = ((p.r || 0) % 4 + 4) % 4;
  const quat = new Quaternion().setFromAxisAngle(UP, (r * Math.PI) / 2);
  const offset = new Vector3(p.x * TILE, (p.y || 0) * LEVEL, p.z * TILE);
  const cells = def.cells.map(([cx, cz]) => {
    const [rx, rz] = rotateCell(cx, cz, r);
    return [p.x + rx, p.z + rz];
  });
  const connectors = def.connectors.map((c, ci) => {
    const [rx, rz] = rotateCell(c.x, c.z, r);
    const cx = p.x + rx, cz = p.z + rz, dir = (c.dir + r) % 4, level = (p.y || 0) + c.level;
    return { index: ci, cx, cz, dir, level, key: edgeKey(cx, cz, dir, level) };
  });
  return { index, data: p, type: p.t, def, r, quat, offset, cells, connectors, level: p.y || 0 };
}

/** Grid-cell occupancy: "x,z" → list of { minLevel, maxLevel, placement }. */
export function buildOccupancy(resolved) {
  const occ = new Map();
  for (const rp of resolved) {
    for (const [x, z] of rp.cells) {
      const k = `${x},${z}`;
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push({ minLevel: rp.level, maxLevel: rp.level + rp.def.height - 1, placement: rp.index });
    }
  }
  return occ;
}

/** Does placement `rp` overlap anything already in `occ`? */
export function overlaps(occ, rp, ignore = -1) {
  for (const [x, z] of rp.cells) {
    const list = occ.get(`${x},${z}`);
    if (!list) continue;
    for (const o of list) {
      if (o.placement === ignore) continue;
      if (rp.level <= o.maxLevel && rp.level + rp.def.height - 1 >= o.minLevel) return true;
    }
  }
  return false;
}

function worldSegments(rp, reversed) {
  const segs = pieceSegments(rp.type).map((s) => ({ ...s, path: transformPath(s.path, rp.quat, rp.offset) }));
  if (!reversed) return segs;
  return segs.reverse().map((s) => ({ ...s, path: reversePath(s.path), capStart: s.capEnd, capEnd: s.capStart }));
}

/**
 * Walk the track from the start piece along connectors (and across jump
 * gaps) to find the driving order. Returns [{ rp, entry, reversed }].
 */
export function traverse(resolved) {
  const byEdge = new Map();
  for (const rp of resolved) for (const c of rp.connectors) {
    if (!byEdge.has(c.key)) byEdge.set(c.key, []);
    byEdge.get(c.key).push({ rp, c });
  }
  const start = resolved.find((rp) => rp.type === 'start');
  if (!start) return [];
  const order = [];
  const visited = new Set();
  let cur = start;
  let entry = start.connectors[0];
  for (let guard = 0; guard < resolved.length + 1 && cur; guard++) {
    visited.add(cur.index);
    const reversed = entry ? entry.index === 1 : false;
    order.push({ rp: cur, entry, reversed });
    if (cur.type === 'finish' && order.length > 1) break;
    // Exit: the other connector, or the launch direction for one-way pieces.
    let exit = cur.connectors.find((c) => c !== entry);
    let exitDir, exitCx, exitCz, exitLevel;
    if (exit) {
      exitDir = exit.dir; exitCx = exit.cx; exitCz = exit.cz; exitLevel = exit.level;
    } else if (cur.def.launch) {
      exitDir = (cur.def.launch.dir + cur.r) % 4;
      exitCx = cur.cells[0][0]; exitCz = cur.cells[0][1]; exitLevel = cur.level;
    } else break;
    const direct = (byEdge.get(edgeKey(exitCx, exitCz, exitDir, exitLevel)) || []).find(
      (e) => e.rp.index !== cur.index && !visited.has(e.rp.index) && e.c.dir === opposite(exitDir),
    );
    let next = direct || null;
    if (!next) next = jumpSearch(byEdge, visited, exitCx, exitCz, exitDir, exitLevel);
    if (!next) break;
    cur = next.rp;
    entry = next.c;
  }
  return order;
}

/** Look ahead across a gap for the landing piece of a jump. */
function jumpSearch(byEdge, visited, cx, cz, dir, level) {
  const [dx, dz] = DIRS[dir];
  for (let k = 1; k <= 14; k++) {
    let best = null;
    for (let dl = 4; dl >= -24; dl--) {
      const list = byEdge.get(edgeKey(cx + dx * k, cz + dz * k, dir, level + dl));
      if (!list) continue;
      const e = list.find((e) => !visited.has(e.rp.index) && e.c.dir === opposite(dir));
      if (e && (!best || Math.abs(dl) < Math.abs(best.dl))) best = { ...e, dl };
    }
    if (best) return best;
  }
  return null;
}

/** Sample the ordered pieces into a dense racing line. */
function buildRoute(order) {
  const pts = [];
  const f = makeFrame();
  let dist = 0;
  const push = (frame, piece) => {
    const prev = pts[pts.length - 1];
    if (prev) {
      const d = prev.pos.distanceTo(frame.pos);
      if (d < 0.05) return;
      dist += d;
    }
    pts.push({ pos: frame.pos.clone(), tangent: frame.tangent.clone(), up: frame.up.clone(), right: frame.right.clone(), dist, piece, ice });
  };
  let ice = false;
  for (const { rp, reversed } of order) {
    const segs = worldSegments(rp, reversed);
    ice = rp.data.s === 'ice';
    for (const s of segs) {
      const n = Math.max(2, Math.ceil(s.path.length / 1.0));
      const prev = pts[pts.length - 1];
      if (prev) {
        // Bridge jump gaps with a straight line so the autopilot keeps its aim.
        s.path.frame(0, f);
        const gap = prev.pos.distanceTo(f.pos);
        if (gap > 1.5) {
          const a = prev.pos.clone(), b = f.pos.clone();
          const tan = b.clone().sub(a).normalize();
          const steps = Math.ceil(gap / 2);
          for (let i = 1; i < steps; i++) {
            const g = makeFrame();
            g.pos.lerpVectors(a, b, i / steps);
            g.tangent.copy(tan);
            g.up.copy(UP);
            g.right.crossVectors(tan, UP).normalize();
            push(g, rp.index);
            pts[pts.length - 1].gap = true;
          }
        }
      }
      for (let i = 0; i <= n; i++) push(s.path.frame(i / n, f), rp.index);
    }
  }
  return pts;
}

function gateInfo(rp, reversed, kind) {
  const center = rp.offset.clone();
  const forward = new Vector3(0, 0, 1).applyQuaternion(rp.quat);
  if (reversed) forward.negate();
  const right = new Vector3().crossVectors(forward, UP).normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), forward);
  if (Math.abs(forward.z + 1) < 1e-6) quat.setFromAxisAngle(UP, Math.PI);
  return {
    kind,
    placement: rp.index,
    center,
    forward,
    right,
    up: UP.clone(),
    halfWidth: ROAD_WIDTH / 2 + 0.6,
    // Generous: flying over a gate after a crest still counts.
    height: 25,
    spawn: {
      pos: center.clone().addScaledVector(UP, PHYSICS.car.rideHeight + 0.05),
      quat,
    },
  };
}

/**
 * Build a track.
 * options: { palette, decorate(build, rand) }, `decorate` adds theme scenery.
 */
export function buildTrack(data, options = {}) {
  const palette = options.palette || {};
  const resolved = data.pieces.map((p, i) => resolvePlacement(p, i));
  const occupancy = buildOccupancy(resolved);
  const order = traverse(resolved);
  const route = buildRoute(order);
  const world = new CollisionWorld();
  const geo = new GeoSet(160);
  const errors = [];

  const reversedOf = new Map(order.map((o) => [o.rp.index, o.reversed]));

  for (const rp of resolved) {
    const segs = worldSegments(rp, reversedOf.get(rp.index) || false);
    for (const s of segs) {
      const surface = s.surface === 'boost' ? 'boost' : rp.data.s === 'ice' ? 'ice' : 'road';
      const spacing = s.spacing || 2;
      addRoadCollision(world, s.path, {
        walls: s.walls,
        surface: SURFACE_IDS[surface],
        guided: s.guided,
        samples: Math.max(2, Math.ceil(s.path.length / Math.min(spacing, 2))),
        width: ROAD_WIDTH,
        wallHeight: WALL_COLLISION_HEIGHT,
      });
      const mid = makeFrame();
      s.path.frame(0.5, mid);
      sweepRoadGeometry(geo.get(surface, mid.pos.x, mid.pos.z), s.path, {
        walls: s.walls,
        width: ROAD_WIDTH,
        wallHeight: WALL_HEIGHT,
        wallThickness: WALL_THICKNESS,
        slab: SLAB,
        spacing,
        capStart: s.capStart,
        capEnd: s.capEnd,
        palette,
      });
    }
  }
  world.build();

  // Gates in driving order.
  const checkpoints = [];
  let finish = null;
  let start = null;
  for (const { rp, reversed } of order) {
    const g = rp.def.gate;
    if (g === 'checkpoint') checkpoints.push(gateInfo(rp, reversed, 'checkpoint'));
    else if (g === 'finish' && !finish) finish = gateInfo(rp, reversed, 'finish');
    else if (g === 'start' && !start) start = gateInfo(rp, false, 'start');
  }
  // Checkpoints the traversal never reached are still required.
  const seen = new Set(checkpoints.map((c) => c.placement));
  for (const rp of resolved) {
    if (rp.def.gate === 'checkpoint' && !seen.has(rp.index)) checkpoints.push(gateInfo(rp, false, 'checkpoint'));
  }
  if (!finish) {
    const f = resolved.find((rp) => rp.def.gate === 'finish');
    if (f) finish = gateInfo(f, false, 'finish');
  }
  const startRp = resolved.find((rp) => rp.type === 'start');
  if (startRp) {
    start = gateInfo(startRp, false, 'start');
    const sp = startRp.def.spawn.clone().applyQuaternion(startRp.quat).add(startRp.offset);
    start.spawn.pos.copy(sp).addScaledVector(UP, PHYSICS.car.rideHeight + 0.05);
  }
  if (!start) errors.push('Track needs a Start piece.');
  if (!finish) errors.push('Track needs a Finish piece.');
  else if (!order.some((o) => o.rp.index === finish.placement)) errors.push('The Finish is not connected to the Start.');

  // Route distance of each gate (for progress & autopilot).
  const gateDist = (gate) => {
    let best = Infinity, bestD = 0;
    for (const p of route) {
      if (p.piece !== gate.placement) continue;
      const d = p.pos.distanceToSquared(gate.center);
      if (d < best) { best = d; bestD = p.dist; }
    }
    return bestD;
  };
  for (const cp of checkpoints) cp.routeDist = gateDist(cp);
  if (finish) finish.routeDist = gateDist(finish);

  let minY = Infinity;
  for (const rp of resolved) minY = Math.min(minY, rp.offset.y);
  if (!isFinite(minY)) minY = 0;

  const build = {
    data,
    resolved,
    occupancy,
    order,
    route,
    world,
    geo,
    checkpoints,
    finish,
    start,
    errors,
    valid: errors.length === 0,
    killY: minY - 18,
    bounds: world.bounds,
  };

  for (const g of [start, ...checkpoints, finish]) if (g) addGateGeometry(geo, g, palette);
  if (options.decorate) options.decorate(build);
  return build;
}

// ── gates ───────────────────────────────────────────────────────────────
const GATE_COLORS = {
  start: { pillar: 0x2b2640, beam: 0xffffff },
  checkpoint: { pillar: 0x2b2640, beam: 0xffd23f },
  finish: { pillar: 0x2b2640, beam: 0xffffff },
};
/** Banner atlas rows (see TrackView): start, checkpoint, finish. */
export const BANNER_ROW = { start: 0, checkpoint: 1, finish: 2 };

function addGateGeometry(geo, gate, palette) {
  const b = geo.get('decor', gate.center.x, gate.center.z);
  const m = new Matrix4();
  const basis = new Matrix4().makeBasis(gate.right, gate.up, gate.forward);
  const W = ROAD_WIDTH / 2 + WALL_THICKNESS / 2;
  const top = 6.6;
  const col = GATE_COLORS[gate.kind];
  const place = (x, y, z, geom, color) => {
    m.copy(basis).setPosition(new Vector3().copy(gate.center).addScaledVector(gate.right, x).addScaledVector(gate.up, y).addScaledVector(gate.forward, z));
    b.append(geom, m, color);
  };
  place(W, (top + WALL_HEIGHT) / 2, 0, new BoxGeometry(0.7, top - WALL_HEIGHT, 0.7), col.pillar);
  place(-W, (top + WALL_HEIGHT) / 2, 0, new BoxGeometry(0.7, top - WALL_HEIGHT, 0.7), col.pillar);
  place(0, top + 0.3, 0, new BoxGeometry(2 * W + 1.2, 0.6, 0.8), col.beam);
  // Banner panel (textured) hanging under the beam.
  const bb = geo.get('banner', gate.center.x, gate.center.z);
  const row = BANNER_ROW[gate.kind];
  const g = new BoxGeometry(2 * W - 1.0, 1.5, 0.25);
  // Map front/back faces to the banner row; sides sample white.
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4); // BoxGeometry: +x,-x,+y,-y,+z,-z
    if (face === 4 || face === 5) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, face === 5 ? 1 - u : u, (2 - row + v) / 3);
    } else uv.setXY(i, 0.99, 0.99);
  }
  m.copy(basis).setPosition(new Vector3().copy(gate.center).addScaledVector(gate.up, top - 0.85));
  bb.append(g, m, palette.banner ?? 0xffffff);
}

/**
 * Geometry for a single piece in its own local frame (editor previews,
 * instanced rendering). Returns a GeoSet with one chunk per material.
 */
export function buildPieceGeometry(type, { surface = null, palette = {} } = {}) {
  const def = getPiece(type);
  const geo = new GeoSet(1e6);
  for (const s of pieceSegments(type)) {
    const mat = s.surface === 'boost' ? 'boost' : surface === 'ice' ? 'ice' : 'road';
    sweepRoadGeometry(geo.get(mat), s.path, {
      walls: s.walls, width: ROAD_WIDTH, wallHeight: WALL_HEIGHT, wallThickness: WALL_THICKNESS, slab: SLAB,
      spacing: s.spacing || 2, capStart: s.capStart, capEnd: s.capEnd, palette,
    });
  }
  if (def.gate) {
    const f = new Vector3(0, 0, 1);
    addGateGeometry(geo, { kind: def.gate, center: new Vector3(), forward: f, right: new Vector3(-1, 0, 0), up: UP.clone() }, palette);
  }
  return geo;
}
