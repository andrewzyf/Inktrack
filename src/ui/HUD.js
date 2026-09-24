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
        <div class="panel hud-best"><span class="label">BEST</span><span class="value" data-best>--:--.---</span></div>
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
    this.cache = {};
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

  update({ time, checkpoint, checkpoints, speed, meter, drifting, boosting }) {
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
