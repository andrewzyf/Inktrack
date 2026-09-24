import { buildTrack } from '../../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../../src/tracks/starterTracks.js';
import { decoratorFor } from '../../src/tracks/decor.js';
import { getTheme } from '../../src/tracks/themes.js';
for (const t of STARTER_TRACKS) {
  const theme = getTheme(t.theme);
  const t0 = performance.now();
  const b = buildTrack(t, { palette: theme.palette, decorate: decoratorFor(theme.id, t.id) });
  const t1 = performance.now();
  const byMat = {};
  for (const { material, builder } of b.geo.entries()) byMat[material] = (byMat[material] || 0) + builder.idx.length / 3;
  console.log(t.id, `${(t1 - t0).toFixed(0)} ms`, 'collision tris', b.world.count, 'render tris', b.geo.triangleCount, 'chunks', b.geo.entries().length, JSON.stringify(byMat));
}
