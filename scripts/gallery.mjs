// Captures the README gallery into docs/images (JPEG, small).
import { launch, sleep } from './pw.mjs';
const base = process.env.BASE || 'http://localhost:4173/';
const shot = (page, name) => page.screenshot({ path: `docs/images/${name}.jpg`, type: 'jpeg', quality: 78 });

async function raceShot(query, t, name, opts = {}) {
  const { browser, page } = await launch(opts);
  await page.goto(base + query);
  await page.waitForFunction(() => window.__INKTRACK__?.mode?.race);
  await page.evaluate((t) => { window.__INKTRACK__.debugPauseAt = t; }, t);
  await page.waitForFunction(() => window.__INKTRACK__.paused, null, { timeout: 200000 });
  await sleep(300);
  await shot(page, name);
  await browser.close();
}

{
  const { browser, page } = await launch();
  await page.goto(base);
  await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'title');
  await sleep(1200);
  await shot(page, 'title');
  await browser.close();
}
await raceShot('?autopilot&track=rooftop-run', 6.4, 'rooftop-run');
await raceShot('?autopilot&track=rooftop-run', 15.7, 'loop');
await raceShot('?autopilot&track=ruin-rally', 11, 'ruin-rally');
await raceShot('?autopilot&track=frost-peak', 7.4, 'frost-peak');
await raceShot('?autopilot&track=rooftop-run&touch=1', 5.2, 'mobile', { mobile: true, width: 390, height: 844 });
{
  const { browser, page } = await launch();
  await page.goto(base + '?editor');
  await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'editor');
  await page.evaluate(async () => {
    const app = window.__INKTRACK__;
    const { STARTER } = { STARTER: null };
    void STARTER;
    app.mode.ui.openLoad();
    document.querySelector('[data-dlg="template"][data-id="ruin-rally"]').click();
    const ed = app.mode;
    ed.target.set(160, 0, -60);
    ed.distance = 210;
    ed.selectPiece('loop');
  });
  await sleep(600);
  await page.mouse.move(640, 380);
  await sleep(300);
  await shot(page, 'editor');
  await browser.close();
}
console.log('gallery done');
