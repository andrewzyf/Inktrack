import { SONGS, SCALES } from './songs.js';

/**
 * Music engine: a small Web Audio sequencer that plays the arrangements in
 * `songs.js` — drums, bass, chords, arpeggios and a lead, with swing,
 * kick side-chain "pump", tempo-synced echo and a light reverb. Songs loop
 * through their sections and drop into a breakdown every third pass so a
 * long session doesn't feel like one bar on repeat.
 *
 * Drop-in files: put `menu.mp3`, `rooftop.ogg`, … in `assets/music/` and they
 * replace the synthesized song with the same name.
 */

const FILES = import.meta.glob('../../assets/music/*.{mp3,ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' });
const FILE_FOR = {};
for (const [path, url] of Object.entries(FILES)) FILE_FOR[path.split('/').pop().replace(/\.[^.]+$/, '')] = url;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
    // Buses: instruments → duck (kick side-chain) → out, plus echo + reverb sends.
    this.duck = ctx.createGain();
    this.duck.connect(this.out);
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    this.delay = ctx.createDelay(2);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2400;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delaySend.connect(this.delay);
    this.delay.connect(delayTone).connect(this.delayFb).connect(this.delay);
    delayTone.connect(this.out);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    this.reverbSend.connect(this.reverb).connect(this.out);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.song = null;
    this.songId = null;
    this.timer = null;
    this.audioEl = null;
  }

  _impulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /** Start `id` (fades from whatever was playing). `volume` 0..1. */
  play(id, volume) {
    if (id === this.songId) {
      this.setVolume(volume);
      return;
    }
    this.stop();
    this.songId = id;
    this.volume = volume;
    if (FILE_FOR[id]) {
      const el = (this.audioEl = new Audio(FILE_FOR[id]));
      el.loop = true;
      el.volume = Math.min(1, volume);
      el.play().catch(() => {});
      return;
    }
    const song = SONGS[id];
    if (!song) return;
    this.song = song;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(volume, t + 1.2);
    this.stepDur = 60 / song.bpm / 4;
    this.delay.delayTime.value = this.stepDur * 3; // dotted-8th echo
    this.nextTime = t + 0.1;
    this.step = 0;
    this.section = 0;
    this.barInSection = 0;
    this.bar = 0;
    this.pass = 0;
    this.lastLead = null;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.4);
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    this.song = null;
    this.songId = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.audioEl) this.audioEl.volume = Math.min(1, v);
    else if (this.song) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Muffle the music (pause menu) without stopping it. */
  setMuffled(on) {
    if (this.audioEl) this.audioEl.volume = Math.min(1, this.volume * (on ? 0.35 : 1));
    else if (this.song) this.out.gain.setTargetAtTime(this.volume * (on ? 0.35 : 1), this.ctx.currentTime, 0.15);
  }

  // ── sequencing ────────────────────────────────────────────────────────
  _schedule() {
    const now = this.ctx.currentTime;
    const horizon = now + 0.15;
    // Background tabs throttle timers: resync instead of bursting a backlog.
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05;
    while (this.song && this.nextTime < horizon) {
      const swing = this.step % 2 === 1 ? this.song.swing * this.stepDur : 0;
      this._playStep(this.nextTime + swing);
      this.nextTime += this.stepDur;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
        this.barInSection++;
        const sec = this.song.sections[this.section];
        if (this.barInSection >= sec.bars) {
          this.barInSection = 0;
          this.section++;
          if (this.section >= this.song.sections.length) {
            this.section = Math.min(1, this.song.sections.length - 1); // skip the intro when looping
            this.pass++;
          }
        }
      }
    }
  }

  _note(degree, octave = 0) {
    const s = SCALES[this.song.scale];
    const idx = degree;
    const o = Math.floor(idx / 7);
    const i = ((idx % 7) + 7) % 7;
    return this.song.root + s[i] + 12 * (o + octave);
  }

  _playStep(t) {
    const song = this.song;
    const sec = song.sections[this.section];
    const st = this.step;
    const chordDeg = song.chords[this.bar % song.chords.length] - 1;
    const breakdown = this.pass % 3 === 2 && this.barInSection < 4 && this.section > 0;
    const fill = this.barInSection === sec.bars - 1 && st >= 12;
    const hit = (pat) => pat && (pat[st] === 'x' || pat[st] === 'o');
    const ins = song.instruments;

    if (!breakdown && hit(sec.kick)) this._kick(t);
    if (hit(sec.snare) || (fill && st % 2 === 0 && !breakdown)) this._snare(t, fill ? 0.7 : 1);
    if (hit(sec.hat)) this._hat(t, st % 4 === 2 ? 1 : 0.6);
    if (ins.toms && hit(sec.tom)) this._tom(t, st);

    if (!breakdown && hit(sec.bass)) {
      const oct = sec.bass[st] === 'o' ? 0 : st % 4 === 3 ? 1 : 0;
      const n = sec.bass[st] === 'x' ? this._note(chordDeg + 4) : this._note(chordDeg, oct);
      this._inst(ins.bass, n, t, this.stepDur * 1.8, 1, this.duck);
    }
    if (hit(sec.chord)) {
      for (const k of [0, 2, 4, 6]) this._inst(ins.chord, this._note(chordDeg + k, 1), t, this.stepDur * (ins.chord === 'pad' ? 15 : 3), 0.55, this.duck);
    }
    if (ins.arp && hit(sec.arp)) {
      const pattern = [0, 2, 4, 7, 4, 2, 4, 6];
      this._inst(ins.arp, this._note(chordDeg + pattern[(this.bar * 16 + st) % pattern.length], 2), t, this.stepDur * 0.9, 0.5, this.dry, true);
    }
    if (sec.lead && !breakdown) {
      const v = sec.lead[st];
      if (typeof v === 'number') {
        // Second half of each section answers the first a third higher.
        const lift = this.barInSection % 8 >= 4 && this.bar % 2 === 1 ? 2 : 0;
        let len = 1;
        while (st + len < 16 && sec.lead[st + len] === '-') len++;
        this._inst(ins.lead, this._note(chordDeg + v + lift, 2), t, this.stepDur * len * 0.95, 0.8, this.dry, true);
      }
    }
  }

  // ── instruments ───────────────────────────────────────────────────────
  _env(g, t, peak, attack, dur, release = 0.08) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  }

  _osc(type, freq, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.2);
    return o;
  }

  _inst(kind, midi, t, dur, vel, bus, send = false) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    g.connect(bus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = 0.6;
      g.connect(s);
      s.connect(this.delaySend);
      s.connect(this.reverbSend);
    } else g.connect(this.reverbSend);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.connect(g);
    const end = t + dur;
    switch (kind) {
      case 'saw':
        lp.frequency.setValueAtTime(1400, t);
        lp.frequency.exponentialRampToValueAtTime(260, t + dur);
        this._osc('sawtooth', f, t, end, lp);
        this._osc('sine', f / 2, t, end, lp);
        this._env(g, t, 0.16 * vel, 0.005, dur);
        break;
      case 'round':
        lp.frequency.value = 900;
        this._osc('triangle', f, t, end, lp);
        this._osc('sine', f / 2, t, end, lp);
        this._env(g, t, 0.3 * vel, 0.01, dur);
        break;
      case 'square':
        lp.frequency.value = 1100;
        this._osc('square', f, t, end, lp);
        this._env(g, t, 0.1 * vel, 0.005, dur);
        break;
      case 'pick':
        lp.frequency.setValueAtTime(1600, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
        this._osc('sawtooth', f, t, end, lp);
        this._env(g, t, 0.16 * vel, 0.004, Math.min(dur, 0.3));
        break;
      case 'pad':
        lp.frequency.value = 1500;
        for (const d of [-9, 0, 9]) this._osc('sawtooth', f, t, end, lp, d);
        this._env(g, t, 0.025 * vel, 0.12, dur, 0.4);
        break;
      case 'ep':
        lp.frequency.value = 2600;
        this._osc('sine', f, t, end, lp);
        this._osc('triangle', f * 2, t, end, lp);
        this._env(g, t, 0.05 * vel, 0.01, Math.min(dur, 0.9), 0.3);
        break;
      case 'pluck':
        lp.frequency.setValueAtTime(3200, t);
        lp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
        this._osc('square', f, t, end, lp);
        this._env(g, t, 0.045 * vel, 0.003, Math.min(dur, 0.2), 0.06);
        break;
      case 'marimba':
        lp.frequency.value = 4000;
        this._osc('sine', f, t, end, lp);
        this._osc('sine', f * 4, t, t + 0.06, lp);
        this._env(g, t, 0.09 * vel, 0.003, Math.min(dur, 0.25), 0.1);
        break;
      case 'glass':
        lp.frequency.value = 5000;
        this._osc('sine', f, t, end, lp);
        this._osc('sine', f * 2, t, end, lp);
        this._env(g, t, 0.035 * vel, 0.01, Math.min(dur, 0.6), 0.25);
        break;
      case 'twang':
        lp.frequency.setValueAtTime(2800, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
        this._osc('sawtooth', f, t, end, lp);
        this._osc('square', f * 1.003, t, end, lp);
        this._env(g, t, 0.05 * vel, 0.004, Math.min(dur, 0.4), 0.1);
        break;
      case 'bell':
        lp.frequency.value = 6000;
        this._osc('sine', f, t, end, lp);
        this._osc('sine', f * 2.76, t, t + 0.3, lp);
        this._env(g, t, 0.06 * vel, 0.004, Math.min(dur, 0.9), 0.35);
        break;
      case 'chip':
        lp.frequency.value = 4000;
        this._osc('square', f, t, end, lp);
        this._env(g, t, 0.04 * vel, 0.003, dur, 0.03);
        break;
      case 'flute': {
        lp.frequency.value = 3000;
        const o = this._osc('sine', f, t, end, lp);
        const vib = this.ctx.createOscillator();
        const vg = this.ctx.createGain();
        vib.frequency.value = 5.5;
        vg.gain.value = f * 0.012;
        vib.connect(vg).connect(o.frequency);
        vib.start(t);
        vib.stop(end + 0.2);
        this._env(g, t, 0.08 * vel, 0.04, dur, 0.1);
        break;
      }
      default: // 'square' lead
        lp.frequency.value = 2600;
        this._osc('square', f, t, end, lp);
        this._osc('sawtooth', f * 1.005, t, end, lp);
        this._env(g, t, 0.035 * vel, 0.01, dur, 0.06);
    }
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + 0.35);
    // Side-chain pump on bass/chords.
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.45, t);
    this.duck.gain.linearRampToValueAtTime(1, t + this.stepDur * 2.5);
  }

  _noiseHit(t, dur, vol, type, freq, q = 1, dest = this.dry) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
    return g;
  }

  _snare(t, vel) {
    const g = this._noiseHit(t, 0.18, 0.28 * vel, 'bandpass', 1900, 0.8);
    g.connect(this.reverbSend);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    og.gain.setValueAtTime(0.18 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(this.dry);
    o.start(t);
    o.stop(t + 0.12);
  }

  _hat(t, vel) {
    this._noiseHit(t, 0.045, 0.09 * vel, 'highpass', 7500, 0.7);
  }

  _tom(t, step) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f0 = [180, 150, 120, 100][step % 4];
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.2);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.dry);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.3);
  }
}
