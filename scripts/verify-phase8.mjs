// Phase 8: phone emulation — responsive layout, multi-touch driving, editor gestures.
import { launch, sleep } from './pw.mjs';
const base = process.env.BASE || 'http://localhost:4173/';

async function phone(width, height, tag) {
  const { browser, page, logs } = await launch({ mobile: true, width, height });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const center = (sel) => ev((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const car = () => ev(() => { const m = window.__INKTRACK__.mode; const f = m.car.getForward(new m.car.position.constructor()); return { kmh: Math.round(m.car.speed * 3.6), heading: +Math.atan2(f.x, f.z).toFixed(3), drifting: m.car.drifting, state: m.race.state }; });

  await page.goto(base);
  await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'title');
  await sleep(600);
  await page.screenshot({ path: `screenshots/phase8-${tag}-title.png` });
  const info = await ev(() => ({ touchUi: document.getElementById('ui').classList.contains('touch-ui'), dpr: window.__INKTRACK__.renderer.pixelRatio, quality: window.__INKTRACK__.renderer.quality, canvas: [window.__INKTRACK__.renderer.gl.domElement.width, window.__INKTRACK__.renderer.gl.domElement.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }));
  console.log(tag, 'layout', JSON.stringify(info));

  // Menus by tapping.
  await page.tap('[data-action="play"]');
  await sleep(300);
  await page.screenshot({ path: `screenshots/phase8-${tag}-tracks.png` });
  await page.tap('[data-action="race"][data-track="rooftop-run"]');
  await page.waitForFunction(() => window.__INKTRACK__?.mode?.race?.state === 'racing', null, { timeout: 60000 });
  const gas = await center('.tc-gas'), right = await center('.tc-zone.right'), left = await center('.tc-zone.left'), drift = await center('.tc-drift');

  // Latency: the control is live the instant the finger lands (no frame delay).
  await touch('touchStart', [[...gas, 1]]);
  const immediate = await ev(() => window.__INKTRACK__.touch.sample({ throttle: 0 }).throttle);
  console.log(tag, 'gas registered synchronously on touchstart:', immediate === 1);
  await sleep(2200);
  const s1 = await car();
  await touch('touchMove', [[...gas, 1], [...right, 2]]);
  await touch('touchStart', [[...gas, 1], [...right, 2]]);
  await sleep(500);
  const s2 = await car();
  await page.screenshot({ path: `screenshots/phase8-${tag}-drive.png` });
  // Slide the steering thumb from ▶ to ◀ without lifting.
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[...gas, 1], [right[0] + ((left[0] - right[0]) * i) / 6, right[1], 2]]);
  const steerNow = await ev(() => window.__INKTRACK__.touch.sample({ steer: 0 }).steer);
  await sleep(400);
  const s3 = await car();
  await touch('touchStart', [[...gas, 1], [left[0], left[1], 2], [...drift, 3]]);
  await sleep(700);
  const s4 = await car();
  await page.screenshot({ path: `screenshots/phase8-${tag}-drift.png` });
  await touch('touchEnd', []);
  console.log(tag, 'drive', JSON.stringify({ afterGas: s1, steerRight: s2, slideToLeftSteer: steerNow, afterLeft: s3, drifting: s4 }));

  // Pause button.
  await page.tap('.tc-small[data-c="pause"]');
  await sleep(300);
  console.log(tag, 'paused via touch:', await ev(() => window.__INKTRACK__.paused && window.__INKTRACK__.menus.current));
  await page.screenshot({ path: `screenshots/phase8-${tag}-pause.png` });

  if (tag === 'portrait') {
    // Tilt steering: switch it on through the real Settings UI, then feed gyro events.
    await page.tap('[data-action="settings"]');
    await page.selectOption('select[data-setting="steering"]', 'tilt');
    await sleep(100);
    await page.tap('[data-action="back"]');
    await page.tap('[data-action="resume"]');
    await sleep(100);
    const tilt = await ev(() => {
      const fire = (gamma) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 30, gamma }));
      fire(2); // neutral pose is captured from the first reading
      fire(14);
      const right = window.__INKTRACK__.touch.sample({ steer: 0 }).steer;
      fire(-10);
      const left = window.__INKTRACK__.touch.sample({ steer: 0 }).steer;
      return { right: +right.toFixed(2), left: +left.toFixed(2), padHidden: document.querySelector('.tc-steer').classList.contains('hidden') };
    });
    console.log(tag, 'tilt steering', JSON.stringify(tilt));
    // Rotate the phone mid-race.
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(500);
    console.log(tag, 'rotated →', JSON.stringify(await ev(() => ({ canvas: [window.__INKTRACK__.renderer.gl.domElement.width, window.__INKTRACK__.renderer.gl.domElement.height], aspect: +window.__INKTRACK__.renderer.camera.aspect.toFixed(2), landscape: matchMedia('(orientation: landscape)').matches }))));
    await page.screenshot({ path: `screenshots/phase8-rotated.png` });
    await page.setViewportSize({ width, height });
    await sleep(300);
    await ev(() => window.__INKTRACK__.pause());
  }

  // Editor on the phone: tap a piece, tap the canvas next to the start, pinch, pan.
  await ev(() => window.__INKTRACK__.openEditor({ name: 'Phone', theme: 'frost', pieces: [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }] }));
  await sleep(500);
  await page.tap('.piece[data-piece="straight"]');
  const cell = await ev(() => { const a = window.__INKTRACK__, ed = a.mode, cam = a.renderer.camera; ed.target.set(0, 0, 10); ed._updateCamera(); const v = new (cam.position.constructor)(0, 0, 10).project(cam); return [((v.x + 1) / 2) * a.renderer.width, ((1 - v.y) / 2) * a.renderer.height]; });
  await touch('touchStart', [[...cell, 1]]);
  await sleep(50);
  await touch('touchEnd', []);
  await sleep(200);
  const placed = await ev(() => window.__INKTRACK__.mode.track.pieces.length);
  const d0 = await ev(() => window.__INKTRACK__.mode.distance);
  const cx = width / 2, cy = height / 2;
  await touch('touchStart', [[cx - 40, cy, 1], [cx + 40, cy, 2]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 40 - i * 15, cy, 1], [cx + 40 + i * 15, cy, 2]]);
  await touch('touchEnd', []);
  const d1 = await ev(() => window.__INKTRACK__.mode.distance);
  const t0 = await ev(() => window.__INKTRACK__.mode.target.toArray());
  await touch('touchStart', [[cx, cy, 1]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx + i * 12, cy + i * 8, 1]]);
  await touch('touchEnd', []);
  const t1 = await ev(() => window.__INKTRACK__.mode.target.toArray());
  console.log(tag, 'editor', JSON.stringify({ placedPieces: placed, pinchZoom: [+d0.toFixed(1), +d1.toFixed(1)], panMoved: Math.hypot(t1[0] - t0[0], t1[2] - t0[2]).toFixed(1) }));
  await page.screenshot({ path: `screenshots/phase8-${tag}-editor.png` });
  const overflow = await ev(() => [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight]);
  console.log(tag, 'page overflow (x,y):', overflow);
  const errs = logs.filter((l) => /error/i.test(l));
  if (errs.length) console.log(errs.slice(0, 8).join('\n'));
  await browser.close();
}

await phone(390, 844, 'portrait');
await phone(844, 390, 'landscape');
