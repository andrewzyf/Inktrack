// Phase 7: build a custom track in the editor with real clicks, save, reload,
// test-drive it (autopilot drives via ?autopilot), export + import JSON.
import { launch, sleep } from './pw.mjs';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:4173/';
const { browser, context, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(base + '?editor&autopilot');
await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'editor');
await sleep(500);
await page.screenshot({ path: 'screenshots/phase7-empty.png' });

// Screen position of the open road end's next cell.
let travelDir = null; // after a jump landing, continue away from the ramp
const nextCell = () => ev((prefer) => {
  const ed = window.__INKTRACK__.mode;
  const byKey = new Map();
  for (const rp of ed.resolved) for (const c of rp.connectors) byKey.set(c.key, (byKey.get(c.key) || 0) + 1);
  const D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let i = ed.resolved.length - 1; i >= 0; i--) {
    for (const c of ed.resolved[i].connectors) if (byKey.get(c.key) === 1 && !(ed.resolved[i].type === 'start' && c.index === 0) && (prefer == null || c.dir === prefer)) {
      ed.level = c.level;
      return [c.cx + D[c.dir][0], c.cz + D[c.dir][1], c.level];
    }
  }
  return null;
}, travelDir);
const clickCell = async ([x, z, level]) => {
  const pos = await ev(([x, z, level]) => {
    const app = window.__INKTRACK__, ed = app.mode, cam = app.renderer.camera;
    ed.target.set(x * 10, 0, z * 10); // keep it on screen
    ed._updateCamera();
    const v = new (cam.position.constructor)(x * 10, level * 2.5, z * 10).project(cam);
    return [((v.x + 1) / 2) * app.renderer.width, ((1 - v.y) / 2) * app.renderer.height];
  }, [x, z, level]);
  await page.mouse.move(pos[0], pos[1]);
  await sleep(60);
  await page.mouse.click(pos[0], pos[1]);
  await sleep(60);
};
const plan = ['straight', 'straight', 'boost', 'straight', 'checkpoint', 'curve', 'straight', 'slope', 'straight', 'ramp', 'GAP', 'straight', 'straight', 'bank', 'straight', 'checkpoint', 'straight', 'finish'];
for (const type of plan) {
  if (type === 'GAP') {
    // After a ramp: land 3 cells along its launch direction, one level down.
    const land = await ev(() => {
      const ed = window.__INKTRACK__.mode;
      const r = ed.resolved.at(-1);
      const d = (r.def.launch.dir + r.r) % 4;
      const D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      ed.level = r.level - 1;
      ed.rotation = d;
      ed.snap = false;
      return [r.cells[0][0] + D[d][0] * 3, r.cells[0][1] + D[d][1] * 3, r.level - 1];
    });
    await page.click('.piece[data-piece="straight"]');
    await ev(() => { window.__INKTRACK__.mode.snap = false; });
    await clickCell(land);
    await ev(() => { window.__INKTRACK__.mode.snap = true; });
    travelDir = await ev(() => window.__INKTRACK__.mode.rotation);
    continue;
  }
  await page.click(`.piece[data-piece="${type}"]`);
  const target = await nextCell();
  travelDir = null;
  await clickCell(target);
  if (process.env.DEBUG) console.log(type, target, JSON.stringify(await ev(() => { const ed = window.__INKTRACK__.mode; return { n: ed.track.pieces.length, last: ed.track.pieces.at(-1), hover: ed.hoverCell, lvl: ed.level }; })));
}
const stats = await ev(() => window.__INKTRACK__.mode.stats);
console.log('built:', JSON.stringify(stats));
if (process.env.DUMP) {
  (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(await ev(() => window.__INKTRACK__.mode.trackData())));
  await browser.close();
  process.exit(0);
}
await ev(() => { const ed = window.__INKTRACK__.mode; ed.target.set(0, 0, 60); ed.distance = 170; });
await sleep(300);
await page.screenshot({ path: 'screenshots/phase7-built.png' });

// Name + save through the UI.
await page.fill('.ed-name', 'Verify Loop');
await page.click('[data-ed="save"]');
await sleep(300);
const saved = await ev(() => Object.keys(localStorage).filter((k) => k.includes('track:')));
console.log('saved keys:', saved);

// Reload → editor restores the draft; also open the saved copy via LOAD.
await page.reload();
await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'editor');
await page.click('[data-ed="new"]').catch(() => {});
page.once('dialog', (d) => d.accept());
await sleep(200);
await page.click('[data-ed="load"]');
await sleep(200);
await page.screenshot({ path: 'screenshots/phase7-load.png' });
await page.click('.dlg-box [data-dlg="open"]');
await sleep(300);
const reloaded = await ev(() => ({ name: window.__INKTRACK__.mode.track.name, pieces: window.__INKTRACK__.mode.track.pieces.length, stats: window.__INKTRACK__.mode.stats }));
console.log('reloaded:', JSON.stringify(reloaded));

// Export + re-import.
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-ed="export"]')]);
const file = await download.path();
const json = JSON.parse(readFileSync(file, 'utf8'));
console.log('export:', download.suggestedFilename(), json.format, json.pieces.length, 'pieces');
await page.setInputFiles('.ed-file-input', file);
await sleep(400);
console.log('after import:', JSON.stringify(await ev(() => ({ name: window.__INKTRACK__.mode.track.name, pieces: window.__INKTRACK__.mode.track.pieces.length }))));

// Test drive (autopilot drives thanks to ?autopilot).
await page.click('[data-ed="test"]');
await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'race');
await ev(() => { window.__INKTRACK__.debugPauseAt = 5; });
await page.waitForFunction(() => window.__INKTRACK__.paused, null, { timeout: 200000 });
await page.screenshot({ path: 'screenshots/phase7-testdrive.png' });
await ev(() => { const a = window.__INKTRACK__; a.paused = false; a.loop.last = performance.now(); });
await page.waitForFunction(() => window.__INKTRACK__?.menus?.current === 'results', null, { timeout: 400000 });
console.log('test drive result:', JSON.stringify(await ev(() => ({ time: window.__INKTRACK__.mode.race.finishTime, respawns: window.__INKTRACK__.mode.race.respawns }))));
await page.screenshot({ path: 'screenshots/phase7-results.png' });
await page.click('[data-action="back-to-editor"]');
await sleep(400);
console.log('back in editor:', JSON.stringify(await ev(() => ({ mode: window.__INKTRACK__.modeName, pieces: window.__INKTRACK__.mode.track.pieces.length, undo: window.__INKTRACK__.mode.undoStack.length }))));
await page.screenshot({ path: 'screenshots/phase7-back.png' });
// The saved track shows up under RACE → YOUR TRACKS.
await ev(() => window.__INKTRACK__.showMenu('tracks'));
await sleep(500);
console.log('track select custom cards:', await ev(() => [...document.querySelectorAll('.cards-custom h3')].map((h) => h.textContent)));
await page.screenshot({ path: 'screenshots/phase7-tracks.png' });
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
void context;
