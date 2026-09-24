import { InstancedMesh, CylinderGeometry, SphereGeometry, BoxGeometry, Matrix4, Vector3, Quaternion, Color, Group } from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import { createToonMaterial } from './materials.js';
import { addOutline } from './outline.js';

/**
 * Ink pots: little bottles of comic ink that bob and spin along the track.
 * One InstancedMesh for all of them; a collected pot shrinks away. Pots
 * already found on an earlier run show as faded "empty" bottles.
 */

let potGeo = null;
function potGeometry() {
  if (!potGeo) {
    const b = new GeoBuilder();
    const m = new Matrix4();
    b.append(new SphereGeometry(0.62, 12, 8), m.makeScale(1, 0.9, 1), 0xffffff); // bottle (tinted per instance)
    b.append(new CylinderGeometry(0.26, 0.3, 0.45, 10), m.makeTranslation(0, 0.72, 0), 0xffffff);
    b.append(new BoxGeometry(0.62, 0.22, 0.62), m.makeTranslation(0, 1.02, 0), 0x2c2838); // cap
    b.append(new BoxGeometry(0.7, 0.34, 0.08), m.makeTranslation(0, 0.02, 0.58), 0xfff3d0); // label
    potGeo = b.toGeometry();
  }
  return potGeo;
}

const COLORS = [0x2f6fe0, 0xff3d7f, 0x3fcf5a, 0xffc928, 0x8f5bdc];
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

export class InkPots {
  constructor(pots, alreadyFound = new Set()) {
    this.pots = pots;
    this.found = alreadyFound;
    this.group = new Group();
    this.group.name = 'inkPots';
    this.time = 0;
    this.scale = pots.map(() => 1);
    this.taken = new Set();
    if (!pots.length) return;
    const mat = createToonMaterial({ vertexColors: true, shine: 0.8, name: 'inkPot' });
    this.mesh = new InstancedMesh(potGeometry(), mat, pots.length);
    this.mesh.userData.sharedGeometry = true;
    pots.forEach((p, i) => {
      _c.set(this.found.has(p.id) ? 0xb9c3d9 : p.shortcut != null ? 0xff9a2a : COLORS[i % COLORS.length]);
      this.mesh.setColorAt(i, _c);
    });
    this.mesh.frustumCulled = false;
    const hull = addOutline(this.mesh);
    if (hull) {
      hull.userData.sharedGeometry = true;
      hull.frustumCulled = false;
    }
    this.group.add(this.mesh);
    this.update(0);
  }

  reset() {
    this.taken.clear();
    this.scale.fill(1);
  }

  take(index) {
    this.taken.add(index);
  }

  update(dt) {
    if (!this.mesh) return;
    this.time += dt;
    for (let i = 0; i < this.pots.length; i++) {
      const p = this.pots[i];
      if (this.taken.has(i)) this.scale[i] = Math.max(0, this.scale[i] - dt * 6);
      const s = this.scale[i] * (this.found.has(p.id) ? 0.8 : 1);
      _q.setFromAxisAngle(_up, this.time * 2.4 + i);
      _p.copy(p.pos).addScaledVector(p.up, Math.sin(this.time * 3 + i) * 0.25 - 0.3);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(s, s, s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
