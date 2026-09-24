import { Vector3, Quaternion } from 'three';
import { buildTrack } from '../tracks/TrackBuilder.js';
import { decoratorFor } from '../tracks/decor.js';
import { getTheme } from '../tracks/themes.js';
import { createTrackMeshes } from '../rendering/TrackView.js';
import { CarView } from '../rendering/CarView.js';
import { Race } from './Race.js';
import { Autopilot } from './Autopilot.js';
import { hashString } from '../core/random.js';

const _look = new Vector3();

/**
 * A playable race on one track: builds the world, runs the Race rules on the
 * fixed tick, renders the car/effects/camera, and drives HUD + impact FX.
 * `options.autopilot` lets the AI drive (attract mode, tests).
 */
export class RaceSession {
  constructor(app, trackData, options = {}) {
    this.app = app;
    this.trackData = trackData;
    this.options = options;
    const theme = (this.theme = getTheme(trackData.theme));
    const stage = app.stage;
    const seed = hashString(trackData.id || trackData.name || 'custom');
    this.build = buildTrack(trackData, { palette: theme.palette, decorate: decoratorFor(theme.id, String(seed)) });
    stage.setTheme(theme, seed % 997);
    stage.clearTrack();
    this.meshes = createTrackMeshes(this.build, stage, theme);
    stage.trackGroup.add(this.meshes);

    this.race = new Race(this.build);
    this.car = this.race.car;
    this.view = new CarView({ scene: stage.trackGroup, world: this.build.world, particles: stage.particles, skids: stage.skids });
    this.view.setShadowTexture(stage.textures.shadow);
    this.autopilot = options.autopilot ? new Autopilot(this.build.route) : null;
    if (this.autopilot) this.autopilot.attach(this.car);

    this.renderPos = new Vector3();
    this.renderQuat = new Quaternion();
    this.carEvents = [];
    this.raceEvents = [];
    this.fallCam = null;
    this.bestTime = options.bestTime ?? null;
    this.bestSplits = options.bestSplits ?? null;

    if (!options.attract) {
      app.hud.show(true);
      app.hud.setBest(this.bestTime);
    }
    stage.chase.world = this.build.world;
    stage.chase.snap(this.car.position, this.car.quaternion);
  }

  get impacts() {
    return this.options.attract ? null : this.app.impacts;
  }

  restart() {
    this.race.restart();
    this.view.reset();
    this.app.stage.particles.clear();
    this.fallCam = null;
    if (this.autopilot) this.autopilot.relocate();
    this.app.stage.chase.snap(this.car.position, this.car.quaternion);
    this.impacts?.clear();
  }

  onAction(action) {
    if (action === 'reset') {
      if (this.race.state === 'racing') this._respawnNow('manual');
      else if (this.race.state === 'countdown') this.restart();
    } else if (action === 'restart') this.restart();
  }

  _respawnNow(reason) {
    this.race.respawn(reason);
  }

  fixedUpdate(dt) {
    const controls = this.autopilot ? this.autopilot.sample(this.app.input.controls) : this.app.input.sample();
    this.race.step(dt, controls);
    this.view.setBraking(controls.brake > 0 && this.car.forwardSpeed > 5);
    this.car.drainEvents(this.carEvents);
    this.race.drainEvents(this.raceEvents);
  }

  _handleEvents() {
    const fx = this.impacts;
    const chase = this.app.stage.chase;
    for (const e of this.carEvents) {
      switch (e.type) {
        case 'land':
          this.view.impulse(Math.min(2.4, e.value * 0.09));
          if (e.value > 9) this.view.landingPuff(this.car, this.car.position, e.value);
          chase.addShake(Math.min(0.8, e.value * 0.03));
          if (e.value > 16) fx?.show(pickWord(['WHAM!', 'THUD!', 'KA-BOOM!']), 'crash', { y: 0.62, size: 9 });
          break;
        case 'wall':
          chase.addShake(Math.min(0.7, e.value * 0.035));
          if (e.value > 16) fx?.show(pickWord(['BONK!', 'CRUNCH!', 'KRAK!']), 'crash', { y: 0.55, x: 0.5 + (Math.random() - 0.5) * 0.3, size: 9 });
          break;
        case 'boostPad':
          fx?.show('ZOOM!', 'boost', { y: 0.6, size: 10 });
          break;
        case 'driftBoost':
          fx?.show(e.value > 0.85 ? 'VROOOM!' : e.value > 0.5 ? 'VROOM!' : 'VRM!', 'driftBoost', { y: 0.6, size: 8 + e.value * 4 });
          break;
        case 'driftStart':
          break;
        case 'airtime':
          if (e.value > 1.2) fx?.show('AIR!', 'drift', { y: 0.3, size: 8, sub: `${e.value.toFixed(1)}s` });
          break;
      }
    }
    this.carEvents.length = 0;
    for (const e of this.raceEvents) this.onRaceEvent(e);
    this.raceEvents.length = 0;
  }

  onRaceEvent(e) {
    const fx = this.impacts;
    switch (e.type) {
      case 'countdown':
        fx?.show(String(e.n), 'count', { size: 16, duration: 480, rotate: 0 });
        break;
      case 'go':
        fx?.show('GO!', 'go', { size: 17, duration: 700, rotate: -4 });
        break;
      case 'checkpoint': {
        const best = this.bestSplits?.[e.index];
        const delta = best != null ? e.time - best : null;
        this.app.hud.flashDelta(delta);
        fx?.show('CHECK!', 'checkpoint', { y: 0.26, size: 9, sub: `${e.index + 1}/${this.race.checkpointCount}` });
        break;
      }
      case 'missed':
        fx?.show('MISSED!', 'crash', { size: 12, sub: 'checkpoint' });
        break;
      case 'fail':
        if (e.reason === 'fall') {
          fx?.show(pickWord(['SPLAT!', 'WHOOPS!', 'YIKES!']), 'fall', { size: 13 });
          this.fallCam = this.app.stage.renderer.camera.position.clone();
        } else if (e.reason === 'flip') fx?.show('KRASH!', 'crash', { size: 13 });
        break;
      case 'respawn':
        this.fallCam = null;
        this.view.reset();
        if (this.autopilot) this.autopilot.relocate();
        this.app.stage.chase.snap(this.car.position, this.car.quaternion);
        break;
      case 'finish':
        fx?.show('FINISH!', 'finish', { size: 15, duration: 1400 });
        this.options.onFinish?.(e, this);
        break;
    }
  }

  frame(dt, alpha) {
    this._handleEvents();
    const car = this.car;
    const race = this.race;
    this.renderPos.lerpVectors(race.prevPos, car.position, alpha);
    this.renderQuat.slerpQuaternions(race.prevQuat, car.quaternion, alpha);
    this.view.update(dt, car, this.renderPos, this.renderQuat);

    const stage = this.app.stage;
    if (this.fallCam) {
      // Falling off: freeze the camera and watch the car tumble away.
      const cam = stage.renderer.camera;
      cam.position.copy(this.fallCam);
      cam.lookAt(_look.copy(this.renderPos));
    } else {
      stage.chase.update(dt, this.renderPos, this.renderQuat, { speed: car.speed, grounded: car.grounded, velocity: car.velocity, boosting: car.boosting });
    }
    const speedN = Math.min(1, Math.abs(car.speed) / 60);
    const lines = car.boosting ? 1 : car.drifting ? 0.45 + speedN * 0.35 : Math.max(0, (speedN - 0.6) * 2.2);
    stage.render(dt, { speedLines: race.state === 'racing' ? lines : 0 });

    if (!this.options.attract) {
      this.app.hud.update({
        time: race.time,
        checkpoint: race.nextCheckpoint,
        checkpoints: race.checkpointCount,
        speed: car.speed,
        meter: car.drifting ? car.driftMeter : car.boosting ? 1 : 0,
        drifting: car.drifting,
        boosting: car.boosting,
      });
    }
  }

  dispose() {
    this.app.stage.chase.world = null;
    this.app.stage.clearTrack();
    this.app.hud.show(false);
    this.impacts?.clear();
  }
}

function pickWord(list) {
  return list[Math.floor(Math.random() * list.length)];
}
