// Phase 5: lap 1 records a time + ghost; lap 2 (slower driver) races the ghost.
import { launch, sleep } from './pw.mjs';
const base = process.env.BASE || 'http://localhost:4173/';
const { browser, page, logs } = await launch();
const app = (fn, arg) => page.evaluate(fn, arg);

await page.goto(base);
await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'title');
await sleep(800);
await page.screenshot({ path: 'screenshots/phase5-title.png' });
await page.click('[data-action="play"]');
await sleep(400);
await page.screenshot({ path: 'screenshots/phase5-tracks.png' });

// Lap 1: autopilot at full pace, recorded as a real run.
await page.goto(base + '?track=rooftop-run&autopilot=1&record');
await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'results', null, { timeout: 400000 });
const r1 = await app(() => ({ ...window.__INKTRACK__.lastResult, records: undefined, entry: undefined }));
console.log('lap 1 result', JSON.stringify(r1));
await page.screenshot({ path: 'screenshots/phase5-results1.png' });

// Lap 2: a slower driver; the ghost should lead.
await app(() => window.__INKTRACK__.startRace('rooftop-run', { autopilot: true, aggression: 0.8 }));
console.log('ghost loaded:', await app(() => !!window.__INKTRACK__.mode.ghost), 'best shown:', await app(() => document.querySelector('[data-best]').textContent));
await app(() => { window.__INKTRACK__.debugPauseAt = 6.2; });
await page.waitForFunction(() => window.__INKTRACK__.paused, null, { timeout: 200000 });
await sleep(300);
await page.screenshot({ path: 'screenshots/phase5-ghost.png' });
console.log('at 6.2s:', await app(() => {
  const m = window.__INKTRACK__.mode;
  return { delta: document.querySelector('[data-delta]').textContent, ghostVisible: m.ghostModel.visible, ghostAheadBy: +m.ghostPos.distanceTo(m.car.position).toFixed(1) };
}));
await app(() => { const a = window.__INKTRACK__; a.paused = false; a.loop.last = performance.now(); });
await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'results', null, { timeout: 400000 });
const r2 = await app(() => ({ ...window.__INKTRACK__.lastResult, records: window.__INKTRACK__.lastResult.records.map((r) => r.time), entry: undefined }));
console.log('lap 2 result', JSON.stringify(r2));
await page.screenshot({ path: 'screenshots/phase5-results2.png' });
await app(() => window.__INKTRACK__.menus.open('records', { track: 'rooftop-run' }));
await sleep(300);
await page.screenshot({ path: 'screenshots/phase5-records.png' });
console.log('storage:', await app(() => Object.keys(localStorage).map((k) => `${k} (${localStorage.getItem(k).length} chars)`)));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
