import { getSettings, onSettingsChange } from '../storage/settings.js';

/**
 * On-screen touch controls.
 *
 * Every finger is tracked by the layer itself and hit-tested against the
 * controls on each move, so you can slide a thumb from ◀ to ▶ or from GAS to
 * BRAKE without lifting it. Handlers act on pointerdown immediately (no click
 * delay) and `touch-action: none` stops the browser from scrolling/zooming.
 *
 * Left thumb: steering pad (left/right zones). Right thumb: GAS, BRAKE, DRIFT.
 * Optional tilt steering (DeviceOrientation) and auto-gas from Settings.
 */

export function hasTouch() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(location.search);
  if (p.get('touch') === '1') return true;
  if (p.get('touch') === '0') return false;
  const layout = getSettings().touchLayout;
  if (layout === 'on') return true;
  if (layout === 'off') return false;
  return (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
}

const ARROW_L = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M26 6 L8 20 L26 34 Z" /></svg>';
const ARROW_R = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 6 L32 20 L14 34 Z" /></svg>';

export class TouchControls {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'touch-controls hidden';
    this.el.innerHTML = `
      <div class="tc-steer" data-c="steer"><div class="tc-zone left">${ARROW_L}</div><div class="tc-zone right">${ARROW_R}</div></div>
      <div class="tc-tilt hidden" data-c="recenter"><span>TILT</span><small>tap to re-centre</small></div>
      <div class="tc-pedals">
        <div class="tc-btn tc-drift" data-c="drift"><span>DRIFT</span></div>
        <div class="tc-btn tc-brake" data-c="brake"><span>BRAKE</span></div>
        <div class="tc-btn tc-gas" data-c="gas"><span>GAS</span></div>
      </div>
      <div class="tc-sys">
        <button class="tc-small" data-c="reset" aria-label="Reset to checkpoint">↺</button>
        <button class="tc-small" data-c="pause" aria-label="Pause">❚❚</button>
      </div>`;
    parent.appendChild(this.el);
    this.controls = {};
    for (const n of this.el.querySelectorAll('[data-c]')) this.controls[n.dataset.c] = n;
    this.pointers = new Map(); // id → control name
    this.steerPointers = new Map(); // id → -1..1
    this.listeners = new Set();
    this.enabled = false;
    this.tilt = { active: false, neutral: null, value: 0, permission: 'unknown' };

    const onDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      try {
        e.target.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      this._track(e);
      const c = this.pointers.get(e.pointerId);
      if (c === 'pause' || c === 'reset') this._emit(c);
      if (c === 'recenter') this.tilt.neutral = null;
      this.onFirstTouch?.();
    };
    const onMove = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault();
      this._track(e);
    };
    const onUp = (e) => {
      this.pointers.delete(e.pointerId);
      this.steerPointers.delete(e.pointerId);
      this._paint();
    };
    this.el.addEventListener('pointerdown', onDown, { passive: false });
    this.el.addEventListener('pointermove', onMove, { passive: false });
    this.el.addEventListener('pointerup', onUp);
    this.el.addEventListener('pointercancel', onUp);
    this.el.addEventListener('lostpointercapture', onUp);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    this._onOrientation = (e) => this._orientation(e);
    this._applySettings();
    onSettingsChange(() => this._applySettings());
  }

  onAction(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(action) {
    for (const fn of this.listeners) fn(action);
    navigator.vibrate?.(8);
  }

  show(on) {
    this.enabled = on;
    this.el.classList.toggle('hidden', !on);
    if (!on) {
      this.pointers.clear();
      this.steerPointers.clear();
      this._paint();
    }
  }

  /** Which control is under a point (with generous slop around the pedals). */
  _hit(x, y) {
    const order = ['pause', 'reset', 'recenter', 'drift', 'brake', 'gas', 'steer'];
    for (const name of order) {
      const el = this.controls[name];
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      const slop = name === 'steer' ? 24 : name === 'pause' || name === 'reset' ? 6 : 12;
      if (x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop) return { name, rect: r };
    }
    return null;
  }

  _track(e) {
    const h = this._hit(e.clientX, e.clientY);
    if (!h) {
      // Keep the previous assignment while a thumb drifts off a control.
      if (!this.pointers.has(e.pointerId)) return;
    } else {
      this.pointers.set(e.pointerId, h.name);
      if (h.name === 'steer') {
        const mid = h.rect.left + h.rect.width / 2;
        this.steerPointers.set(e.pointerId, e.clientX < mid ? -1 : 1);
      } else this.steerPointers.delete(e.pointerId);
    }
    this._paint();
  }

  _paint() {
    const active = new Set(this.pointers.values());
    for (const name of ['gas', 'brake', 'drift']) this.controls[name].classList.toggle('on', active.has(name));
    let l = false, r = false;
    for (const v of this.steerPointers.values()) (v < 0 ? (l = true) : (r = true));
    this.controls.steer.querySelector('.left').classList.toggle('on', l);
    this.controls.steer.querySelector('.right').classList.toggle('on', r);
  }

  _applySettings() {
    const s = getSettings();
    this.autoGas = !!s.autoGas;
    this.el.classList.toggle('auto-gas', this.autoGas);
    const tilt = s.steering === 'tilt';
    if (tilt !== this.tilt.active) {
      this.tilt.active = tilt;
      this.tilt.neutral = null;
      if (tilt) window.addEventListener('deviceorientation', this._onOrientation);
      else window.removeEventListener('deviceorientation', this._onOrientation);
    }
    this.controls.steer.classList.toggle('hidden', tilt);
    this.controls.recenter.classList.toggle('hidden', !tilt);
    this.sensitivity = s.tiltSensitivity || 1;
  }

  /** iOS 13+ needs an explicit permission request from a user gesture. */
  async requestTiltPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        this.tilt.permission = await DOE.requestPermission();
      } catch {
        this.tilt.permission = 'denied';
      }
    } else this.tilt.permission = DOE ? 'granted' : 'unsupported';
    return this.tilt.permission;
  }

  _orientation(e) {
    if (e.beta == null || e.gamma == null) return;
    // Pick the axis that means "steering wheel" for the current screen rotation.
    const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    let raw;
    if (angle === 90) raw = e.beta;
    else if (angle === -90 || angle === 270) raw = -e.beta;
    else raw = e.gamma;
    if (this.tilt.neutral === null) this.tilt.neutral = raw;
    const deg = raw - this.tilt.neutral;
    const dead = 2.5, full = 22 / this.sensitivity;
    const v = Math.abs(deg) < dead ? 0 : (deg - Math.sign(deg) * dead) / (full - dead);
    this.tilt.value = Math.max(-1, Math.min(1, v));
  }

  sample(out) {
    if (!this.enabled) return out;
    const active = new Set(this.pointers.values());
    if (active.has('gas') || (this.autoGas && !active.has('brake'))) out.throttle = 1;
    if (active.has('brake')) out.brake = 1;
    if (active.has('drift')) out.drift = true;
    let steer = 0;
    if (this.tilt.active) steer = this.tilt.value;
    else for (const v of this.steerPointers.values()) steer += v;
    if (steer !== 0) out.steer = Math.max(-1, Math.min(1, (out.steer || 0) + steer));
    return out;
  }
}
