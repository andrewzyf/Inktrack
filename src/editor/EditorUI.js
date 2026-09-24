import { Vector3 } from 'three';
import { pieceIcon, TOOL_ICONS } from './pieceIcons.js';
import { PIECES, PIECE_ORDER as PALETTE } from '../tracks/pieces.js';
import { THEMES } from '../tracks/themes.js';
import { TILE, LEVEL } from '../tracks/constants.js';
import { listCustomTracks, saveCustomTrack, deleteCustomTrack, toFileJSON, parseTrackFile } from '../storage/customTracks.js';
import { writeJSON } from '../storage/storage.js';
import { STARTER_TRACKS } from '../tracks/starterTracks.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const _v = new Vector3();

/** DOM side of the editor: toolbar, palette, tools, status, labels, dialogs. */
export class EditorUI {
  constructor(editor, parent) {
    this.editor = editor;
    this.el = document.createElement('div');
    this.el.className = 'editor-ui';
    this.el.innerHTML = `
      <header class="ed-top">
        <button class="btn btn-small" data-ed="exit" title="Back to menu (Esc)">◀<span class="wide-only"> MENU</span></button>
        <input class="ed-name" maxlength="40" aria-label="Track name" spellcheck="false">
        <select class="ed-theme" aria-label="Theme">${Object.values(THEMES).map((t) => `<option value="${t.id}">${esc(t.name)}${t.vehicle ? ` (${t.vehicle})` : ''}</option>`).join('')}</select>
        <span class="ed-spacer"></span>
        <button class="btn btn-small" data-ed="undo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button class="btn btn-small" data-ed="redo" title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
        <div class="ed-file">
          <button class="btn btn-small ed-file-toggle" data-ed="file" aria-haspopup="true">FILE ▾</button>
          <div class="ed-file-items">
            <button class="btn btn-small" data-ed="save" title="Save (Ctrl+S)">SAVE</button>
            <button class="btn btn-small" data-ed="load">LOAD</button>
            <button class="btn btn-small" data-ed="export" title="Download as a .json file">EXPORT</button>
            <button class="btn btn-small" data-ed="import" title="Open a .json track file">IMPORT</button>
            <button class="btn btn-small" data-ed="new">NEW</button>
          </div>
        </div>
        <button class="btn btn-yellow ed-test" data-ed="test" title="Test drive (T)">▶ TEST<span class="wide-only"> DRIVE</span></button>
      </header>
      <aside class="ed-tools">
        <button class="tool" data-ed="erase" title="Erase tool (X / Delete)">${TOOL_ICONS.erase}<span>ERASE</span></button>
        <button class="tool" data-ed="rotate" title="Rotate piece (R)">${TOOL_ICONS.rotate}<span>ROTATE</span></button>
        <button class="tool" data-ed="up" title="Level up (PageUp / +)">${TOOL_ICONS.up}<span>UP</span></button>
        <div class="tool-level"><small>LEVEL</small><b data-level>0</b></div>
        <button class="tool" data-ed="down" title="Level down (PageDown / −)">${TOOL_ICONS.down}<span>DOWN</span></button>
        <button class="tool" data-ed="ice" title="Ice surface (I)">${TOOL_ICONS.ice}<span>ICE</span></button>
        <button class="tool" data-ed="snap" title="Auto-snap to open road ends (G)">${TOOL_ICONS.snap}<span>SNAP</span></button>
      </aside>
      <footer class="ed-palette">${PALETTE.map((t, i) => `
        <button class="piece" data-piece="${t}" title="${esc(PIECES[t].name)} (${i < 9 ? i + 1 : 'Shift+' + (i - 8)})">${pieceIcon(t)}<span>${esc(PIECES[t].name)}</span></button>`).join('')}
      </footer>
      <div class="ed-status panel"></div>
      <div class="ed-labels"></div>
      <div class="ed-toast"></div>
      <div class="ed-help panel desktop-only">
        <b>CLICK</b> place · <b>DRAG</b> pan · <b>RIGHT-DRAG</b> orbit · <b>WHEEL</b> zoom · <b>WASD</b> pan · <b>Q/E</b> turn view ·
        <b>R</b> rotate · <b>+/−</b> level · <b>X</b> erase · <b>I</b> ice · <b>T</b> test drive
      </div>
      <input type="file" accept=".json,application/json" class="ed-file-input" hidden>`;
    parent.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.nameInput = this.q('.ed-name');
    this.themeSelect = this.q('.ed-theme');
    this.statusEl = this.q('.ed-status');
    this.labelsEl = this.q('.ed-labels');
    this.toastEl = this.q('.ed-toast');
    this.fileInput = this.q('.ed-file-input');
    this.labels = [];
    this.dialogOpen = false;

    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed], [data-piece], [data-dlg]');
      if (!b) return;
      editor.app.audio?.ui('click');
      if (b.dataset.piece) editor.selectPiece(b.dataset.piece);
      else if (b.dataset.ed) this.command(b.dataset.ed, b);
      else if (b.dataset.dlg) this.dialogCommand(b.dataset.dlg, b.dataset);
    });
    this.nameInput.addEventListener('input', () => {
      editor.setName(this.nameInput.value);
      this.saveDraft();
    });
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.nameInput.blur(); e.stopPropagation(); });
    this.themeSelect.addEventListener('change', () => editor.setTheme(this.themeSelect.value));
    this.fileInput.addEventListener('change', () => this._importFile());
    // Stop UI touches from reaching the canvas handlers.
    for (const sel of ['.ed-top', '.ed-tools', '.ed-palette']) this.q(sel).addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
  }

  command(cmd) {
    const ed = this.editor;
    if (cmd !== 'file') this.q('.ed-file').classList.remove('open');
    switch (cmd) {
      case 'file': return this.q('.ed-file').classList.toggle('open');
      case 'exit': return this.exit();
      case 'undo': return ed.undo();
      case 'redo': return ed.redo();
      case 'save': return this.save();
      case 'load': return this.openLoad();
      case 'export': return this.exportFile();
      case 'import': return this.fileInput.click();
      case 'new':
        if (ed.track.pieces.length > 1 && !confirm('Start a new track? Unsaved changes stay in the undo history.')) return;
        ed.snapshot();
        ed.track.id = undefined;
        ed.track.name = 'My Track';
        ed.clear();
        return;
      case 'test': return this.testDrive();
      case 'erase': return ed.setTool(ed.tool === 'erase' ? 'place' : 'erase');
      case 'rotate': return ed.rotate(1);
      case 'up': return ed.changeLevel(1);
      case 'down': return ed.changeLevel(-1);
      case 'ice': return ed.toggleIce();
      case 'snap': return ed.toggleSnap();
    }
  }

  refresh() {
    const ed = this.editor;
    if (document.activeElement !== this.nameInput) this.nameInput.value = ed.track.name;
    this.themeSelect.value = ed.track.theme;
    for (const b of this.el.querySelectorAll('.piece')) b.classList.toggle('active', ed.tool === 'place' && b.dataset.piece === ed.selected);
    this.q('[data-ed="erase"]').classList.toggle('active', ed.tool === 'erase');
    this.q('[data-ed="ice"]').classList.toggle('active', ed.ice);
    this.q('[data-ed="snap"]').classList.toggle('active', ed.snap);
    this.q('[data-level]').textContent = String(ed.level);
    this.q('[data-ed="undo"]').disabled = !ed.undoStack.length;
    this.q('[data-ed="redo"]').disabled = !ed.redoStack.length;
    const s = ed.stats || {};
    const ok = (v) => (v ? '✔' : '✘');
    this.statusEl.innerHTML = `
      <span>${s.pieces || 0} pieces</span>
      <span class="${s.hasStart ? 'ok' : 'bad'}">START ${ok(s.hasStart)}</span>
      <span class="${s.finishConnected ? 'ok' : 'bad'}">FINISH ${ok(s.finishConnected)}</span>
      <span>CP ${s.connectedCheckpoints || 0}/${s.checkpoints || 0}</span>
      <span>${ed.tool === 'erase' ? 'ERASE' : esc(PIECES[ed.selected].name)} · ${ed.rotation * 90}°${ed.ice ? ' · ICE' : ''}</span>`;
    this._buildLabels();
    this.saveDraft();
  }

  saveDraft() {
    writeJSON('editor:draft', { ...this.editor.trackData(), dirty: this.editor.dirty });
  }

  /** Gate labels: S, 1…n in driving order (? if off-route), F. */
  _buildLabels() {
    const ed = this.editor;
    this.labelsEl.innerHTML = '';
    this.labels = [];
    const orderIdx = new Map(ed.order.map((o, i) => [o.rp.index, i]));
    let n = 0;
    const cpNumber = new Map();
    for (const o of ed.order) if (o.rp.type === 'checkpoint') cpNumber.set(o.rp.index, ++n);
    ed.track.pieces.forEach((p, i) => {
      const gate = PIECES[p.t].gate;
      if (!gate) return;
      const el = document.createElement('div');
      el.className = `ed-label ${gate}`;
      el.textContent = gate === 'start' ? 'S' : gate === 'finish' ? (orderIdx.has(i) ? 'F' : 'F?') : cpNumber.get(i) ?? '?';
      this.labelsEl.appendChild(el);
      this.labels.push({ el, pos: new Vector3(p.x * TILE, (p.y || 0) * LEVEL + 9, p.z * TILE) });
    });
  }

  updateLabels(camera) {
    const w = this.editor.app.renderer.width, h = this.editor.app.renderer.height;
    for (const l of this.labels) {
      _v.copy(l.pos).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
      l.el.style.display = vis ? '' : 'none';
      if (vis) l.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  toast(msg, kind = 'info', ms = 2200) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = msg;
    this.toastEl.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  save() {
    const ed = this.editor;
    const saved = saveCustomTrack(ed.trackData());
    if (!saved) return this.toast('Could not save (storage full or blocked).', 'bad');
    ed.track.id = saved.id;
    ed.dirty = false;
    this.saveDraft();
    this.toast(`Saved <b>${esc(saved.name)}</b>! It's in RACE → YOUR TRACKS.`, 'good');
    return saved;
  }

  exportFile() {
    const ed = this.editor;
    const json = toFileJSON(ed.trackData());
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(ed.track.name || 'track').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'track'}.inktrack.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.toast('Track file downloaded — share it with a friend!', 'good');
  }

  async _importFile() {
    const f = this.fileInput.files && this.fileInput.files[0];
    this.fileInput.value = '';
    if (!f) return;
    try {
      if (f.size > 2e6) throw new Error('File is too big.');
      const track = parseTrackFile(await f.text());
      this.editor.loadTrack(track, { keepHistory: true });
      this.editor.dirty = true;
      this.toast(`Imported <b>${esc(track.name)}</b> (${track.pieces.length} pieces). SAVE to keep it.`, 'good', 3000);
    } catch (err) {
      this.toast(`Import failed: ${esc(err.message)}`, 'bad', 3500);
    }
  }

  testDrive() {
    const ed = this.editor;
    const problems = ed.problems();
    if (problems.length) {
      this.toast(`<b>Can't test drive yet:</b><br>${problems.map(esc).join('<br>')}`, 'bad', 3500);
      return;
    }
    ed.app.testDrive(ed);
  }

  exit() {
    const ed = this.editor;
    if (ed.dirty && ed.track.pieces.length > 1 && !confirm('Leave the editor? Your draft is kept, but unsaved changes are not in your track list.')) return;
    ed.app.showMenu();
  }

  // ── load dialog ─────────────────────────────────────────────────────
  openLoad() {
    const customs = listCustomTracks();
    const row = (t, custom) => `
      <li><span class="dlg-name">${esc(t.name)}<small>${t.pieces.length} pieces · ${esc(THEMES[t.theme]?.name || t.theme)}</small></span>
        <button class="btn btn-small btn-yellow" data-dlg="${custom ? 'open' : 'template'}" data-id="${esc(t.id)}">${custom ? 'EDIT' : 'COPY'}</button>
        ${custom ? `<button class="btn btn-small" data-dlg="delete" data-id="${esc(t.id)}">✕</button>` : ''}</li>`;
    const dlg = document.createElement('div');
    dlg.className = 'ed-dialog';
    dlg.innerHTML = `
      <div class="panel dlg-box">
        <h3>YOUR TRACKS</h3>
        <ul>${customs.length ? customs.map((t) => row(t, true)).join('') : '<li class="empty">Nothing saved yet.</li>'}</ul>
        <h3>START FROM A BUILT-IN TRACK</h3>
        <ul>${STARTER_TRACKS.map((t) => row(t, false)).join('')}</ul>
        <button class="btn" data-dlg="close">CLOSE</button>
      </div>`;
    dlg.addEventListener('pointerdown', (e) => e.stopPropagation());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) this.closeDialog();
    });
    this.el.appendChild(dlg);
    this.dialog = dlg;
    this.dialogOpen = true;
  }

  closeDialog() {
    this.dialog?.remove();
    this.dialog = null;
    this.dialogOpen = false;
  }

  dialogCommand(cmd, data) {
    const ed = this.editor;
    if (cmd === 'close') return this.closeDialog();
    if (cmd === 'open') {
      const t = listCustomTracks().find((x) => x.id === data.id);
      if (t) ed.loadTrack(t);
      this.toast(`Editing <b>${esc(t?.name)}</b>`, 'good');
      return this.closeDialog();
    }
    if (cmd === 'template') {
      const t = STARTER_TRACKS.find((x) => x.id === data.id);
      if (t) ed.loadTrack({ name: `${t.name} Remix`, theme: t.theme, pieces: t.pieces }, { keepHistory: true });
      ed.dirty = true;
      return this.closeDialog();
    }
    if (cmd === 'delete') {
      if (!confirm('Delete this track and its times?')) return;
      deleteCustomTrack(data.id);
      this.closeDialog();
      this.openLoad();
    }
  }

  dispose() {
    this.closeDialog();
    this.el.remove();
  }
}
