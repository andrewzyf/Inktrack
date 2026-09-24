import { formatTime, formatDelta, formatDate } from './format.js';
import { getSettings, setSetting } from '../storage/settings.js';
import { MUTATORS, MUTATOR_IDS } from '../vehicles/profiles.js';
import { SLOTS, getLook, isOwned, equip, itemFor, PAINTS, ACCENTS, RIMS } from '../vehicles/garage.js';
import { inkWallet, trackProgress, medalTimes, MEDALS } from '../storage/progress.js';
import { trackKey } from '../storage/records.js';

/**
 * Comic-panel menus: title, track select, records (leaderboard), settings,
 * pause and results. Plain DOM with delegated clicks; keyboard: arrows move
 * focus, Enter activates, Esc goes back.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const THEME_COLORS = {
  rooftop: ['#ff7a9c', '#4b3a78'],
  ruins: ['#8fbf4a', '#4a3a28'],
  frost: ['#8fd3ff', '#3b4a70'],
  canyon: ['#ffb070', '#8a3a22'],
  ocean: ['#6fd8ff', '#1d6fb8'],
  sky: ['#ffd0f0', '#6f7ef2'],
};

const MODES = [
  { id: 'all', label: 'ALL' },
  { id: 'car', label: 'LAND', icon: '🏎' },
  { id: 'boat', label: 'SEA', icon: '🚤' },
  { id: 'plane', label: 'SKY', icon: '✈' },
];
const VEHICLE_LABEL = { car: 'CAR', boat: 'BOAT', plane: 'PLANE' };

const inkBadge = () => `<span class="ink-wallet" title="Ink: earn it from pots, shortcuts, medals and dailies"><span class="pot-icon"></span><b>${inkWallet()}</b> INK</span>`;
const medalBadge = (i, small = false) => i < 0 ? `<span class="medal none${small ? ' small' : ''}" title="No medal yet"></span>` : `<span class="medal${small ? ' small' : ''}" style="--m:${MEDALS[i].color}" title="${MEDALS[i].name} medal">${MEDALS[i].name[0]}</span>`;
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function burstSvg(fill, points = 18) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 ? 36 + ((i * 7) % 5) : 49;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<svg class="burst" viewBox="0 0 100 100" aria-hidden="true"><polygon points="${pts.join(' ')}" transform="translate(3,3)" fill="#141018"/><polygon points="${pts.join(' ')}" fill="${fill}" stroke="#141018" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}

export class Menus {
  constructor(app, parent) {
    this.app = app;
    this.root = document.createElement('div');
    this.root.className = 'menu-root hidden';
    parent.appendChild(this.root);
    this.stack = [];
    this.current = null;
    this.raceOpts = { rival: null, mutators: new Set() };
    this.trackMode = 'all';
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      e.preventDefault();
      this.app.audio?.ui('click');
      this.handle(b.dataset.action, b.dataset, b);
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.setting) {
        const v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? parseFloat(t.value) : t.value;
        setSetting(t.dataset.setting, v);
        // iOS only grants motion sensors from a user gesture — this change event is one.
        if (t.dataset.setting === 'steering' && v === 'tilt') this.app.touch?.requestTiltPermission();
      }
    });
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }

  _onKey(e) {
    if (!this.visible) return;
    if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.current === 'pause') this.handle('resume');
      else if (this.current === 'results') this.handle('menu');
      else this.back();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      const items = [...this.root.querySelectorAll('button:not([disabled]), select, input')].filter((b) => b.offsetParent !== null);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const dir = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
      items[(i + dir + items.length) % items.length].focus();
    }
  }

  show(screen, params = {}, { replace = false } = {}) {
    if (replace || this.stack.length === 0 || this.stack[this.stack.length - 1].screen !== screen) {
      if (replace) this.stack.pop();
      this.stack.push({ screen, params });
    }
    this._render(screen, params);
  }

  /** Reset the history so `screen` is the root. */
  open(screen, params = {}) {
    this.stack = [];
    this.show(screen, params);
  }

  back() {
    if (this.stack.length > 1) {
      this.stack.pop();
      const top = this.stack[this.stack.length - 1];
      this._render(top.screen, top.params);
    }
  }

  hide() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.current = null;
    this.stack = [];
  }

  refresh() {
    const top = this.stack[this.stack.length - 1];
    if (top) this._render(top.screen, top.params);
  }

  _render(screen, params) {
    this.current = screen;
    const html = this[`_${screen}`](params);
    this.root.className = `menu-root screen-${screen}`;
    this.root.innerHTML = html;
    const first = this.root.querySelector('[autofocus]') || this.root.querySelector('button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  handle(action, data = {}) {
    const app = this.app;
    switch (action) {
      case 'play': return this.show('tracks');
      case 'mode':
        this.trackMode = data.mode;
        return this.refresh();
      case 'rival':
        this.raceOpts.rival = data.level || null;
        return this.refresh();
      case 'mutator':
        if (this.raceOpts.mutators.has(data.id)) this.raceOpts.mutators.delete(data.id);
        else this.raceOpts.mutators.add(data.id);
        return this.refresh();
      case 'daily': return app.startDaily();
      case 'garage': return app.openGarage(data.kind || 'car');
      case 'garage-kind': return app.openGarage(data.kind);
      case 'equip': {
        const ok = equip(data.kind, data.slot, data.id, inkWallet());
        if (!ok) {
          app.audio?.ui('error');
          this._toast('Not enough ink! Grab ink pots, find shortcuts and win medals.');
          return;
        }
        app.audio?.play(isOwned(data.kind, data.slot, data.id) && data.cost > 0 && data.fresh ? 'unlock' : 'drift');
        app.showroom?.setLook(getLook(data.kind));
        return this.refresh();
      }
      case 'records': return this.show('records', { track: data.track });
      case 'settings': return this.show('settings');
      case 'editor': return app.openEditor();
      case 'back':
        if (this.current === 'garage') return app.showMenu('title');
        return this.back();
      case 'race': return app.startRace(data.track, this._raceOptions());
      case 'resume': return app.resume();
      case 'restart': return app.restartRace();
      case 'retry': return app.restartRace();
      case 'next': return app.startRace(data.track);
      case 'menu': return app.showMenu();
      case 'clear-records':
        if (confirm('Delete all local times and the ghost for this track?')) {
          app.clearTrackRecords(data.track);
          this.refresh();
        }
        return;
      case 'custom-play': return app.startRace(data.track);
      default:
        return app.onMenuAction?.(action, data);
    }
  }

  // ── screens ───────────────────────────────────────────────────────────
  _title() {
    const d = this.app.daily();
    return `
      <section class="screen title">
        <div class="title-wallet">${inkBadge()}</div>
        <div class="logo">
          ${burstSvg('#ffd23f', 22)}
          <h1><span class="ink">INK</span><span class="track">TRACK</span></h1>
          <p class="tagline">Drift! Boost! Fly! — a hand-inked arcade racer</p>
        </div>
        <nav class="menu-buttons">
          <button class="btn btn-big btn-yellow" data-action="play" autofocus>RACE!</button>
          <button class="btn btn-daily ${d.done ? 'done' : ''}" data-action="daily">
            <span class="daily-tag">DAILY${d.done ? ' ✔' : ''}</span>
            <span class="daily-line">${esc(d.track.name)} · ${MUTATORS[d.mutators[0]].icon} ${esc(d.mutatorName)}</span>
            <small>${esc(d.goal.text)}${d.done ? '' : ' · +25 ink'}</small>
          </button>
          <div class="btn-row">
            <button class="btn btn-pink" data-action="garage">GARAGE</button>
            <button class="btn btn-cyan" data-action="editor">EDITOR</button>
          </div>
          <div class="btn-row">
            <button class="btn" data-action="records">RECORDS</button>
            <button class="btn" data-action="settings">SETTINGS</button>
          </div>
        </nav>
        <p class="hint desktop-only">WASD / ARROWS drive · SPACE drift · R reset · ENTER restart · ESC pause</p>
        <p class="hint touch-only">Left thumb steers · right thumb gas, brake &amp; drift</p>
      </section>`;
  }

  _toast(text) {
    let t = this.root.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      this.root.appendChild(t);
    }
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  _raceOptions() {
    return { rival: this.raceOpts.rival, mutators: [...this.raceOpts.mutators] };
  }

  _tracks() {
    const all = this.app.listTracks();
    const mode = this.trackMode;
    const tracks = mode === 'all' ? all : all.filter((t) => t.vehicle === mode);
    const card = (t, i) => {
      const [c1, c2] = THEME_COLORS[t.theme] || THEME_COLORS.rooftop;
      const best = this.app.bestFor(t);
      const prog = trackProgress(trackKey(t));
      const par = medalTimes(t.par);
      const potsTotal = t.potCount ?? null;
      return `
        <article class="card" style="--c1:${c1};--c2:${c2};--tilt:${[-1.5, 1, -0.5][i % 3]}deg">
          <div class="card-art"><span class="card-num">${i + 1}</span><span class="card-vehicle">${VEHICLE_LABEL[t.vehicle] || 'CAR'}</span><span class="card-theme">${esc(t.themeName || '')}</span>${par ? `<span class="card-medal">${medalBadge(prog.medal)}</span>` : ''}</div>
          <h3>${esc(t.name)}</h3>
          <p class="card-best">BEST <b>${best ? formatTime(best.time) : '--:--.---'}</b> ${best && best.ghost ? '<span class="badge">GHOST</span>' : ''}</p>
          <p class="card-stats">
            ${potsTotal != null ? `<span title="Ink pots found"><span class="pot-icon"></span> ${prog.pots.size}/${potsTotal}</span>` : ''}
            ${t.shortcutCount ? `<span title="Shortcuts discovered">⤴ ${prog.shortcuts.size}/${t.shortcutCount}</span>` : ''}
            ${par ? `<span class="card-par" title="Gold medal time">${medalBadge(2, true)} ${formatTime(par[2])}</span>` : ''}
          </p>
          <div class="card-actions">
            <button class="btn btn-yellow" data-action="race" data-track="${esc(t.ref)}">RACE</button>
            <button class="btn btn-small" data-action="records" data-track="${esc(t.ref)}">TIMES</button>
          </div>
        </article>`;
    };
    const starters = tracks.filter((t) => t.builtIn);
    const customs = tracks.filter((t) => !t.builtIn);
    const o = this.raceOpts;
    const rivalBtn = (lvl, label) => `<button class="chip ${o.rival === lvl ? 'on' : ''}" data-action="rival" data-level="${lvl || ''}">${label}</button>`;
    return `
      <section class="screen tracks">
        <header class="screen-head"><button class="btn btn-small btn-back" data-action="back">◀ BACK</button><h2>PICK A TRACK</h2>${inkBadge()}</header>
        <div class="tabs mode-tabs">${MODES.map((m) => `<button class="tab ${m.id === mode ? 'active' : ''}" data-action="mode" data-mode="${m.id}">${m.icon ? `<span class="tab-icon">${m.icon}</span>` : ''}${m.label}</button>`).join('')}</div>
        <div class="race-options panel">
          <div class="opt-row"><span class="opt-label">RIVAL</span>${rivalBtn(null, 'OFF')}${rivalBtn('easy', 'EASY')}${rivalBtn('medium', 'MEDIUM')}${rivalBtn('hard', 'HARD')}</div>
          <div class="opt-row"><span class="opt-label">TWISTS</span>${MUTATOR_IDS.map((id) => `<button class="chip ${o.mutators.has(id) ? 'on' : ''}" data-action="mutator" data-id="${id}" title="${esc(MUTATORS[id].desc)}">${MUTATORS[id].icon} ${esc(MUTATORS[id].name)}</button>`).join('')}</div>
          ${o.mutators.size ? '<p class="opt-note">Twists are just for fun — times with twists aren’t saved.</p>' : ''}
        </div>
        <div class="cards">${starters.map(card).join('')}</div>
        ${customs.length ? `<h3 class="section-title">YOUR TRACKS</h3><div class="cards cards-custom">${customs.map((t, i) => card(t, i + starters.length)).join('')}</div>` : ''}
        ${!tracks.length ? '<p class="hint">No tracks in this mode yet — build one in the editor!</p>' : ''}
      </section>`;
  }

  _garage({ kind = 'car' }) {
    const look = getLook(kind);
    const wallet = inkWallet();
    const swatch = (slot, item) => {
      const list = { paint: PAINTS, accent: ACCENTS, rims: RIMS }[slot];
      return list ? `<i class="swatch" style="background:${hex(item.color)}"></i>` : '';
    };
    const rows = Object.entries(SLOTS).map(([slot, def]) => {
      const items = def.items(kind);
      if (!items) return '';
      return `
        <div class="garage-slot">
          <h4>${def.label.toUpperCase()}</h4>
          <div class="garage-items">${items.map((it) => {
            const owned = isOwned(kind, slot, it.id);
            const on = look[slot] === it.id;
            const afford = owned || wallet >= it.cost;
            return `<button class="chip item ${on ? 'on' : ''} ${owned ? '' : 'locked'} ${afford ? '' : 'poor'}" data-action="equip" data-kind="${kind}" data-slot="${slot}" data-id="${it.id}" data-cost="${it.cost}" ${!owned ? 'data-fresh="1"' : ''} title="${esc(it.desc || it.name)}">${swatch(slot, it)}${esc(it.name)}${owned ? '' : ` <span class="cost">🔒 ${it.cost}</span>`}</button>`;
          }).join('')}</div>
        </div>`;
    }).join('');
    return `
      <section class="screen garage">
        <header class="screen-head"><button class="btn btn-small btn-back" data-action="back">◀ BACK</button><h2>GARAGE</h2>${inkBadge()}</header>
        <div class="tabs">${['car', 'boat', 'plane'].map((k) => `<button class="tab ${k === kind ? 'active' : ''}" data-action="garage-kind" data-kind="${k}">${VEHICLE_LABEL[k]}</button>`).join('')}</div>
        <div class="panel garage-panel">${rows}</div>
        <p class="hint">Looks only — every vehicle drives the same, so times stay fair.</p>
      </section>`;
  }

  _records({ track }) {
    const tracks = this.app.listTracks();
    const sel = tracks.find((t) => t.ref === track) || tracks[0];
    const records = sel ? this.app.recordsFor(sel) : [];
    const rows = records.length
      ? records.map((r, i) => `<tr class="${i === 0 ? 'gold' : ''}"><td>${i + 1}</td><td>${formatTime(r.time)}</td><td>${i ? formatDelta(r.time - records[0].time) : ''}</td><td>${formatDate(r.date)}</td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">No times yet — go set one!</td></tr>`;
    return `
      <section class="screen records">
        <header class="screen-head"><button class="btn btn-small btn-back" data-action="back">◀ BACK</button><h2>RECORDS</h2></header>
        <div class="tabs">${tracks.map((t) => `<button class="tab ${t === sel ? 'active' : ''}" data-action="records" data-track="${esc(t.ref)}">${esc(t.name)}</button>`).join('')}</div>
        <div class="panel records-panel">
          <table><thead><tr><th>#</th><th>TIME</th><th>GAP</th><th>DATE</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="row-actions">
          ${sel ? `<button class="btn btn-yellow" data-action="race" data-track="${esc(sel.ref)}">RACE IT</button>` : ''}
          ${records.length ? `<button class="btn btn-small" data-action="clear-records" data-track="${esc(sel.ref)}">CLEAR</button>` : ''}
        </div>
      </section>`;
  }

  _settings() {
    const s = getSettings();
    const toggle = (key, label, hint = '') => `
      <label class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
        <input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}><i class="switch"></i></label>`;
    const select = (key, label, options) => `
      <label class="setting"><span>${label}</span>
        <select data-setting="${key}">${options.map(([v, l]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const slider = (key, label, hint = '') => `
      <label class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-setting="${key}"></label>`;
    return `
      <section class="screen settings">
        <header class="screen-head"><button class="btn btn-small btn-back" data-action="back">◀ BACK</button><h2>SETTINGS</h2></header>
        <div class="panel settings-panel">
          ${toggle('ghost', 'Ghost car', 'race your best run')}
          ${slider('volume', 'Master volume')}
          ${slider('musicVolume', 'Music')}
          ${slider('engineVolume', 'Engine sound', 'the motor hum')}
          ${toggle('music', 'Play music')}
          ${select('quality', 'Graphics', [['auto', 'Auto'], ['low', 'Low (fast)'], ['medium', 'Medium'], ['high', 'High']])}
          ${select('steering', 'Touch steering', [['zones', 'Touch zones'], ['tilt', 'Tilt (gyro)']])}
          ${toggle('autoGas', 'Auto-accelerate', 'touch: gas is always on')}
          ${toggle('showFps', 'Show FPS')}
        </div>
        <p class="hint">Quality changes apply on the next track load.</p>
      </section>`;
  }

  _pause() {
    return `
      <section class="screen pause">
        <div class="pause-title">${burstSvg('#3df2ff', 14)}<h2>PAUSED</h2></div>
        <nav class="menu-buttons">
          <button class="btn btn-big btn-yellow" data-action="resume" autofocus>RESUME</button>
          <button class="btn" data-action="restart">RESTART</button>
          <button class="btn" data-action="settings">SETTINGS</button>
          ${this.app.inTestDrive ? '<button class="btn btn-cyan" data-action="back-to-editor">BACK TO EDITOR</button>' : '<button class="btn btn-pink" data-action="menu">QUIT TO MENU</button>'}
        </nav>
      </section>`;
  }

  _results(p) {
    const { time, isBest, previousBest, rank, records = [], trackRef, nextTrack, trackName, testDrive } = p;
    const delta = previousBest != null ? time - previousBest : null;
    const top = records.slice(0, 5).map((r, i) => `<tr class="${r === p.entry ? 'you' : ''}"><td>${i + 1}</td><td>${formatTime(r.time)}</td><td>${r === p.entry ? 'YOU!' : formatDate(r.date)}</td></tr>`).join('');
    const medal = p.medal ?? -1;
    const medalRow = p.medalTimes ? `
      <div class="medal-row">${MEDALS.map((m, i) => `<span class="medal-step ${i <= medal ? 'got' : ''} ${i === p.newMedal ? 'new' : ''}">${medalBadge(i <= medal ? i : -1, true)}<small>${m.name}<br>${formatTime(p.medalTimes[i])}</small></span>`).join('')}</div>` : '';
    const extras = [
      p.potsTotal ? `<span><span class="pot-icon"></span> ${p.pots}/${p.potsTotal} pots</span>` : '',
      p.shortcutsTotal ? `<span>⤴ ${p.shortcuts}/${p.shortcutsTotal} shortcuts found</span>` : '',
      p.rival ? `<span class="${p.rival.beaten ? 'good' : 'bad'}">${p.rival.beaten ? 'You beat' : 'Lost to'} ${p.rival.level} Inkbot${p.rival.time != null ? ` (${formatTime(p.rival.time)})` : ''}</span>` : '',
      p.mutators?.length ? `<span>${p.mutators.map((m) => MUTATORS[m].icon + ' ' + MUTATORS[m].name).join(' · ')}</span>` : '',
      p.dailyDone ? '<span class="good">DAILY CHALLENGE DONE! +25 ink</span>' : '',
    ].filter(Boolean).join('');
    const head = p.newMedal >= 0 ? `${MEDALS[p.newMedal].name.toUpperCase()} MEDAL!` : isBest ? (previousBest == null ? 'FIRST TIME!' : 'NEW RECORD!') : 'FINISH!';
    return `
      <section class="screen results">
        <div class="results-head">${burstSvg(p.newMedal >= 0 ? MEDALS[p.newMedal].color : isBest ? '#ffd23f' : '#7cff6b', 20)}<h2>${head}</h2></div>
        <div class="panel results-panel">
          <p class="track-name">${esc(trackName)}</p>
          <p class="big-time">${formatTime(time)}</p>
          ${delta != null ? `<p class="delta ${delta <= 0 ? 'ahead' : 'behind'}">${formatDelta(delta)} vs best</p>` : ''}
          ${rank ? `<p class="rank">Rank #${rank} of ${records.length}</p>` : ''}
          ${medalRow}
          ${extras ? `<p class="result-extras">${extras}</p>` : ''}
          ${top ? `<table>${top}</table>` : ''}
          ${p.ink != null ? `<p class="result-ink">${inkBadge()}</p>` : ''}
        </div>
        <nav class="menu-buttons row">
          <button class="btn btn-big btn-yellow" data-action="retry" autofocus>RETRY ⏎</button>
          ${testDrive ? '<button class="btn btn-cyan" data-action="back-to-editor">EDITOR</button>' : nextTrack ? `<button class="btn btn-cyan" data-action="next" data-track="${esc(nextTrack)}">NEXT TRACK</button>` : ''}
          ${testDrive ? '' : `<button class="btn" data-action="records" data-track="${esc(trackRef)}">TIMES</button><button class="btn btn-pink" data-action="menu">MENU</button>`}
        </nav>
      </section>`;
  }
}
