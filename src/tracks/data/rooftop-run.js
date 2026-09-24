/**
 * Rooftop Run — city rooftops at dusk. Boost off the line, climb onto a
 * taller block and leap the street gap, a banked plunge into the drift
 * chicane, the loop-de-loop over the avenue, a second rooftop hop, a long
 * rolling run back west and a final big jump to the finish.
 */
export default {
  id: 'rooftop-run',
  name: 'Rooftop Run',
  theme: 'rooftop',
  author: 'InkTrack',
  script: [
    ['start'],
    ['straight', 2],
    ['boost'],
    ['straight', 3],
    ['wideRight'], // → west
    ['straight', 2],
    ['cp'],
    ['up2'],
    ['straight', 1],
    ['ramp'],
    ['gap', 3, -2], // street gap
    ['straight', 3],
    ['bankRight'], // → south
    ['straight', 1],
    ['left'], // drift chicane
    ['right'],
    ['straight', 1],
    ['right'],
    ['left'],
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    ['wideRight'], // → east
    ['straight', 2],
    ['boost'],
    ['straight', 2],
    ['loopLeft'],
    ['straight', 2],
    ['cp'],
    ['straight', 6],
    ['bankLeft'], // → south
    ['straight', 2],
    ['up', 1],
    ['ramp'],
    ['gap', 2, -1],
    ['straight', 3],
    ['wideLeft'], // → west
    ['straight', 3],
    ['cp'],
    ['up2'],
    ['straight', 2],
    ['down2'],
    ['straight', 3],
    ['boost'],
    ['straight', 8],
    ['bankLeft'], // → north
    ['straight', 3],
    ['cp'],
    ['straight', 2],
    ['left'],
    ['right'],
    ['straight', 2],
    ['up2'],
    ['straight', 1],
    ['ramp'],
    ['gap', 3, -2],
    ['straight', 3],
    ['boost'],
    ['straight', 2],
    ['finish'],
  ],
};
