import { readJSON, writeJSON } from '../storage/storage.js';

/**
 * Garage catalogue: every cosmetic option, what it costs in ink, and the
 * player's current look per vehicle kind. Options are purely visual — they
 * never change handling, so every time on the leaderboard stays comparable.
 */

export const PAINTS = [
  { id: 'red', name: 'Comic Red', color: 0xe8343f, cost: 0 },
  { id: 'blue', name: 'Ink Blue', color: 0x2f6fe0, cost: 0 },
  { id: 'yellow', name: 'Pow Yellow', color: 0xffc928, cost: 0 },
  { id: 'green', name: 'Slime Green', color: 0x3fcf5a, cost: 0 },
  { id: 'white', name: 'Paper White', color: 0xf4f0e6, cost: 5 },
  { id: 'black', name: 'Night Ink', color: 0x2c2838, cost: 5 },
  { id: 'orange', name: 'Tangerine', color: 0xff7a1a, cost: 10 },
  { id: 'pink', name: 'Bubblegum', color: 0xff6fb5, cost: 10 },
  { id: 'purple', name: 'Grape Soda', color: 0x8f5bdc, cost: 15 },
  { id: 'teal', name: 'Lagoon', color: 0x19b5a5, cost: 15 },
  { id: 'gold', name: 'Trophy Gold', color: 0xe0b33a, cost: 40 },
  { id: 'chrome', name: 'Chrome', color: 0xc9d3e6, cost: 60 },
];

export const ACCENTS = [
  { id: 'yellow', name: 'Yellow', color: 0xffd23f, cost: 0 },
  { id: 'white', name: 'White', color: 0xffffff, cost: 0 },
  { id: 'black', name: 'Black', color: 0x2c2838, cost: 0 },
  { id: 'cyan', name: 'Cyan', color: 0x3df2ff, cost: 5 },
  { id: 'pink', name: 'Pink', color: 0xff5fd2, cost: 5 },
  { id: 'lime', name: 'Lime', color: 0x9dff3a, cost: 5 },
  { id: 'red', name: 'Red', color: 0xff3355, cost: 5 },
];

export const BODIES = {
  car: [
    { id: 'racer', name: 'Racer', cost: 0, desc: 'Low wedge, big wing' },
    { id: 'muscle', name: 'Muscle', cost: 30, desc: 'Long hood, loud attitude' },
    { id: 'buggy', name: 'Buggy', cost: 50, desc: 'Roll cage and fat tyres' },
  ],
  boat: [
    { id: 'speedboat', name: 'Speedboat', cost: 0, desc: 'Classic V-hull runabout' },
    { id: 'hydro', name: 'Hydroplane', cost: 40, desc: 'Twin-hull racing machine' },
  ],
  plane: [
    { id: 'prop', name: 'Prop Plane', cost: 0, desc: 'Trusty stunt propeller' },
    { id: 'jet', name: 'Jet', cost: 50, desc: 'Swept wings, twin fins' },
  ],
};

export const DECALS = [
  { id: 'none', name: 'Clean', cost: 0 },
  { id: 'stripes', name: 'Twin Stripes', cost: 0 },
  { id: 'number', name: 'Race Number', cost: 10 },
  { id: 'flames', name: 'Flames', cost: 20 },
  { id: 'checker', name: 'Checkers', cost: 25 },
  { id: 'stars', name: 'Stars', cost: 35 },
];

export const SPOILERS = [
  { id: 'wing', name: 'Wing', cost: 0 },
  { id: 'none', name: 'None', cost: 0 },
  { id: 'duck', name: 'Ducktail', cost: 10 },
  { id: 'big', name: 'Big Wing', cost: 25 },
];

export const RIMS = [
  { id: 'white', name: 'White', color: 0xe9e6f2, cost: 0 },
  { id: 'black', name: 'Black', color: 0x2c2838, cost: 0 },
  { id: 'gold', name: 'Gold', color: 0xffc928, cost: 15 },
  { id: 'neon', name: 'Neon', color: 0x3df2ff, cost: 20 },
];

export const TRAILS = [
  { id: 'smoke', name: 'Smoke', color: 0xffffff, cost: 0 },
  { id: 'rainbow', name: 'Rainbow', color: null, cost: 40 },
  { id: 'fire', name: 'Fire', color: 0xff8a1f, cost: 25 },
  { id: 'ink', name: 'Ink', color: 0x2c2838, cost: 15 },
];

export const SLOTS = {
  body: { label: 'Body', items: (kind) => BODIES[kind] },
  paint: { label: 'Paint', items: () => PAINTS },
  accent: { label: 'Accent', items: () => ACCENTS },
  decal: { label: 'Decal', items: () => DECALS },
  spoiler: { label: 'Spoiler', items: (kind) => (kind === 'car' ? SPOILERS : null) },
  rims: { label: 'Rims', items: (kind) => (kind === 'car' ? RIMS : null) },
  trail: { label: 'Trail', items: () => TRAILS },
};

const DEFAULT_LOOKS = {
  car: { body: 'racer', paint: 'red', accent: 'yellow', decal: 'stripes', spoiler: 'wing', rims: 'white', trail: 'smoke' },
  boat: { body: 'speedboat', paint: 'white', accent: 'red', decal: 'stripes', trail: 'smoke' },
  plane: { body: 'prop', paint: 'yellow', accent: 'red', decal: 'stripes', trail: 'smoke' },
};

let state = null;
function load() {
  if (!state) {
    const saved = readJSON('garage', {});
    state = {
      looks: {
        car: { ...DEFAULT_LOOKS.car, ...saved.looks?.car },
        boat: { ...DEFAULT_LOOKS.boat, ...saved.looks?.boat },
        plane: { ...DEFAULT_LOOKS.plane, ...saved.looks?.plane },
      },
      owned: new Set(saved.owned || []),
      spent: saved.spent || 0,
    };
  }
  return state;
}
function save() {
  writeJSON('garage', { looks: state.looks, owned: [...state.owned], spent: state.spent });
}

const ownedKey = (kind, slot, id) => (slot === 'body' ? `${kind}:body:${id}` : `${slot}:${id}`);

export function getLook(kind = 'car') {
  return { kind, ...load().looks[kind] };
}

export function itemFor(kind, slot, id) {
  return SLOTS[slot].items(kind)?.find((i) => i.id === id) || null;
}

export function isOwned(kind, slot, id) {
  const item = itemFor(kind, slot, id);
  return !!item && (item.cost === 0 || load().owned.has(ownedKey(kind, slot, id)));
}

export function inkSpent() {
  return load().spent;
}

/** Buy (if needed, with `wallet` ink available) and equip. Returns false if unaffordable. */
export function equip(kind, slot, id, wallet = Infinity) {
  const s = load();
  const item = itemFor(kind, slot, id);
  if (!item) return false;
  if (!isOwned(kind, slot, id)) {
    if (wallet < item.cost) return false;
    s.owned.add(ownedKey(kind, slot, id));
    s.spent += item.cost;
  }
  s.looks[kind] = { ...s.looks[kind], [slot]: id };
  save();
  return true;
}

/** Resolve ids to colours etc. for the model builder. */
export function resolveLook(look) {
  const kind = look.kind || 'car';
  const find = (list, id, fallback) => list.find((i) => i.id === id) || list.find((i) => i.id === fallback);
  return {
    kind,
    body: look.body || DEFAULT_LOOKS[kind].body,
    paint: find(PAINTS, look.paint, 'red').color,
    accent: find(ACCENTS, look.accent, 'yellow').color,
    decal: look.decal || 'stripes',
    spoiler: look.spoiler || 'wing',
    rims: find(RIMS, look.rims, 'white').color,
    trail: find(TRAILS, look.trail, 'smoke'),
    chrome: look.paint === 'chrome',
  };
}

export function resetGarageForTests() {
  state = null;
}
