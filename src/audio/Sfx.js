import { getSettings, onSettingsChange } from '../storage/settings.js';
import { Music } from './Music.js';

/** Engine voice per vehicle kind: pitch range, filter and loudness. */
const ENGINES = {
  car: { base: 46, range: 58, gear: 5, cut: 260, cutRange: 520, vol: 1 },
  boat: { base: 34, range: 40, gear: 3, cut: 200, cutRange: 380, vol: 1.1 },
  plane: { base: 70, range: 60, gear: 0, cut: 380, cutRange: 600, vol: 0.8 },
};

/**
 * Procedural sound effects (Web Audio) — no audio files to download or
 * license. A continuous engine/tyre/wind bed follows the car; one-shots
 * cover checkpoints, boosts, crashes, landings, countdown, finish and UI.
 *
 * Browsers only start audio after a user gesture, so `unlock()` is called
 * from the first key press / tap.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    this.volume = getSettings().volume;
    this.vehicle = 'car';
    this.wantSong = null;
    this.muffled = false;
    onSettingsChange((key, value, all) => {
      this.volume = all.volume;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.volume, t, 0.05);
      this.engineBus.gain.setTargetAtTime(all.engineVolume, t, 0.05);
      this._syncMusic();
    });
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('pointerdown', unlock, { capture: true });
    this.bedOn = false;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      this._init();
      this._bedSynced = false;
      this._syncMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    // Shared white-noise buffer.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ── continuous bed: engine, tyre squeal, wind ─────────────────────
    const bed = (this.bedGain = ctx.createGain());
    bed.gain.value = 0;
    bed.connect(this.master);
    // Engine: a soft triangle + sine sub through a gentle low-pass, on its
    // own bus so the "Engine sound" setting can tame (or silence) it.
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = getSettings().engineVolume;
    this.engineBus.connect(bed);
    this.engineA = ctx.createOscillator();
    this.engineA.type = 'triangle';
    this.engineB = ctx.createOscillator();
    this.engineB.type = 'sine';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 0.6;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.7;
    this.engineA.connect(this.engineFilter);
    this.engineB.connect(bGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.engineBus);
    this.engineA.start();
    this.engineB.start();
    // Slow wobble so the note never sits perfectly still (less droning).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain).connect(this.engineA.frequency);
    lfo.start();
    this.engineLfo = lfo;

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
    this.music = new Music(ctx, this.musicBus);

    this.squeal = this._loopNoise('bandpass', 1500, 6);
    this.squeal.gain.connect(bed);
    this.wind = this._loopNoise('lowpass', 700, 0.7);
    this.wind.gain.connect(bed);
  }

  _loopNoise(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g);
    src.start();
    return { src, filter: f, gain: g };
  }

  /** Request a song by id (plays once audio is unlocked; null = silence). */
  playMusic(id) {
    this.wantSong = id;
    this._syncMusic();
  }

  /** Quieter music behind the pause menu. */
  setMusicMuffled(on) {
    this.muffled = on;
    if (this.music) this.music.setMuffled(on);
  }

  _syncMusic() {
    if (!this.music) return;
    const s = getSettings();
    if (!s.music || !this.wantSong || s.musicVolume <= 0) {
      if (this.music.songId) this.music.stop();
      return;
    }
    this.music.play(this.wantSong, s.musicVolume * 0.7);
    if (this.muffled) this.music.setMuffled(true);
  }

  /** Engine timbre for the current vehicle: 'car' | 'boat' | 'plane'. */
  setVehicle(kind) {
    this.vehicle = ENGINES[kind] ? kind : 'car';
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Turn the engine/tyre bed on (racing) or fade it out (menus, pause). */
  setBed(on) {
    if (on === this.bedOn && this._bedSynced) return;
    this.bedOn = on;
    if (!this.ctx) return;
    this._bedSynced = true;
    this.bedGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, on ? 0.15 : 0.08);
  }

  /** Per-frame car state → engine pitch, tyre squeal, wind. */
  updateCar(car, controls) {
    if (!this.ready || !this.bedOn) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(car.speed);
    const e = ENGINES[this.vehicle];
    // Fake gearbox: rpm climbs within each gear, drops on the shift.
    const gears = [0, 12, 24, 36, 48, 62, 80];
    let g = 1;
    while (g < gears.length - 1 && speed > gears[g]) g++;
    const lo = gears[g - 1], hi = gears[g];
    const rpm = e.gear ? 0.25 + 0.75 * Math.min(1, (speed - lo) / (hi - lo)) : Math.min(1, speed / 70);
    const throttle = controls.throttle || (car.boosting ? 1 : 0);
    const air = car.grounded || this.vehicle === 'plane' ? 0 : 12 * throttle;
    const base = e.base + rpm * e.range + g * e.gear + air;
    this.engineA.frequency.setTargetAtTime(base, t, 0.06);
    this.engineB.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(e.cut + rpm * e.cutRange + throttle * 180 + (car.boosting ? 300 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime((0.05 + throttle * 0.05 + Math.min(1, speed / 50) * 0.04) * e.vol, t, 0.1);
    const slip = car.grounded ? (car.drifting ? 0.6 + car.slip : Math.max(0, car.slip - 0.15) * 2) : 0;
    const skid = car.grounded && controls.brake && car.forwardSpeed > 12 ? 0.35 : 0;
    this.squeal.gain.gain.setTargetAtTime(Math.min(0.12, (slip + skid) * 0.1), t, 0.05);
    this.squeal.filter.frequency.setTargetAtTime(1300 + Math.min(1, speed / 50) * 700 + (car.surface === 'ice' ? -500 : 0), t, 0.1);
    this.wind.gain.gain.setTargetAtTime(Math.max(0, (speed - 25) / 45) * 0.09, t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(400 + speed * 18, t, 0.2);
  }

  // ── one-shots ────────────────────────────────────────────────────────
  _tone(type, f0, f1, dur, vol, at = 0, curve = 'exp') {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, type, f0, f1 = f0, q = 1, at = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name, value = 0) {
    if (!this.ready) return;
    switch (name) {
      case 'count':
        this._tone('square', 440, 440, 0.16, 0.12);
        break;
      case 'go':
        this._tone('square', 880, 880, 0.35, 0.14);
        this._tone('triangle', 1320, 1320, 0.35, 0.08);
        break;
      case 'checkpoint':
        [1046, 1318, 1568].forEach((f, i) => this._tone('triangle', f, f, 0.14, 0.13, i * 0.06));
        break;
      case 'ahead':
        this._tone('sine', 1568, 2093, 0.2, 0.08, 0.2);
        break;
      case 'boost':
        this._noise(0.55, 0.3, 'bandpass', 500, 3500, 1.5);
        this._tone('sawtooth', 160, 520, 0.4, 0.06);
        break;
      case 'driftBoost':
        this._noise(0.4 + value * 0.3, 0.22 + value * 0.1, 'bandpass', 700, 3000, 1.2);
        this._tone('sawtooth', 140, 380 + value * 250, 0.35 + value * 0.2, 0.07);
        break;
      case 'drift':
        this._tone('triangle', 660, 990, 0.12, 0.05);
        break;
      case 'wall':
        this._noise(0.25, Math.min(0.5, 0.15 + value * 0.012), 'lowpass', 1800, 200, 0.8);
        this._tone('sine', 110, 45, 0.22, Math.min(0.35, 0.1 + value * 0.01));
        break;
      case 'land':
        this._tone('sine', 95, 38, 0.2, Math.min(0.4, 0.08 + value * 0.012));
        this._noise(0.12, Math.min(0.25, value * 0.01), 'lowpass', 900, 150, 0.7);
        break;
      case 'fall':
        this._tone('sine', 1100, 180, 0.9, 0.12, 0, 'lin');
        this._noise(0.35, 0.25, 'lowpass', 600, 80, 0.6, 0.85);
        break;
      case 'respawn':
        this._tone('triangle', 392, 784, 0.18, 0.08);
        break;
      case 'missed':
        this._tone('square', 220, 160, 0.3, 0.1);
        this._tone('square', 207, 150, 0.3, 0.08, 0.15);
        break;
      case 'finish':
        [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, i === 3 ? 0.6 : 0.16, 0.14, i * 0.12));
        this._noise(0.8, 0.06, 'highpass', 5000, 9000, 0.5, 0.36);
        break;
      case 'pot':
        // Bottle "plink": two quick glassy notes (brighter for a new pot).
        this._tone('sine', value ? 1568 : 1175, value ? 1568 : 1175, 0.12, 0.09);
        this._tone('sine', value ? 2093 : 1568, value ? 2093 : 1568, 0.18, 0.07, 0.06);
        break;
      case 'shortcut':
        [659, 880, 1109, 1319].forEach((f, i) => this._tone('triangle', f, f, 0.14, 0.1, i * 0.05));
        this._noise(0.4, 0.08, 'bandpass', 1200, 5000, 1.2);
        break;
      case 'medal':
        [784, 988, 1175, 1568].forEach((f, i) => this._tone('triangle', f, f, i === 3 ? 0.7 : 0.18, 0.12, i * 0.1));
        break;
      case 'unlock':
        [523, 784, 1046].forEach((f, i) => this._tone('square', f, f, 0.12, 0.06, i * 0.07));
        break;
      case 'record':
        [784, 988, 1175, 1568, 1976].forEach((f, i) => this._tone('square', f, f, 0.12, 0.07, 0.6 + i * 0.07));
        break;
      default:
        break;
    }
  }

  ui(kind) {
    if (!this.ready) return;
    if (kind === 'click') this._tone('triangle', 900, 1200, 0.05, 0.05);
    else if (kind === 'place') { this._tone('sine', 300, 600, 0.08, 0.12); this._noise(0.05, 0.05, 'bandpass', 2000, 2000, 2); }
    else if (kind === 'erase') this._noise(0.18, 0.12, 'bandpass', 2500, 400, 1.5);
    else if (kind === 'error') this._tone('square', 150, 120, 0.18, 0.08);
  }
}
