import { launch, sleep } from '../pw.mjs';
const { browser, page } = await launch();
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__INKTRACK__);
await page.keyboard.down('KeyW'); await sleep(2500);
await page.keyboard.down('KeyA'); await page.keyboard.down('Space'); await sleep(1200);
const r = await page.evaluate(() => {
  const s = window.__INKTRACK__.stage.skids;
  const c = window.__INKTRACK__.mode.car;
  return { next: s.next, trails: s.trails.map(t => ({active: t.active, len: t.len.toFixed(1)})), wheels: c.wheels.map(w => [w.contact, w.hit.point.toArray().map(v=>v.toFixed(1)).join(',')]) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
