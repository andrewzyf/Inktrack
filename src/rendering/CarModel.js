import {
  Group, Mesh, Shape, ExtrudeGeometry, BoxGeometry, CylinderGeometry, Matrix4, Vector3, Color,
} from 'three';
import { createToonMaterial, createOutlineMaterial } from './materials.js';
import { addOutline, computeOutlineNormals } from './outline.js';
import { GeoBuilder } from './GeoBuilder.js';

/**
 * Procedural arcade racer: a low, wedge-shaped body with a narrower glass
 * cabin, rear wing and chunky wheels — roughly the silhouette of a standard
 * arcade racing car. Built from ~1.2k triangles.
 *
 * Car space: +Z forward, +Y up, +X = driver's left. Origin = chassis centre,
 * which sits `rideHeight` (0.55 m) above the road.
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

function extrudeProfile(points, width, bevel = 0.06) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // Shape XY → car ZY, extrusion → car X (centred).
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

let cachedParts = null;

/** Build (once) and return the car's static geometries. */
function carParts() {
  if (cachedParts) return cachedParts;
  // Side profile (z, y) — nose at +Z.
  const body = extrudeProfile(
    [
      [-2.08, -0.3], [2.02, -0.3], [2.2, -0.14], [2.12, 0.0], [1.1, 0.14],
      [0.9, 0.2], [-1.35, 0.24], [-2.0, 0.22], [-2.18, 0.1],
    ],
    1.96,
  );
  const cabin = extrudeProfile(
    [[-1.5, 0.12], [0.98, 0.12], [0.2, 0.66], [-0.95, 0.68]],
    1.46,
    0.05,
  );

  // Accent parts merged into one "trim" mesh: side skirts, nose stripe, wing, lights.
  const trim = new GeoBuilder();
  const m = new Matrix4();
  const box = (w, h, d, x, y, z, color) => {
    const g = new BoxGeometry(w, h, d);
    trim.append(g, m.makeTranslation(x, y, z), color);
  };
  box(0.14, 0.1, 3.0, 1.0, -0.2, 0.0, CAR_COLORS.dark); // skirts
  box(0.14, 0.1, 3.0, -1.0, -0.2, 0.0, CAR_COLORS.dark);
  box(1.9, 0.07, 0.5, 0, 0.6, -1.88, CAR_COLORS.bodyAccent); // wing
  box(0.08, 0.36, 0.3, 0.62, 0.38, -1.84, CAR_COLORS.dark); // wing struts
  box(0.08, 0.36, 0.3, -0.62, 0.38, -1.84, CAR_COLORS.dark);
  box(0.12, 0.24, 0.62, 0.95, 0.62, -1.88, CAR_COLORS.dark); // wing endplates
  box(0.12, 0.24, 0.62, -0.95, 0.62, -1.88, CAR_COLORS.dark);
  const trimGeo = trim.toGeometry();

  const lights = new GeoBuilder();
  const lbox = (w, h, d, x, y, z, color) => lights.append(new BoxGeometry(w, h, d), m.makeTranslation(x, y, z), color);
  lbox(0.46, 0.12, 0.08, 0.6, -0.03, 2.1, CAR_COLORS.light);
  lbox(0.46, 0.12, 0.08, -0.6, -0.03, 2.1, CAR_COLORS.light);
  lbox(0.5, 0.12, 0.08, 0.6, 0.08, -2.19, CAR_COLORS.tail);
  lbox(0.5, 0.12, 0.08, -0.6, 0.08, -2.19, CAR_COLORS.tail);
  const lightGeo = lights.toGeometry();

  // Stripe decals on the hood + roof (slightly proud of the surface).
  const stripes = new GeoBuilder();
  const sbox = (w, h, d, x, y, z, rx = 0) => {
    m.makeRotationX(rx).setPosition(x, y, z);
    stripes.append(new BoxGeometry(w, h, d), m, 0xffffff);
  };
  sbox(0.22, 0.02, 1.05, 0.2, 0.215, 1.5, -0.06);
  sbox(0.22, 0.02, 1.05, -0.2, 0.215, 1.5, -0.06);
  const stripeGeo = stripes.toGeometry();

  // Wheel: tyre cylinder with a rim disc, axis along X.
  const tyre = new CylinderGeometry(0.37, 0.37, 0.34, 14, 1);
  tyre.rotateZ(Math.PI / 2);
  const rim = new CylinderGeometry(0.21, 0.21, 0.36, 8, 1);
  rim.rotateZ(Math.PI / 2);
  const wheel = new GeoBuilder();
  wheel.append(tyre, m.identity(), CAR_COLORS.tyre);
  wheel.append(rim, m.identity(), CAR_COLORS.rim);
  // A hub notch so spinning reads visually.
  wheel.append(new BoxGeometry(0.38, 0.06, 0.3), m.identity(), CAR_COLORS.dark);
  const wheelGeo = wheel.toGeometry();

  for (const g of [body, cabin]) computeOutlineNormals(g);
  cachedParts = { body, cabin, trimGeo, lightGeo, stripeGeo, wheelGeo };
  return cachedParts;
}

export const WHEEL_POSITIONS = [
  new Vector3(0.9, -0.18, 1.32),
  new Vector3(-0.9, -0.18, 1.32),
  new Vector3(0.9, -0.18, -1.28),
  new Vector3(-0.9, -0.18, -1.28),
];

/**
 * Create a car model.
 * options.ghost → translucent, flat-blue "ghost" variant (no halftone).
 * options.color → body colour override.
 */
export function createCarModel({ ghost = false, color = CAR_COLORS.body, opacity = 0.42 } = {}) {
  const parts = carParts();
  const root = new Group();
  root.name = ghost ? 'ghostCar' : 'car';
  const body = new Group(); // squash/tilt pivot
  root.add(body);

  let bodyMat, cabinMat, trimMat, lightMat, stripeMat, wheelMat, outlineMat;
  if (ghost) {
    const g = { transparent: true, opacity, halftone: false, depthWrite: true };
    bodyMat = createToonMaterial({ ...g, color: 0x7fd4ff, name: 'ghostBody' });
    cabinMat = createToonMaterial({ ...g, color: 0x3d78c9 });
    trimMat = createToonMaterial({ ...g, color: 0xbfe8ff, vertexColors: false });
    lightMat = createToonMaterial({ ...g, color: 0xffffff, emissive: 0x777777 });
    stripeMat = trimMat;
    wheelMat = createToonMaterial({ ...g, color: 0x2e5aa0 });
    outlineMat = createOutlineMaterial({ opacity: opacity * 0.9, color: 0x123a7a, depthWrite: false });
  } else {
    bodyMat = createToonMaterial({ color, shine: 1, name: 'carBody' });
    cabinMat = createToonMaterial({ color: CAR_COLORS.glass, shine: 1.5 });
    trimMat = createToonMaterial({ vertexColors: true });
    lightMat = createToonMaterial({ vertexColors: true, emissive: 0x555555, halftone: false });
    stripeMat = createToonMaterial({ vertexColors: true });
    wheelMat = createToonMaterial({ vertexColors: true });
    outlineMat = createOutlineMaterial({ thickness: 1.15 });
  }

  const mk = (geo, mat, outline = true) => {
    const mesh = new Mesh(geo, mat);
    if (outline) addOutline(mesh, outlineMat);
    return mesh;
  };
  body.add(mk(parts.body, bodyMat));
  body.add(mk(parts.cabin, cabinMat));
  body.add(mk(parts.trimGeo, trimMat));
  body.add(mk(parts.lightGeo, lightMat, false));
  if (!ghost) body.add(mk(parts.stripeGeo, stripeMat, false));

  const wheels = WHEEL_POSITIONS.map((p, i) => {
    const pivot = new Group(); // steering yaw
    pivot.position.copy(p);
    const spin = mk(parts.wheelGeo, wheelMat);
    if (i % 2 === 1) spin.rotation.y = Math.PI; // mirror rims to the outside
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, base: p.clone(), front: i < 2 };
  });

  root.userData = { body, wheels, ghost, materials: { bodyMat, outlineMat } };
  return root;
}

/** Set a ghost model's overall transparency (fades near the player). */
export function setGhostOpacity(model, opacity) {
  model.traverse((o) => {
    if (o.material && o.material.uniforms && o.material.uniforms.uOpacity) {
      o.material.uniforms.uOpacity.value = o.material.isOutline ? opacity * 0.9 : opacity;
    }
  });
}

export function carBodyColor(model) {
  return new Color().copy(model.userData.materials.bodyMat.uniforms.uColor.value);
}
