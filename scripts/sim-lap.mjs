// Headless lap: build a starter track, let the autopilot drive it, report.
// Usage: node scripts/sim-lap.mjs [trackId] [--trace]
import { buildTrack } from '../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../src/tracks/starterTracks.js';
import { Race } from '../src/race/Race.js';
import { Autopilot } from '../src/race/Autopilot.js';
import { FlightAutopilot } from '../src/race/FlightAutopilot.js';
import { PHYSICS } from '../src/config/physics.js';

const id = process.argv[2] || 'rooftop-run';
const trace = process.argv.includes('--trace');
const data = STARTER_TRACKS.find((t) => t.id === id);
const build = buildTrack(data);
console.log(`${data.name}: ${data.pieces.length} pieces, ${build.order.length} in route, route ${build.route.at(-1).dist.toFixed(0)} m, ${build.checkpoints.length} CPs, ${build.world.count} tris, errors: ${build.errors.join('; ') || 'none'}`);
const race = new Race(build);
const ap = build.air ? new FlightAutopilot(build.route) : new Autopilot(build.route);
ap.attach(race.car);
const dt = 1 / PHYSICS.tickRate;
const controls = { throttle: 0, brake: 0, steer: 0, drift: false };
let t = 0;
while (race.state !== 'finished' && t < 180) {
  ap.sample(controls);
  race.step(dt, controls);
  t += dt;
  for (const e of race.drainEvents()) {
    if (['checkpoint', 'fail', 'respawn', 'finish', 'missed'].includes(e.type)) {
      const c = race.car;
      console.log(`${t.toFixed(2)}s ${e.type} ${JSON.stringify({ ...e, type: undefined, splits: undefined })} pos=${c.position.toArray().map((v) => v.toFixed(1))} v=${(c.velocity.length() * 3.6).toFixed(0)}km/h route#${ap.index}`);
      if (e.type === 'respawn') ap.relocate();
    }
  }
  if (trace && Math.round(t * 120) % 60 === 0) {
    const c = race.car;
    console.log(`  t=${t.toFixed(1)} pos=${c.position.toArray().map((v) => v.toFixed(1))} kmh=${(c.speed * 3.6).toFixed(0)} g=${c.grounded} idx=${ap.index}/${build.route.length}`);
  }
}
console.log(`vehicle ${build.vehicle}, ${build.pots.length} ink pots, ${build.shortcutCount} shortcuts`);
console.log(race.state === 'finished' ? `FINISHED in ${race.finishTime.toFixed(3)} s with ${race.respawns} respawns` : `DID NOT FINISH (state ${race.state}, cp ${race.nextCheckpoint}/${build.checkpoints.length})`);
process.exit(race.state === 'finished' ? 0 : 1);
