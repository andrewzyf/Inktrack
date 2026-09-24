import { PHYSICS } from '../config/physics.js';
import { Input } from '../input/Input.js';
import { GameLoop } from './GameLoop.js';
import { Renderer } from '../rendering/Renderer.js';
import { Stage } from '../rendering/Stage.js';
import { HUD } from '../ui/HUD.js';
import { ImpactLayer } from '../ui/Impact.js';
import { Menus } from '../ui/Menus.js';
import { RaceSession } from '../race/RaceSession.js';
import { Playground } from '../race/Playground.js';
import { STARTER_TRACKS } from '../tracks/starterTracks.js';
import { getTheme } from '../tracks/themes.js';
import { trackKey, getRecords, getBest, submitTime, saveGhost, loadGhost, clearRecords } from '../storage/records.js';
import { getSettings } from '../storage/settings.js';
import { readJSON } from '../storage/storage.js';
import { listCustomTracks } from '../storage/customTracks.js';
import { Editor } from '../editor/Editor.js';

/**
 * Top-level state machine. Owns the renderer, the shared Stage, input, the
 * fixed-step loop and the DOM UI layers, and swaps between modes:
 *   menu   — title/track select/records/settings over an autopilot attract race
 *   race   — a RaceSession (+ pause and results overlays)
 *   editor — the track editor (Phase 7)
 */
export class App {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.params = new URLSearchParams(location.search);
    const q = this.params.get('quality') || getSettings().quality;
    this.renderer = new Renderer(canvas, q === 'auto' ? undefined : q);
    this.stage = new Stage(this.renderer);
    this.input = new Input();
    this.hud = new HUD(uiRoot);
    this.impacts = new ImpactLayer(uiRoot);
    this.menus = new Menus(this, uiRoot);
    this.mode = null;
    this.modeName = null;
    this.paused = false;
    this.attractIndex = 0;
    this.loop = new GameLoop({
      tickRate: PHYSICS.tickRate,
      fixedUpdate: (dt) => {
        if (this.paused || !this.mode) return;
        this.mode.fixedUpdate(dt);
        // Verification hook: freeze at an exact race time (see scripts/verify-*.mjs).
        if (this.debugPauseAt != null && this.mode.race && this.mode.race.time >= this.debugPauseAt) {
          this.debugPauseAt = null;
          this.paused = true;
        }
      },
      frame: (dt, alpha) => {
        if (this.mode) this.mode.frame(this.paused ? 0 : dt, this.paused ? 1 : alpha);
      },
    });
    this.customTracks = () => listCustomTracks();
    this.input.onAction((action) => this.onAction(action));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.modeName === 'race' && this.mode?.race.state === 'racing') this.pause();
    });
  }

  start() {
    const p = this.params;
    if (p.has('playground')) {
      this.modeName = 'playground';
      this.setMode(new Playground({ stage: this.stage, input: this.input }));
    } else if (p.has('editor')) {
      this.openEditor();
    } else if (p.has('track') || p.has('autopilot')) {
      const ap = p.get('autopilot');
      this.startRace(p.get('track') || STARTER_TRACKS[0].id, { autopilot: p.has('autopilot'), aggression: ap ? parseFloat(ap) || 1 : 1 });
    } else {
      this.showMenu();
    }
    this.loop.start();
  }

  setMode(mode) {
    if (this.mode && this.mode.dispose) this.mode.dispose();
    this.mode = mode;
  }

  // ── tracks & records ────────────────────────────────────────────────
  /** Every raceable track (built-ins, then custom), with a stable `ref`. */
  listTracks() {
    const list = STARTER_TRACKS.map((t) => ({ ...t, ref: t.id, themeName: getTheme(t.theme).name }));
    for (const t of this.customTracks?.() || []) list.push({ ...t, ref: `custom:${t.id}`, themeName: getTheme(t.theme).name });
    return list;
  }

  resolveTrack(ref) {
    if (ref && typeof ref === 'object') return ref;
    return this.listTracks().find((t) => t.ref === ref) || this.listTracks()[0];
  }

  bestFor(track) {
    const key = trackKey(track);
    const best = getBest(key);
    return best ? { ...best, ghost: !!loadGhost(key) } : null;
  }

  recordsFor(track) {
    return getRecords(trackKey(track));
  }

  clearTrackRecords(ref) {
    clearRecords(trackKey(this.resolveTrack(ref)));
  }

  // ── modes ───────────────────────────────────────────────────────────
  showMenu(screen = 'title') {
    this.paused = false;
    this.inTestDrive = false;
    if (this.editorInstance) {
      if (this.mode !== this.editorInstance) this.editorInstance.dispose();
      this.editorInstance = null;
    }
    this.hud.show(false);
    this.impacts.clear();
    // Attract mode: the autopilot laps the built-in tracks behind the menus.
    const track = STARTER_TRACKS[this.attractIndex % STARTER_TRACKS.length];
    this.modeName = 'menu';
    this.setMode(null);
    this.setMode(new RaceSession(this, track, {
      autopilot: true,
      attract: true,
      onFinish: () => {
        this.attractIndex++;
        setTimeout(() => this.modeName === 'menu' && this.mode?.options.attract && this._nextAttract(), 1500);
      },
    }));
    this.menus.open(screen);
  }

  _nextAttract() {
    const screen = this.menus.current;
    const stack = this.menus.stack;
    const track = STARTER_TRACKS[this.attractIndex % STARTER_TRACKS.length];
    this.setMode(null);
    this.setMode(new RaceSession(this, track, { autopilot: true, attract: true, onFinish: () => { this.attractIndex++; setTimeout(() => this.modeName === 'menu' && this._nextAttract(), 1500); } }));
    this.menus.stack = stack;
    if (screen) this.menus.refresh();
  }

  startRace(ref, options = {}) {
    const track = this.resolveTrack(ref);
    this.paused = false;
    this.menus.hide();
    this.impacts.clear();
    const key = trackKey(track);
    const best = getBest(key);
    const ghost = getSettings().ghost && !options.attract ? loadGhost(key) : null;
    this.modeName = 'race';
    this.currentTrack = track;
    this.setMode(null);
    const session = new RaceSession(this, track, {
      ...options,
      bestTime: best?.time ?? null,
      bestSplits: ghost?.splits ?? best?.splits ?? null,
      ghost,
      onFinish: (e, s) => this._onFinish(e, s, track, key),
    });
    this.setMode(session);
    return session;
  }

  _onFinish(e, session, track, key) {
    if (session.options.autopilot && !this.params.has('record')) {
      // Autopilot demo runs don't pollute the leaderboard (unless ?record).
      setTimeout(() => this._showResults(track, { time: e.time, isBest: false, previousBest: null, rank: null, records: [] }), 1200);
      return;
    }
    const result = { ...submitTime(key, e.time, e.splits), time: e.time };
    if (result.isBest && session.recorder) {
      saveGhost(key, session.recorder.toGhost({ time: e.time, splits: e.splits, trackKey: key }));
    }
    this.lastResult = result;
    setTimeout(() => {
      if (this.mode === session) this._showResults(track, result);
    }, 1300);
  }

  _showResults(track, result) {
    const list = this.listTracks();
    const idx = list.findIndex((t) => t.ref === track.ref);
    const next = list[(idx + 1) % list.length];
    this.menus.open('results', {
      ...result,
      trackRef: track.ref,
      trackName: track.name,
      nextTrack: next && next.ref !== track.ref ? next.ref : null,
      testDrive: !!this.inTestDrive,
    });
  }

  restartRace() {
    if (this.modeName !== 'race' || !this.mode) return;
    // Re-create the session so a fresh best time/ghost is picked up.
    const { autopilot, aggression } = this.mode.options;
    if (this.mode.race.state === 'finished') this.startRace(this.currentTrack, { autopilot, aggression });
    else {
      this.menus.hide();
      this.paused = false;
      this.mode.restart();
    }
  }

  pause() {
    if (this.modeName !== 'race' || this.paused) return;
    if (this.mode.race.state === 'finished') return;
    this.paused = true;
    this.menus.open('pause');
  }

  resume() {
    if (!this.paused) return;
    this.menus.hide();
    this.paused = false;
    this.loop.last = performance.now();
  }

  // ── editor ──────────────────────────────────────────────────────────
  /** Open the editor on `track`, the saved draft, or a fresh track. */
  openEditor(track = null) {
    this.paused = false;
    this.menus.hide();
    this.hud.show(false);
    this.impacts.clear();
    const draft = readJSON('editor:draft');
    const t = track || (draft && Array.isArray(draft.pieces) && draft.pieces.length ? draft : { name: 'My Track', theme: 'rooftop', pieces: [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }] });
    this.setMode(null);
    this.modeName = 'editor';
    this.editorInstance = new Editor(this, t);
    this.setMode(this.editorInstance);
  }

  /** Race the editor's track right now; the editor waits in the background. */
  testDrive(editor) {
    editor.suspend();
    this.mode = null; // don't dispose the editor
    this.inTestDrive = true;
    this.editorInstance = editor;
    const data = editor.trackData();
    this.startRace({ ...data, ref: 'test-drive', builtIn: false }, { autopilot: this.params.has('autopilot') });
  }

  backToEditor() {
    if (!this.editorInstance) return this.openEditor();
    this.menus.hide();
    this.paused = false;
    this.inTestDrive = false;
    this.setMode(null); // disposes the race session
    this.modeName = 'editor';
    this.mode = this.editorInstance;
    this.editorInstance.resume();
  }

  onMenuAction(action) {
    if (action === 'back-to-editor') this.backToEditor();
  }

  onAction(action) {
    if (this.modeName === 'race') {
      if (action === 'pause') {
        if (this.paused) this.resume();
        else this.pause();
        return;
      }
      // With a menu open, Enter activates the focused button instead.
      if (this.paused || this.menus.visible) return;
      if (action === 'restart') return this.restartRace();
    }
    if (this.modeName === 'menu' || this.modeName === 'editor') return; // editor has its own keys
    if (this.mode && this.mode.onAction) this.mode.onAction(action);
  }
}
