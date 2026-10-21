// One localStorage key through a probe-then-fallback wrapper (architecture.md section 2.4).
// WP0 keeps only what the shell needs: settings. The app WP adds lessons, drill and sandbox.
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';

export const STORAGE_KEY = 'baccaratton:v1';

export interface PersistedV1 {
  version: 1;
  settings: Settings;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage if it works (it can throw or be blocked), else an in-memory map. */
export function createStorage(): { storage: KeyValueStorage; persistent: boolean } {
  try {
    const probe = `${STORAGE_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return { storage: localStorage, persistent: true };
  } catch {
    const mem = new Map<string, string>();
    return {
      storage: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
      },
      persistent: false,
    };
  }
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Keeps only fields whose type matches the default, so a bad blob never breaks the app. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (isObj(raw)) {
    for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof raw[k] === typeof def) out[k] = raw[k];
    }
  }
  return out as unknown as Settings;
}

/** Never throws. Unreadable, foreign or newer data yields the defaults. */
export function load(storage: KeyValueStorage): PersistedV1 {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text) {
      const raw: unknown = JSON.parse(text);
      if (isObj(raw) && raw.version === 1)
        return { version: 1, settings: sanitizeSettings(raw.settings) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { version: 1, settings: { ...DEFAULT_SETTINGS } };
}

export function save(storage: KeyValueStorage, data: PersistedV1): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
