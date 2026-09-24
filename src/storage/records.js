import { readJSON, writeJSON, remove } from './storage.js';
import { hashString } from '../core/random.js';

/**
 * Local leaderboard + ghost persistence, per track.
 * A track's record key includes a hash of its layout, so editing a custom
 * track (or re-tuning a built-in one) never compares times across layouts.
 */
export const MAX_RECORDS = 10;

export function trackKey(track) {
  const layout = JSON.stringify(track.pieces.map((p) => [p.t, p.x, p.y ?? 0, p.z, p.r ?? 0, p.s ?? '']));
  const base = track.builtIn ? track.id : 'custom';
  return `${base}@${hashString(layout).toString(36)}`;
}

export function getRecords(key) {
  const list = readJSON(`times:${key}`, []);
  return Array.isArray(list) ? list.filter((r) => typeof r.time === 'number' && isFinite(r.time)) : [];
}

export function getBest(key) {
  return getRecords(key)[0] || null;
}

/**
 * Insert a finished run. Returns { rank (1-based, or null if outside the
 * top list), isBest, previousBest, records }.
 */
export function submitTime(key, time, splits = [], meta = {}) {
  const records = getRecords(key);
  const previousBest = records[0] ? records[0].time : null;
  const entry = { time, splits, date: Date.now(), ...meta };
  records.push(entry);
  records.sort((a, b) => a.time - b.time);
  const kept = records.slice(0, MAX_RECORDS);
  writeJSON(`times:${key}`, kept);
  const idx = kept.indexOf(entry);
  return { rank: idx >= 0 ? idx + 1 : null, isBest: idx === 0, previousBest, records: kept, entry };
}

export function clearRecords(key) {
  remove(`times:${key}`);
  remove(`ghost:${key}`);
}

export function saveGhost(key, ghost) {
  return writeJSON(`ghost:${key}`, ghost);
}

export function loadGhost(key) {
  const g = readJSON(`ghost:${key}`, null);
  if (!g || g.v !== 1 || typeof g.data !== 'string') return null;
  return g;
}
