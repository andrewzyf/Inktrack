import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { runTurtle } from '../src/tracks/Turtle.js';
import { buildTrack, traverse, resolvePlacement } from '../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../src/tracks/starterTracks.js';
import { Race } from '../src/race/Race.js';
import { FlightPhysics } from '../src/physics/FlightPhysics.js';
import { FLIGHT, physicsFor, flightFor, vehicleForTheme } from '../src/vehicles/profiles.js';
import { PHYSICS } from '../src/config/physics.js';
import { setStorageBackend } from '../src/storage/storage.js';
import { collectPot, discoverShortcut, awardMedal, medalFor, inkEarned, inkWallet, resetProgressForTests, completeDaily, trackProgress, MEDALS } from '../src/storage/progress.js';
import { equip, getLook, isOwned, resetGarageForTests, resolveLook } from '../src/vehicles/garage.js';
import { getDaily, dailyMet } from '../src/race/daily.js';

const DT = 1 / PHYSICS.tickRate;
const NONE = { throttle: 0, brake: 0, steer: 0, drift: false };

class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i]; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const SHORTCUT_SCRIPT = [
  ['start'], ['straight', 2],
  ['shortcut', 'left', { main: [['right'], ['straight', 1], ['left'], ['straight', 2], ['left'], ['straight', 1], ['right']], alt: [['straight', 4]] }],
  ['straight', 2], ['cp'], ['straight', 1], ['cp'], ['straight', 1], ['cp'], ['straight', 1], ['cp'], ['finish'],
];

describe('Shortcuts (fork / merge)', () => {
  const pieces = runTurtle(SHORTCUT_SCRIPT);
  const build = buildTrack({ pieces });

  it('places a fork, a lane of shortcut pieces and a merge', () => {
    const types = pieces.map((p) => p.t);
    expect(types.filter((t) => t === 'fork' || t === 'forkRight').length).toBe(2);
    expect(pieces.filter((p) => p.sc === 0).length).toBe(4);
    expect(build.errors).toEqual([]);
    expect(build.shortcutCount).toBe(1);
  });

  it('keeps the racing line on the main lane and drives the merge backwards', () => {
    const order = traverse(pieces.map((p, i) => resolvePlacement(p, i)));
    expect(order.some((o) => o.rp.data.sc != null)).toBe(false);
    const merge = order.filter((o) => o.rp.type.startsWith('fork'))[1];
    expect(merge.reversed).toBe(true);
  });

  it('rejects lanes that do not meet', () => {
    expect(() => runTurtle([['start'], ['shortcut', 'left', { main: [['straight', 3]], alt: [['straight', 1]] }]])).toThrow(/don't meet/);
  });

  it('fires a shortcut event once when the car drives the side lane', () => {
    const race = new Race(build);
    const lane = pieces.find((p) => p.sc === 0);
    const rp = resolvePlacement(lane);
    for (let i = 0; i < 200; i++) race.step(DT, NONE); // through the countdown
    race.car.reset(rp.offset.clone().add(new Vector3(0, 0.6, 0)), new Quaternion());
    race.step(DT, NONE);
    race.step(DT, NONE);
    const events = race.drainEvents().filter((e) => e.type === 'shortcut');
    expect(events).toEqual([{ type: 'shortcut', id: 0 }]);
  });

  it('every land and sea starter track hides at least one shortcut', () => {
    for (const t of STARTER_TRACKS) {
      const b = buildTrack(t, { infoOnly: true });
      if (b.vehicle !== 'plane') expect(b.shortcutCount, t.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Ink pots', () => {
  it('are collected by driving through them, once each', () => {
    const build = buildTrack(STARTER_TRACKS[0]);
    const race = new Race(build);
    for (let i = 0; i < 200; i++) race.step(DT, NONE);
    const pot = build.pots[0];
    race.car.reset(pot.pos.clone(), new Quaternion());
    race.step(DT, NONE);
    race.step(DT, NONE);
    const got = race.drainEvents().filter((e) => e.type === 'pot');
    expect(got.length).toBe(1);
    expect(got[0].id).toBe(pot.id);
    expect(race.potsTaken.size).toBe(1);
  });

  it('include one on every shortcut lane', () => {
    const b = buildTrack(STARTER_TRACKS.find((t) => t.id === 'canyon-blitz'), { infoOnly: true });
    expect(b.pots.filter((p) => p.shortcut != null).length).toBe(b.shortcutCount);
  });
});

describe('Vehicle modes', () => {
  it('picks the vehicle from the theme', () => {
    expect(vehicleForTheme('rooftop')).toBe('car');
    expect(vehicleForTheme('ocean')).toBe('boat');
    expect(vehicleForTheme('sky')).toBe('plane');
  });

  it('boats slide more than cars; mutators layer on top', () => {
    const car = physicsFor('car');
    const boat = physicsFor('boat');
    expect(boat.grip.lateral).toBeLessThan(car.grip.lateral);
    expect(physicsFor('car', ['lowGravity']).gravity).toBeLessThan(car.gravity);
    expect(physicsFor('boat', ['turbo']).engine.maxSpeed).toBeGreaterThan(boat.engine.maxSpeed);
    expect(PHYSICS.grip.lateral).toBe(car.grip.lateral); // base table untouched
  });

  it('a plane climbs, dives faster and turns', () => {
    const f = new FlightPhysics([], FLIGHT);
    f.reset(new Vector3(0, 50, 0), new Quaternion());
    for (let i = 0; i < 240; i++) f.step(DT, { throttle: 1, brake: 0, steer: 0 });
    expect(f.position.y).toBeGreaterThan(60);
    const climbSpeed = f.speed;
    f.reset(new Vector3(0, 200, 0), new Quaternion());
    for (let i = 0; i < 360; i++) f.step(DT, { throttle: 0, brake: 1, steer: 0 });
    expect(f.speed).toBeGreaterThan(climbSpeed);
    f.reset(new Vector3(0, 50, 0), new Quaternion());
    for (let i = 0; i < 120; i++) f.step(DT, { throttle: 0, brake: 0, steer: 1 });
    expect(f.position.x).toBeLessThan(-5); // steer right = toward −X (driver's right)
  });

  it('a plane that hits an obstacle crashes and the race respawns it', () => {
    const build = buildTrack(STARTER_TRACKS.find((t) => t.id === 'cloud-circuit'));
    const race = new Race(build);
    expect(race.car).toBeInstanceOf(FlightPhysics);
    for (let i = 0; i < 200; i++) race.step(DT, NONE);
    expect(race.state).toBe('racing');
    const ahead = race.car.position.clone().add(new Vector3(0, 0, 8));
    build.obstacles.push({ pos: ahead, radius: 3 });
    let failed = null;
    for (let i = 0; i < 240 && !failed; i++) {
      race.step(DT, NONE);
      failed = race.drainEvents().find((e) => e.type === 'fail');
    }
    build.obstacles.pop();
    expect(failed?.reason).toBe('crash');
  });

  it('holds the plane still during the countdown', () => {
    const build = buildTrack(STARTER_TRACKS.find((t) => t.id === 'cloud-circuit'));
    const race = new Race(build);
    const start = race.car.position.clone();
    for (let i = 0; i < 100; i++) race.step(DT, { throttle: 1, brake: 0, steer: 1 });
    expect(race.state).toBe('countdown');
    expect(race.car.position.distanceTo(start)).toBeLessThan(1e-6);
    expect(flightFor(['turbo']).cruise).toBeGreaterThan(FLIGHT.cruise);
  });
});

describe('Progress, ink and the garage', () => {
  beforeEach(() => {
    setStorageBackend(new MemStorage());
    resetProgressForTests();
    resetGarageForTests();
  });

  it('pots, shortcuts and medals add up to ink', () => {
    expect(inkEarned()).toBe(0);
    expect(collectPot('t', 1)).toBe(true);
    expect(collectPot('t', 1)).toBe(false); // once only
    expect(discoverShortcut('t', 0)).toBe(true);
    expect(inkEarned()).toBe(5 + 10);
    expect(medalFor(40, 40)).toBe(2); // gold: within 4 % of par
    expect(medalFor(38.7, 40)).toBe(3); // ink medal: beat par by 3 %
    expect(medalFor(60, 40)).toBe(-1);
    awardMedal('t', 2);
    expect(inkEarned()).toBe(15 + MEDALS[0].ink + MEDALS[1].ink + MEDALS[2].ink);
    awardMedal('t', 1); // a worse medal never downgrades
    expect(trackProgress('t').medal).toBe(2);
    expect(completeDaily('2026-01-01')).toBe(true);
    expect(completeDaily('2026-01-01')).toBe(false);
  });

  it('buying items spends ink; free items are always owned', () => {
    expect(isOwned('car', 'paint', 'red')).toBe(true);
    expect(isOwned('car', 'body', 'buggy')).toBe(false);
    expect(equip('car', 'body', 'buggy', 10)).toBe(false); // costs 50
    for (let i = 0; i < 12; i++) collectPot('t', i); // 60 ink
    expect(equip('car', 'body', 'buggy', inkWallet())).toBe(true);
    expect(inkWallet()).toBe(10);
    expect(getLook('car').body).toBe('buggy');
    expect(equip('car', 'body', 'racer', 0)).toBe(true); // owned items switch freely
    expect(equip('car', 'body', 'buggy', 0)).toBe(true);
    expect(resolveLook(getLook('boat')).kind).toBe('boat');
  });

  it('the daily challenge is the same all day and checks its goal', () => {
    const tracks = STARTER_TRACKS.map((t) => ({ ...t, ref: t.id }));
    const a = getDaily(tracks, new Date(2026, 3, 5, 8));
    const b = getDaily(tracks, new Date(2026, 3, 5, 22));
    expect(a).toEqual(b);
    expect(a.mutators.length).toBe(1);
    expect(dailyMet({ type: 'pots', n: 5 }, { pots: 6 })).toBe(true);
    expect(dailyMet({ type: 'rival' }, { rivalBeaten: false })).toBe(false);
    expect(dailyMet({ type: 'clean' }, { respawns: 0 })).toBe(true);
  });
});
