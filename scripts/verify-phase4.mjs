// Drives Rooftop Run in the browser with the autopilot and screenshots key moments.
import { launch, sleep } from './pw.mjs';
const base = process.argv[2] || 'http://localhost:4173/';
const { browser, page, logs } = await launch();
await page.goto(base + '?autopilot');
await page.waitForFunction(() => window.__INKTRACK__?.mode?.race);
const st = () => page.evaluate(() => {
  const s = window.__INKTRACK__.mode;
  return { state: s.race.state, t: +s.race.time.toFixed(2), cp: s.race.nextCheckpoint, pos: s.car.position.toArray().map((v) => +v.toFixed(0)), kmh: Math.round(s.car.speed * 3.6) };
});
await sleep(300);
await page.screenshot({ path: 'screenshots/phase4-start.png' });
const shots = (process.env.SHOTS || '3.2,6.5,9,13.5,17,21,27,33').split(',').map(Number);
let i = 0;
const t0 = Date.now();
while (true) {
  const s = await st();
  if (i < shots.length && s.t >= shots[i]) {
    await page.screenshot({ path: `screenshots/phase4-t${String(shots[i]).replace('.', '_')}.png` });
    console.log('shot', shots[i], s);
    i++;
  }
  if (s.state === 'finished' || Date.now() - t0 > 240000) { console.log('end', s); break; }
  await sleep(100);
}
await sleep(600);
await page.screenshot({ path: 'screenshots/phase4-finish.png' });
const info = await page.evaluate(() => ({ calls: window.__INKTRACK__.renderer.info.calls, tris: window.__INKTRACK__.renderer.info.triangles, trackTris: window.__INKTRACK__.mode.meshes.userData.triangles, respawns: window.__INKTRACK__.mode.race.respawns, finish: window.__INKTRACK__.mode.race.finishTime }));
console.log(info);
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 20).join('\n'));
await browser.close();
