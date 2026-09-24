import { buildTrack } from '../../src/tracks/TrackBuilder.js';
import { decoratorFor } from '../../src/tracks/decor.js';
import { runTurtle } from '../../src/tracks/Turtle.js';
import { STARTER_TRACKS } from '../../src/tracks/starterTracks.js';
for (const [name, pieces] of [['custom', runTurtle([['start'], ['straight', 8], ['wideLeft'], ['straight', 6], ['finish']])], ['rooftop', STARTER_TRACKS[0].pieces]]) {
  const b = buildTrack({ pieces }, { decorate: decoratorFor('rooftop', '123') });
  const signs = b.geo.entries().filter((e) => e.material === 'signs');
  const us = new Set();
  for (const { builder } of signs) for (let i = 0; i < builder.uv.length; i += 8) us.add(`${Math.floor(builder.uv[i] * 4)},${Math.floor(builder.uv[i + 1] * 2)}`);
  console.log(name, [...us].join(' '));
}
