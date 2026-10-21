import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/app/settings';
import { STORAGE_KEY, load, sanitizeSettings } from '../../src/app/storage';
import type { KeyValueStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';

const memory = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
  return { storage, persistent: true, m };
};

afterEach(() => vi.useRealTimers());

describe('defaults (decisions.md)', () => {
  it('are 72 hands/hour, Tie 8:1, punto-banco, Shoe tracker off, costly-bet confirm on', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      handsPerHour: 72,
      tiePays: 8,
      variant: 'punto-banco',
      shoeTracker: false,
      confirmCostlyBets: true,
      showRoads: true,
      defaultBankrollCents: 50_000,
    });
  });
});

describe('storage', () => {
  it('uses the baccaratton:v1 key', () => {
    expect(STORAGE_KEY).toBe('baccaratton:v1');
  });
  it('never throws and falls back to defaults on garbage or foreign data', () => {
    for (const text of ['not json', '{"version":2}', '[]', 'null', '{"version":1,"settings":7}']) {
      expect(load(memory({ [STORAGE_KEY]: text }).storage).settings).toEqual(DEFAULT_SETTINGS);
    }
  });
  it('keeps only settings whose type matches the default', () => {
    const s = sanitizeSettings({ theme: 'dark', handsPerHour: 'lots', extra: 1, variant: 'ez' });
    expect(s.theme).toBe('dark');
    expect(s.variant).toBe('ez');
    expect(s.handsPerHour).toBe(72);
    expect('extra' in s).toBe(false);
  });
});

describe('Store', () => {
  it('saves debounced, restores, and notifies subscribers', () => {
    vi.useFakeTimers();
    const mem = memory();
    const store = new Store(mem);
    const seen: number[] = [];
    const off = store.subscribe(() => seen.push(1));
    store.setSettings({ theme: 'dark' });
    store.setSettings({ fourColorDeck: true });
    expect(seen).toHaveLength(2);
    expect(mem.m.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(400);
    expect(mem.m.has(STORAGE_KEY)).toBe(true);
    const again = new Store(mem);
    expect(again.settings).toMatchObject({ theme: 'dark', fourColorDeck: true });
    off();
    store.setSettings({ theme: 'light' });
    expect(seen).toHaveLength(2);
  });
  it('flush writes immediately and only when something changed', () => {
    const mem = memory();
    const store = new Store(mem);
    store.flush();
    expect(mem.m.size).toBe(0);
    store.setSettings({ reduceMotion: true });
    store.flush();
    expect(mem.m.size).toBe(1);
  });
  it('reports persistent: false when localStorage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const store = new Store();
      expect(store.persistent).toBe(false);
      store.setSettings({ theme: 'dark' });
      expect(() => store.flush()).not.toThrow();
      expect(store.settings.theme).toBe('dark');
    } finally {
      blocked.mockRestore();
    }
  });
});
