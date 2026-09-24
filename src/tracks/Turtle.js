import { DIRS, opposite, rotateCell } from './constants.js';
import { getPiece } from './pieces.js';
import { resolvePlacement, buildOccupancy, overlaps } from './TrackBuilder.js';

/**
 * "Turtle" track authoring: describe a track as a driving script and get
 * grid placements back. The turtle keeps a cursor (next cell, level, travel
 * direction) and snaps each piece's entry connector onto it.
 *
 *   ['start'], ['straight', 3], ['left'], ['wideRight'], ['bankLeft'],
 *   ['up'], ['down'], ['up2'], ['down2'], ['ramp'], ['gap', 3, -2],
 *   ['loopLeft'], ['loopRight'], ['boost'], ['cp'], ['finish'], ['ice', true]
 */
export function runTurtle(script, { x = 0, z = 0, level = 0, dir = 0 } = {}, { partial = false } = {}) {
  const cur = { x, z, level, dir };
  const pieces = [];
  const resolved = [];
  let ice = false;

  const place = (type, want = () => true, label = type) => {
    const def = getPiece(type);
    for (let ci = 0; ci < def.connectors.length; ci++) {
      const c = def.connectors[ci];
      const r = (((opposite(cur.dir) - c.dir) % 4) + 4) % 4;
      const [rx, rz] = rotateCell(c.x, c.z, r);
      const p = { t: type, x: cur.x - rx, y: cur.level - c.level, z: cur.z - rz, r };
      if (ice && type !== 'boost') p.s = 'ice';
      const rp = resolvePlacement(p, pieces.length);
      const exit = rp.connectors.find((k) => k.index !== ci);
      const exitDir = exit ? exit.dir : (def.launch.dir + r) % 4;
      const exitLevel = exit ? exit.level : rp.level;
      if (!want(exitDir, exitLevel - cur.level)) continue;
      const occ = buildOccupancy(resolved);
      if (overlaps(occ, rp)) {
        throw new Error(`Turtle: "${label}" at step ${pieces.length} overlaps existing track at cell (${cur.x}, ${cur.z}) level ${cur.level}`);
      }
      pieces.push(p);
      resolved.push(rp);
      if (exit) {
        const [dx, dz] = DIRS[exit.dir];
        cur.x = exit.cx + dx;
        cur.z = exit.cz + dz;
        cur.level = exit.level;
        cur.dir = exit.dir;
      } else {
        const [dx, dz] = DIRS[exitDir];
        cur.x = rp.cells[0][0] + dx;
        cur.z = rp.cells[0][1] + dz;
        cur.dir = exitDir;
      }
      return p;
    }
    throw new Error(`Turtle: no orientation of "${type}" satisfies "${label}"`);
  };

  const turn = (k) => (d) => d === (cur.dir + k) % 4;
  for (const step of script) {
    if (partial) {
      try {
        runStep(step);
      } catch (e) {
        pieces.error = e.message;
        return pieces;
      }
    } else runStep(step);
  }
  return pieces;

  function runStep(step) {
    const [cmd, a, b] = Array.isArray(step) ? step : [step];
    const n = a ?? 1;
    switch (cmd) {
      case 'start': place('start', (d) => d === cur.dir); break;
      case 'finish': place('finish'); break;
      case 'cp': place('checkpoint'); break;
      case 'boost': place('boost'); break;
      case 'straight': for (let i = 0; i < n; i++) place('straight'); break;
      case 'left': place('turn', turn(1), cmd); break;
      case 'right': place('turn', turn(3), cmd); break;
      case 'wideLeft': place('curve', turn(1), cmd); break;
      case 'wideRight': place('curve', turn(3), cmd); break;
      case 'bankLeft': place('bank', turn(1), cmd); break;
      case 'bankRight': place('bank', turn(3), cmd); break;
      case 'up': for (let i = 0; i < n; i++) place('slope', (d, dl) => dl > 0, cmd); break;
      case 'down': for (let i = 0; i < n; i++) place('slope', (d, dl) => dl < 0, cmd); break;
      case 'up2': for (let i = 0; i < n; i++) place('slopeLong', (d, dl) => dl > 0, cmd); break;
      case 'down2': for (let i = 0; i < n; i++) place('slopeLong', (d, dl) => dl < 0, cmd); break;
      case 'ramp': place('ramp'); break;
      case 'loopLeft': place('loop', () => true, cmd); break;
      case 'loopRight': place('loopRight', () => true, cmd); break;
      case 'gap': {
        const [dx, dz] = DIRS[cur.dir];
        cur.x += dx * n;
        cur.z += dz * n;
        cur.level += b ?? 0;
        break;
      }
      case 'ice': ice = a !== false; break;
      default: throw new Error(`Turtle: unknown command "${cmd}"`);
    }
  }
}
