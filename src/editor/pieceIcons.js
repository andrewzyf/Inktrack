/**
 * Tiny inked SVG icons for the editor palette (drawn top-down, travel = up).
 */
const ROAD = 'fill="#6b6784" stroke="#141018" stroke-width="3" stroke-linejoin="round"';
const LINE = 'fill="none" stroke="#fff8e7" stroke-width="2.5" stroke-dasharray="4 4" stroke-linecap="round"';

const ICONS = {
  straight: `<rect x="12" y="2" width="16" height="36" ${ROAD}/><path d="M20 4 V36" ${LINE}/>`,
  turn: `<path d="M12 38 A26 26 0 0 1 38 12 V28 A10 10 0 0 0 28 38 Z" ${ROAD}/><path d="M20 37 A17 17 0 0 1 37 20" ${LINE}/>`,
  curve: `<path d="M8 38 A30 30 0 0 1 38 8 V20 A18 18 0 0 0 20 38 Z" ${ROAD}/><path d="M14 38 A24 24 0 0 1 38 14" ${LINE}/>`,
  bank: `<path d="M8 38 A30 30 0 0 1 38 8 V20 A18 18 0 0 0 20 38 Z" fill="#8b86a3" stroke="#141018" stroke-width="3"/><path d="M8 38 A30 30 0 0 1 38 8" fill="none" stroke="#ff4d5a" stroke-width="4"/><path d="M14 38 A24 24 0 0 1 38 14" ${LINE}/>`,
  slope: `<path d="M4 34 H14 L28 16 H36 V34 Z" ${ROAD}/><path d="M6 30 H14 L28 12" fill="none" stroke="#ffd23f" stroke-width="3"/><path d="M30 6 l4 5 h-8 z" fill="#141018"/>`,
  slopeLong: `<path d="M2 34 H8 L30 10 H38 V34 Z" ${ROAD}/><path d="M4 30 H9 L30 6" fill="none" stroke="#ffd23f" stroke-width="3"/><path d="M34 3 l4 5 h-8 z" fill="#141018"/>`,
  ramp: `<path d="M4 34 H18 Q30 34 36 20 V34 Z" ${ROAD}/><path d="M24 12 q6 -8 12 -2" fill="none" stroke="#141018" stroke-width="2.5" stroke-dasharray="3 3"/>`,
  loop: `<circle cx="20" cy="18" r="12" fill="none" stroke="#141018" stroke-width="8"/><circle cx="20" cy="18" r="12" fill="none" stroke="#6b6784" stroke-width="4"/><path d="M4 34 H36" stroke="#141018" stroke-width="6"/><path d="M26 6 l6 2 -3 5" fill="none" stroke="#ffd23f" stroke-width="2.5"/>`,
  loopRight: `<circle cx="20" cy="18" r="12" fill="none" stroke="#141018" stroke-width="8"/><circle cx="20" cy="18" r="12" fill="none" stroke="#6b6784" stroke-width="4"/><path d="M4 34 H36" stroke="#141018" stroke-width="6"/><path d="M14 6 l-6 2 3 5" fill="none" stroke="#ffd23f" stroke-width="2.5"/>`,
  boost: `<rect x="12" y="2" width="16" height="36" ${ROAD}/><path d="M14 24 L20 16 L26 24 M14 32 L20 24 L26 32" fill="none" stroke="#ff7a1a" stroke-width="4" stroke-linejoin="round"/>`,
  checkpoint: `<rect x="12" y="2" width="16" height="36" ${ROAD}/><rect x="6" y="14" width="28" height="8" fill="#ffd23f" stroke="#141018" stroke-width="2.5"/>`,
  start: `<rect x="12" y="2" width="16" height="36" ${ROAD}/><path d="M6 12 h28 v8 h-28 z" fill="#fff8e7" stroke="#141018" stroke-width="2.5"/><path d="M6 12 h4 v4 h-4z M14 16 h4 v4 h-4z M18 12 h4 v4 h-4z M26 12 h4 v4 h-4z M30 16 h4 v4 h-4z M10 16 h4 v4h-4z M22 16 h4 v4 h-4z" fill="#141018"/><path d="M20 36 V26 M16 30 l4 -4 4 4" stroke="#7cff6b" stroke-width="3" fill="none"/>`,
  finish: `<rect x="12" y="2" width="16" height="36" ${ROAD}/><path d="M6 16 h28 v8 h-28 z" fill="#fff8e7" stroke="#141018" stroke-width="2.5"/><path d="M6 16 h4 v4 h-4z M14 20 h4 v4 h-4z M18 16 h4 v4 h-4z M26 16 h4 v4 h-4z M30 20 h4 v4 h-4z M10 20 h4 v4h-4z M22 20 h4 v4 h-4z" fill="#141018"/>`,
};

export function pieceIcon(type) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${ICONS[type] || ICONS.straight}</svg>`;
}

export const TOOL_ICONS = {
  erase: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 26 L22 10 L34 20 L22 34 H14 Z" fill="#ff4d5a" stroke="#141018" stroke-width="3" stroke-linejoin="round"/><path d="M14 20 l10 9" stroke="#141018" stroke-width="3"/></svg>',
  rotate: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 14 A12 12 0 1 0 32 24" fill="none" stroke="#141018" stroke-width="5" stroke-linecap="round"/><path d="M24 6 L33 13 L24 18 Z" fill="#141018"/></svg>',
  up: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6 L34 24 H26 V34 H14 V24 H6 Z" fill="#7cff6b" stroke="#141018" stroke-width="3" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34 L34 16 H26 V6 H14 V16 H6 Z" fill="#ffd23f" stroke="#141018" stroke-width="3" stroke-linejoin="round"/></svg>',
  ice: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 V36 M6 12 L34 28 M6 28 L34 12" stroke="#141018" stroke-width="6" stroke-linecap="round"/><path d="M20 4 V36 M6 12 L34 28 M6 28 L34 12" stroke="#8fd3ff" stroke-width="3" stroke-linecap="round"/></svg>',
  snap: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 6 V20 A12 12 0 0 0 32 20 V6 H24 V20 A4 4 0 0 1 16 20 V6 Z" fill="#ff4d5a" stroke="#141018" stroke-width="3" stroke-linejoin="round"/><path d="M8 6 H16 V11 H8Z M24 6 H32 V11 H24Z" fill="#e9e6f2" stroke="#141018" stroke-width="2"/></svg>',
};
