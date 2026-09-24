import { Vector3, Vector2, Plane, Raycaster, MathUtils } from 'three';
import { EditorView } from './EditorView.js';
import { EditorUI } from './EditorUI.js';
import { getTheme } from '../tracks/themes.js';
import { PIECES, PIECE_ORDER } from '../tracks/pieces.js';
import { TILE, LEVEL } from '../tracks/constants.js';
import { resolvePlacement, buildOccupancy, traverse, buildTrack, edgeKey } from '../tracks/TrackBuilder.js';
import { candidateAt, pieceAt, MIN_LEVEL, MAX_LEVEL } from './placement.js';
import { fitFov } from '../rendering/ChaseCamera.js';

const _ray = new Raycaster();
const _ndc = new Vector2();
const _plane = new Plane(new Vector3(0, 1, 0), 0);
const _hit = new Vector3();

export const PALETTE = PIECE_ORDER;

/**
 * Track editor mode. Place pieces on a grid (tap/click), rotate, change
 * level, paint ice, erase, undo/redo, save/load/export, and test-drive the
 * track instantly. New pieces auto-snap onto an open road end when you hover
 * next to one, so building on a phone is mostly "tap, tap, tap".
 */
export class Editor {
  constructor(app, track) {
    this.app = app;
    this.stage = app.stage;
    this.track = { id: track.id, name: track.name || 'My Track', theme: track.theme || 'rooftop', pieces: track.pieces.map((p) => ({ ...p })) };
    this.dirty = !!track.dirty;
    this.undoStack = [];
    this.redoStack = [];
    this.tool = 'place';
    this.selected = 'straight';
    this.rotation = 0;
    this.level = 0;
    this.ice = false;
    this.snap = true;
    this.manualRotation = false;
    this.hoverCell = null;
    this.candidate = null;

    // Camera rig.
    this.target = new Vector3(0, 0, 20);
    this.distance = 95;
    this.yaw = Math.PI; // looking toward +Z
    this.pitch = 0.95;
    this.camera = app.renderer.camera;

    this.view = new EditorView(this.stage);
    this.stage.clearTrack();
    this.stage.trackGroup.add(this.view.group);
    this.applyTheme();
    this.ui = new EditorUI(this, app.uiRoot);
    this.rebuild();
    const start = this.track.pieces.find((p) => p.t === 'start');
    if (start) this.target.set(start.x * TILE, 0, start.z * TILE + 20);
    this._bindInput();
  }

  // ── state ─────────────────────────────────────────────────────────────
  applyTheme() {
    const theme = getTheme(this.track.theme);
    this.stage.setTheme(theme, 7);
    this.view.setTheme(theme);
  }

  setTheme(id) {
    this.snapshot();
    this.track.theme = id;
    this.applyTheme();
    this.rebuild();
  }

  setName(name) {
    this.track.name = String(name).slice(0, 40);
    this.dirty = true;
  }

  snapshot() {
    this.undoStack.push(JSON.stringify(this.track));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.track));
    this._restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.track));
    this._restore(this.redoStack.pop());
  }

  _restore(json) {
    const t = JSON.parse(json);
    const themeChanged = t.theme !== this.track.theme;
    this.track = t;
    if (themeChanged) this.applyTheme();
    this.dirty = true;
    this.rebuild();
  }

  loadTrack(track, { keepHistory = false } = {}) {
    if (keepHistory) this.snapshot();
    else { this.undoStack = []; this.redoStack = []; }
    this.track = { id: track.id, name: track.name, theme: track.theme || 'rooftop', pieces: track.pieces.map((p) => ({ ...p })) };
    this.dirty = false;
    this.applyTheme();
    this.rebuild();
    const start = this.track.pieces.find((p) => p.t === 'start');
    if (start) this.target.set(start.x * TILE, start.y * LEVEL, start.z * TILE + 20);
  }

  clear() {
    this.snapshot();
    this.track.pieces = [{ t: 'start', x: 0, y: 0, z: 0, r: 0 }];
    this.rebuild();
  }

  /** Re-render pieces and refresh the analysis (order, checkpoints, errors). */
  rebuild() {
    this.resolved = this.track.pieces.map((p, i) => resolvePlacement(p, i));
    this.occupancy = buildOccupancy(this.resolved);
    this.order = traverse(this.resolved);
    this.view.setPieces(this.track.pieces);
    const connected = new Set(this.order.map((o) => o.rp.index));
    const cps = this.order.filter((o) => o.rp.type === 'checkpoint');
    this.stats = {
      pieces: this.track.pieces.length,
      hasStart: this.track.pieces.some((p) => p.t === 'start'),
      hasFinish: this.track.pieces.some((p) => p.t === 'finish'),
      finishConnected: this.order.some((o) => o.rp.type === 'finish'),
      checkpoints: this.track.pieces.filter((p) => p.t === 'checkpoint').length,
      connectedCheckpoints: cps.length,
      disconnected: this.track.pieces.length - connected.size,
    };
    this._updateHover();
    this.ui?.refresh();
  }

  /** Human-readable problems preventing a test drive. */
  problems() {
    const s = this.stats;
    const out = [];
    if (!s.hasStart) out.push('Add a START piece.');
    if (!s.hasFinish) out.push('Add a FINISH piece.');
    else if (!s.finishConnected) out.push('Connect the road from START to FINISH (jumps count if the landing lines up).');
    if (s.connectedCheckpoints < s.checkpoints) out.push(`${s.checkpoints - s.connectedCheckpoints} checkpoint(s) are not on the route.`);
    return out;
  }

  // ── tools ─────────────────────────────────────────────────────────────
  selectPiece(type) {
    this.selected = type;
    this.tool = 'place';
    this.manualRotation = false;
    this._updateHover(true);
    this.ui.refresh();
  }

  setTool(tool) {
    this.tool = tool;
    this._updateHover(true);
    this.ui.refresh();
  }

  rotate(delta = 1) {
    this.rotation = (this.rotation + delta + 4) % 4;
    this.manualRotation = true;
    this._updateHover(true);
    this.ui.refresh();
  }

  changeLevel(delta) {
    this.level = MathUtils.clamp(this.level + delta, MIN_LEVEL, MAX_LEVEL);
    this.manualRotation = false;
    this._updateHover(true);
    this.ui.refresh();
  }

  toggleIce() {
    this.ice = !this.ice;
    this._updateHover(true);
    this.ui.refresh();
  }

  toggleSnap() {
    this.snap = !this.snap;
    this._updateHover(true);
    this.ui.refresh();
  }

  _candidateAt(cell) {
    return candidateAt(this.resolved, this.occupancy, cell, {
      type: this.selected, level: this.level, rotation: this.rotation, ice: this.ice, snap: this.snap && !this.manualRotation,
    });
  }

  _pieceAt(cell) {
    return pieceAt(this.occupancy, cell, this.level);
  }

  _updateHover(force = false) {
    if (!this.hoverCell) {
      this.view.setPreview(null);
      this.view.setEraseHighlight(null);
      this.view.setCursor(null, this.level, false);
      return;
    }
    this.view.setCursor(this.hoverCell, this.level, true);
    if (this.tool === 'erase') {
      this.view.setPreview(null);
      const idx = this._pieceAt(this.hoverCell);
      this.view.setEraseHighlight(idx != null ? this.track.pieces[idx] : null);
      this.candidate = null;
      return;
    }
    this.view.setEraseHighlight(null);
    this.candidate = this._candidateAt(this.hoverCell);
    this.view.setPreview(this.candidate.piece, this.candidate.valid);
    if (this.candidate.snapped && force !== 'keep') {
      this.rotation = this.candidate.piece.r;
    }
  }

  /** Apply the current tool at the hovered cell. */
  act() {
    if (!this.hoverCell) return;
    if (this.tool === 'erase') {
      const idx = this._pieceAt(this.hoverCell);
      if (idx == null) return;
      this.snapshot();
      this.track.pieces.splice(idx, 1);
      this.app.audio?.ui('erase');
      this.rebuild();
      return;
    }
    const cand = this.candidate || this._candidateAt(this.hoverCell);
    if (!cand.valid) {
      this.app.audio?.ui('error');
      this.ui.toast('Blocked — something is already there.', 'bad');
      return;
    }
    this.snapshot();
    const p = { ...cand.piece };
    if (p.t === 'start') this.track.pieces = this.track.pieces.filter((q) => q.t !== 'start'); // only one start
    this.track.pieces.push(p);
    this.manualRotation = false;
    this.app.audio?.ui('place');
    this.rebuild();
  }

  // ── camera & input ───────────────────────────────────────────────────
  _updateCamera() {
    const cam = this.camera;
    const r = this.app.renderer;
    const levelY = this.level * LEVEL;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      levelY + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target.x, levelY, this.target.z);
    cam.aspect = r.aspect;
    cam.fov = fitFov(55, cam.aspect);
    cam.far = 2000;
    cam.updateProjectionMatrix();
    this.view.setGrid(this.target, this.level);
  }

  pan(dx, dz) {
    // Camera-relative panning in world units.
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.target.x += -c * dx - s * dz;
    this.target.z += s * dx - c * dz;
  }

  zoom(factor) {
    this.distance = MathUtils.clamp(this.distance * factor, 18, 420);
  }

  _cellFromClient(x, y) {
    const rect = this.app.canvas.getBoundingClientRect();
    _ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    _plane.constant = -this.level * LEVEL;
    if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
    return [Math.round(_hit.x / TILE), Math.round(_hit.z / TILE)];
  }

  _setHover(cell) {
    const same = cell && this.hoverCell && cell[0] === this.hoverCell[0] && cell[1] === this.hoverCell[1];
    if (same) return;
    this.hoverCell = cell;
    this.manualRotation = false; // moving on re-enables auto-snap
    this._updateHover();
  }

  _bindInput() {
    const canvas = this.app.canvas;
    const pointers = new Map();
    let dragStart = null;
    let dragging = false;
    let lastPinch = null;

    this._onPointerDown = (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType });
      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
        dragging = false;
      } else {
        dragStart = null; // multi-touch gesture, never a tap
        lastPinch = null;
      }
      if (e.pointerType === 'touch') this._setHover(this._cellFromClient(e.clientX, e.clientY));
    };
    this._onPointerMove = (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this._setHover(this._cellFromClient(e.clientX, e.clientY));
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (lastPinch) {
          this.zoom(lastPinch.dist / Math.max(1, dist));
          this.yaw += ang - lastPinch.ang;
        }
        lastPinch = { dist, ang };
        return;
      }
      if (dragStart && !dragging && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 8) dragging = true;
      if (dragging) {
        if (prev.button === 2 || e.buttons === 2) {
          this.yaw -= dx * 0.006;
          this.pitch = MathUtils.clamp(this.pitch + dy * 0.004, 0.35, 1.45);
        } else {
          const k = (this.distance / this.app.renderer.height) * 1.25;
          this.pan(dx * k, dy * k);
        }
      }
      if (e.pointerType === 'mouse') this._setHover(this._cellFromClient(e.clientX, e.clientY));
    };
    this._onPointerUp = (e) => {
      const was = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) lastPinch = null;
      if (!was || !dragStart) return;
      const tap = !dragging && performance.now() - dragStart.t < 600 && dragStart.button !== 2;
      dragStart = null;
      if (tap) {
        this._setHover(this._cellFromClient(e.clientX, e.clientY));
        this.act();
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    };
    this._onContext = (e) => e.preventDefault();
    this._onKey = (e) => this._key(e);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContext);
    window.addEventListener('keydown', this._onKey);
    this.keys = new Set();
    this._onKeyUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _key(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (this.ui.dialogOpen) return;
    const ctrl = e.ctrlKey || e.metaKey;
    this.keys.add(e.code);
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); return this.redo(); }
    if (ctrl && e.code === 'KeyS') { e.preventDefault(); return this.ui.save(); }
    if (ctrl) return;
    switch (e.code) {
      case 'KeyR': return this.rotate(e.shiftKey ? -1 : 1);
      case 'KeyQ': this.yaw += Math.PI / 4; return;
      case 'KeyE': this.yaw -= Math.PI / 4; return;
      case 'PageUp': case 'Equal': case 'NumpadAdd': e.preventDefault(); return this.changeLevel(1);
      case 'PageDown': case 'Minus': case 'NumpadSubtract': e.preventDefault(); return this.changeLevel(-1);
      case 'Delete': case 'Backspace': case 'KeyX': return this.setTool(this.tool === 'erase' ? 'place' : 'erase');
      case 'KeyI': return this.toggleIce();
      case 'KeyG': return this.toggleSnap();
      case 'KeyT': return this.ui.testDrive();
      case 'Space': case 'Enter': e.preventDefault(); return this.act();
      case 'Escape': return this.ui.exit();
      default:
        if (/^Digit[1-9]$/.test(e.code)) {
          const idx = Number(e.code.slice(5)) - 1 + (e.shiftKey ? 9 : 0);
          if (PALETTE[idx]) this.selectPiece(PALETTE[idx]);
        }
    }
  }

  // ── mode hooks ───────────────────────────────────────────────────────
  fixedUpdate() {}

  frame(dt) {
    // Keyboard panning (camera relative).
    const k = this.keys;
    if (k) {
      const sp = this.distance * 0.9 * dt;
      let dx = 0, dz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) dz -= sp;
      if (k.has('KeyS') || k.has('ArrowDown')) dz += sp;
      if (k.has('KeyA') || k.has('ArrowLeft')) dx -= sp;
      if (k.has('KeyD') || k.has('ArrowRight')) dx += sp;
      if (dx || dz) this.pan(dx, dz);
    }
    this._updateCamera();
    this.ui.updateLabels(this.camera);
    this.stage.render(dt, { speedLines: 0 });
  }

  /** Track data for racing / saving. */
  trackData() {
    return { id: this.track.id, name: this.track.name, theme: this.track.theme, pieces: this.track.pieces.map((p) => ({ ...p })) };
  }

  buildForTest() {
    return buildTrack(this.trackData());
  }

  _unbindInput() {
    const canvas = this.app.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    canvas.removeEventListener('wheel', this._onWheel);
    canvas.removeEventListener('contextmenu', this._onContext);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    this.keys?.clear();
  }

  /** Step aside for a test drive, keeping all editor state (undo history…). */
  suspend() {
    this._unbindInput();
    this.ui.show(false);
    this.stage.trackGroup.remove(this.view.group);
    this.hoverCell = null;
  }

  resume() {
    this.stage.chase.world = null;
    this.stage.clearTrack();
    this.stage.trackGroup.add(this.view.group);
    this.applyTheme();
    this._bindInput();
    this.ui.show(true);
    this.rebuild();
  }

  dispose() {
    this._unbindInput();
    this.ui.dispose();
    this.view.dispose();
    this.stage.clearTrack();
  }
}

export { PIECES, edgeKey };
