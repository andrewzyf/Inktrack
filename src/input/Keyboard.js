/**
 * Keyboard source. Uses `event.code` so WASD works on any keyboard layout
 * (AZERTY users get the physical W/A/S/D positions).
 */
const BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
};

const ACTION_KEYS = {
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  restart: ['Enter', 'Backspace'],
  camera: ['KeyC'],
};

const GAME_CODES = new Set([...Object.values(BINDINGS).flat(), 'Space']);

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.listeners = new Set();
    this.enabled = true;
    this._onDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (GAME_CODES.has(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      for (const [action, codes] of Object.entries(ACTION_KEYS)) {
        if (codes.includes(e.code)) this._emit(action, e);
      }
    };
    this._onUp = (e) => this.down.delete(e.code);
    this._onBlur = () => this.down.clear();
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
    this.target = target;
  }

  onAction(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(action, event) {
    for (const fn of this.listeners) fn(action, event);
  }

  isDown(action) {
    const codes = BINDINGS[action];
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true;
    return false;
  }

  /** Write this source's contribution into a controls object. */
  sample(out) {
    if (!this.enabled) return out;
    if (this.isDown('throttle')) out.throttle = 1;
    if (this.isDown('brake')) out.brake = 1;
    const steer = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    if (steer !== 0) out.steer = steer;
    if (this.isDown('drift')) out.drift = true;
    return out;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onDown);
    this.target.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
