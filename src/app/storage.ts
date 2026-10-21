// Persistence (architecture.md section 2.4): one localStorage key, `baccaratton:v1`, through a
// probe-then-fallback wrapper (private windows, file:// quirks). `load()` validates, migrates by
// version, backs up unreadable data, never throws, and is read-only on data from a newer app.
import { DRILL_CATEGORY_IDS, VARIANT_IDS } from '../sim';
import type { DrillCategoryId, TiePays } from '../sim';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';

export { DEFAULT_SETTINGS };
export type { Settings };

export const STORAGE_KEY = 'baccaratton:v1';
export const EXPORT_PREFIX = 'baccaratton1:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  keys(): string[] {
    return [...this.m.keys()];
  }
}

export interface StorageHandle {
  storage: StorageLike;
  /** false when localStorage is unavailable: progress lives in memory only (show a banner). */
  persistent: boolean;
}

/** localStorage when it really works, else memory. Never throws. */
export function createStorage(): StorageHandle {
  try {
    const ls = globalThis.localStorage;
    const probe = `${STORAGE_KEY}:probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}

export interface LessonProgress {
  startedAt?: number;
  completedAt?: number;
  /** `firstTry`: the first attempt was correct (retries never count toward the exam score) */
  quizzes: Record<string, { correct: boolean; attempts: number; firstTry?: boolean }>;
  scenes: Record<string, { completed: boolean; step: number }>;
}

export const MAX_RECENT_MISSES = 50;
export const TIE_PAYS: readonly TiePays[] = [8, 9];

export interface CategoryStats {
  answered: number;
  correct: number;
}

export interface DrillStats {
  bestStreak: number;
  /** D29: accuracy per Drill category */
  byCategory: Partial<Record<DrillCategoryId, CategoryStats>>;
  /** spot codes (strategy/drill.ts spotCode), newest first, max 50 */
  recentMisses: string[];
}

export interface PersistedV1 {
  version: 1;
  lessons: Record<string, LessonProgress>;
  settings: Settings;
  drill: DrillStats;
  /** opaque snapshot owned by sim/ui (shoe, bets, bankroll, road history) */
  sandbox?: unknown;
}

export function emptyDrill(): DrillStats {
  return { bestStreak: 0, byCategory: {}, recentMisses: [] };
}

export function defaultPersisted(): PersistedV1 {
  return { version: 1, lessons: {}, settings: { ...DEFAULT_SETTINGS }, drill: emptyDrill() };
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const safeEntries = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([k]) => !UNSAFE_KEYS.has(k));

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined;
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const oneOf = <T extends string | number>(x: unknown, opts: readonly T[], d: T): T =>
  (opts as readonly unknown[]).includes(x) ? (x as T) : d;
const clampInt = (x: unknown, lo: number, hi: number, d: number) => {
  const n = num(x);
  return n === undefined || n < lo ? d : Math.min(Math.round(n), hi);
};
/** Cents rounded to whole dollars and clamped to [lo, hi] dollars; `d` (cents) when unusable. */
const wholeDollars = (x: unknown, lo: number, hi: number, d: number) => {
  const n = num(x);
  return n === undefined ? d : Math.min(Math.max(Math.round(n / 100), lo), hi) * 100;
};

/** Bounds shared by sanitizing and the Settings inputs (dollars, except handsPerHour). */
export const LIMITS = {
  unitDollars: { min: 5, max: 5_000 },
  bankrollDollars: { min: 5, max: 1_000_000 },
  handsPerHour: { min: 1, max: 500 },
} as const;

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const o = isObj(raw) ? raw : {};
  return {
    theme: oneOf(o.theme, ['system', 'light', 'dark'] as const, d.theme),
    animationSpeed: oneOf(
      o.animationSpeed,
      ['normal', 'fast', 'instant'] as const,
      d.animationSpeed,
    ),
    reduceMotion: bool(o.reduceMotion, d.reduceMotion),
    fourColorDeck: bool(o.fourColorDeck, d.fourColorDeck),
    variant: oneOf(o.variant, VARIANT_IDS, d.variant),
    tiePays: oneOf(o.tiePays, TIE_PAYS, d.tiePays),
    unitCents: wholeDollars(
      o.unitCents,
      LIMITS.unitDollars.min,
      LIMITS.unitDollars.max,
      d.unitCents,
    ),
    handsPerHour: clampInt(
      o.handsPerHour,
      LIMITS.handsPerHour.min,
      LIMITS.handsPerHour.max,
      d.handsPerHour,
    ),
    confirmCostlyBets: bool(o.confirmCostlyBets, d.confirmCostlyBets),
    practice: bool(o.practice, d.practice),
    shoeTracker: bool(o.shoeTracker, d.shoeTracker),
    showRoads: bool(o.showRoads, d.showRoads),
    defaultBankrollCents: wholeDollars(
      o.defaultBankrollCents,
      LIMITS.bankrollDollars.min,
      LIMITS.bankrollDollars.max,
      d.defaultBankrollCents,
    ),
  };
}

function sanitizeDrill(raw: unknown): DrillStats {
  const d = emptyDrill();
  if (!isObj(raw)) return d;
  d.bestStreak = clampInt(raw.bestStreak, 0, 1_000_000, 0);
  if (isObj(raw.byCategory))
    for (const c of DRILL_CATEGORY_IDS) {
      const v = raw.byCategory[c];
      if (!isObj(v)) continue;
      const answered = clampInt(v.answered, 0, 10_000_000, 0);
      d.byCategory[c] = {
        answered,
        correct: Math.min(clampInt(v.correct, 0, 10_000_000, 0), answered),
      };
    }
  if (Array.isArray(raw.recentMisses))
    d.recentMisses = [
      ...new Set(
        raw.recentMisses.filter(
          (x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80,
        ),
      ),
    ].slice(0, MAX_RECENT_MISSES);
  return d;
}

/** Validates arbitrary parsed JSON into PersistedV1; malformed parts fall back to defaults. */
export function sanitize(raw: unknown): PersistedV1 | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  return sanitizeV1(raw);
}

/** Upgrades any known stored version to the current shape. v1 is the identity (then sanitized). */
export function migrate(raw: unknown): PersistedV1 | null {
  if (!isObj(raw)) return null;
  switch (raw.version) {
    case 1:
      return sanitizeV1(raw);
    default:
      return null;
  }
}

function sanitizeV1(raw: Record<string, unknown>): PersistedV1 {
  const lessons: Record<string, LessonProgress> = {};
  if (isObj(raw.lessons)) {
    for (const [id, v] of safeEntries(raw.lessons)) {
      if (!isObj(v)) continue;
      const p: LessonProgress = { quizzes: {}, scenes: {} };
      const s = num(v.startedAt);
      const c = num(v.completedAt);
      if (s !== undefined) p.startedAt = s;
      if (c !== undefined) p.completedAt = c;
      if (isObj(v.quizzes))
        for (const [qid, q] of safeEntries(v.quizzes))
          if (isObj(q))
            p.quizzes[qid] = {
              correct: q.correct === true,
              attempts: Math.max(0, Math.floor(num(q.attempts) ?? 0)),
              ...(typeof q.firstTry === 'boolean' ? { firstTry: q.firstTry } : {}),
            };
      if (isObj(v.scenes))
        for (const [sid, sc] of safeEntries(v.scenes))
          if (isObj(sc))
            p.scenes[sid] = {
              completed: sc.completed === true,
              step: Math.max(0, Math.floor(num(sc.step) ?? 0)),
            };
      lessons[id] = p;
    }
  }
  return {
    version: 1,
    lessons,
    settings: sanitizeSettings(raw.settings),
    drill: sanitizeDrill(raw.drill),
    ...(raw.sandbox !== undefined ? { sandbox: raw.sandbox } : {}),
  };
}

export interface LoadResult {
  data: PersistedV1;
  /** true when the stored data came from a newer app: never overwrite it */
  readOnly: boolean;
}

function backUp(storage: StorageLike, text: string, now: number) {
  try {
    storage.setItem(`${STORAGE_KEY}:backup-${now}`, text);
  } catch {
    /* best effort */
  }
}

/**
 * Never throws. Unreadable or unknown-version data is copied to `baccaratton:v1:backup-<ts>`
 * before defaults are used; data from a newer version (version > 1) is left untouched (readOnly).
 */
export function loadDetailed(storage: StorageLike, now = Date.now()): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: defaultPersisted(), readOnly: false };
  }
  if (!text) return { data: defaultPersisted(), readOnly: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    backUp(storage, text, now);
    return { data: defaultPersisted(), readOnly: false };
  }
  const data = migrate(parsed);
  if (data) return { data, readOnly: false };
  backUp(storage, text, now);
  const newer = isObj(parsed) && typeof parsed.version === 'number' && parsed.version > 1;
  return { data: defaultPersisted(), readOnly: newer };
}

export function load(storage: StorageLike): PersistedV1 {
  return loadDetailed(storage).data;
}

export function save(storage: StorageLike, data: PersistedV1): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ---- export / import: a base64 code of the JSON (copy-pasteable) ----

export function encodeExport(data: PersistedV1): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return EXPORT_PREFIX + btoa(bin);
}

export function decodeImport(code: string): PersistedV1 | null {
  try {
    const t = code.trim();
    if (!t.startsWith(EXPORT_PREFIX)) return null;
    const bin = atob(t.slice(EXPORT_PREFIX.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
