import { PHYSICS } from '../config/physics.js';
import { Input } from '../input/Input.js';
import { GameLoop } from './GameLoop.js';
import { Renderer } from '../rendering/Renderer.js';
import { Stage } from '../rendering/Stage.js';
import { HUD } from '../ui/HUD.js';
import { ImpactLayer } from '../ui/Impact.js';
import { RaceSession } from '../race/RaceSession.js';
import { Playground } from '../race/Playground.js';
import { getStarterTrack, STARTER_TRACKS } from '../tracks/starterTracks.js';

/**
 * Top-level state machine. Owns the renderer, the shared Stage, input, the
 * fixed-step loop and the DOM UI layers, and swaps between modes
 * (race, playground; menus and editor arrive in later phases).
 */
export class App {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.params = new URLSearchParams(location.search);
    this.renderer = new Renderer(canvas, this.params.get('quality') || undefined);
    this.stage = new Stage(this.renderer);
    this.input = new Input();
    this.hud = new HUD(uiRoot);
    this.impacts = new ImpactLayer(uiRoot);
    this.mode = null;
    this.paused = false;
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
    this.input.onAction((action) => this.onAction(action));
  }

  start() {
    if (this.params.has('playground')) this.setMode(new Playground({ stage: this.stage, input: this.input }));
    else this.startRace(this.params.get('track') || STARTER_TRACKS[0].id, { autopilot: this.params.has('autopilot') });
    this.loop.start();
  }

  setMode(mode) {
    if (this.mode && this.mode.dispose) this.mode.dispose();
    this.mode = mode;
  }

  startRace(trackOrId, options = {}) {
    const data = typeof trackOrId === 'string' ? getStarterTrack(trackOrId) || STARTER_TRACKS[0] : trackOrId;
    this.setMode(null);
    const session = new RaceSession(this, data, options);
    this.setMode(session);
    return session;
  }

  onAction(action) {
    if (this.mode && this.mode.onAction) this.mode.onAction(action);
  }
}
