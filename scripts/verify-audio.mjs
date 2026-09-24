// Checks the Web Audio graph starts on a user gesture and race events trigger sounds.
import { launch, sleep } from './pw.mjs';
const base = process.env.BASE || 'http://localhost:4173/';
const { browser, page, logs } = await launch();
await page.goto(base + '?track=rooftop-run');
await page.waitForFunction(() => window.__INKTRACK__?.mode?.race);
await page.evaluate(() => {
  const a = window.__INKTRACK__.audio;
  window.__played = [];
  const play = a.play.bind(a);
  a.play = (n, v) => { window.__played.push(n); play(n, v); };
});
await page.keyboard.down('KeyW'); // user gesture → unlock, and drive
await page.waitForFunction(() => window.__INKTRACK__.mode.race.state === 'racing', null, { timeout: 60000 });
await sleep(3000);
await page.keyboard.down('KeyD');
await page.keyboard.down('Space');
await sleep(1500);
await page.keyboard.up('Space');
await sleep(800);
const r = await page.evaluate(() => {
  const a = window.__INKTRACK__.audio;
  return { state: a.ctx?.state, sampleRate: a.ctx?.sampleRate, bedOn: a.bedOn, engineHz: Math.round(a.engineA?.frequency.value || 0), engineGain: +(a.engineGain?.gain.value * a.engineBus?.gain.value).toFixed(4), song: a.music?.songId, musicGain: +(a.music?.out.gain.value || 0).toFixed(3), musicStep: a.music?.bar, played: [...new Set(window.__played)] };
});
console.log(JSON.stringify(r));
console.log(logs.filter((l) => /error/i.test(l)).slice(0, 5).join('\n') || 'no errors');
await browser.close();
