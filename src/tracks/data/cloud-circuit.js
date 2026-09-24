/**
 * Cloud Circuit — fly a stunt plane through the Cloud Kingdom. Thread the
 * ring gates between floating islands: a climb past the windmills, a
 * screaming dive under the castle, boost hoops, and a slalom through the
 * balloon field. There's no road — cut corners wherever you dare.
 */
export default {
  id: 'cloud-circuit',
  name: 'Cloud Circuit',
  theme: 'sky',
  author: 'InkTrack',
  origin: { x: 0, z: 0, level: 16, dir: 0 },
  script: [
    ['start'],
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['up2'], // the windmill climb
    ['up2'],
    ['straight', 3],
    ['wideRight'],
    ['straight', 4],
    ['cp'],
    ['down2'], // dive under the castle
    ['down2'],
    ['down2'],
    ['straight', 3],
    ['bankLeft'],
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['wideLeft'],
    ['straight', 4],
    ['cp'],
    ['up2'],
    ['up2'],
    ['straight', 2],
    ['wideRight'], // balloon slalom
    ['wideLeft'],
    ['wideRight'],
    ['straight', 3],
    ['boost'],
    ['straight', 3],
    ['cp'],
    ['bankRight'],
    ['straight', 4],
    ['down2'],
    ['down2'],
    ['straight', 3],
    ['wideRight'],
    ['straight', 4],
    ['cp'],
    ['straight', 1],
    ['up2'],
    ['straight', 3],
    ['boost'],
    ['straight', 4],
    ['finish'],
  ],
};
