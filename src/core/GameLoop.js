/**
 * requestAnimationFrame driver with a fixed-timestep simulation.
 * Physics, the race clock and ghost sampling all run on `fixedUpdate`, so the
 * game behaves identically at 30, 60 or 144 fps; rendering interpolates
 * between the last two ticks using `alpha`.
 */
export class GameLoop {
  constructor({ tickRate = 120, fixedUpdate, frame }) {
    this.step = 1 / tickRate;
    this.fixedUpdate = fixedUpdate;
    this.frame = frame;
    this.accumulator = 0;
    this.last = 0;
    this.running = false;
    this.maxStepsPerFrame = 12;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._raf = 0;
    this._tick = (now) => this._onFrame(now);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _onFrame(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25; // tab was hidden / debugger pause

    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxStepsPerFrame) {
      this.fixedUpdate(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.accumulator = 0; // drop time rather than spiral
    this.frame(dt, this.accumulator / this.step);
  }
}
