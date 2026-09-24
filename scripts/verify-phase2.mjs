import { launch, sleep } from './pw.mjs';
const url = process.argv[2] || 'http://localhost:4173/';
const { browser, page, logs } = await launch();
await page.goto(url);
await page.waitForFunction(() => window.__INKTRACK__);
const state = () => page.evaluate(() => {
  const c = window.__INKTRACK__.car;
  return { pos: c.position.toArray().map((v) => +v.toFixed(1)), kmh: Math.round(c.speed * 3.6), drifting: c.drifting, meter: +c.driftMeter.toFixed(2), boost: +c.boostTime.toFixed(2), grounded: c.grounded };
});
// Straight run over the boost pad and the kicker.
await page.keyboard.down('KeyW');
await sleep(1900);
console.log('ramp approach', await state());
await sleep(500);
console.log('airborne?', await state());
await page.screenshot({ path: 'screenshots/phase2-jump.png' });
await sleep(1500);
// Drift: hold space + D.
await page.keyboard.down('KeyD');
await page.keyboard.down('Space');
await sleep(1200);
console.log('drifting', await state());
await page.screenshot({ path: 'screenshots/phase2-drift.png' });
await page.keyboard.up('Space');
await page.keyboard.up('KeyD');
await sleep(100);
console.log('released', await state());
await sleep(600);
console.log('boosting', await state());
await page.keyboard.up('KeyW');
console.log(logs.filter((l) => l.includes('event')).join('\n'));
console.log(logs.filter((l) => !l.includes('event')).join('\n'));
await browser.close();
