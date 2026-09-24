import {
  Group, InstancedMesh, Mesh, Matrix4, Quaternion, Vector3, GridHelper, LineSegments, BufferGeometry,
  Float32BufferAttribute, LineBasicMaterial, Color,
} from 'three';
import { buildPieceGeometry, resolvePlacement } from '../tracks/TrackBuilder.js';
import { materialsFor } from '../rendering/TrackView.js';
import { createToonMaterial } from '../rendering/materials.js';
import { addOutline } from '../rendering/outline.js';
import { TILE, LEVEL } from '../tracks/constants.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

const NO_OUTLINE = new Set(['glow', 'signs']);

/**
 * Editor rendering: every placed piece is drawn with InstancedMeshes (one per
 * piece type × surface × material) so a 200-piece track still costs a few
 * dozen draw calls, and edits only rewrite instance matrices. Also owns the
 * level grid, the cursor cell and the placement preview.
 */
export class EditorView {
  constructor(stage) {
    this.stage = stage;
    this.group = new Group();
    this.group.name = 'editor';
    stage.trackGroup.add(this.group);
    this.pieceGroup = new Group();
    this.group.add(this.pieceGroup);
    this.geoCache = new Map();
    this.theme = null;

    this.grid = new GridHelper(600, 60, 0x141018, 0x141018);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.grid.material.depthWrite = false;
    this.grid.renderOrder = 3;
    this.group.add(this.grid);

    // Cursor: an inked square on the hovered cell.
    const h = TILE / 2;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-h, 0, -h, h, 0, -h, h, 0, -h, h, 0, h, h, 0, h, -h, 0, h, -h, 0, h, -h, 0, -h], 3));
    this.cursor = new LineSegments(g, new LineBasicMaterial({ color: 0xffd23f, depthTest: false }));
    this.cursor.renderOrder = 20;
    this.group.add(this.cursor);

    this.previewValid = createToonMaterial({ color: 0x7cff6b, opacity: 0.55, halftone: false, depthWrite: false });
    this.previewInvalid = createToonMaterial({ color: 0xff4d5a, opacity: 0.55, halftone: false, depthWrite: false });
    this.previewErase = createToonMaterial({ color: 0xff4d5a, opacity: 0.35, halftone: false, depthWrite: false });
    this.preview = new Group();
    this.preview.renderOrder = 10;
    this.group.add(this.preview);
    this.previewKey = null;
    this.eraseHighlight = new Group();
    this.group.add(this.eraseHighlight);
  }

  setTheme(theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    this.geoCache.clear();
    this.previewKey = null;
  }

  /** Geometries (per material) for one piece type/surface in local space. */
  pieceGeometries(type, surface) {
    const key = `${type}|${surface || ''}`;
    if (!this.geoCache.has(key)) {
      const set = buildPieceGeometry(type, { surface, palette: this.theme.palette });
      this.geoCache.set(key, set.entries().map(({ material, builder }) => ({ material, geometry: builder.toGeometry() })));
    }
    return this.geoCache.get(key);
  }

  static matrixFor(p, out = new Matrix4()) {
    _q.setFromAxisAngle(UP, ((p.r || 0) * Math.PI) / 2);
    _p.set(p.x * TILE, (p.y || 0) * LEVEL, p.z * TILE);
    return out.compose(_p, _q, _s);
  }

  /** Rebuild instanced meshes for the whole track. */
  setPieces(pieces) {
    for (const child of [...this.pieceGroup.children]) {
      this.pieceGroup.remove(child);
      child.dispose?.();
    }
    const mats = materialsFor(this.stage, this.theme);
    const groups = new Map();
    for (const p of pieces) {
      const key = `${p.t}|${p.s || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const [key, list] of groups) {
      const [type, surface] = key.split('|');
      for (const { material, geometry } of this.pieceGeometries(type, surface || null)) {
        const mesh = new InstancedMesh(geometry, mats[material] || mats.decor, list.length);
        list.forEach((p, i) => mesh.setMatrixAt(i, EditorView.matrixFor(p, _m)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.userData.sharedGeometry = true;
        if (!NO_OUTLINE.has(material)) {
          const hull = addOutline(mesh);
          if (hull) hull.userData.sharedGeometry = true;
        }
        this.pieceGroup.add(mesh);
      }
    }
  }

  /** Show the placement preview (or hide it with piece = null). */
  setPreview(piece, valid) {
    if (!piece) {
      this.preview.visible = false;
      return;
    }
    const key = `${piece.t}|${piece.s || ''}`;
    if (key !== this.previewKey) {
      this.preview.clear();
      for (const { geometry } of this.pieceGeometries(piece.t, piece.s || null)) {
        const m = new Mesh(geometry, this.previewValid);
        m.renderOrder = 10;
        this.preview.add(m);
      }
      this.previewKey = key;
    }
    const mat = valid ? this.previewValid : this.previewInvalid;
    for (const m of this.preview.children) m.material = mat;
    EditorView.matrixFor(piece, this.preview.matrix);
    this.preview.matrixAutoUpdate = false;
    this.preview.matrixWorldNeedsUpdate = true;
    this.preview.visible = true;
  }

  /** Red overlay on the piece the erase tool would remove. */
  setEraseHighlight(piece) {
    this.eraseHighlight.clear();
    if (!piece) return;
    for (const { geometry } of this.pieceGeometries(piece.t, piece.s || null)) {
      const m = new Mesh(geometry, this.previewErase);
      m.renderOrder = 11;
      m.scale.setScalar(1.02);
      this.eraseHighlight.add(m);
    }
    EditorView.matrixFor(piece, this.eraseHighlight.matrix);
    this.eraseHighlight.matrixAutoUpdate = false;
    this.eraseHighlight.matrixWorldNeedsUpdate = true;
  }

  setCursor(cell, level, visible = true) {
    this.cursor.visible = visible;
    if (!cell) return;
    this.cursor.position.set(cell[0] * TILE, level * LEVEL + 0.05, cell[1] * TILE);
  }

  /** Grid lines sit on cell borders at the current editing level. */
  setGrid(target, level) {
    const snap = (v) => Math.round(v / TILE) * TILE + TILE / 2;
    this.grid.position.set(snap(target.x), level * LEVEL + 0.02, snap(target.z));
  }

  dispose() {
    this.stage.trackGroup.remove(this.group);
    for (const { geometry } of [...this.geoCache.values()].flat()) geometry.dispose();
    this.geoCache.clear();
  }
}

export { resolvePlacement, Color };
