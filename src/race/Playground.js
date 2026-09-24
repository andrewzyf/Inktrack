import {
  Vector3, Quaternion, Mesh, PlaneGeometry, IcosahedronGeometry, CylinderGeometry, BoxGeometry,
  TorusKnotGeometry, Matrix4,
} from 'three';
import { PHYSICS } from '../config/physics.js';
import { CollisionWorld, DRIVABLE, SURFACE } from '../physics/CollisionWorld.js';
import { CarPhysics } from '../physics/CarPhysics.js';
import { createPath, linePath, loopPath } from '../tracks/paths.js';
import { addRoadCollision, sweepRoadGeometry } from '../tracks/sweep.js';
import { GeoBuilder } from '../rendering/GeoBuilder.js';
import { createToonMaterial } from '../rendering/materials.js';
import { addOutline } from '../rendering/outline.js';
import { CarView } from '../rendering/CarView.js';
import { getTheme } from '../tracks/themes.js';

const V = (x, y, z) => new Vector3(x, y, z);

/**
 * Physics/visual playground: a flat plane with a boost pad, kicker ramp, loop,
 * walled corridor and an ice rink, plus cel-shaded props. Open with `?playground`.
 */
export class Playground {
  constructor({ stage, input }) {
    this.stage = stage;
    this.input = input;
    stage.setTheme(getTheme('rooftop'), 3);
    stage.clearTrack();

    const world = new CollisionWorld();
    const SIZE = 1000;
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), d = V(0, 0, 0);
    for (let x = -SIZE / 2; x < SIZE / 2; x += 20) {
      for (let z = -SIZE / 2; z < SIZE / 2; z += 20) {
        a.set(x, 0, z); b.set(x, 0, z + 20); c.set(x + 20, 0, z + 20); d.set(x + 20, 0, z);
        world.addTriangle(a, b, c, DRIVABLE);
        world.addTriangle(a, c, d, DRIVABLE);
      }
    }

    const features = [
      { path: linePath(V(0, 0.03, 20), V(0, 0.03, 30)), style: 'boost', surface: SURFACE.BOOST, walls: [false, false], slab: 0.1 },
      { path: linePath(V(0, 0.03, 50), V(0, 0.03, 60)), style: 'rooftop', walls: [false, false], width: 10, slab: 0.1 },
      { path: createPath((t, o) => o.set(0, 2.2 * t * t, 60 + t * 10)), style: 'rooftop', walls: [false, false], width: 10, samples: 16, capEnd: true, slab: 0.4 },
      { path: linePath(V(-40, 0.03, -40), V(-40, 0.03, 0)), style: 'rooftop' },
      { path: loopPath(V(-40, 0.03, 0), V(0, 0, 1), V(1, 0, 0), 9, 10), style: 'rooftop', samples: 96, guided: true, spacing: 1 },
      { path: linePath(V(-30, 0.03, 0), V(-30, 0.03, 60)), style: 'rooftop' },
      { path: linePath(V(40, 0.03, 0), V(40, 0.03, 250)), style: 'rooftop', width: 12 },
      { path: linePath(V(110, 0.03, 0), V(110, 0.03, 80)), style: 'ice', surface: SURFACE.ICE, walls: [false, false], width: 60, slab: 0.1 },
    ];
    const builders = {};
    for (const f of features) {
      addRoadCollision(world, f.path, { walls: f.walls ?? [true, true], width: f.width ?? 8.4, surface: f.surface ?? SURFACE.ROAD, samples: f.samples, guided: f.guided });
      const bld = (builders[f.style] ||= new GeoBuilder());
      sweepRoadGeometry(bld, f.path, { walls: f.walls ?? [true, true], width: f.width ?? 8.4, samples: f.samples, spacing: f.spacing ?? 2, slab: f.slab ?? 0.7, capEnd: f.capEnd, palette: stage.theme.palette });
    }
    world.build();
    this.world = world;

    for (const [style, bld] of Object.entries(builders)) {
      const mesh = new Mesh(bld.toGeometry(), createToonMaterial({ vertexColors: true, map: stage.roadTexture(style) }));
      addOutline(mesh);
      stage.trackGroup.add(mesh);
    }

    // Ground + props that show off the three-band shading and halftone.
    const ground = new Mesh(new PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), createToonMaterial({ color: 0x6d5a9c }));
    stage.trackGroup.add(ground);
    const props = new GeoBuilder();
    const m = new Matrix4();
    const colors = [0xff4d5a, 0xffd23f, 0x4dd6ff, 0x7cf07c, 0xff8a3d, 0xc58cff];
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      const r = 70 + (i % 3) * 12;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const kind = i % 3;
      const col = colors[i % colors.length];
      if (kind === 0) props.append(new IcosahedronGeometry(3, 2), m.makeTranslation(x, 3, z), col);
      else if (kind === 1) props.append(new CylinderGeometry(2, 2.6, 8, 12), m.makeTranslation(x, 4, z), col);
      else props.append(new BoxGeometry(5, 7, 5), m.makeRotationY(ang).setPosition(x, 3.5, z), col);
    }
    props.append(new TorusKnotGeometry(4, 1.3, 90, 12), m.makeTranslation(0, 9, 120), 0xff4d5a);
    const propMesh = new Mesh(props.toGeometry(), createToonMaterial({ vertexColors: true }));
    addOutline(propMesh);
    stage.trackGroup.add(propMesh);

    this.car = new CarPhysics(world);
    this.view = new CarView({ scene: stage.trackGroup, world, particles: stage.particles, skids: stage.skids });
    this.view.setShadowTexture(stage.textures.shadow);
    this.spawn = { pos: V(0, PHYSICS.car.rideHeight, 0), quat: new Quaternion() };
    this.prevPos = new Vector3();
    this.prevQuat = new Quaternion();
    this.renderPos = new Vector3();
    this.renderQuat = new Quaternion();
    this.respawn();
    this.offAction = input.onAction((action) => {
      if (action === 'reset') this.respawn();
    });
  }

  respawn() {
    this.car.reset(this.spawn.pos, this.spawn.quat);
    this.prevPos.copy(this.car.position);
    this.prevQuat.copy(this.car.quaternion);
    this.view.reset();
    this.stage.chase.snap(this.car.position, this.car.quaternion);
  }

  fixedUpdate(dt) {
    const car = this.car;
    this.prevPos.copy(car.position);
    this.prevQuat.copy(car.quaternion);
    const controls = this.input.sample();
    car.step(dt, controls);
    this.view.setBraking(controls.brake > 0 && car.forwardSpeed > 5);
    for (const e of car.drainEvents()) {
      if (e.type === 'land') {
        this.view.impulse(Math.min(2.2, e.value * 0.09));
        this.view.landingPuff(car, car.position, e.value);
        this.stage.chase.addShake(Math.min(0.8, e.value * 0.03));
      } else if (e.type === 'wall') this.stage.chase.addShake(Math.min(0.6, e.value * 0.03));
    }
    if (car.position.y < -30 || car.flippedTime > 1.5) this.respawn();
  }

  frame(dt, alpha) {
    const car = this.car;
    this.renderPos.lerpVectors(this.prevPos, car.position, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, car.quaternion, alpha);
    this.view.update(dt, car, this.renderPos, this.renderQuat);
    this.stage.chase.update(dt, this.renderPos, this.renderQuat, { speed: car.speed, grounded: car.grounded, velocity: car.velocity, boosting: car.boosting });
    const speedN = Math.min(1, Math.abs(car.speed) / 60);
    const lines = car.boosting ? 1 : car.drifting ? 0.55 + speedN * 0.3 : Math.max(0, (speedN - 0.62) * 2.2);
    this.stage.render(dt, { speedLines: lines });
  }

  dispose() {
    this.offAction();
  }
}
