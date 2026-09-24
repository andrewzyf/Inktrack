/**
 * localStorage helpers: namespaced keys, JSON encoding, and try/catch
 * everywhere (private browsing, quota exceeded or blocked storage must never
 * break the game). Falls back to an in-memory map when storage is missing.
 */
const PREFIX = 'inktrack:v1:';
const memory = new Map();

function backend() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = PREFIX + '__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

let store = backend();

/** For tests: swap in any Storage-like object (or null → memory). */
export function setStorageBackend(s) {
  store = s;
  memory.clear();
}

export function readJSON(key, fallback = null) {
  try {
    const raw = store ? store.getItem(PREFIX + key) : memory.get(key) ?? null;
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Returns true on success (false if e.g. the quota is exceeded). */
export function writeJSON(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (store) store.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    if (store) store.removeItem(PREFIX + key);
    else memory.delete(key);
  } catch {
    /* ignore */
  }
}

/** All keys (without prefix) that start with `sub`. */
export function listKeys(sub = '') {
  const out = [];
  try {
    if (store) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX + sub)) out.push(k.slice(PREFIX.length));
      }
    } else {
      for (const k of memory.keys()) if (k.startsWith(sub)) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}
