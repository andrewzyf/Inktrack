import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePlacement, buildOccupancy, buildTrack, buildPieceGeometry } from '../src/tracks/TrackBuilder.js';
import { PIECES } from '../src/tracks/pieces.js';
import { candidateAt, openEndsInto, pieceAt } from '../src/editor/placement.js';
import { setStorageBackend } from '../src/storage/storage.js';
import { saveCustomTrack, listCustomTracks, getCustomTrack, deleteCustomTrack, toFileJSON, parseTrackFile, sanitizeTrack } from '../src/storage/customTracks.js';
import { Race } from '../src/race/Race.js';
import { Autopilot } from '../src/race/Autopilot.js';
import { PHYSICS } from '../src/config/physics.js';

/** Simulate the editor: repeatedly "click" the cell after the open road end. */
function buildBySnapping(types) {
  const pieces = [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }];
  const D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const type of types) {
    const resolved = pieces.map((p, i) => resolvePlacement(p, i));
    const occ = buildOccupancy(resolved);
    // Next cell: the newest piece's open end.
    let cell = null, level = 0;
    const keys = new Map();
    for (const rp of resolved) for (const c of rp.connectors) keys.set(c.key, (keys.get(c.key) || 0) + 1);
    for (let i = resolved.length - 1; i >= 0 && !cell; i--) {
      for (const c of resolved[i].connectors) {
        if (cell || keys.get(c.key) !== 1 || (resolved[i].type === 'start' && c.index === 0)) continue;
        cell = [c.cx + D[c.dir][0], c.cz + D[c.dir][1]];
        level = c.level;
      }
    }
    const cand = candidateAt(resolved, occ, cell, { type, level: 0, rotation: 0, snap: true });
    expect(cand.snapped, `${type} snaps`).toBe(true);
    expect(cand.valid, `${type} valid`).toBe(true);
    expect(cand.piece.y).toBeGreaterThanOrEqual(level - 2);
    pieces.push(cand.piece);
  }
  return pieces;
}

describe('Phase 7 — editor placement', () => {
  it('every palette piece has renderable local geometry', () => {
    for (const type of Object.keys(PIECES)) {
      const geo = buildPieceGeometry(type);
      expect(geo.triangleCount, type).toBeGreaterThan(0);
      if (PIECES[type].gate) expect(geo.entries().some((e) => e.material === 'banner'), type).toBe(true);
    }
    expect(buildPieceGeometry('straight', { surface: 'ice' }).entries().some((e) => e.material === 'ice')).toBe(true);
  });

  it('auto-snap chains pieces into a connected, drivable track', () => {
    const pieces = buildBySnapping(['straight', 'boost', 'curve', 'straight', 'checkpoint', 'slope', 'straight', 'turn', 'straight', 'bank', 'loop', 'straight', 'finish']);
    const build = buildTrack({ pieces });
    expect(build.errors).toEqual([]);
    expect(build.order.length).toBe(pieces.length);
    // …and the autopilot can finish it.
    const race = new Race(build);
    const ap = new Autopilot(build.route);
    ap.attach(race.car);
    const c = {};
    for (let t = 0; t < 90 && race.state !== 'finished'; t += 1 / PHYSICS.tickRate) race.step(1 / PHYSICS.tickRate, ap.sample(c));
    expect(race.state).toBe('finished');
  });

  it('snaps slopes to the level of the road end, both up and down', () => {
    const pieces = buildBySnapping(['slope', 'straight']);
    expect(pieces[1].y).toBe(0);
    expect(pieces[2].y).toBe(1); // straight after the slope sits one level up
  });

  it('blocks overlapping placements when snapping is off', () => {
    const pieces = [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }, { t: 'straight', x: 0, y: 0, z: 1, r: 0 }];
    const resolved = pieces.map((p, i) => resolvePlacement(p, i));
    const occ = buildOccupancy(resolved);
    expect(candidateAt(resolved, occ, [0, 1], { type: 'straight', snap: false }).valid).toBe(false);
    expect(candidateAt(resolved, occ, [0, 1], { type: 'straight', level: 2, snap: false }).valid).toBe(true); // bridge above
    expect(candidateAt(resolved, occ, [5, 5], { type: 'loop', snap: false }).valid).toBe(true);
  });

  it('open ends and erase picking', () => {
    const pieces = [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }, { t: 'straight', x: 0, y: 3, z: 0, r: 1 }]; // bridge over the start gate
    const resolved = pieces.map((p, i) => resolvePlacement(p, i));
    expect(openEndsInto(resolved, [0, 1])).toEqual([{ dir: 0, level: 0 }]);
    const occ = buildOccupancy(resolved);
    expect(pieceAt(occ, [0, 0], 0)).toBe(0);
    expect(pieceAt(occ, [0, 0], 3)).toBe(1);
    expect(pieceAt(occ, [9, 9], 0)).toBe(null);
  });
});

describe('Phase 7 — save / load / export / import', () => {
  beforeEach(() => setStorageBackend(null)); // in-memory

  it('saves, lists, reloads and deletes custom tracks', () => {
    const pieces = buildBySnapping(['straight', 'finish']);
    const saved = saveCustomTrack({ name: 'My <b>Track</b>', theme: 'frost', pieces });
    expect(saved.id).toMatch(/^c/);
    expect(saved.name).toBe('My bTrack/b');
    expect(listCustomTracks().map((t) => t.id)).toEqual([saved.id]);
    expect(getCustomTrack(saved.id).pieces).toEqual(pieces);
    const again = saveCustomTrack({ ...saved, name: 'Renamed' });
    expect(again.id).toBe(saved.id);
    expect(listCustomTracks()).toHaveLength(1);
    deleteCustomTrack(saved.id);
    expect(listCustomTracks()).toHaveLength(0);
  });

  it('exports to a JSON file format and imports it back', () => {
    const pieces = buildBySnapping(['straight', 'ramp']).concat([{ t: 'straight', x: 0, y: 0, z: 6, r: 0, s: 'ice' }, { t: 'finish', x: 0, y: 0, z: 7, r: 0 }]);
    const json = toFileJSON({ name: 'Share Me', theme: 'ruins', pieces });
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('inktrack-track');
    expect(parsed.version).toBe(1);
    const back = parseTrackFile(json);
    expect(back).toMatchObject({ name: 'Share Me', theme: 'ruins' });
    expect(back.pieces).toEqual(pieces);
    expect(back.id).toBeUndefined();
  });

  it('rejects malformed or hostile files', () => {
    expect(() => parseTrackFile('not json')).toThrow(/JSON/);
    expect(() => parseTrackFile('{"format":"other","pieces":[]}')).toThrow(/not an InkTrack/);
    expect(() => parseTrackFile('{"pieces":[{"t":"rocket","x":0,"z":0}]}')).toThrow(/Unknown piece/);
    expect(() => parseTrackFile('{"pieces":[{"t":"straight","x":1.5,"z":0}]}')).toThrow(/Invalid x/);
    expect(() => parseTrackFile('{"pieces":[{"t":"straight","x":0,"z":0,"r":7}]}')).toThrow(/rotation/);
    expect(sanitizeTrack({ pieces: [], theme: 'lava' }).theme).toBe('rooftop');
    expect(() => sanitizeTrack({ pieces: new Array(2001).fill({ t: 'straight', x: 0, z: 0 }) })).toThrow(/too big/);
  });
});
