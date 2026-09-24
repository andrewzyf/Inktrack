import { readJSON, writeJSON } from './storage.js';
import { inkSpent } from '../vehicles/garage.js';

/**
 * Per-track progress (ink pots found, shortcuts discovered, best medal) and
 * the ink wallet it adds up to. Ink buys garage items.
 *
 *   pot 5 ink · shortcut 10 · bronze 5 · silver +10 · gold +20 · ink medal +40
 *   daily challenge 25
 */

export const MEDALS = [
  { id: 'bronze', name: 'Bronze', factor: 1.35, ink: 5, color: '#d98a4a' },
  { id: 'silver', name: 'Silver', factor: 1.15, ink: 10, color: '#c9d3e6' },
  { id: 'gold', name: 'Gold', factor: 1.04, ink: 20, color: '#ffd23f' },
  { id: 'ink', name: 'Ink', factor: 0.97, ink: 40, color: '#8f5bdc' },
];
export const POT_INK = 5;
export const SHORTCUT_INK = 10;
export const DAILY_INK = 25;

let data = null;
function load() {
  if (!data) data = readJSON('progress', { tracks: {}, dailies: [] });
  data.tracks ||= {};
  data.dailies ||= [];
  return data;
}
function save() {
  writeJSON('progress', data);
}

export function trackProgress(key) {
  const t = load().tracks[key] || {};
  return { pots: new Set(t.pots || []), shortcuts: new Set(t.shortcuts || []), medal: t.medal ?? -1 };
}

function update(key, fn) {
  const d = load();
  const t = d.tracks[key] || { pots: [], shortcuts: [], medal: -1 };
  fn(t);
  d.tracks[key] = t;
  save();
}

/** Returns true if this pot is new. */
export function collectPot(key, id) {
  if (trackProgress(key).pots.has(id)) return false;
  update(key, (t) => t.pots.push(id));
  return true;
}

export function discoverShortcut(key, id) {
  if (trackProgress(key).shortcuts.has(id)) return false;
  update(key, (t) => t.shortcuts.push(id));
  return true;
}

/** Medal times from the track's par (autopilot) time. */
export function medalTimes(par) {
  return par ? MEDALS.map((m) => par * m.factor) : null;
}

/** Highest medal index earned by `time` (−1 = none). */
export function medalFor(time, par) {
  const times = medalTimes(par);
  if (!times) return -1;
  let best = -1;
  times.forEach((t, i) => {
    if (time <= t) best = i;
  });
  return best;
}

/** Record a finish; returns { medal, newMedal } */
export function awardMedal(key, medal) {
  const prev = trackProgress(key).medal;
  if (medal > prev) update(key, (t) => (t.medal = medal));
  return { medal: Math.max(prev, medal), newMedal: medal > prev ? medal : -1 };
}

export function completeDaily(dateKey) {
  const d = load();
  if (d.dailies.includes(dateKey)) return false;
  d.dailies.push(dateKey);
  save();
  return true;
}

export function dailyDone(dateKey) {
  return load().dailies.includes(dateKey);
}

/** Total ink earned across all tracks. */
export function inkEarned() {
  const d = load();
  let ink = d.dailies.length * DAILY_INK;
  for (const t of Object.values(d.tracks)) {
    ink += (t.pots?.length || 0) * POT_INK + (t.shortcuts?.length || 0) * SHORTCUT_INK;
    for (let i = 0; i <= (t.medal ?? -1); i++) ink += MEDALS[i].ink;
  }
  return ink;
}

export function inkWallet() {
  return inkEarned() - inkSpent();
}

export function resetProgressForTests() {
  data = null;
}
