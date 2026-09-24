import { Mesh, CylinderGeometry, Group, Vector3 } from 'three';
import { createCarModel, updateWheels } from '../rendering/CarModel.js';
import { createToonMaterial } from '../rendering/materials.js';
import { addOutline } from '../rendering/outline.js';
import { getTheme } from '../tracks/themes.js';
import { resolveLook } from '../vehicles/garage.js';

const _look = new Vector3();
const THEME_FOR = { car: 'rooftop', boat: 'ocean', plane: 'sky' };

/**
 * Garage showroom: the current vehicle on a slowly spinning turntable
 * behind the garage menu. A "mode" like RaceSession (frame/fixedUpdate).
 */
export class Showroom {
  constructor(app) {
    this.app = app;
    this.group = new Group();
    this.group.name = 'showroom';
    this.angle = 0.6;
    this.time = 0;
    const plat = new Mesh(new CylinderGeometry(4.2, 4.6, 0.6, 36), createToonMaterial({ color: 0xfff3d0, name: 'turntable' }));
    plat.position.y = -0.85;
    addOutline(plat);
    const rim = new Mesh(new CylinderGeometry(4.7, 4.9, 0.3, 36), createToonMaterial({ color: 0x2c2838 }));
    rim.position.y = -1.1;
    this.group.add(plat, rim);
    app.stage.clearTrack();
    app.stage.trackGroup.add(this.group);
    this.kind = null;
    this.model = null;
  }

  /** Show `look` ({ kind, body, paint … } ids). */
  setLook(look) {
    if (this.kind !== look.kind) {
      this.kind = look.kind;
      const theme = getTheme(THEME_FOR[look.kind]);
      this.app.stage.setTheme(theme, 7);
    }
    if (this.model) this.group.remove(this.model);
    this.model = createCarModel({ look: resolveLook(look) });
    this.model.position.y = look.kind === 'plane' ? 0.9 : 0;
    this.group.add(this.model);
  }

  fixedUpdate() {}

  frame(dt) {
    this.time += dt;
    this.angle += dt * 0.45;
    const m = this.model;
    if (m) {
      m.rotation.y = this.angle;
      const u = m.userData;
      if (u.propeller) u.propeller.rotation.z += dt * 30;
      if (u.kind === 'boat') u.body.position.y = Math.sin(this.time * 2.3) * 0.05;
      if (u.wheels.length) {
        for (const w of u.wheels) w.spin = this.time * 3;
        updateWheels(m);
      }
    }
    const stage = this.app.stage;
    const cam = stage.renderer.camera;
    const portrait = stage.renderer.aspect < 1;
    const dist = this.kind === 'plane' ? 11 : 8;
    // The menu covers the right half (bottom in portrait): frame the vehicle beside it.
    cam.position.set(-dist * 0.35, portrait ? 6 : 2.6, dist * (portrait ? 1.3 : 1));
    cam.lookAt(_look.set(portrait ? 0 : 3.4, portrait ? -2.6 : 0.1, 0));
    stage.render(dt, { speedLines: 0 });
  }

  dispose() {
    this.app.stage.clearTrack();
  }
}
