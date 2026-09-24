import { hashString, mulberry32 } from '../core/random.js';
import { MUTATOR_IDS, MUTATORS } from '../vehicles/profiles.js';

/**
 * Daily challenge: one track + one mutator + one goal, picked from the date
 * so everyone gets the same challenge on the same day. Worth bonus ink once.
 */
export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function getDaily(tracks, date = new Date()) {
  const key = todayKey(date);
  const rand = mulberry32(hashString(`daily:${key}`));
  const track = tracks[Math.floor(rand() * tracks.length)];
  const pool = MUTATOR_IDS.filter((m) => m !== 'night' || rand() < 0.5);
  const mutator = pool[Math.floor(rand() * pool.length)];
  const kind = ['pots', 'rival', 'clean'][Math.floor(rand() * 3)];
  let goal;
  if (kind === 'pots') goal = { type: 'pots', n: 5 + Math.floor(rand() * 3), text: '' };
  else if (kind === 'rival') goal = { type: 'rival', level: rand() < 0.5 ? 'easy' : 'medium', text: '' };
  else goal = { type: 'clean', text: '' };
  goal.text = goal.type === 'pots' ? `Grab ${goal.n}+ ink pots in one run`
    : goal.type === 'rival' ? `Beat the ${goal.level} Inkbot`
    : 'Finish without a single respawn';
  return { key, track, trackRef: track.ref || track.id, mutators: [mutator], mutatorName: MUTATORS[mutator].name, goal };
}

/** Did this finished run meet the goal? result: { pots, rivalBeaten, respawns } */
export function dailyMet(goal, result) {
  if (goal.type === 'pots') return result.pots >= goal.n;
  if (goal.type === 'rival') return !!result.rivalBeaten;
  return result.respawns === 0;
}
