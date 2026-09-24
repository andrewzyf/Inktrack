/**
 * Tidal Run — speedboats through a tropical bay. Start high on the harbour
 * flume, shoot two waterfalls down to the open lanes, skim the reef on wide
 * banked sweeps, jump the wave ramps and slalom the buoys home. A lagoon
 * shortcut hides behind the lighthouse.
 */
export default {
  id: 'tidal-run',
  name: 'Tidal Run',
  theme: 'ocean',
  author: 'InkTrack',
  origin: { x: 0, z: 0, level: 6, dir: 0 },
  script: [
    ['start'],
    ['straight', 2],
    ['boost'],
    ['straight', 2],
    ['down2'], // first waterfall
    ['straight', 2],
    ['wideRight'], // → west
    ['straight', 2],
    ['down2'], // second waterfall
    ['down', 2],
    ['straight', 3],
    ['cp'],
    ['straight', 2],
    ['bankLeft'], // → south, into the bay
    ['straight', 5],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -1], // wave jump
    ['boost'],
    ['straight', 3],
    ['wideLeft'], // → east
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    // Shortcut: the lagoon behind the lighthouse.
    ['shortcut', 'right', {
      main: [['left'], ['straight', 3], ['right'], ['straight', 1], ['right'], ['straight', 3], ['left']],
      alt: [['straight', 1], ['ramp'], ['gap', 1, 0]],
    }],
    ['straight', 2],
    ['bankLeft'], // → north
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['cp'],
    ['wideRight'], // buoy slalom
    ['wideLeft'],
    ['wideRight'], // → east, out past the reef
    ['straight', 2],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -1], // wave jump
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['cp'],
    ['bankLeft'], // → north
    ['straight', 3],
    ['wideLeft'], // buoy slalom
    ['wideRight'],
    ['straight', 3],
    ['boost'],
    ['straight', 2],
    ['finish'],
  ],
};
