import { Vector3 } from 'three';
import { TILE, LEVEL } from './constants.js';
import { createPath, linePath, loopPath } from './paths.js';

/**
 * Track piece prefabs.
 *
 * Every piece is authored in its own local grid frame: the anchor cell (0,0)
 * is centred on the origin, the road surface of the base level is y = 0 and
 * the "natural" driving direction is +Z. A placement rotates the piece by
 * r quarter-turns and moves it to grid (x, level, z).
 *
 *   cells       footprint cells [x, z]
 *   height      levels occupied above the base (for overlap checks)
 *   connectors  open road ends: cell, edge direction (0 +Z, 1 +X, 2 −Z, 3 −X), level
 *   segments()  road sections from connector 0 → connector 1, as centre-line paths
 *   gate        start / checkpoint / finish trigger at the piece centre
 *
 * Pieces are undirected (drive a slope up or down, a curve left or right) so
 * the same prefabs serve the hand-built tracks and the editor.
 */

const H = TILE / 2;
const V = (x, y, z) => new Vector3(x, y, z);
const Y = V(0, 1, 0);
const ease = (t) => (1 - Math.cos(Math.PI * t)) / 2;

/** Quarter circle turning from +Z toward +X, centred at `c`. Optional banking. */
function quarterArc(c, radius, bank = 0) {
  const inward = new Vector3();
  return createPath(
    (t, o) => {
      const a = (t * Math.PI) / 2;
      return o.set(c.x - radius * Math.cos(a), c.y, c.z + radius * Math.sin(a));
    },
    bank
      ? (t, p, tan, o) => {
          const b = bank * Math.sin(Math.PI * t);
          inward.set(c.x - p.x, 0, c.z - p.z).normalize();
          return o.copy(Y).multiplyScalar(Math.cos(b)).addScaledVector(inward, Math.sin(b));
        }
      : null,
  );
}

function road(path, extra = {}) {
  return { path, walls: [true, true], surface: 'road', ...extra };
}

const straightSegs = () => [road(linePath(V(0, 0, -H), V(0, 0, H)))];
const straightConnectors = [
  { x: 0, z: 0, dir: 2, level: 0 },
  { x: 0, z: 0, dir: 0, level: 0 },
];

function loopPiece(side) {
  return {
    name: side > 0 ? 'Loop (left)' : 'Loop (right)',
    category: 'stunt',
    cells: [[0, 0], [0, 1], [side, 0], [side, 1]],
    height: 9,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: side, z: 1, dir: 0, level: 0 },
    ],
    segments: () => [
      road(linePath(V(0, 0, -H), V(0, 0, H))),
      road(loopPath(V(0, 0, H), V(0, 0, 1), V(side, 0, 0), 9, TILE), { guided: true, spacing: 1.2 }),
      road(linePath(V(TILE * side, 0, H), V(TILE * side, 0, H + TILE))),
    ],
  };
}

export const PIECES = {
  straight: {
    name: 'Straight',
    category: 'road',
    cells: [[0, 0]],
    height: 2,
    connectors: straightConnectors,
    segments: straightSegs,
  },
  start: {
    name: 'Start',
    category: 'gate',
    cells: [[0, 0]],
    height: 3,
    connectors: straightConnectors,
    segments: straightSegs,
    gate: 'start',
    spawn: V(0, 0, -2),
  },
  checkpoint: {
    name: 'Checkpoint',
    category: 'gate',
    cells: [[0, 0]],
    height: 3,
    connectors: straightConnectors,
    segments: straightSegs,
    gate: 'checkpoint',
  },
  finish: {
    name: 'Finish',
    category: 'gate',
    cells: [[0, 0]],
    height: 3,
    connectors: straightConnectors,
    segments: straightSegs,
    gate: 'finish',
  },
  boost: {
    name: 'Boost Pad',
    category: 'road',
    cells: [[0, 0]],
    height: 2,
    connectors: straightConnectors,
    segments: () => [
      road(linePath(V(0, 0, -H), V(0, 0, -3))),
      road(linePath(V(0, 0, -3), V(0, 0, 3)), { surface: 'boost' }),
      road(linePath(V(0, 0, 3), V(0, 0, H))),
    ],
  },
  turn: {
    name: 'Tight Turn',
    category: 'road',
    cells: [[0, 0]],
    height: 2,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: 0, z: 0, dir: 1, level: 0 },
    ],
    segments: () => [road(quarterArc(V(H, 0, -H), H), { spacing: 1 })],
  },
  curve: {
    name: 'Wide Curve',
    category: 'road',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]],
    height: 2,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: 1, z: 1, dir: 1, level: 0 },
    ],
    segments: () => [road(quarterArc(V(TILE + H, 0, -H), TILE + H), { spacing: 1.5 })],
  },
  bank: {
    name: 'Banked Curve',
    category: 'road',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]],
    height: 3,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: 1, z: 1, dir: 1, level: 0 },
    ],
    segments: () => [road(quarterArc(V(TILE + H, 0, -H), TILE + H, 0.5), { spacing: 1.5 })],
  },
  slope: {
    name: 'Slope',
    category: 'road',
    cells: [[0, 0]],
    height: 3,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: 0, z: 0, dir: 0, level: 1 },
    ],
    segments: () => [road(createPath((t, o) => o.set(0, LEVEL * ease(t), -H + TILE * t)), { spacing: 1.25 })],
  },
  slopeLong: {
    name: 'Long Slope',
    category: 'road',
    cells: [[0, 0], [0, 1]],
    height: 4,
    connectors: [
      { x: 0, z: 0, dir: 2, level: 0 },
      { x: 0, z: 1, dir: 0, level: 2 },
    ],
    segments: () => [road(createPath((t, o) => o.set(0, 2 * LEVEL * ease(t), -H + 2 * TILE * t)), { spacing: 1.5 })],
  },
  ramp: {
    name: 'Jump Ramp',
    category: 'stunt',
    cells: [[0, 0]],
    height: 3,
    connectors: [{ x: 0, z: 0, dir: 2, level: 0 }],
    launch: { dir: 0 }, // where the car flies to (for route finding)
    segments: () => [road(createPath((t, o) => o.set(0, 1.6 * t * t, -H + TILE * t)), { spacing: 1, capEnd: true })],
  },
  loop: loopPiece(1),
  loopRight: loopPiece(-1),
};

export const PIECE_ORDER = ['straight', 'turn', 'curve', 'bank', 'slope', 'slopeLong', 'ramp', 'loop', 'loopRight', 'boost', 'checkpoint', 'start', 'finish'];

export function getPiece(type) {
  const p = PIECES[type];
  if (!p) throw new Error(`Unknown track piece "${type}"`);
  return p;
}

/** Cache segment lists — paths are pure functions of the piece type. */
const segCache = new Map();
export function pieceSegments(type) {
  if (!segCache.has(type)) segCache.set(type, getPiece(type).segments());
  return segCache.get(type);
}
