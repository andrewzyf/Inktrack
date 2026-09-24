import { launch, sleep } from '../pw.mjs';
const { browser, page } = await launch();
await page.goto('http://localhost:4173/?editor');
await page.waitForFunction(() => window.__INKTRACK__?.modeName === 'editor');
const out = await page.evaluate(() => {
  const ed = window.__INKTRACK__.mode;
  const log = [];
  const placeNext = (type) => {
    ed.selectPiece(type);
    const byKey = new Map();
    for (const rp of ed.resolved) for (const c of rp.connectors) byKey.set(c.key, (byKey.get(c.key) || 0) + 1);
    const D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    let cell = null;
    for (let i = ed.resolved.length - 1; i >= 0 && !cell; i--) for (const c of ed.resolved[i].connectors) if (!cell && byKey.get(c.key) === 1 && !(ed.resolved[i].type === 'start' && c.index === 0)) { ed.level = c.level; cell = [c.cx + D[c.dir][0], c.cz + D[c.dir][1]]; }
    ed.hoverCell = null; ed._setHover(cell);
    log.push(`${type} @${cell} lvl${ed.level} cand=${JSON.stringify(ed.candidate?.piece)} valid=${ed.candidate?.valid}`);
    ed.act();
  };
  for (const t of ['straight', 'straight', 'boost', 'straight', 'checkpoint', 'curve', 'straight', 'slope', 'straight', 'ramp']) placeNext(t);
  const r = ed.resolved.at(-1);
  log.push('last: ' + r.type + ' cells ' + JSON.stringify(r.cells) + ' r ' + r.r + ' lvl ' + r.level);
  return log;
});
console.log(out.join('\n'));
await browser.close();
