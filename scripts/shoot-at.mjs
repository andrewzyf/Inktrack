// Screenshot a race at exact race times: node scripts/shoot-at.mjs <query> <name> t1,t2,...
// e.g. node scripts/shoot-at.mjs "?autopilot&track=rooftop-run" loop 17.8,18.2,18.6
import { launch, sleep } from './pw.mjs';
const [query = '?autopilot', name = 'shot', times = '5'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4173/';
const { browser, page, logs } = await launch(process.env.MOBILE ? { mobile: true, width: +process.env.W || 390, height: +process.env.H || 844 } : {});
await page.goto(base + query);
await page.waitForFunction(() => window.__INKTRACK__?.mode?.race);
for (const t of times.split(',').map(Number)) {
  await page.evaluate((t) => { const a = window.__INKTRACK__; a.debugPauseAt = t; a.paused = false; }, t);
  await page.waitForFunction(() => window.__INKTRACK__.paused, null, { timeout: 180000 });
  await sleep(250);
  const file = `screenshots/${name}-${String(t).replace('.', '_')}.png`;
  await page.screenshot({ path: file });
  const s = await page.evaluate(() => { const m = window.__INKTRACK__.mode; return { t: +m.race.time.toFixed(2), pos: m.car.position.toArray().map((v) => +v.toFixed(1)), kmh: Math.round(m.car.speed * 3.6), calls: window.__INKTRACK__.renderer.info.calls, tris: window.__INKTRACK__.renderer.info.triangles }; });
  console.log(file, JSON.stringify(s));
}
const errs = logs.filter((l) => /error/i.test(l));
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
await browser.close();
