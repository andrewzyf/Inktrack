import { readJSON, writeJSON } from './storage.js';

/** Player settings with defaults, persisted to localStorage. */
const DEFAULTS = {
  ghost: true,
  volume: 0.8,
  music: true,
  musicVolume: 0.55,
  engineVolume: 0.3,
  quality: 'auto', // auto | low | medium | high
  showFps: false,
  steering: 'zones', // zones | tilt (mobile)
  tiltSensitivity: 1,
  autoGas: false,
  touchLayout: 'auto',
  camera: 'chase', // chase | far
};

let current = { ...DEFAULTS, ...readJSON('settings', {}) };
const listeners = new Set();

export function getSettings() {
  return current;
}

export function setSetting(key, value) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  writeJSON('settings', current);
  for (const fn of listeners) fn(key, value, current);
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetSettings() {
  current = { ...DEFAULTS };
  writeJSON('settings', current);
  for (const fn of listeners) fn('*', null, current);
}
