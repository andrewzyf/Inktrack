// ASCII top-down map of a starter track (letters = piece order, digits = level).
import { buildTrack, resolvePlacement } from '../../src/tracks/TrackBuilder.js';
import { runTurtle } from '../../src/tracks/Turtle.js';
const src = (await import(`../../src/tracks/data/${process.argv[2] || 'rooftop-run'}.js`)).default;
const data = { ...src, pieces: runTurtle(src.script, src.origin, { partial: true }) };
if (data.pieces.error) console.log('ERROR:', data.pieces.error);
const rs = data.pieces.map((p, i) => resolvePlacement(p, i));
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const r of rs) for (const [x, z] of r.cells) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
const sym = { start: 'S', finish: 'F', checkpoint: 'C', boost: 'B', ramp: 'R', loop: 'O', loopRight: 'O', turn: 't', curve: 'c', bank: 'b', slope: '/', slopeLong: '/', straight: '.' };
const grid = {};
rs.forEach((r) => r.cells.forEach(([x, z]) => { grid[`${x},${z}`] = (grid[`${x},${z}`] ? '#' : '') + (sym[r.type] || '?'); }));
for (let z = maxZ; z >= minZ; z--) {
  let row = String(z).padStart(4) + ' ';
  for (let x = maxX; x >= minX; x--) { const v = grid[`${x},${z}`]; row += v ? (v.length > 1 ? '#' : v) : ' '; }
  console.log(row);
}
console.log('     x: ' + maxX + ' (left/east) … ' + minX + ' (right/west)   north is up');
const b = buildTrack(data);
console.log(`route ${b.route.at(-1)?.dist.toFixed(0)} m, pieces ${data.pieces.length}, CPs ${b.checkpoints.length}`);
