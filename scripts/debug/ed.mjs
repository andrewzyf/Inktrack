import { launch, sleep } from '../pw.mjs';
const { browser, page, logs } = await launch();
await page.goto('http://localhost:4173/?editor&autopilot');
await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'editor', null, { timeout: 15000 }).catch(() => {});
await sleep(500);
console.log(await page.evaluate(() => { const a = window.__INKTRACK__; return { mode: a.modeName, hasMode: !!a.mode, resolved: a.mode?.resolved?.length, pieces: a.mode?.track?.pieces }; }));
console.log(logs.join('\n'));
await browser.close();
