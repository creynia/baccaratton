import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/app/settings';
import {
  EXPORT_PREFIX,
  MAX_RECENT_MISSES,
  MemoryStorage,
  STORAGE_KEY,
  decodeImport,
  defaultPersisted,
  encodeExport,
  load,
  loadDetailed,
  sanitizeSettings,
} from '../../src/app/storage';
import {
  FINAL_EXAM_ID,
  Store,
  finalExamScore,
  nextLesson,
  overallProgress,
} from '../../src/app/store';
import type { ContentBundle } from '../../src/content/types';

afterEach(() => vi.useRealTimers());

const withData = (data: unknown) => {
  const m = new MemoryStorage();
  m.setItem(STORAGE_KEY, typeof data === 'string' ? data : JSON.stringify(data));
  return m;
};

describe('storage', () => {
  it('uses the one key baccaratton:v1', () => {
    expect(STORAGE_KEY).toBe('baccaratton:v1');
  });

  it('loads defaults from empty storage', () => {
    expect(load(new MemoryStorage())).toEqual(defaultPersisted());
    expect(defaultPersisted().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid settings and drops bad ones field by field', () => {
    const s = sanitizeSettings({
      variant: 'ez',
      tiePays: 9,
      unitCents: 2_550, // not whole dollars: rounds to $26
      handsPerHour: 1e9,
      shoeTracker: true,
      showRoads: 'yes',
      theme: 'neon',
      confirmCostlyBets: false,
    });
    expect(s.variant).toBe('ez');
    expect(s.tiePays).toBe(9);
    expect(s.unitCents).toBe(2_600);
    expect(s.handsPerHour).toBe(500);
    expect(s.shoeTracker).toBe(true);
    expect(s.showRoads).toBe(DEFAULT_SETTINGS.showRoads);
    expect(s.theme).toBe('system');
    expect(s.confirmCostlyBets).toBe(false);
    expect(sanitizeSettings({ variant: 'chemmy', tiePays: 7 })).toMatchObject({
      variant: 'punto-banco',
      tiePays: 8,
    });
  });

  it('has no squeeze or continuous-shuffle setting (D7, D8)', () => {
    const keys = Object.keys(DEFAULT_SETTINGS).join(' ').toLowerCase();
    expect(keys).not.toMatch(/squeeze|shuffle|csm/);
  });

  it('sanitizes drill stats per category (D29) and caps misses', () => {
    const misses = Array.from({ length: 80 }, (_, i) => `banker-5:${i}`);
    const d = load(
      withData({
        version: 1,
        drill: {
          bestStreak: 7,
          byCategory: { 'banker-5': { answered: 4, correct: 9 }, bogus: { answered: 1 } },
          recentMisses: [...misses, 42, 'banker-5:0'],
        },
      }),
    ).drill;
    expect(d.bestStreak).toBe(7);
    expect(d.byCategory).toEqual({ 'banker-5': { answered: 4, correct: 4 } });
    expect(d.recentMisses).toHaveLength(MAX_RECENT_MISSES);
    expect(d.recentMisses[0]).toBe('banker-5:0');
  });

  it('backs up unreadable data and never throws', () => {
    const m = withData('{not json');
    expect(load(m)).toEqual(defaultPersisted());
    expect(m.keys().some((k) => k.startsWith(`${STORAGE_KEY}:backup-`))).toBe(true);
  });

  it('is read-only on data from a newer version', () => {
    const r = loadDetailed(withData({ version: 2, lessons: {} }));
    expect(r.readOnly).toBe(true);
    expect(r.data).toEqual(defaultPersisted());
  });

  it('ignores prototype-polluting keys', () => {
    const d = load(withData('{"version":1,"lessons":{"__proto__":{"quizzes":{}},"a":{}}}'));
    expect(Object.keys(d.lessons)).toEqual(['a']);
    expect(({} as Record<string, unknown>).quizzes).toBeUndefined();
  });

  it('round-trips export / import and rejects junk', () => {
    const data = {
      ...defaultPersisted(),
      lessons: { welcome: { quizzes: {}, scenes: {}, completedAt: 5 } },
    };
    const code = encodeExport(data);
    expect(code.startsWith(EXPORT_PREFIX)).toBe(true);
    expect(decodeImport(code)).toEqual(data);
    expect(decodeImport('holdumb1:abc')).toBeNull();
    expect(decodeImport(`${EXPORT_PREFIX}!!!`)).toBeNull();
  });
});

describe('Store', () => {
  it('debounces saves by 300 ms and flushes on demand', () => {
    vi.useFakeTimers();
    const m = new MemoryStorage();
    const s = new Store(m);
    s.updateSettings({ variant: 'super-6' });
    expect(m.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(300);
    expect(load(m).settings.variant).toBe('super-6');
    s.updateSettings({ tiePays: 9 });
    s.flush();
    expect(load(m).settings.tiePays).toBe(9);
  });

  it('tracks lesson status, quizzes (first try) and scenes', () => {
    const s = new Store(new MemoryStorage());
    expect(s.status('a')).toBe('new');
    s.start('a');
    expect(s.status('a')).toBe('progress');
    s.markQuiz('a', 'a-q1', false);
    s.markQuiz('a', 'a-q1', true);
    expect(s.lesson('a')?.quizzes['a-q1']).toEqual({ correct: true, attempts: 2, firstTry: false });
    s.markSceneStep('a', 'l01-s1', 2);
    s.markSceneStep('a', 'l01-s1', 1);
    s.markSceneComplete('a', 'l01-s1');
    expect(s.lesson('a')?.scenes['l01-s1']).toEqual({ completed: true, step: 2 });
    s.completeLesson('a');
    expect(s.status('a')).toBe('done');
    s.completeLesson('a', false);
    expect(s.status('a')).toBe('progress');
  });

  it('records Drill answers per category, streaks and misses', () => {
    const s = new Store(new MemoryStorage());
    s.recordDrill('banker-5', true, 'c1');
    s.recordDrill('banker-5', true, 'c2');
    s.recordDrill('natural', false, 'c3');
    s.recordDrill('banker-5', false, 'c4');
    expect(s.drill.byCategory['banker-5']).toEqual({ answered: 3, correct: 2 });
    expect(s.drill.byCategory.natural).toEqual({ answered: 1, correct: 0 });
    expect(s.drill.bestStreak).toBe(2);
    expect(s.drillStreak).toBe(0);
    expect(s.drill.recentMisses).toEqual(['c4', 'c3']);
    s.recordDrill('natural', true, 'c3'); // a right answer clears the miss
    expect(s.drill.recentMisses).toEqual(['c4']);
    s.resetDrill();
    expect(s.drill).toEqual({ bestStreak: 0, byCategory: {}, recentMisses: [] });
  });

  it('notifies subscribers and survives a reload', () => {
    const m = new MemoryStorage();
    const s = new Store(m);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.completeLesson('x');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    s.flush();
    expect(new Store(m).status('x')).toBe('done');
  });

  it('keeps the sandbox snapshot without notifying, and exports it', () => {
    const s = new Store(new MemoryStorage());
    const fn = vi.fn();
    s.subscribe(fn);
    s.setSandbox({ shoe: [1, 2, 3] });
    expect(fn).not.toHaveBeenCalled();
    expect(decodeImport(s.exportCode())?.sandbox).toEqual({ shoe: [1, 2, 3] });
  });

  it('imports a code and resets progress (keeping settings)', () => {
    const a = new Store(new MemoryStorage());
    a.completeLesson('x');
    a.updateSettings({ variant: 'ez' });
    const b = new Store(new MemoryStorage());
    expect(b.importCode('nope')).toBe(false);
    expect(b.importCode(a.exportCode())).toBe(true);
    expect(b.status('x')).toBe('done');
    b.reset();
    expect(b.status('x')).toBe('new');
    expect(b.settings.variant).toBe('ez');
    b.reset(true);
    expect(b.settings.variant).toBe('punto-banco');
  });

  it('reports not persistent when storage refuses writes, and never overwrites newer data', () => {
    const full: MemoryStorage = Object.assign(new MemoryStorage(), {
      setItem: () => {
        throw new Error('quota');
      },
    });
    const s = new Store(full);
    expect(s.persistent).toBe(true);
    s.completeLesson('x');
    s.flush();
    expect(s.persistent).toBe(false);

    const newer = withData({ version: 9 });
    const t = new Store(newer);
    expect(t.persistent).toBe(false);
    t.completeLesson('x');
    t.flush();
    expect(JSON.parse(newer.getItem(STORAGE_KEY)!)).toEqual({ version: 9 });
  });
});

describe('progress helpers', () => {
  const lesson = (id: string, quizzes: string[] = []) => ({
    id,
    title: id,
    summary: '',
    minutes: 1,
    chapterId: 'c',
    blocks: quizzes.map((q) => ({
      kind: 'quiz' as const,
      quiz: { id: q, prompt: 'q', choices: ['a', 'b'], answer: 0, explanation: 'e' },
    })),
  });
  const content: ContentBundle = {
    chapters: [{ id: 'c', title: 'C', summary: '', lessons: ['a', 'b', FINAL_EXAM_ID] }],
    lessons: [lesson('a'), lesson('b'), lesson(FINAL_EXAM_ID, ['e1', 'e2'])],
    glossary: [],
    bets: {},
    systems: {},
  };

  it('finds the next unfinished lesson and the overall progress', () => {
    const s = new Store(new MemoryStorage());
    expect(nextLesson(content, s)).toBe('a');
    s.completeLesson('a');
    expect(nextLesson(content, s)).toBe('b');
    expect(overallProgress(content, s)).toEqual({ done: 1, total: 3 });
  });

  it('scores the final exam on first tries only', () => {
    const s = new Store(new MemoryStorage());
    s.markQuiz(FINAL_EXAM_ID, 'e1', true);
    s.markQuiz(FINAL_EXAM_ID, 'e2', false);
    s.markQuiz(FINAL_EXAM_ID, 'e2', true);
    expect(finalExamScore(content, s)).toBe(0.5);
    s.resetLesson(FINAL_EXAM_ID);
    expect(finalExamScore(content, s)).toBe(0);
  });
});
