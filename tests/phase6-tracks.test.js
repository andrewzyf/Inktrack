import { describe, it, expect } from 'vitest';
import { buildTrack } from '../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../src/tracks/starterTracks.js';
import { decoratorFor } from '../src/tracks/decor.js';
import { getTheme, THEMES } from '../src/tracks/themes.js';
import { Race } from '../src/race/Race.js';
import { Autopilot } from '../src/race/Autopilot.js';
import { PHYSICS } from '../src/config/physics.js';

const DT = 1 / PHYSICS.tickRate;

describe('Phase 6 — all three starter tracks', () => {
  it('ships Rooftop Run, Ruin Rally and Frost Peak with distinct themes', () => {
    expect(STARTER_TRACKS.map((t) => t.id)).toEqual(['rooftop-run', 'ruin-rally', 'frost-peak']);
    const themes = STARTER_TRACKS.map((t) => getTheme(t.theme));
    expect(new Set(themes.map((t) => t.id)).size).toBe(3);
    expect(new Set(themes.map((t) => t.roadStyle)).size).toBe(3);
    expect(new Set(themes.map((t) => t.sky.horizon)).size).toBe(3);
    expect(Object.keys(THEMES)).toEqual(expect.arrayContaining(['rooftop', 'ruins', 'frost']));
  });

  for (const track of STARTER_TRACKS) {
    describe(track.name, () => {
      const theme = getTheme(track.theme);
      const build = buildTrack(track, { palette: theme.palette, decorate: decoratorFor(theme.id, track.id) });
      const types = build.order.map((o) => o.rp.type);

      it('has straights, banked curves, a jump, a loop and a full checkpoint sequence', () => {
        expect(build.errors).toEqual([]);
        expect(types[0]).toBe('start');
        expect(types.at(-1)).toBe('finish');
        expect(types).toContain('straight');
        expect(types).toContain('bank');
        expect(types).toContain('ramp');
        expect(types.some((t) => t === 'loop' || t === 'loopRight')).toBe(true);
        expect(build.checkpoints.length).toBeGreaterThanOrEqual(4);
        expect(build.route.at(-1).dist).toBeGreaterThan(1000);
        expect(build.order.length).toBe(track.pieces.length);
      });

      it('stays inside the triangle budget', () => {
        expect(build.geo.triangleCount).toBeLessThan(130_000);
        expect(build.world.count).toBeLessThan(8000);
      });

      it('is completable start to finish (autopilot, no respawns)', () => {
        const race = new Race(build);
        const ap = new Autopilot(build.route);
        ap.attach(race.car);
        const c = { throttle: 0, brake: 0, steer: 0, drift: false };
        for (let t = 0; t < 150 && race.state !== 'finished'; t += DT) {
          race.step(DT, ap.sample(c));
          for (const e of race.drainEvents()) if (e.type === 'respawn') ap.relocate();
        }
        expect(race.state).toBe('finished');
        expect(race.respawns).toBe(0);
        expect(race.finishTime).toBeGreaterThan(28);
        expect(race.finishTime).toBeLessThan(60);
      });
    });
  }

  it('Frost Peak has ice sections', () => {
    const fp = STARTER_TRACKS.find((t) => t.id === 'frost-peak');
    expect(fp.pieces.filter((p) => p.s === 'ice').length).toBeGreaterThanOrEqual(10);
  });
});
