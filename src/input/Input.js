import { Keyboard } from './Keyboard.js';

/**
 * Merges every input source (keyboard, touch, tilt, autopilot) into a single
 * controls snapshot that the physics reads once per tick.
 */
export function createControls() {
  return { throttle: 0, brake: 0, steer: 0, drift: false };
}

export class Input {
  constructor() {
    this.keyboard = new Keyboard();
    this.sources = [this.keyboard];
    this.override = null; // e.g. autopilot / scripted input for tests
    this.controls = createControls();
    this.locked = false;
  }

  addSource(source) {
    this.sources.push(source);
    return source;
  }

  removeSource(source) {
    this.sources = this.sources.filter((s) => s !== source);
  }

  onAction(fn) {
    const offs = this.sources.filter((s) => s.onAction).map((s) => s.onAction(fn));
    return () => offs.forEach((off) => off());
  }

  sample() {
    const c = this.controls;
    c.throttle = 0;
    c.brake = 0;
    c.steer = 0;
    c.drift = false;
    if (this.locked) return c;
    if (this.override) return this.override.sample(c);
    for (const s of this.sources) s.sample(c);
    c.steer = Math.max(-1, Math.min(1, c.steer));
    return c;
  }
}
