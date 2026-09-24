import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { buildTrack } from '../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../src/tracks/starterTracks.js';
import { Race } from '../src/race/Race.js';
import { Autopilot } from '../src/race/Autopilot.js';
import { Recorder } from '../src/replay/Recorder.js';
import { GhostPlayer } from '../src/replay/GhostPlayer.js';
import { encodeFloats, decodeFloats } from '../src/replay/codec.js';
import { setStorageBackend } from '../src/storage/storage.js';
import { trackKey, submitTime, getRecords, getBest, saveGhost, loadGhost, MAX_RECORDS } from '../src/storage/records.js';
import { PHYSICS } from '../src/config/physics.js';

const DT = 1 / PHYSICS.tickRate;

/** Minimal Storage mock (quota-limited like a browser). */
class MemStorage {
  constructor(quota = 5e6) { this.m = new Map(); this.quota = quota; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i]; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    const size = [...this.m.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0) + k.length + String(v).length;
    if (size > this.quota) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
}

function recordLap(build, aggression = 1) {
  const race = new Race(build);
  const ap = new Autopilot(build.route, { aggression });
  ap.attach(race.car);
  const rec = new Recorder(PHYSICS.tickRate, 4);
  const truth = []; // pose at every sample tick, for comparison
  const controls = { throttle: 0, brake: 0, steer: 0, drift: false };
  for (let i = 0; i < 120 * 120 && race.state !== 'finished'; i++) {
    const wasCountdown = race.state === 'countdown';
    race.step(DT, ap.sample(controls));
    if (race.state === 'racing') {
      if (wasCountdown) rec.reset();
      rec.capture(race.raceTicks, race.car);
      if (race.raceTicks % 4 === 0) truth.push({ t: race.raceTicks / 120, pos: race.car.position.clone() });
    } else if (race.state === 'finished') rec.finish(race.car);
    race.drainEvents();
  }
  return { race, rec, truth };
}

describe('Phase 5 — ghost recording & playback', () => {
  const track = STARTER_TRACKS[0];
  const build = buildTrack(track);
  const { race, rec, truth } = recordLap(build);

  it('records ~30 samples per second for the whole run', () => {
    expect(race.state).toBe('finished');
    expect(rec.rate).toBe(30);
    expect(rec.count).toBeGreaterThanOrEqual(Math.floor(race.finishTime * 30));
    expect(rec.count).toBeLessThanOrEqual(Math.ceil(race.finishTime * 30) + 2);
  });

  it('base64 codec round-trips exactly', () => {
    const f = new Float32Array([1.5, -2.25, 3e5, 0, Math.PI, -0.001]);
    expect([...decodeFloats(encodeFloats(f))]).toEqual([...f]);
  });

  it('playback reproduces the recorded path in real time', () => {
    const ghost = new GhostPlayer(rec.toGhost({ time: race.finishTime, splits: race.splits }));
    const p = new Vector3(), q = new Quaternion();
    let maxErr = 0;
    for (const s of truth) {
      ghost.sample(s.t, p, q);
      maxErr = Math.max(maxErr, p.distanceTo(s.pos));
    }
    expect(maxErr).toBeLessThan(1e-3); // exact at sample times
    // Between samples the spline stays close to the real (120 Hz) path.
    expect(ghost.duration).toBeCloseTo(race.finishTime, 1);
    expect(ghost.sample(ghost.duration + 5, p, q)).toBe(false);
  });

  it('a stored ghost stays well inside the localStorage budget', () => {
    const json = JSON.stringify(rec.toGhost({ time: race.finishTime, splits: race.splits }));
    expect(json.length).toBeLessThan(80_000); // ~40 s lap
  });
});

describe('Phase 5 — local leaderboard', () => {
  beforeEach(() => setStorageBackend(new MemStorage()));
  const track = STARTER_TRACKS[0];
  const key = trackKey(track);

  it('track keys are stable and change when the layout changes', () => {
    expect(trackKey(track)).toBe(key);
    const edited = { ...track, pieces: [...track.pieces.slice(0, -1), { ...track.pieces.at(-1), x: track.pieces.at(-1).x + 1 }] };
    expect(trackKey(edited)).not.toBe(key);
  });

  it('keeps the top times sorted, reports rank and new bests', () => {
    let r = submitTime(key, 40.5);
    expect(r).toMatchObject({ rank: 1, isBest: true, previousBest: null });
    r = submitTime(key, 42.1);
    expect(r).toMatchObject({ rank: 2, isBest: false, previousBest: 40.5 });
    r = submitTime(key, 38.9);
    expect(r).toMatchObject({ rank: 1, isBest: true, previousBest: 40.5 });
    expect(getRecords(key).map((x) => x.time)).toEqual([38.9, 40.5, 42.1]);
    expect(getBest(key).time).toBe(38.9);
    for (let i = 0; i < 20; i++) submitTime(key, 50 + i);
    expect(getRecords(key).length).toBe(MAX_RECORDS);
    expect(submitTime(key, 99).rank).toBe(null);
  });

  it('saves and loads ghosts; survives a full storage quota', () => {
    const ghost = { v: 1, time: 40, splits: [], rate: 30, samples: 1, data: encodeFloats(new Float32Array(8)) };
    expect(saveGhost(key, ghost)).toBe(true);
    expect(loadGhost(key).time).toBe(40);
    setStorageBackend(new MemStorage(100));
    expect(saveGhost(key, ghost)).toBe(false); // no throw
    expect(loadGhost(key)).toBe(null);
  });
});
