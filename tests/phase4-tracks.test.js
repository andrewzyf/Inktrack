import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { buildTrack, resolvePlacement, traverse } from '../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../src/tracks/starterTracks.js';
import { runTurtle } from '../src/tracks/Turtle.js';
import { PIECES } from '../src/tracks/pieces.js';
import { Race } from '../src/race/Race.js';
import { Autopilot } from '../src/race/Autopilot.js';
import { PHYSICS } from '../src/config/physics.js';
import { decoratorFor } from '../src/tracks/decor.js';
import { getTheme } from '../src/tracks/themes.js';

const DT = 1 / PHYSICS.tickRate;

function driveLap(build, maxSeconds = 150) {
  const race = new Race(build);
  const ap = new Autopilot(build.route);
  ap.attach(race.car);
  const controls = { throttle: 0, brake: 0, steer: 0, drift: false };
  const events = [];
  for (let t = 0; t < maxSeconds && race.state !== 'finished'; t += DT) {
    ap.sample(controls);
    race.step(DT, controls);
    for (const e of race.drainEvents()) {
      events.push(e);
      if (e.type === 'respawn') ap.relocate();
    }
  }
  return { race, events };
}

describe('Phase 4 — piece prefabs', () => {
  it('every piece has consistent connectors and builds geometry + collision', () => {
    for (const [type, def] of Object.entries(PIECES)) {
      const build = buildTrack({ pieces: [{ t: type, x: 0, y: 0, z: 0, r: 0 }] });
      expect(build.world.count, type).toBeGreaterThan(0);
      expect(build.geo.triangleCount, type).toBeGreaterThan(0);
      for (const c of def.connectors) {
        const inside = def.cells.some(([x, z]) => x === c.x && z === c.z);
        expect(inside, `${type} connector cell`).toBe(true);
      }
    }
  });

  it('connector ends of each piece line up with its road path ends', () => {
    // Build each piece between two straights; the route must be continuous.
    for (const type of ['turn', 'curve', 'bank', 'slope', 'slopeLong', 'loop', 'loopRight', 'boost']) {
      const pieces = runTurtle([['start'], [type === 'turn' ? 'left' : type === 'curve' ? 'wideLeft' : type === 'bank' ? 'bankRight' : type === 'slope' ? 'up' : type === 'slopeLong' ? 'up2' : type === 'loop' ? 'loopLeft' : type === 'loopRight' ? 'loopRight' : 'boost'], ['straight'], ['finish']]);
      const build = buildTrack({ pieces });
      expect(build.errors, type).toEqual([]);
      let maxGap = 0;
      for (let i = 1; i < build.route.length; i++) maxGap = Math.max(maxGap, build.route[i].pos.distanceTo(build.route[i - 1].pos));
      expect(maxGap, `${type} route continuity`).toBeLessThan(2.1);
    }
  });

  it('rotation maps the local +Z entry correctly for all four headings', () => {
    for (let r = 0; r < 4; r++) {
      const rp = resolvePlacement({ t: 'straight', x: 3, y: 1, z: -2, r });
      const dirs = rp.connectors.map((c) => c.dir).sort();
      expect(dirs).toEqual([r % 4, (r + 2) % 4].sort());
    }
  });

  it('jump ramps are bridged by the route to their landing piece', () => {
    const pieces = runTurtle([['start'], ['straight', 2], ['ramp'], ['gap', 3, -1], ['straight', 2], ['finish']], { level: 2 });
    const build = buildTrack({ pieces });
    expect(build.errors).toEqual([]);
    expect(build.order.map((o) => o.rp.type)).toEqual(['start', 'straight', 'straight', 'ramp', 'straight', 'straight', 'finish']);
    expect(build.route.some((p) => p.gap)).toBe(true);
  });

  it('turtle refuses overlapping layouts', () => {
    expect(() => runTurtle([['start'], ['left'], ['left'], ['left'], ['left'], ['straight']])).toThrow(/overlaps/);
  });
});

describe('Phase 4 — checkpoints, timer, respawn', () => {
  const rooftop = STARTER_TRACKS.find((t) => t.id === 'rooftop-run');
  const theme = getTheme(rooftop.theme);
  const build = buildTrack(rooftop, { palette: theme.palette, decorate: decoratorFor(theme.id, rooftop.id) });

  it('Rooftop Run builds with a start, ≥4 checkpoints, finish, and all required elements', () => {
    expect(build.errors).toEqual([]);
    expect(build.checkpoints.length).toBeGreaterThanOrEqual(4);
    const types = new Set(build.order.map((o) => o.rp.type));
    for (const t of ['straight', 'bank', 'ramp', 'checkpoint', 'finish']) expect(types.has(t), t).toBe(true);
    expect(types.has('loop') || types.has('loopRight')).toBe(true);
    expect(build.order.at(-1).rp.type).toBe('finish');
    expect(build.order.length).toBe(rooftop.pieces.filter((p) => p.sc == null).length); // every piece except shortcut lanes is on the driving line
  });

  it('a full timed lap is completable (autopilot, no respawns)', () => {
    const { race, events } = driveLap(build);
    expect(race.state).toBe('finished');
    expect(race.respawns).toBe(0);
    const cps = events.filter((e) => e.type === 'checkpoint').map((e) => e.index);
    expect(cps).toEqual([...Array(build.checkpoints.length).keys()]);
    expect(race.finishTime).toBeGreaterThan(25);
    expect(race.finishTime).toBeLessThan(60);
    // Splits strictly increase and the finish comes after the last split.
    for (let i = 1; i < race.splits.length; i++) expect(race.splits[i]).toBeGreaterThan(race.splits[i - 1]);
    expect(race.finishTime).toBeGreaterThan(race.splits.at(-1));
  });

  it('the car is frozen during the countdown and the clock starts at GO', () => {
    const race = new Race(build);
    const start = race.car.position.clone();
    for (let i = 0; i < 170; i++) race.step(DT, { throttle: 1, brake: 0, steer: 0, drift: false });
    expect(race.state).toBe('countdown');
    expect(race.time).toBe(0);
    expect(race.car.position.distanceTo(start)).toBeLessThan(0.2);
    const ev = race.drainEvents().map((e) => e.type);
    expect(ev.filter((t) => t === 'countdown').length).toBe(3);
  });

  it('falling off respawns at the last checkpoint with the clock still running', () => {
    const race = new Race(build);
    while (race.state === 'countdown') race.step(DT, {});
    // Teleport past checkpoint 1 then drop the car off the side of the world.
    const cp = build.checkpoints[0];
    race.prevPos.copy(cp.center).addScaledVector(cp.forward, -1).setY(cp.center.y + 1);
    race.car.position.copy(cp.center).addScaledVector(cp.forward, 1).setY(cp.center.y + 1);
    race._checkGates();
    expect(race.nextCheckpoint).toBe(1);
    race.car.reset(new Vector3(500, 5, 500), race.car.quaternion);
    let respawned = false;
    for (let i = 0; i < 1200 && !respawned; i++) {
      race.step(DT, {});
      respawned = race.drainEvents().some((e) => e.type === 'respawn');
    }
    expect(respawned).toBe(true);
    expect(race.car.position.distanceTo(cp.spawn.pos)).toBeLessThan(1);
    expect(race.time).toBeGreaterThan(1);
  });

  it('skipping a checkpoint counts as missed and respawns', () => {
    const race = new Race(build);
    while (race.state === 'countdown') race.step(DT, {});
    const cp2 = build.checkpoints[1];
    race.prevPos.copy(cp2.center).addScaledVector(cp2.forward, -1).setY(cp2.center.y + 1);
    race.car.position.copy(cp2.center).addScaledVector(cp2.forward, 1).setY(cp2.center.y + 1);
    race._checkGates();
    const ev = race.drainEvents().map((e) => e.type);
    expect(ev).toContain('missed');
    expect(race.nextCheckpoint).toBe(0);
    expect(race.respawnTimer).toBeGreaterThan(0);
  });

  it('crossing the finish early does not finish the race', () => {
    const race = new Race(build);
    while (race.state === 'countdown') race.step(DT, {});
    const f = build.finish;
    race.prevPos.copy(f.center).addScaledVector(f.forward, -1).setY(f.center.y + 1);
    race.car.position.copy(f.center).addScaledVector(f.forward, 1).setY(f.center.y + 1);
    race._checkGates();
    expect(race.state).toBe('racing');
    expect(race.drainEvents().map((e) => e.type)).toContain('missed');
  });

  it('traversal reaches every placed piece of every starter track', () => {
    for (const t of STARTER_TRACKS) {
      const order = traverse(t.pieces.map((p, i) => resolvePlacement(p, i)));
      expect(order.length, t.id).toBe(t.pieces.filter((p) => p.sc == null).length);
    }
  });
});
