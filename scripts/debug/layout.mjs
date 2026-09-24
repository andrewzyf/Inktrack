import { buildTrack } from '../../src/tracks/TrackBuilder.js';
import { STARTER_TRACKS } from '../../src/tracks/starterTracks.js';
const data = STARTER_TRACKS.find((t) => t.id === (process.argv[2] || 'rooftop-run'));
const b = buildTrack(data);
b.order.forEach((o, i) => {
  const pts = b.route.filter((p) => p.piece === o.rp.index);
  const a = pts[0], z = pts.at(-1);
  console.log(i, o.rp.type.padEnd(10), 'cell', o.rp.data.x, o.rp.data.z, 'lvl', o.rp.level, 'r', o.rp.r, o.reversed ? 'REV' : '   ', 'route', a && `${pts.indexOf(a) >= 0 ? b.route.indexOf(a) : '-'}..${b.route.indexOf(z)}`, a && a.pos.toArray().map((v) => v.toFixed(0)).join(','), '→', z && z.pos.toArray().map((v) => v.toFixed(0)).join(','));
});
