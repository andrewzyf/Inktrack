/**
 * Ruin Rally — stone causeways through an overgrown jungle temple. Temple
 * stairs up and down, a leap across the ravine, a tight switchback through
 * the courtyard, the Serpent Loop, and a banked sprint around the pyramid.
 */
export default {
  id: 'ruin-rally',
  name: 'Ruin Rally',
  theme: 'ruins',
  author: 'InkTrack',
  script: [
    ['start'],
    ['straight', 1],
    ['boost'],
    ['straight', 2],
    ['bankLeft'], // → east
    ['straight', 2],
    ['up', 2], // temple stairs
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    ['down', 2],
    ['straight', 1],
    ['wideLeft'], // → south, down the ravine side
    ['straight', 2],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -2], // the ravine
    ['straight', 3],
    ['right'], // courtyard switchback
    ['left'],
    ['straight', 1],
    ['left'],
    ['right'],
    ['straight', 1],
    ['cp'],
    ['straight', 2],
    ['boost'],
    ['straight', 2],
    ['loopRight'],
    ['straight', 2],
    ['bankRight'], // → east
    ['straight', 3],
    ['cp'],
    ['up2'],
    ['straight', 2],
    ['ramp'],
    ['gap', 3, -2],
    ['straight', 3],
    ['wideRight'], // → north, along the east wall
    ['straight', 4],
    ['boost'],
    ['straight', 2],
    ['cp'],
    ['straight', 3],
    ['up', 1], // mossy hump
    ['down', 1],
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    // Shortcut: the causeway swings out around a shrine; the old temple
    // aqueduct runs straight past it — boost, then leap into the merge.
    ['shortcut', 'left', {
      main: [['right'], ['straight', 3], ['left'], ['straight', 2], ['left'], ['straight', 3], ['right']],
      alt: [['boost'], ['straight', 1], ['ramp'], ['gap', 1, 0]],
    }],
    ['bankRight'], // → west, north of the temple stairs
    ['straight', 2],
    ['left'],
    ['right'],
    ['straight', 2],
    ['up2'],
    ['ramp'],
    ['gap', 3, -2], // over the courtyard wall
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['cp'],
    ['straight', 2],
    ['wideLeft'],
    ['wideRight'],
    ['straight', 4],
    ['boost'],
    ['straight', 2],
    ['cp'],
    ['bankLeft'], // → the sunken plaza
    ['straight', 2],
    ['down2'],
    ['straight', 2],
    ['right'],
    ['left'],
    ['left'],
    ['right'],
    ['straight', 2],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -1],
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['finish'],
  ],
};
