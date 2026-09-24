import { DIRS, opposite, rotateCell } from '../tracks/constants.js';
import { getPiece } from '../tracks/pieces.js';
import { resolvePlacement, overlaps } from '../tracks/TrackBuilder.js';

/**
 * Pure placement rules for the editor (unit-tested headlessly).
 */
export const MIN_LEVEL = -8;
export const MAX_LEVEL = 40;

/** Open road ends of `resolved` whose next cell is `cell`. */
export function openEndsInto(resolved, cell) {
  const byEdge = new Map();
  for (const rp of resolved) for (const c of rp.connectors) {
    if (!byEdge.has(c.key)) byEdge.set(c.key, []);
    byEdge.get(c.key).push(c);
  }
  const ends = [];
  for (const rp of resolved) {
    for (const c of rp.connectors) {
      const [dx, dz] = DIRS[c.dir];
      if (c.cx + dx !== cell[0] || c.cz + dz !== cell[1]) continue;
      const partners = (byEdge.get(c.key) || []).filter((o) => o !== c && o.dir === opposite(c.dir));
      if (!partners.length) ends.push({ dir: c.dir, level: c.level });
    }
  }
  return ends;
}

function inRange(rp) {
  return rp.level >= MIN_LEVEL && rp.level + rp.def.height - 1 <= MAX_LEVEL + 10;
}

/**
 * The placement the editor would make at `cell`.
 * opts: { type, level, rotation, ice, snap } → { piece, valid, snapped }
 * With `snap`, a piece hovering next to an open road end is rotated and
 * lifted so one of its connectors joins that end.
 */
export function candidateAt(resolved, occupancy, cell, { type, level = 0, rotation = 0, ice = false, snap = true }) {
  const def = getPiece(type);
  const surface = ice && type !== 'boost' ? 'ice' : undefined;
  const make = (x, z, y, r) => (surface ? { t: type, x, y, z, r, s: surface } : { t: type, x, y, z, r });
  if (snap) {
    const ends = openEndsInto(resolved, cell).sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
    for (const end of ends) {
      for (const c of def.connectors) {
        const r = (((opposite(end.dir) - c.dir) % 4) + 4) % 4;
        const [rx, rz] = rotateCell(c.x, c.z, r);
        const p = make(cell[0] - rx, cell[1] - rz, end.level - c.level, r);
        const rp = resolvePlacement(p);
        if (!overlaps(occupancy, rp)) return { piece: p, valid: inRange(rp), snapped: true };
      }
    }
  }
  const p = make(cell[0], cell[1], level, rotation);
  const rp = resolvePlacement(p);
  return { piece: p, valid: inRange(rp) && !overlaps(occupancy, rp), snapped: false };
}

/** Index of the piece the erase tool targets at `cell` (prefers `level`). */
export function pieceAt(occupancy, cell, level) {
  const list = occupancy.get(`${cell[0]},${cell[1]}`);
  if (!list || !list.length) return null;
  const atLevel = list.find((o) => level >= o.minLevel && level <= o.maxLevel);
  const pick = atLevel || [...list].sort((a, b) => b.maxLevel - a.maxLevel)[0];
  return pick ? pick.placement : null;
}
