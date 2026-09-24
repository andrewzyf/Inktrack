/**
 * Frost Peak — a climb up a snowy mountain. Switchback ascents on packed
 * snow, a glassy ice shelf, the Avalanche Jump down the col, the Ice Loop,
 * and a long, icy descent to the lodge.
 *
 * Design note: crests launch the car at speed, so every climb is followed by
 * enough straight to land before the next corner.
 */
export default {
  id: 'frost-peak',
  name: 'Frost Peak',
  theme: 'frost',
  author: 'InkTrack',
  script: [
    ['start'],
    ['straight', 2],
    ['up2'],
    ['straight', 3],
    ['boost'],
    ['straight', 1],
    ['wideRight'], // → west
    ['straight', 1],
    ['up2'],
    ['straight', 3],
    ['cp'],
    ['bankLeft'], // → north
    ['ice'],
    ['straight', 4], // the ice shelf
    ['ice', false],
    ['straight', 1],
    ['up2'],
    ['straight', 3],
    ['right'],
    ['left'],
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    ['ramp'],
    ['gap', 4, -4], // avalanche jump
    ['straight', 4],
    ['down2'],
    ['straight', 3],
    ['bankRight'],
    ['ice'],
    ['straight', 3],
    ['ice', false],
    ['boost'],
    ['straight', 2],
    ['loopLeft'],
    ['straight', 2],
    ['cp'],
    ['straight', 2],
    ['wideLeft'],
    ['ice'],
    ['straight', 2],
    ['ice', false],
    ['down2'],
    ['straight', 3],
    ['bankRight'],
    ['straight', 3],
    ['cp'],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -2],
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['wideLeft'], // the descent
    ['straight', 2],
    ['down2'],
    ['ice'],
    ['straight', 3], // frozen waterfall
    ['ice', false],
    ['cp'],
    ['down2'],
    ['straight', 3],
    ['right'],
    ['left'],
    ['straight', 2],
    ['boost'],
    ['straight', 3],
    ['finish'],
  ],
};
