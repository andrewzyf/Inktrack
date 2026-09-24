import { formatTime, formatDelta, formatDate } from './format.js';
import { getSettings, setSetting } from '../storage/settings.js';

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
};

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
      case 'records': return this.show('records', { track: data.track });
      case 'settings': return this.show('settings');
      case 'editor': return app.openEditor();
      case 'back': return this.back();
      case 'race': return app.startRace(data.track);
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
    return `
      <section class="screen title">
        <div class="logo">
          ${burstSvg('#ffd23f', 22)}
          <h1><span class="ink">INK</span><span class="track">TRACK</span></h1>
          <p class="tagline">Drift! Boost! Loop! — a hand-inked arcade racer</p>
        </div>
        <nav class="menu-buttons">
          <button class="btn btn-big btn-yellow" data-action="play" autofocus>RACE!</button>
          <button class="btn btn-cyan" data-action="editor">TRACK EDITOR</button>
          <button class="btn btn-pink" data-action="records">RECORDS</button>
          <button class="btn" data-action="settings">SETTINGS</button>
        </nav>
        <p class="hint desktop-only">WASD / ARROWS drive · SPACE drift · R reset · ENTER restart · ESC pause</p>
        <p class="hint touch-only">Left thumb steers · right thumb gas, brake &amp; drift</p>
      </section>`;
  }

  _tracks() {
    const tracks = this.app.listTracks();
    const card = (t, i) => {
      const [c1, c2] = THEME_COLORS[t.theme] || THEME_COLORS.rooftop;
      const best = this.app.bestFor(t);
      return `
        <article class="card" style="--c1:${c1};--c2:${c2};--tilt:${[-1.5, 1, -0.5][i % 3]}deg">
          <div class="card-art"><span class="card-num">${i + 1}</span><span class="card-theme">${esc(t.themeName || '')}</span></div>
          <h3>${esc(t.name)}</h3>
          <p class="card-best">BEST <b>${best ? formatTime(best.time) : '--:--.---'}</b> ${best && best.ghost ? '<span class="badge">GHOST</span>' : ''}</p>
          <div class="card-actions">
            <button class="btn btn-yellow" data-action="race" data-track="${esc(t.ref)}">RACE</button>
            <button class="btn btn-small" data-action="records" data-track="${esc(t.ref)}">TIMES</button>
          </div>
        </article>`;
    };
    const starters = tracks.filter((t) => t.builtIn);
    const customs = tracks.filter((t) => !t.builtIn);
    return `
      <section class="screen tracks">
        <header class="screen-head"><button class="btn btn-small btn-back" data-action="back">◀ BACK</button><h2>PICK A TRACK</h2></header>
        <div class="cards">${starters.map(card).join('')}</div>
        ${customs.length ? `<h3 class="section-title">YOUR TRACKS</h3><div class="cards cards-custom">${customs.map((t, i) => card(t, i + starters.length)).join('')}</div>` : ''}
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
    return `
      <section class="screen results">
        <div class="results-head">${burstSvg(isBest ? '#ffd23f' : '#7cff6b', 20)}<h2>${isBest ? (previousBest == null ? 'FIRST TIME!' : 'NEW RECORD!') : 'FINISH!'}</h2></div>
        <div class="panel results-panel">
          <p class="track-name">${esc(trackName)}</p>
          <p class="big-time">${formatTime(time)}</p>
          ${delta != null ? `<p class="delta ${delta <= 0 ? 'ahead' : 'behind'}">${formatDelta(delta)} vs best</p>` : ''}
          ${rank ? `<p class="rank">Rank #${rank} of ${records.length}</p>` : ''}
          <table>${top}</table>
        </div>
        <nav class="menu-buttons row">
          <button class="btn btn-big btn-yellow" data-action="retry" autofocus>RETRY ⏎</button>
          ${testDrive ? '<button class="btn btn-cyan" data-action="back-to-editor">EDITOR</button>' : nextTrack ? `<button class="btn btn-cyan" data-action="next" data-track="${esc(nextTrack)}">NEXT TRACK</button>` : ''}
          ${testDrive ? '' : `<button class="btn" data-action="records" data-track="${esc(trackRef)}">TIMES</button><button class="btn btn-pink" data-action="menu">MENU</button>`}
        </nav>
      </section>`;
  }
}
