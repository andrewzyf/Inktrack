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
  let shortcutId = null;
  let shortcuts = 0;

  const place = (type, want = () => true, label = type, onlyEntry = null) => {
    const def = getPiece(type);
    for (let ci = 0; ci < def.connectors.length; ci++) {
      if (onlyEntry != null && ci !== onlyEntry) continue;
      const c = def.connectors[ci];
      const r = (((opposite(cur.dir) - c.dir) % 4) + 4) % 4;
      const [rx, rz] = rotateCell(c.x, c.z, r);
      const p = { t: type, x: cur.x - rx, y: cur.level - c.level, z: cur.z - rz, r };
      if (ice && type !== 'boost') p.s = 'ice';
      if (shortcutId != null) p.sc = shortcutId;
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

  /**
   * ['shortcut', 'left'|'right', { main: [...], alt: [...] }]: a fork whose
   * side lane runs `alt` while the racing line runs `main`; both must arrive
   * side by side (alt on the same side) where a merge joins them again.
   */
  const shortcut = (side, { main, alt }) => {
    const id = shortcuts++;
    const fork = place(side === 'right' ? 'forkRight' : 'fork', () => true, 'shortcut', 0);
    const frp = resolvePlacement(fork);
    const ac = frp.connectors[2];
    const [adx, adz] = DIRS[ac.dir];
    const altCur = { x: ac.cx + adx, z: ac.cz + adz, level: ac.level, dir: ac.dir };
    for (const st of main) runStep(st);
    const mainCur = { ...cur };
    Object.assign(cur, altCur);
    shortcutId = id;
    for (const st of alt) runStep(st);
    shortcutId = null;
    const altEnd = { ...cur };
    Object.assign(cur, mainCur);
    for (const type of ['fork', 'forkRight']) {
      const def = getPiece(type);
      for (let r = 0; r < 4; r++) {
        const c1 = def.connectors[1];
        if ((c1.dir + r) % 4 !== opposite(cur.dir)) continue;
        const [rx, rz] = rotateCell(c1.x, c1.z, r);
        const p = { t: type, x: cur.x - rx, y: cur.level - c1.level, z: cur.z - rz, r };
        if (ice) p.s = 'ice';
        const rp = resolvePlacement(p, pieces.length);
        const c2 = rp.connectors[2];
        if (c2.cx !== altEnd.x || c2.cz !== altEnd.z || c2.level !== altEnd.level || c2.dir !== opposite(altEnd.dir)) continue;
        if (overlaps(buildOccupancy(resolved), rp)) throw new Error(`Turtle: shortcut ${id} merge overlaps existing track`);
        pieces.push(p);
        resolved.push(rp);
        const exit = rp.connectors[0];
        const [dx, dz] = DIRS[exit.dir];
        Object.assign(cur, { x: exit.cx + dx, z: exit.cz + dz, level: exit.level, dir: exit.dir });
        return;
      }
    }
    throw new Error(`Turtle: shortcut ${id} lanes don't meet — main ends at (${mainCur.x}, ${mainCur.z}) L${mainCur.level} dir ${mainCur.dir}, alt at (${altEnd.x}, ${altEnd.z}) L${altEnd.level} dir ${altEnd.dir}`);
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
      case 'shortcut': shortcut(a, b); break;
      default: throw new Error(`Turtle: unknown command "${cmd}"`);
    }
  }
}
