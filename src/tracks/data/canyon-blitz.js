/**
 * Canyon Blitz — a dusty sprint through red-rock canyons. A long plunge off
 * the mesa, two canyon leaps, the Rattlesnake esses, a corkscrew loop and a
 * banked run along the cliff edge. Two shortcuts: a dry-riverbed jump and a
 * mine-rail straight that skips the switchbacks.
 */
export default {
  id: 'canyon-blitz',
  name: 'Canyon Blitz',
  theme: 'canyon',
  author: 'InkTrack',
  script: [
    ['start'],
    ['straight', 2],
    ['boost'],
    ['straight', 2],
    ['down2'], // off the mesa
    ['down2'],
    ['straight', 3],
    ['wideLeft'], // → east
    ['straight', 2],
    ['cp'],
    ['straight', 1],
    ['up', 1],
    ['ramp'],
    ['gap', 4, -2], // first canyon leap
    ['straight', 3],
    ['bankLeft'], // → north
    ['straight', 1],
    // Shortcut 1: the dry riverbed.
    ['shortcut', 'left', {
      main: [['right'], ['straight', 2], ['left'], ['straight', 1], ['left'], ['straight', 2], ['right']],
      alt: [['straight', 1], ['ramp'], ['gap', 1, 0]],
    }],
    ['straight', 2],
    ['cp'],
    ['right'], // Rattlesnake esses
    ['left'],
    ['straight', 1],
    ['right'],
    ['left'],
    ['straight', 2],
    ['boost'],
    ['straight', 2],
    ['loopLeft'], // corkscrew
    ['straight', 3],
    ['bankLeft'], // → west
    ['straight', 2],
    ['cp'],
    ['up2'],
    ['straight', 2],
    ['ramp'],
    ['gap', 4, -3], // big canyon leap
    ['straight', 3],
    ['wideRight'], // → north
    ['straight', 1],
    // Shortcut 2: the old mine rail runs straight past the switchbacks.
    ['shortcut', 'right', {
      main: [['left'], ['straight', 3], ['right'], ['straight', 1], ['right'], ['straight', 3], ['left']],
      alt: [['boost'], ['straight', 2]],
    }],
    ['straight', 1],
    ['cp'],
    ['bankRight'], // → east, the cliff edge
    ['straight', 4],
    ['boost'],
    ['straight', 3],
    ['down2'],
    ['straight', 2],
    ['wideLeft'], // → north
    ['straight', 2],
    ['up', 1],
    ['ramp'],
    ['gap', 3, -1],
    ['straight', 2],
    ['boost'],
    ['straight', 3],
    ['finish'],
  ],
};
