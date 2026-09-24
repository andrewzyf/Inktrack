import { BufferAttribute, Mesh, InstancedMesh } from 'three';
import { getDefaultOutlineMaterial, renderSettings } from './materials.js';

/**
 * Inverted-hull outlines.
 *
 * Why not a Sobel edge pass? A screen-space edge detector needs a depth +
 * normal pre-pass (≈2× draw calls) *and* a full-screen 9-tap filter at native
 * resolution — expensive fill-rate/bandwidth on tile-based phone GPUs, and it
 * forces rendering to an offscreen target (losing cheap MSAA). The hull costs
 * one extra, trivially-shaded draw per mesh, keeps native MSAA, and gives
 * bold, even silhouettes that read as ink. Trade-off: no interior crease
 * lines, so creases that matter (road edges, panel lines) are painted into
 * the geometry/textures instead.
 */

/**
 * Store per-vertex normals averaged over all vertices sharing a position, so
 * hard-edged geometry (boxes, extrusions) extrudes into a closed hull
 * instead of cracking open at the corners.
 */
export function computeOutlineNormals(geometry, precision = 1e3) {
  if (geometry.getAttribute('outlineNormal')) return geometry;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const sums = new Map();
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * precision)},${Math.round(pos.getY(i) * precision)},${Math.round(pos.getZ(i) * precision)}`;
    keys[i] = key;
    let s = sums.get(key);
    if (!s) sums.set(key, (s = [0, 0, 0]));
    s[0] += nrm.getX(i);
    s[1] += nrm.getY(i);
    s[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(keys[i]);
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / len;
    out[i * 3 + 1] = s[1] / len;
    out[i * 3 + 2] = s[2] / len;
  }
  geometry.setAttribute('outlineNormal', new BufferAttribute(out, 3));
  return geometry;
}

/** Attach an ink hull to `mesh` (as a child, so it inherits every transform). */
export function addOutline(mesh, material = null) {
  if (!renderSettings.outlines) return null;
  computeOutlineNormals(mesh.geometry);
  const mat = material || getDefaultOutlineMaterial();
  let hull;
  if (mesh.isInstancedMesh) {
    hull = new InstancedMesh(mesh.geometry, mat, mesh.count);
    hull.instanceMatrix = mesh.instanceMatrix;
    hull.count = mesh.count;
  } else {
    hull = new Mesh(mesh.geometry, mat);
  }
  hull.name = 'outline';
  hull.renderOrder = (mesh.renderOrder || 0) + 1; // after the fill → early-z rejects hidden hull
  hull.frustumCulled = mesh.frustumCulled;
  hull.matrixAutoUpdate = false;
  hull.castShadow = hull.receiveShadow = false;
  mesh.add(hull);
  mesh.userData.outline = hull;
  return hull;
}
