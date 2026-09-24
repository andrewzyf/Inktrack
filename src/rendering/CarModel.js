import {
  Group, Mesh, InstancedMesh, Shape, ExtrudeGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
  Matrix4, Vector3, Quaternion, Euler,
} from 'three';
import { createToonMaterial, createOutlineMaterial } from './materials.js';
import { addOutline, computeOutlineNormals } from './outline.js';
import { GeoBuilder } from './GeoBuilder.js';

/**
 * Procedural vehicles, built from a "look" (see vehicles/garage.js):
 *   cars   — racer (low wedge + wing), muscle (long hood), buggy (roll cage)
 *   boats  — speedboat (V-hull runabout), hydro (twin-hull racer)
 *   planes — prop (stunt propeller plane), jet (swept wings, twin fins)
 * plus paint, accent colour, decals, spoilers and rims. Each variant merges
 * into one vertex-coloured body mesh (1 draw + 1 ink hull), cached by look.
 *
 * Vehicle space: +Z forward, +Y up, +X = driver's left. Origin = chassis
 * centre, `rideHeight` (0.55 m) above the road / water line.
 */

export const CAR_COLORS = {
  body: 0xe8343f,
  bodyAccent: 0xffd23f,
  glass: 0x243b6b,
  tyre: 0x2a2632,
  rim: 0xe9e6f2,
  light: 0xfff3a8,
  tail: 0xff3355,
  dark: 0x2c2838,
};

const DEFAULT_LOOK = { kind: 'car', body: 'racer', paint: CAR_COLORS.body, accent: CAR_COLORS.bodyAccent, decal: 'stripes', spoiler: 'wing', rims: CAR_COLORS.rim };

function extrudeProfile(points, width, bevel = 0.06) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // Shape XY → vehicle ZY, extrusion → vehicle X (centred).
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** A flat decal shape (x, z points) lying on a surface at height y. */
function flatShape(points, y, thickness = 0.03) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2); // shape XY → XZ, extrusion points down
  g.translate(0, y + thickness, 0);
  g.computeVertexNormals();
  return g;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

class Parts {
  constructor() {
    this.b = new GeoBuilder();
    this.lights = new GeoBuilder();
  }
  add(geom, color, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}, into = this.b) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    into.append(geom, _m, color);
  }
  box(w, h, d, x, y, z, color, rot) {
    this.add(new BoxGeometry(w, h, d), color, x, y, z, rot);
  }
  light(w, h, d, x, y, z, color) {
    this.add(new BoxGeometry(w, h, d), color, x, y, z, {}, this.lights);
  }
}

// ── decals ──────────────────────────────────────────────────────────────
/** `top` = surface height of the hood/deck at z; `z0..z1` its extent; `half` = half width. */
function addDecal(P, decal, look, { top, z0, z1, half, side = 0.99, sideY = 0 }) {
  const a = look.accent;
  const len = z1 - z0;
  if (decal === 'stripes') {
    P.box(0.22, 0.02, len, 0.2, top + 0.01, (z0 + z1) / 2, 0xffffff);
    P.box(0.22, 0.02, len, -0.2, top + 0.01, (z0 + z1) / 2, 0xffffff);
  } else if (decal === 'number') {
    for (const s of [-1, 1]) {
      P.add(new CylinderGeometry(0.36, 0.36, 0.03, 16), 0xffffff, s * side, sideY, (z0 + z1) / 2 - 0.2, { rz: Math.PI / 2 });
      // A chunky "7".
      P.box(0.03, 0.08, 0.34, s * (side + 0.02), sideY + 0.16, (z0 + z1) / 2 - 0.2, 0x141018);
      P.box(0.03, 0.34, 0.08, s * (side + 0.02), sideY - 0.02, (z0 + z1) / 2 - 0.1, 0x141018, { rx: 0.45 });
    }
    P.box(0.5, 0.02, 0.5, 0, top + 0.01, z1 - 0.45, 0xffffff);
  } else if (decal === 'flames') {
    for (const s of [-1, 1]) {
      const pts = [];
      const n = 4;
      for (let i = 0; i <= n; i++) pts.push([s * (0.05 + (i / n) * half * 0.9), z1 - 0.05]);
      for (let i = n; i >= 0; i--) {
        const x = s * (0.05 + (i / n) * half * 0.9);
        pts.push([x + s * 0.04, z1 - 0.25 - len * (0.3 + 0.35 * ((i % 2) ? 0.4 : 1)) * (1 - i / (n + 2))]);
      }
      P.add(flatShape(pts, top), 0xff8a1f);
      P.add(flatShape(pts.map(([x, z]) => [x * 0.7, z + (z1 - z) * 0.35]), top + 0.012), 0xffe066);
    }
  } else if (decal === 'checker') {
    const n = 4;
    const cw = (half * 1.4) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) continue;
      P.box(cw, 0.02, cw, -half * 0.7 + cw * (i + 0.5), top + 0.01, z1 - 0.15 - cw * (j + 0.5), 0x141018);
    }
  } else if (decal === 'stars') {
    const star = (r) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r;
        pts.push([Math.sin(ang) * rr, Math.cos(ang) * rr]);
      }
      return pts;
    };
    P.add(flatShape(star(0.32), top), a, 0, 0, (z0 + z1) / 2);
    for (const s of [-1, 1]) {
      const g = flatShape(star(0.22), 0);
      g.rotateZ(-s * Math.PI / 2);
      P.add(g, a, s * (side + 0.01), sideY, (z0 + z1) / 2 - 0.4);
    }
  }
}

// ── cars ────────────────────────────────────────────────────────────────
function spoiler(P, kind, look, zBack, yBase) {
  if (kind === 'none') return;
  if (kind === 'duck') {
    P.add(extrudeProfile([[zBack - 0.5, yBase], [zBack + 0.05, yBase], [zBack + 0.05, yBase + 0.18]], 1.8, 0.03), look.accent);
    return;
  }
  const big = kind === 'big';
  const h = big ? 0.62 : 0.36, w = big ? 2.1 : 1.9;
  P.box(w, 0.07, big ? 0.62 : 0.5, 0, yBase + h, zBack + 0.3, look.accent);
  for (const s of [-1, 1]) {
    P.box(0.08, h, 0.3, s * 0.62, yBase + h / 2, zBack + 0.34, CAR_COLORS.dark);
    P.box(0.12, 0.24 + (big ? 0.1 : 0), 0.64, s * (w / 2), yBase + h, zBack + 0.3, CAR_COLORS.dark);
  }
}

function buildRacer(P, look) {
  P.add(extrudeProfile([[-2.08, -0.3], [2.02, -0.3], [2.2, -0.14], [2.12, 0.0], [1.1, 0.14], [0.9, 0.2], [-1.35, 0.24], [-2.0, 0.22], [-2.18, 0.1]], 1.96), look.paint);
  P.add(extrudeProfile([[-1.5, 0.12], [0.98, 0.12], [0.2, 0.66], [-0.95, 0.68]], 1.46, 0.05), CAR_COLORS.glass);
  P.box(0.14, 0.1, 3.0, 1.0, -0.2, 0.0, CAR_COLORS.dark);
  P.box(0.14, 0.1, 3.0, -1.0, -0.2, 0.0, CAR_COLORS.dark);
  spoiler(P, look.spoiler, look, -2.2, 0.24);
  addDecal(P, look.decal, look, { top: 0.205, z0: 1.0, z1: 2.0, half: 0.9, side: 0.99, sideY: -0.05 });
  P.light(0.46, 0.12, 0.08, 0.6, -0.03, 2.1, CAR_COLORS.light);
  P.light(0.46, 0.12, 0.08, -0.6, -0.03, 2.1, CAR_COLORS.light);
  P.light(0.5, 0.12, 0.08, 0.6, 0.08, -2.19, CAR_COLORS.tail);
  P.light(0.5, 0.12, 0.08, -0.6, 0.08, -2.19, CAR_COLORS.tail);
}

function buildMuscle(P, look) {
  P.add(extrudeProfile([[-2.15, -0.32], [2.1, -0.32], [2.22, -0.1], [2.2, 0.2], [0.55, 0.3], [-1.6, 0.32], [-2.15, 0.28], [-2.22, 0.0]], 2.02), look.paint);
  P.add(extrudeProfile([[-1.45, 0.26], [0.5, 0.26], [0.0, 0.78], [-1.15, 0.8]], 1.6, 0.05), CAR_COLORS.glass);
  // Hood scoop, chrome bumpers, side pipes.
  P.box(0.6, 0.18, 0.8, 0, 0.36, 1.25, CAR_COLORS.dark);
  P.box(2.0, 0.14, 0.14, 0, -0.22, 2.2, 0xd9dfeb);
  P.box(2.0, 0.14, 0.14, 0, -0.22, -2.2, 0xd9dfeb);
  for (const s of [-1, 1]) P.add(new CylinderGeometry(0.08, 0.08, 1.8, 8), 0xd9dfeb, s * 1.05, -0.24, 0, { rx: Math.PI / 2 });
  spoiler(P, look.spoiler === 'wing' ? 'duck' : look.spoiler, look, -2.25, 0.3);
  addDecal(P, look.decal, look, { top: 0.3, z0: 0.6, z1: 2.1, half: 0.95, side: 1.02, sideY: -0.02 });
  P.light(0.4, 0.2, 0.08, 0.62, 0.02, 2.23, CAR_COLORS.light);
  P.light(0.4, 0.2, 0.08, -0.62, 0.02, 2.23, CAR_COLORS.light);
  P.light(0.7, 0.1, 0.08, 0.55, 0.12, -2.23, CAR_COLORS.tail);
  P.light(0.7, 0.1, 0.08, -0.55, 0.12, -2.23, CAR_COLORS.tail);
}

function buildBuggy(P, look) {
  // Open tub + roll cage + engine block at the back.
  P.add(extrudeProfile([[-1.7, -0.28], [1.6, -0.28], [2.05, 0.05], [1.8, 0.12], [-1.5, 0.12], [-1.8, 0.0]], 1.6), look.paint);
  P.box(1.3, 0.3, 1.0, 0, 0.25, -0.2, 0x141018); // seat well
  P.box(0.9, 0.45, 0.8, 0, 0.35, -1.3, CAR_COLORS.dark); // engine
  const bar = (x0, y0, z0, x1, y1, z1) => {
    const a = new Vector3(x0, y0, z0), b = new Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const g = new CylinderGeometry(0.06, 0.06, len, 6);
    const dir = b.clone().sub(a).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    _m.compose(a.clone().add(b).multiplyScalar(0.5), q, _s.set(1, 1, 1));
    P.b.append(g, _m, look.accent);
  };
  for (const s of [-1, 1]) {
    bar(s * 0.7, 0.12, 0.6, s * 0.6, 1.05, 0.1);
    bar(s * 0.7, 0.12, -0.9, s * 0.6, 1.05, -0.6);
    bar(s * 0.6, 1.05, 0.1, s * 0.6, 1.05, -0.6);
  }
  bar(0.6, 1.05, 0.1, -0.6, 1.05, 0.1);
  bar(0.6, 1.05, -0.6, -0.6, 1.05, -0.6);
  // Fenders.
  for (const [x, z] of [[1.0, 1.32], [-1.0, 1.32], [1.0, -1.28], [-1.0, -1.28]]) P.box(0.5, 0.06, 1.0, x, 0.32, z, CAR_COLORS.dark);
  if (look.spoiler !== 'none' && look.spoiler !== 'wing') spoiler(P, look.spoiler, look, -1.95, 0.2);
  addDecal(P, look.decal, look, { top: 0.12, z0: 0.7, z1: 1.8, half: 0.75, side: 0.81, sideY: -0.08 });
  P.light(0.3, 0.3, 0.1, 0.45, 0.5, 1.9, CAR_COLORS.light);
  P.light(0.3, 0.3, 0.1, -0.45, 0.5, 1.9, CAR_COLORS.light);
  P.light(0.3, 0.12, 0.08, 0.5, 0.05, -1.75, CAR_COLORS.tail);
  P.light(0.3, 0.12, 0.08, -0.5, 0.05, -1.75, CAR_COLORS.tail);
}

// ── boats ───────────────────────────────────────────────────────────────
function buildSpeedboat(P, look) {
  // Deck + V hull; the hull sits in the water (y < -0.35 is under the surface).
  P.add(extrudeProfile([[-2.3, -0.2], [1.2, -0.2], [2.5, 0.2], [2.35, 0.35], [-2.3, 0.35]], 2.0, 0.08), look.paint);
  P.add(extrudeProfile([[-2.2, -0.75], [1.0, -0.8], [2.45, 0.1], [1.2, -0.2], [-2.3, -0.2]], 1.4, 0.08), 0xffffff);
  P.box(2.02, 0.12, 4.4, 0, 0.1, 0.05, look.accent); // gunwale stripe
  P.add(extrudeProfile([[0.2, 0.35], [0.9, 0.35], [0.45, 0.85], [0.25, 0.85]], 1.7, 0.03), CAR_COLORS.glass); // windscreen
  P.box(1.5, 0.3, 1.3, 0, 0.5, -0.6, 0xf4e6c8); // seats
  P.box(0.6, 0.9, 0.7, 0, 0.3, -2.5, CAR_COLORS.dark); // outboard motor
  P.box(0.3, 0.9, 0.3, 0, -0.35, -2.6, CAR_COLORS.dark);
  addDecal(P, look.decal, look, { top: 0.36, z0: 1.0, z1: 2.1, half: 0.8, side: 1.01, sideY: 0.1 });
  P.light(0.3, 0.12, 0.08, 0.5, 0.4, 2.3, 0x7cff6b);
  P.light(0.3, 0.12, 0.08, -0.5, 0.4, 2.3, 0xff3355);
  P.light(0.4, 0.14, 0.08, 0, 0.8, -2.86, CAR_COLORS.tail);
}

function buildHydro(P, look) {
  for (const s of [-1, 1]) {
    P.add(extrudeProfile([[-2.2, -0.7], [1.6, -0.7], [2.6, -0.1], [2.5, 0.15], [-2.2, 0.15]], 0.7, 0.06), look.paint, s * 0.85, 0, 0);
  }
  P.box(1.1, 0.25, 3.6, 0, 0.05, -0.2, 0xffffff); // bridge deck
  P.add(extrudeProfile([[-0.9, 0.15], [0.6, 0.15], [0.1, 0.75], [-0.7, 0.75]], 0.9, 0.04), CAR_COLORS.glass);
  // Tail fin with accent.
  P.add(extrudeProfile([[-2.3, 0.15], [-1.6, 0.15], [-2.0, 1.4], [-2.4, 1.4]], 0.14, 0.02), look.accent);
  P.box(2.4, 0.08, 0.5, 0, 1.4, -2.2, look.accent);
  addDecal(P, look.decal, look, { top: 0.18, z0: 0.2, z1: 1.5, half: 0.5, side: 1.2, sideY: -0.2 });
  P.light(0.2, 0.12, 0.08, 0.85, 0.1, 2.5, 0x7cff6b);
  P.light(0.2, 0.12, 0.08, -0.85, 0.1, 2.5, 0xff3355);
}

// ── planes ──────────────────────────────────────────────────────────────
function buildProp(P, look) {
  const fus = new CylinderGeometry(0.45, 0.6, 4.2, 12);
  fus.rotateX(Math.PI / 2);
  P.add(fus, look.paint, 0, 0.1, 0.1);
  P.add(new ConeGeometry(0.45, 1.3, 12).rotateX(-Math.PI / 2), look.paint, 0, 0.1, -2.6);
  P.add(new SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), CAR_COLORS.glass, 0, 0.45, 0.3, { sz: 1.6 });
  P.box(7.4, 0.14, 1.3, 0, -0.05, 0.5, look.paint); // main wing
  for (const s of [-1, 1]) P.box(1.2, 0.16, 1.32, s * 3.2, -0.05, 0.5, look.accent); // wing tips
  P.box(2.6, 0.1, 0.8, 0, 0.15, -2.8, look.paint); // tailplane
  P.add(extrudeProfile([[-3.2, 0.2], [-2.4, 0.2], [-2.9, 1.3], [-3.3, 1.3]], 0.12, 0.02), look.accent);
  P.add(new CylinderGeometry(0.62, 0.62, 0.35, 12).rotateX(Math.PI / 2), CAR_COLORS.dark, 0, 0.1, 2.05); // cowling
  P.add(new ConeGeometry(0.22, 0.45, 10).rotateX(Math.PI / 2), look.accent, 0, 0.1, 2.4); // spinner
  addDecal(P, look.decal === 'stripes' ? 'stripes' : look.decal, look, { top: 0.03, z0: 0, z1: 1.1, half: 3.4, side: 0.62, sideY: 0.1 });
  P.light(0.2, 0.1, 0.2, 3.75, -0.05, 0.5, 0x7cff6b);
  P.light(0.2, 0.1, 0.2, -3.75, -0.05, 0.5, 0xff3355);
}

function buildJet(P, look) {
  const fus = new CylinderGeometry(0.45, 0.55, 4.6, 12);
  fus.rotateX(Math.PI / 2);
  P.add(fus, look.paint, 0, 0.1, -0.2);
  P.add(new ConeGeometry(0.45, 1.6, 12).rotateX(Math.PI / 2), look.paint, 0, 0.1, 2.9);
  P.add(new SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), CAR_COLORS.glass, 0, 0.45, 1.0, { sz: 2.2 });
  for (const s of [-1, 1]) {
    // Swept wing = a flat quad-ish prism.
    P.add(flatShape([[0, 0.8], [s * 3.4, -0.9], [s * 3.4, -1.5], [0, -1.2]], -0.05, 0.12), look.paint);
    P.add(flatShape([[s * 3.0, -0.6], [s * 3.4, -0.9], [s * 3.4, -1.5], [s * 3.0, -1.35]], -0.04, 0.14), look.accent);
    P.add(extrudeProfile([[-2.6, 0.3], [-1.8, 0.3], [-2.4, 1.4], [-2.8, 1.4]], 0.1, 0.02), look.accent, s * 0.45, 0, 0, { rz: s * 0.25 });
    P.add(flatShape([[s * 0.3, -2.0], [s * 1.6, -2.7], [s * 1.6, -3.0], [s * 0.3, -2.8]], 0.05, 0.08), look.paint);
  }
  P.add(new CylinderGeometry(0.4, 0.34, 0.5, 12).rotateX(Math.PI / 2), CAR_COLORS.dark, 0, 0.1, -2.7);
  addDecal(P, look.decal, look, { top: 0.07, z0: -0.6, z1: 0.4, half: 3, side: 0.55, sideY: 0.1 });
  P.light(0.5, 0.5, 0.1, 0, 0.1, -2.96, 0xffa53d);
}

const BUILDERS = { racer: buildRacer, muscle: buildMuscle, buggy: buildBuggy, speedboat: buildSpeedboat, hydro: buildHydro, prop: buildProp, jet: buildJet };

const cache = new Map();
function vehicleGeometry(look) {
  const key = JSON.stringify([look.body, look.paint, look.accent, look.decal, look.spoiler]);
  if (!cache.has(key)) {
    const P = new Parts();
    (BUILDERS[look.body] || buildRacer)(P, look);
    cache.set(key, { body: P.b.toGeometry(), lights: P.lights.toGeometry() });
  }
  return cache.get(key);
}

let wheelGeoCache = new Map();
function wheelGeometry(rimColor, big) {
  const key = `${rimColor}:${big}`;
  if (!wheelGeoCache.has(key)) {
    const m = new Matrix4();
    const r = big ? 0.46 : 0.37;
    const tyre = new CylinderGeometry(r, r, big ? 0.46 : 0.34, 14, 1);
    tyre.rotateZ(Math.PI / 2);
    const rim = new CylinderGeometry(r * 0.57, r * 0.57, big ? 0.48 : 0.36, 8, 1);
    rim.rotateZ(Math.PI / 2);
    const wheel = new GeoBuilder();
    wheel.append(tyre, m.identity(), CAR_COLORS.tyre);
    wheel.append(rim, m.identity(), rimColor);
    wheel.append(new BoxGeometry(big ? 0.5 : 0.38, 0.06, r * 0.8), m.identity(), CAR_COLORS.dark);
    wheelGeoCache.set(key, wheel.toGeometry());
  }
  return wheelGeoCache.get(key);
}

export const WHEEL_POSITIONS = [
  new Vector3(0.9, -0.18, 1.32),
  new Vector3(-0.9, -0.18, 1.32),
  new Vector3(0.9, -0.18, -1.28),
  new Vector3(-0.9, -0.18, -1.28),
];

let propGeo = null;
function propellerGeometry() {
  if (!propGeo) {
    const b = new GeoBuilder();
    const m = new Matrix4();
    b.append(new BoxGeometry(0.16, 2.4, 0.06), m.identity(), CAR_COLORS.dark);
    b.append(new BoxGeometry(0.18, 0.3, 0.07), m.makeTranslation(0, 1.05, 0), 0xffd23f);
    b.append(new BoxGeometry(0.18, 0.3, 0.07), m.makeTranslation(0, -1.05, 0), 0xffd23f);
    propGeo = b.toGeometry();
  }
  return propGeo;
}

const _wm = new Matrix4();
const _wq = new Quaternion();
const _wqs = new Quaternion();
const _wp = new Vector3();
const _one = new Vector3(1, 1, 1);
const _axisX = new Vector3(1, 0, 0);
const _axisY = new Vector3(0, 1, 0);

/**
 * Create a vehicle model: merged body mesh, emissive lights and (cars) the
 * four wheels as one InstancedMesh, (planes) a spinning propeller.
 * options.ghost → translucent flat-blue "ghost" variant (no halftone).
 */
export function createCarModel({ ghost = false, look = null, color = null, opacity = 0.42 } = {}) {
  const lk = { ...DEFAULT_LOOK, ...(look || {}) };
  if (color != null) lk.paint = color;
  const kind = lk.kind || 'car';
  const geo = vehicleGeometry(lk);
  const root = new Group();
  root.name = ghost ? 'ghostCar' : 'car';
  const body = new Group(); // squash/tilt pivot
  root.add(body);

  let bodyMat, lightMat, wheelMat, outlineMat;
  if (ghost) {
    const g = { transparent: true, opacity, halftone: false, depthWrite: true };
    bodyMat = createToonMaterial({ ...g, color: 0x7fd4ff, name: 'ghostBody' });
    lightMat = createToonMaterial({ ...g, color: 0xffffff, emissive: 0x777777 });
    wheelMat = createToonMaterial({ ...g, color: 0x2e5aa0 });
    outlineMat = createOutlineMaterial({ opacity: opacity * 0.9, color: 0x123a7a, depthWrite: false });
  } else {
    bodyMat = createToonMaterial({ vertexColors: true, shine: lk.chrome ? 1.6 : 1, name: 'carBody' });
    lightMat = createToonMaterial({ vertexColors: true, emissive: 0x555555, halftone: false });
    wheelMat = createToonMaterial({ vertexColors: true });
    outlineMat = createOutlineMaterial({ thickness: 1.15 });
  }

  const shared = (mesh, outline = true) => {
    mesh.userData.sharedGeometry = true; // cached across vehicles — never dispose
    if (outline) {
      const hull = addOutline(mesh, outlineMat);
      if (hull) hull.userData.sharedGeometry = true;
    }
    return mesh;
  };
  body.add(shared(new Mesh(geo.body, bodyMat)));
  body.add(shared(new Mesh(geo.lights, lightMat), false));

  let wheelMesh = null;
  let wheels = [];
  if (kind === 'car') {
    const big = lk.body === 'buggy';
    wheelMesh = new InstancedMesh(wheelGeometry(lk.rims, big), wheelMat, 4);
    wheelMesh.frustumCulled = false;
    shared(wheelMesh);
    if (wheelMesh.userData.outline) wheelMesh.userData.outline.frustumCulled = false;
    root.add(wheelMesh);
    wheels = WHEEL_POSITIONS.map((p, i) => ({ base: new Vector3(p.x * (big ? 1.08 : 1), p.y + (big ? 0.06 : 0), p.z), y: p.y + (big ? 0.06 : 0), steer: 0, spin: 0, front: i < 2, mirror: i % 2 === 1 }));
  }
  let propeller = null;
  if (kind === 'plane' && lk.body === 'prop') {
    propeller = shared(new Mesh(propellerGeometry(), wheelMat));
    propeller.position.set(0, 0.1, 2.3);
    body.add(propeller);
  }

  root.userData = { kind, body, wheels, wheelMesh, propeller, ghost, look: lk, materials: { bodyMat, outlineMat } };
  if (wheelMesh) updateWheels(root);
  return root;
}

/** Push wheel spin / steer / suspension into the wheel InstancedMesh. */
export function updateWheels(model) {
  const { wheels, wheelMesh } = model.userData;
  if (!wheelMesh) return;
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    _wq.setFromAxisAngle(_axisY, w.steer + (w.mirror ? Math.PI : 0));
    _wqs.setFromAxisAngle(_axisX, w.mirror ? -w.spin : w.spin);
    _wq.multiply(_wqs);
    _wp.set(w.base.x, w.y, w.base.z);
    wheelMesh.setMatrixAt(i, _wm.compose(_wp, _wq, _one));
  }
  wheelMesh.instanceMatrix.needsUpdate = true;
}

/** Set a ghost model's overall transparency (fades near the player). */
export function setGhostOpacity(model, opacity) {
  model.traverse((o) => {
    if (o.material && o.material.uniforms && o.material.uniforms.uOpacity) {
      o.material.uniforms.uOpacity.value = o.material.isOutline ? opacity * 0.9 : opacity;
    }
  });
}

export { computeOutlineNormals };
