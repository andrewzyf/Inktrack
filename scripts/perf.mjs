// Main-thread profile under CPU throttling (a stand-in for a mid-range phone).
// Usage: node scripts/perf.mjs [track] [throttle=4] [seconds=12]
import { launch, sleep } from './pw.mjs';
const [track = 'rooftop-run', throttle = '4', seconds = '12'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4173/';
const { browser, page, logs } = await launch({ mobile: true, width: 390, height: 844 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
await page.goto(`${base}?track=${track}&autopilot${process.env.QUALITY ? '&quality=' + process.env.QUALITY : ''}`);
await page.waitForFunction(() => window.__INKTRACK__?.mode?.race?.state === 'racing', null, { timeout: 90000 });
await sleep(1500); // skip warm-up (shader compiles, texture uploads)
await page.evaluate(() => {
  const app = window.__INKTRACK__;
  const loop = app.loop;
  const stats = (window.__perf = { frames: 0, sim: [], frame: [], render: [], calls: [], tris: [], ticks: 0, simTick: [] });
  const fu = loop.fixedUpdate, fr = loop.frame;
  loop.fixedUpdate = (dt) => { const t = performance.now(); fu(dt); stats.simTick.push(performance.now() - t); stats.ticks++; };
  const r = app.renderer, rr = r.render.bind(r);
  let renderMs = 0;
  r.render = (s, c) => { const t = performance.now(); rr(s, c); renderMs += performance.now() - t; };
  loop.frame = (dt, a) => {
    renderMs = 0;
    const t = performance.now();
    fr(dt, a);
    const total = performance.now() - t;
    stats.frame.push(total - renderMs);
    stats.render.push(renderMs);
    stats.calls.push(r.info.calls);
    stats.tris.push(r.info.triangles);
    stats.frames++;
  };
});
await sleep(+seconds * 1000);
const res = await page.evaluate(() => {
  const s = window.__perf;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] || 0;
  return {
    frames: s.frames,
    simPerTickMs: [avg(s.simTick), p95(s.simTick)].map((v) => +v.toFixed(3)),
    ticksPerFrame: +(s.ticks / Math.max(1, s.frames)).toFixed(2),
    sceneUpdateMs: [avg(s.frame), p95(s.frame)].map((v) => +v.toFixed(2)),
    renderSubmitMs: [avg(s.render), p95(s.render)].map((v) => +v.toFixed(2)),
    drawCalls: [Math.round(avg(s.calls)), Math.max(...s.calls)],
    triangles: [Math.round(avg(s.tris)), Math.max(...s.tris)],
    raceTime: +window.__INKTRACK__.mode.race.time.toFixed(1),
    pixelRatio: window.__INKTRACK__.renderer.pixelRatio,
  };
});
// Budget at 60 fps: sim for 2 ticks + scene + submit must fit well under 16.7 ms.
res.mainThreadPer60fpsFrameMs = +(res.simPerTickMs[0] * 2 + res.sceneUpdateMs[0] + res.renderSubmitMs[0]).toFixed(2);
console.log(JSON.stringify({ track, throttle: +throttle, ...res }, null, 1));
const errs = logs.filter((l) => /error/i.test(l));
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
await browser.close();
