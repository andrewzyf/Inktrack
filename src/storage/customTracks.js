import { readJSON, writeJSON, remove, listKeys } from './storage.js';
import { PIECES } from '../tracks/pieces.js';
import { THEMES } from '../tracks/themes.js';

/**
 * Custom tracks made in the editor: localStorage persistence plus the
 * shareable JSON file format.
 *   { format: 'inktrack-track', version: 1, name, theme, pieces: [{ t, x, y, z, r, s? }] }
 */
export const FILE_FORMAT = 'inktrack-track';

export function newTrackId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export function listCustomTracks() {
  return listKeys('track:')
    .map((k) => readJSON(k))
    .filter((t) => t && Array.isArray(t.pieces))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function getCustomTrack(id) {
  return readJSON(`track:${id}`);
}

export function saveCustomTrack(track) {
  const clean = { ...sanitizeTrack(track), id: track.id || newTrackId(), updated: Date.now() };
  return writeJSON(`track:${clean.id}`, clean) ? clean : null;
}

export function deleteCustomTrack(id) {
  remove(`track:${id}`);
}

/** Validate & normalise untrusted track data (imports, storage). Throws on garbage. */
export function sanitizeTrack(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a track file.');
  if (data.format && data.format !== FILE_FORMAT) throw new Error('This file is not an InkTrack track.');
  if (!Array.isArray(data.pieces)) throw new Error('Track has no pieces.');
  if (data.pieces.length > 2000) throw new Error('Track is too big (max 2000 pieces).');
  const int = (v, lo, hi, name) => {
    const n = Number(v ?? 0);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`Invalid ${name} value "${v}".`);
    return n;
  };
  const pieces = data.pieces.map((p) => {
    if (!p || !PIECES[p.t]) throw new Error(`Unknown piece type "${p && p.t}".`);
    const out = { t: p.t, x: int(p.x, -500, 500, 'x'), y: int(p.y, -40, 80, 'level'), z: int(p.z, -500, 500, 'z'), r: int(p.r, 0, 3, 'rotation') };
    if (p.s === 'ice') out.s = 'ice';
    return out;
  });
  const name = String(data.name || 'Untitled Track').replace(/[<>]/g, '').slice(0, 40).trim() || 'Untitled Track';
  const theme = THEMES[data.theme] ? data.theme : 'rooftop';
  return { id: typeof data.id === 'string' ? data.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) : undefined, name, theme, pieces };
}

export function toFileJSON(track) {
  const t = sanitizeTrack(track);
  return JSON.stringify({ format: FILE_FORMAT, version: 1, name: t.name, theme: t.theme, pieces: t.pieces }, null, 1);
}

export function parseTrackFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const t = sanitizeTrack(data);
  delete t.id; // imported copies get a fresh id
  return t;
}
