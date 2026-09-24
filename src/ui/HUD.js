import { formatTime, formatDelta } from './format.js';

/**
 * In-race heads-up display: race clock, checkpoint counter, speedometer,
 * drift-boost meter, personal-best/ghost delta. DOM text is only touched
 * when values change so it stays cheap on phones.
 */
export class HUD {
  constructor(parent) {
    const el = document.createElement('div');
    el.className = 'hud hidden';
    el.innerHTML = `
      <div class="hud-top">
        <div class="panel hud-cp"><span class="label">CP</span><span class="value" data-cp>0/0</span></div>
        <div class="panel hud-timer"><span class="value" data-time>00:00.000</span><span class="delta" data-delta></span></div>
        <div class="panel hud-best"><span class="label">BEST</span><span class="value" data-best>--:--.---</span><span class="target" data-target></span></div>
      </div>
      <div class="hud-side">
        <div class="panel hud-pots" data-pots-panel><span class="pot-icon"></span><span class="value" data-pots>0/0</span></div>
        <div class="panel hud-rival hidden" data-rival></div>
      </div>
      <div class="hud-bottom">
        <div class="panel hud-speed">
          <span class="value" data-speed>0</span><span class="unit">KM/H</span>
          <div class="meter" data-meter><i></i><i></i><i></i><b data-fill></b></div>
        </div>
      </div>`;
    parent.appendChild(el);
    this.el = el;
    // Comic "boost" edge glow + optional perf meter.
    this.flash = document.createElement('div');
    this.flash.className = 'boost-flash';
    parent.appendChild(this.flash);
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps-meter hidden';
    parent.appendChild(this.fpsEl);
    this.q = (s) => el.querySelector(s);
    this.timeEl = this.q('[data-time]');
    this.cpEl = this.q('[data-cp]');
    this.bestEl = this.q('[data-best]');
    this.speedEl = this.q('[data-speed]');
    this.deltaEl = this.q('[data-delta]');
    this.meterEl = this.q('[data-meter]');
    this.fillEl = this.q('[data-fill]');
    this.potsEl = this.q('[data-pots]');
    this.potsPanel = this.q('[data-pots-panel]');
    this.rivalEl = this.q('[data-rival]');
    this.targetEl = this.q('[data-target]');
    this.cache = {};
  }

  /** Next medal to chase, e.g. { name: 'GOLD', time, color }. */
  setTarget(t) {
    if (!t) {
      this.targetEl.textContent = '';
      return;
    }
    this.targetEl.textContent = `${t.name} ${formatTime(t.time)}`;
    this.targetEl.style.color = t.color;
  }

  show(on = true) {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.flash.classList.remove('on');
  }

  setFps(text) {
    this.fpsEl.classList.toggle('hidden', text == null);
    if (text != null && this.cache.fps !== text) {
      this.cache.fps = text;
      this.fpsEl.textContent = text;
    }
  }

  _set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  setBest(time) {
    this._set('best', this.bestEl, time == null ? '--:--.---' : formatTime(time));
  }

  /** Flash a split delta (negative = ahead of best). */
  flashDelta(delta) {
    if (delta == null) return;
    this.deltaEl.textContent = formatDelta(delta);
    this.deltaEl.className = `delta show ${delta <= 0 ? 'ahead' : 'behind'}`;
    clearTimeout(this._deltaTimer);
    this._deltaTimer = setTimeout(() => (this.deltaEl.className = 'delta'), 2200);
  }

  update({ time, checkpoint, checkpoints, speed, meter, drifting, boosting, pots = 0, potsTotal = 0, rival = null }) {
    this._set('pots', this.potsEl, `${pots}/${potsTotal}`);
    if (this.cache.potsShown !== potsTotal > 0) {
      this.cache.potsShown = potsTotal > 0;
      this.potsPanel.classList.toggle('hidden', !potsTotal);
    }
    const rv = !rival ? '' : rival.done ? (rival.delta <= 0 ? 'BEAT INKBOT!' : 'INKBOT WON') : rival.ahead > 0 ? 'INKBOT ▼ BEHIND' : rival.ahead < 0 ? 'INKBOT ▲ AHEAD' : 'INKBOT NECK & NECK';
    if (this.cache.rival !== rv) {
      this.cache.rival = rv;
      this.rivalEl.textContent = rv;
      this.rivalEl.classList.toggle('hidden', !rv);
      this.rivalEl.classList.toggle('ahead', !!rival && (rival.done ? rival.delta <= 0 : rival.ahead > 0));
    }
    this._set('time', this.timeEl, formatTime(time));
    this._set('cp', this.cpEl, `${checkpoint}/${checkpoints}`);
    this._set('speed', this.speedEl, String(Math.round(Math.abs(speed) * 3.6)));
    const pct = Math.round(Math.min(1, meter) * 100);
    if (this.cache.meter !== pct) {
      this.cache.meter = pct;
      this.fillEl.style.transform = `scaleX(${pct / 100})`;
    }
    if (this.cache.boost !== boosting) {
      this.cache.boost = boosting;
      this.flash.classList.toggle('on', !!boosting);
    }
    const tier = !drifting ? 'idle' : meter < 0.5 ? 't1' : meter < 0.85 ? 't2' : 't3';
    const cls = `meter ${tier}${boosting ? ' boosting' : ''}`;
    this._set('meterCls', this.meterEl, cls, 'className');
  }
}
