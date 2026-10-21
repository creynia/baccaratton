// Lessons 17–24 (content-c, decisions.md D24): files, front matter, scenes, quizzes, banned
// wording, and every number the prose quotes, recomputed. The exact tableau below is an
// independent oracle (integer weights over ordered six-card sequences); the engine, math and
// strategy registries are checked against the same pins further down.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileLesson, type CompiledLesson } from '../../src/content/compile';
import { BET_IDS, STRATEGY_IDS, expectedUnitsBet, parseCards, playHand, resolveRules, settleHand, validateScene } from '../../src/sim';
import type { BetId, SceneConfig, SceneStep } from '../../src/sim';

const DIR = join(process.cwd(), 'content/lessons');
const LESSONS: readonly [number, string, string][] = [
  [17, 'card-counting', 'perfect-practical'],
  [18, 'strategy-practical', 'perfect-practical'],
  [19, 'betting-systems', 'perfect-fun'],
  [20, 'pairs-and-dragon-bonus', 'perfect-fun'],
  [21, 'ez-side-bets', 'perfect-fun'],
  [22, 'strategy-fun-per-dollar', 'perfect-fun'],
  [23, 'at-the-casino', 'real-casino'],
  [24, 'final-exam', 'real-casino'],
];

const source = (n: number, id: string) => readFileSync(join(DIR, `${n}-${id}.md`), 'utf8');
const compiled = new Map<string, CompiledLesson>(
  LESSONS.map(([n, id]) => [id, compileLesson(source(n, id), `${n}-${id}.md`)]),
);
const lesson = (id: string) => compiled.get(id)!;
const prose = (id: string) => {
  const n = LESSONS.find((l) => l[1] === id)![0];
  return source(n, id);
};
const scenes = (id: string): SceneConfig[] =>
  lesson(id).blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene] : []));
const scene = (sid: string): SceneConfig => {
  const s = [...compiled.keys()].flatMap(scenes).find((x) => x.id === sid);
  if (!s) throw new Error(`no scene ${sid}`);
  return s;
};
const quizzes = (id: string) =>
  lesson(id).blocks.flatMap((b) => (b.kind === 'quiz' ? [b.quiz] : []));
/** Asserts the lesson source contains every snippet. */
const quotes = (id: string, ...snippets: string[]) => {
  const text = prose(id);
  for (const s of snippets) expect(text, `${id} should say ${JSON.stringify(s)}`).toContain(s);
};

// ---------------------------------------------------------------- exact oracle

type Comp = readonly number[]; // count by point value 0..9
const FULL8: Comp = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];

interface Cell {
  pt: number;
  bt: number;
  pc: 2 | 3;
  bc: 2 | 3;
  w: bigint;
}
interface Dist {
  cells: Cell[];
  total: bigint;
}

function bankerDrawsOracle(bt: number, third: number | null): boolean {
  if (third === null) return bt <= 5;
  if (bt <= 2) return true;
  if (bt === 3) return third !== 8;
  if (bt === 4) return third >= 2 && third <= 7;
  if (bt === 5) return third >= 4 && third <= 7;
  if (bt === 6) return third === 6 || third === 7;
  return false;
}

/** Exact tableau outcome distribution over ordered six-card sequences (weights fit in 2^53). */
function dist(comp: Comp): Dist {
  const c = [...comp];
  const N = c.reduce((a, b) => a + b, 0);
  const fall = (n: number, k: number) => {
    let r = 1;
    for (let i = 0; i < k; i++) r *= n - i;
    return r;
  };
  const acc = new Map<string, number>();
  const add = (pt: number, bt: number, pc: number, bc: number, w: number, used: number) => {
    const key = `${pt},${bt},${pc},${bc}`;
    acc.set(key, (acc.get(key) ?? 0) + w * fall(N - used, 6 - used));
  };
  const take = (v: number, w: number, f: (w: number) => void) => {
    if (c[v]! === 0) return;
    const ww = w * c[v]!;
    c[v]!--;
    f(ww);
    c[v]!++;
  };
  for (let p1 = 0; p1 < 10; p1++)
    take(p1, 1, (w1) => {
      for (let b1 = 0; b1 < 10; b1++)
        take(b1, w1, (w2) => {
          for (let p2 = 0; p2 < 10; p2++)
            take(p2, w2, (w3) => {
              for (let b2 = 0; b2 < 10; b2++)
                take(b2, w3, (w4) => {
                  const pt = (p1 + p2) % 10;
                  const bt = (b1 + b2) % 10;
                  if (pt >= 8 || bt >= 8) return add(pt, bt, 2, 2, w4, 4);
                  if (pt >= 6) {
                    if (bt <= 5)
                      for (let b3 = 0; b3 < 10; b3++)
                        take(b3, w4, (w5) => add(pt, (bt + b3) % 10, 2, 3, w5, 5));
                    else add(pt, bt, 2, 2, w4, 4);
                    return;
                  }
                  for (let p3 = 0; p3 < 10; p3++)
                    take(p3, w4, (w5) => {
                      const pt3 = (pt + p3) % 10;
                      if (bankerDrawsOracle(bt, p3))
                        for (let b3 = 0; b3 < 10; b3++)
                          take(b3, w5, (w6) => add(pt3, (bt + b3) % 10, 3, 3, w6, 6));
                      else add(pt3, bt, 3, 2, w5, 5);
                    });
                });
            });
        });
    });
  const cells: Cell[] = [...acc].map(([k, w]) => {
    const [pt, bt, pc, bc] = k.split(',').map(Number) as [number, number, 2 | 3, 2 | 3];
    expect(Number.isSafeInteger(w)).toBe(true);
    return { pt, bt, pc, bc, w: BigInt(w) };
  });
  return { cells, total: BigInt(fall(N, 6)) };
}

// Exact rationals.
interface Q {
  n: bigint;
  d: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
};
const q = (n: bigint, d = 1n): Q => {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
};
const qs = (s: string): Q => {
  const [a, b = '1'] = s.replace('−', '-').split('/');
  return q(BigInt(a!), BigInt(b));
};
const num = (x: Q) => Number(x.n) / Number(x.d);
const pct = (x: Q) => 100 * num(x);
const qeq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;

type Pay = (c: Cell) => [bigint, bigint] | 'push' | 'lose';
/** EV per unit: Σ weight × net / total, with net = a/b for a win. */
function ev(d: Dist, pay: Pay): Q {
  let n = 0n;
  const den = 100n; // every net below has a denominator dividing 100 (0.95, 0.54, 1.5, 0.5)
  for (const c of d.cells) {
    const r = pay(c);
    if (r === 'push') continue;
    if (r === 'lose') n -= c.w * den;
    else n += (c.w * den * r[0]) / r[1];
  }
  return q(n, d.total * den);
}
const prob = (d: Dist, f: (c: Cell) => boolean): Q =>
  q(
    d.cells.reduce((a, c) => (f(c) ? a + c.w : a), 0n),
    d.total,
  );

const bWin = (c: Cell) => c.bt > c.pt;
const pWin = (c: Cell) => c.pt > c.bt;
const tie = (c: Cell) => c.pt === c.bt;
const pNat = (c: Cell) => c.pc === 2 && c.pt >= 8 && c.bc === 2;
const bNat = (c: Cell) => c.bc === 2 && c.bt >= 8 && c.pc === 2;

const PAYS = {
  banker: (c) => (bWin(c) ? [19n, 20n] : tie(c) ? 'push' : 'lose'),
  player: (c) => (pWin(c) ? [1n, 1n] : tie(c) ? 'push' : 'lose'),
  tie8: (c) => (tie(c) ? [8n, 1n] : 'lose'),
  tie9: (c) => (tie(c) ? [9n, 1n] : 'lose'),
  ezBanker: (c) =>
    bWin(c) ? (c.bc === 3 && c.bt === 7 ? 'push' : [1n, 1n]) : tie(c) ? 'push' : 'lose',
  super6Banker: (c) =>
    bWin(c) ? (c.bt === 6 ? [1n, 2n] : [1n, 1n]) : tie(c) ? 'push' : 'lose',
  dragon7: (c) => (bWin(c) && c.bc === 3 && c.bt === 7 ? [40n, 1n] : 'lose'),
  panda8: (c) => (pWin(c) && c.pc === 3 && c.pt === 8 ? [25n, 1n] : 'lose'),
  dbPlayer: dragonBonus('player'),
  dbBanker: dragonBonus('banker'),
  lucky6: (c) => (bWin(c) && c.bt === 6 ? (c.bc === 2 ? [12n, 1n] : [20n, 1n]) : 'lose'),
  big: (c) => (c.pc + c.bc >= 5 ? [27n, 50n] : 'lose'),
  small: (c) => (c.pc + c.bc === 4 ? [3n, 2n] : 'lose'),
  super6Side12: (c) => (bWin(c) && c.bt === 6 ? [12n, 1n] : 'lose'),
  super6Side15: (c) => (bWin(c) && c.bt === 6 ? [15n, 1n] : 'lose'),
} satisfies Record<string, Pay>;
type PayId = keyof typeof PAYS;
const MARGIN_PAY: Record<number, bigint> = { 9: 30n, 8: 10n, 7: 6n, 6: 4n, 5: 2n, 4: 1n };
function dragonBonus(side: 'player' | 'banker'): Pay {
  return (c) => {
    const mine = side === 'player' ? c.pt : c.bt;
    const theirs = side === 'player' ? c.bt : c.pt;
    const natural = (side === 'player' ? c.pc : c.bc) === 2 && mine >= 8 && c.pc === 2 && c.bc === 2;
    if (natural && mine > theirs) return [1n, 1n];
    if (natural && mine === theirs) return 'push';
    const m = mine - theirs;
    const pay = MARGIN_PAY[m];
    return !natural && pay !== undefined ? [pay, 1n] : 'lose';
  };
}

const D8 = dist(FULL8);
const EV = Object.fromEntries(Object.entries(PAYS).map(([k, f]) => [k, ev(D8, f)])) as Record<
  PayId,
  Q
>;
const edge = (k: PayId) => -pct(EV[k]);
/** Dollars per hour at `stake` dollars a hand, 72 hands an hour (D5). */
const perHour = (k: PayId, stake: number, hands = 72) => -num(EV[k]) * stake * hands;
const cents = (x: number) => Math.round(x * 100) / 100;

// Pair bets (rank composition: 32 cards of each of 13 ranks in 8 decks, 24 in 6).
function pairs(decks: number) {
  const r = 4n * BigInt(decks); // per rank
  const s = BigInt(decks); // per exact card
  const N = 52n * s;
  const pPair = q(13n * r * (r - 1n), N * (N - 1n));
  const f4 = N * (N - 1n) * (N - 2n) * (N - 3n);
  const both = q(13n * r * (r - 1n) * (r - 2n) * (r - 3n) + 156n * (r * (r - 1n)) ** 2n, f4);
  const either = q(2n * pPair.n * both.d - both.n * pPair.d, pPair.d * both.d);
  const pPerfect = q(52n * s * (s - 1n), N * (N - 1n));
  const perfectBoth = q(52n * s * (s - 1n) * (s - 2n) * (s - 3n) + 52n * 51n * (s * (s - 1n)) ** 2n, f4);
  const perfectAny = q(
    2n * pPerfect.n * perfectBoth.d - perfectBoth.n * pPerfect.d,
    pPerfect.d * perfectBoth.d,
  );
  return { pPair, both, either, perfectAny, perfectBoth };
}
const P8 = pairs(8);
const P6 = pairs(6);
const pairEv = (p: Q) => q(12n * p.n - p.d, p.d);
const eitherEv = q(6n * P8.either.n - P8.either.d, P8.either.d);
// Perfect Pair 25:1 one side, 200:1 both: EV = 26·P(exactly one) + 201·P(both) − 1.
const perfectEv = (() => {
  const one = q(P8.perfectAny.n * P8.perfectBoth.d - P8.perfectBoth.n * P8.perfectAny.d, P8.perfectAny.d * P8.perfectBoth.d);
  const n = 26n * one.n * P8.perfectBoth.d + 201n * P8.perfectBoth.n * one.d - one.d * P8.perfectBoth.d;
  return q(n, one.d * P8.perfectBoth.d);
})();

// ---------------------------------------------------------------- files and structure

describe('lessons 17–24: files, front matter and blocks', () => {
  it('has exactly the eight content-c lesson files', () => {
    const mine = readdirSync(DIR).filter((f) => /^(1[7-9]|2[0-4])-/.test(f));
    expect(mine.sort()).toEqual(LESSONS.map(([n, id]) => `${n}-${id}.md`).sort());
  });

  it.each(LESSONS)('lesson %i (%s) compiles with its front matter', (_n, id, chapter) => {
    const l = lesson(id);
    expect(l.id).toBe(id);
    expect(l.chapter).toBe(chapter);
    expect(l.title.length).toBeGreaterThan(3);
    expect(l.summary.length).toBeGreaterThan(10);
    expect(l.minutes).toBeGreaterThan(0);
    expect(l.blocks.some((b) => b.kind === 'scene')).toBe(true);
    expect(quizzes(id).length).toBeGreaterThanOrEqual(3);
  });

  it('marks the final exam as a checkpoint', () => {
    expect(prose('final-exam')).toMatch(/^checkpoint: true$/m);
  });

  it('uses the curriculum titles and minutes', () => {
    const want: Record<string, [string, number]> = {
      'card-counting': ['Can you count cards at baccarat?', 9],
      'strategy-practical': ['Perfect strategy II: a plan you can follow', 6],
      'betting-systems': ['Martingale, Paroli and friends: what they really cost', 10],
      'pairs-and-dragon-bonus': ['Pairs and the Dragon Bonus', 7],
      'ez-side-bets': ['Dragon 7, Panda 8 and the rest of the side bets', 7],
      'strategy-fun-per-dollar': ['Perfect strategy III: the most fun per dollar', 7],
      'at-the-casino': ['Playing at a real table', 7],
      'final-exam': ['Final exam', 10],
    };
    for (const [id, [title, minutes]] of Object.entries(want)) {
      expect(lesson(id).title).toBe(title);
      expect(lesson(id).minutes).toBe(minutes);
    }
  });

  it('has the expected scenes and quiz counts', () => {
    const want: Record<string, [string[], number]> = {
      'card-counting': [['l17-s1', 'l17-s2'], 3],
      'strategy-practical': [['l18-s1'], 3],
      'betting-systems': [['l19-s1'], 4],
      'pairs-and-dragon-bonus': [['l20-s1'], 4],
      'ez-side-bets': [['l21-s1'], 3],
      'strategy-fun-per-dollar': [['l22-s1'], 3],
      'at-the-casino': [['l23-s1'], 4],
      'final-exam': [['l24-s1', 'l24-s2'], 9],
    };
    for (const [id, [ids, nq]] of Object.entries(want)) {
      expect(scenes(id).map((s) => s.id)).toEqual(ids);
      expect(quizzes(id)).toHaveLength(nq);
    }
  });

  it('keeps every quiz answer in range with an explanation', () => {
    for (const [, id] of LESSONS)
      for (const qz of quizzes(id)) {
        expect(qz.answer).toBeGreaterThanOrEqual(0);
        expect(qz.answer).toBeLessThan(qz.choices.length);
        expect(new Set(qz.choices).size).toBe(qz.choices.length);
        expect(qz.explanation.length).toBeGreaterThan(0);
      }
  });
});

// ---------------------------------------------------------------- scenes

const allScenes = LESSONS.flatMap(([, id]) => scenes(id));
const steps = (s: SceneConfig): SceneStep[] => s.steps ?? [];

describe('lessons 17–24: scenes (simulator SceneConfig dialect, D26–D28, D36, D38)', () => {
  it.each(allScenes.map((s) => [s.id, s] as const))('%s passes validateScene', (_id, s) => {
    const res = validateScene(s);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('uses only real bet and strategy ids', () => {
    for (const s of allScenes) {
      for (const b of [...(s.allowedBets ?? []), ...Object.keys(s.bets ?? {})])
        expect(BET_IDS as readonly string[]).toContain(b);
      for (const st of steps(s))
        for (const b of st.allowedBets ?? []) expect(BET_IDS as readonly string[]).toContain(b);
      for (const spec of [...(s.autoPlay?.compare ?? []), ...(s.autoPlay?.defaultStrategy ? [s.autoPlay.defaultStrategy] : [])]) {
        expect(STRATEGY_IDS as readonly string[]).toContain(spec.id);
        for (const b of Object.keys(spec.sideBets ?? {})) expect(BET_IDS as readonly string[]).toContain(b);
      }
    }
  });

  it('locks Deal on betting steps and on steps that wait for a tap or a button', () => {
    for (const s of allScenes)
      for (const st of steps(s)) {
        const cw = JSON.stringify(st.completeWhen);
        if (/betOnFelt|previewed|tapped|acknowledged/.test(cw) && !/hands|predicted/.test(cw))
          expect(st.allowedActions ?? ['deal'], `${s.id}/${st.id}`).not.toContain('deal');
        if ('acknowledged' in st.completeWhen) {
          expect(st.allowedActions, `${s.id}/${st.id}`).toEqual([]);
          expect(st.advance).toBe('button');
        }
      }
  });

  it('D38: auto-play run steps allow no table actions', () => {
    for (const id of ['l19-s1', 'l22-s1']) {
      const run = steps(scene(id)).find((st) => st.id === 'run')!;
      expect(run.allowedActions).toEqual([]);
      expect(run.completeWhen).toHaveProperty('autoPlayCompleted');
    }
  });

  it('D30: l17-s1 deals 20 hands with Rebet & Deal, and the tracker is on', () => {
    const s = scene('l17-s1');
    expect(s.ui?.shoeTracker).toBe(true);
    const run = steps(s).find((st) => st.id === 'run')!;
    expect(run.allowedActions).toEqual(['deal', 'rebet']);
    expect(run.completeWhen).toEqual({ hands: 20 });
    expect(run.text).toContain('rows');
    expect(run.text).not.toMatch(/\blines\b/);
  });

  it('D26/D36: l17-s2 removes cards to leave 52: 17 tens, 4 aces, five each of 2–7, no 8s, one 9', () => {
    const s = scene('l17-s2');
    expect(s.variant).toBe('ez');
    const shoe = s.shoe;
    expect(typeof shoe).toBe('object');
    const removed = (shoe as { removed: Record<string, number> }).removed;
    const left = FULL8.map((n, v) => n - (removed[String(v)] ?? 0));
    expect(left).toEqual([17, 4, 5, 5, 5, 5, 5, 5, 0, 1]);
    expect(left.reduce((a, b) => a + b, 0)).toBe(52);
    // Fewer than 40 cards before the cut card: no step may deal (D36).
    for (const st of steps(s)) expect(st.allowedActions ?? []).not.toContain('deal');
  });

  it('D28: lesson 19 compares the eight systems with their caps on one seed', () => {
    const ap = scene('l19-s1').autoPlay!;
    expect(ap.enabled).toBe(true);
    expect(ap.handOptions).toEqual([72]);
    expect(ap.sessions).toEqual([100]);
    expect(ap.compare!.map((c) => c.id)).toEqual([
      'flat-banker',
      'follow-the-shoe',
      'paroli',
      'one-three-two-six',
      'fibonacci',
      'martingale',
      'dalembert',
      'labouchere',
    ]);
    const by = Object.fromEntries(ap.compare!.map((c) => [c.id, c]));
    expect(by.martingale!.maxSteps).toBe(7);
    expect(by.dalembert!.maxUnits).toBe(20);
    expect(by.labouchere!.maxBetUnits).toBe(100);
    expect(by.labouchere!.sequence).toEqual([1, 2, 3, 4]);
    for (const c of ap.compare!) expect(c.unit).toBe(1000);
    expect(scene('l19-s1').bankroll).toBe(1_000_000);
  });

  it('lesson 22 compares three plans over 720 hands, with labels', () => {
    const ap = scene('l22-s1').autoPlay!;
    expect(ap.handOptions).toEqual([720]);
    expect(ap.compare!.map((c) => c.label)).toEqual([
      '$10 Banker',
      '+ $5 Dragon Bonus Player',
      '+ $5 Tie',
    ]);
    expect(ap.compare!.map((c) => c.sideBets ?? {})).toEqual([
      {},
      { 'dragon-bonus-player': 500 },
      { tie: 500 },
    ]);
  });

  it('forced hands obey the tableau and produce what the step text says', () => {
    const hands: Record<string, { pt: number; bt: number; winner: string }> = {
      'l20-s1': { pt: 9, bt: 0, winner: 'player' },
      'l21-s1': { pt: 8, bt: 5, winner: 'player' },
      'l23-s1': { pt: 7, bt: 9, winner: 'banker' },
    };
    const val = (c: string) => {
      const r = c[0]!;
      return 'TJQK'.includes(r) ? 0 : r === 'A' ? 1 : Number(r);
    };
    for (const [sid, want] of Object.entries(hands)) {
      const deal = steps(scene(sid)).find((st) => st.deals)!;
      expect(deal.allowedActions).toEqual(['deal']);
      expect(deal.deals).toHaveLength(1);
      const { player, banker } = deal.deals![0]!;
      const p2 = (val(player[0]!) + val(player[1]!)) % 10;
      const b2 = (val(banker[0]!) + val(banker[1]!)) % 10;
      const natural = p2 >= 8 || b2 >= 8;
      const pDraws = !natural && p2 <= 5;
      expect(player.length === 3).toBe(pDraws);
      const third = pDraws ? val(player[2]!) : null;
      expect(banker.length === 3).toBe(!natural && bankerDrawsOracle(b2, third));
      const pt = player.reduce((a, c) => a + val(c), 0) % 10;
      const bt = banker.reduce((a, c) => a + val(c), 0) % 10;
      expect({ pt, bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' }).toEqual(want);
    }
  });

  it('final exam: five random calls with skipNaturals, then the EZ Banker bet', () => {
    const s = scene('l24-s1');
    expect(s.onDealsExhausted).toBe('random');
    const [p, b] = steps(s);
    expect(p!.predict).toEqual({ kind: 'player-draws' });
    expect(p!.pauseAt).toBe('two-cards');
    expect(p!.completeWhen).toEqual({ predicted: { correct: true, count: 2 } });
    expect(b!.predict).toEqual({ kind: 'banker-draws' });
    expect(b!.pauseAt).toBe('player-third');
    expect(b!.completeWhen).toEqual({ predicted: { correct: true, count: 3 } });
    for (const st of [p!, b!]) {
      expect(st.skipNaturals).toBe(true);
      expect(st.allowedActions).toEqual(['deal']);
    }
    const s2 = scene('l24-s2');
    expect(s2.variant).toBe('ez');
    expect(steps(s2)[0]!.completeWhen).toEqual({ betOnFelt: { bet: 'banker', minAmount: 1000 } });
  });
});

// ---------------------------------------------------------------- wording

describe('lessons 17–24: wording (decisions.md)', () => {
  const all = LESSONS.map(([n, id]) => source(n, id)).join('\n');
  it('uses the SceneConfig dialect only (D26)', () => {
    for (const bad of [/place-bet/, /\bremaining:/, /predict: \{[^}]*hand:/, /rules: \{/])
      expect(all).not.toMatch(bad);
    for (const s of allScenes)
      for (const spec of s.autoPlay?.compare ?? []) {
        expect(spec).not.toHaveProperty('bet');
        expect(spec).not.toHaveProperty('side');
      }
  });
  it('keeps the D7 squeeze and D30 copy fixes', () => {
    quotes('at-the-casino', 'The app always reveals cards with a quick flip.');
    expect(all).not.toMatch(/squeeze (feature|mode|button)/i);
    expect(all).not.toMatch(/changes nothing material/);
    expect(all).not.toMatch(/band's centre/);
    expect(all).not.toMatch(/continuous shuffl/i);
    expect(all).not.toMatch(/Natural, nobody draws/);
    quotes('strategy-fun-per-dollar', 'expected line ends');
    quotes('card-counting', '52 cards left, no 4s and eight 6s', 'about **1 hand in 500**', 'about **0.4%**', 'about **5 cents an hour**', 'about **9% of hands**', 'about **+8%**', '**$13 an hour**');
  });
  it('labels simulated figures (≈ simulated)', () => {
    quotes('card-counting', '(≈ simulated)');
    quotes('betting-systems', '≈ $95 (≈ simulated)');
  });
});

// ---------------------------------------------------------------- pinned numbers (oracle)

describe('lessons 17–24: every quoted number, recomputed exactly', () => {
  it('the oracle reproduces the pinned 8-deck values (curriculum.md §11)', () => {
    expect(D8.cells).toHaveLength(205);
    expect(D8.total).toBe(4998398275503360n);
    expect(qeq(EV.player, qs('-241149546272/19524993263685'))).toBe(true);
    expect(qeq(EV.banker, qs('-114753351728/10847218479825'))).toBe(true);
    expect(qeq(EV.ezBanker, qs('-66274384744/6508331087895'))).toBe(true);
    expect(qeq(EV.super6Banker, qs('-284694798368/19524993263685'))).toBe(true);
    expect(qeq(EV.tie8, qs('-103841353768/723147898655'))).toBe(true);
    expect(qeq(EV.tie9, qs('-63053127805/1301666217579'))).toBe(true);
    expect(qeq(EV.dragon7, qs('-64613588827/848912750595'))).toBe(true);
    expect(qeq(EV.panda8, qs('-153010345753/1501922558745'))).toBe(true);
    expect(qeq(EV.dbPlayer, qs('-103547854751/3904998652737'))).toBe(true);
    expect(qeq(EV.dbBanker, qs('-9683026823/103306842665'))).toBe(true);
    expect(qeq(EV.lucky6, qs('-47209656769/282970916865'))).toBe(true);
    expect(qeq(EV.big, qs('-22999/529230'))).toBe(true);
    expect(qeq(EV.small, qs('-19571/370461'))).toBe(true);
    expect(qeq(EV.super6Side12, qs('-90046773893/300384511749'))).toBe(true);
    expect(qeq(EV.super6Side15, qs('-539594847041/3904998652737'))).toBe(true);
    expect(qeq(P8.pPair, qs('31/415'))).toBe(true);
    expect(qeq(P8.both, qs('65999/11826255'))).toBe(true);
    expect(qeq(P8.either, qs('340163/2365251'))).toBe(true);
    expect(qeq(eitherEv, qs('-108091/788417'))).toBe(true);
    expect(qeq(perfectEv, qs('-135952/1689465'))).toBe(true);
    expect(qeq(P6.pPair, qs('23/311'))).toBe(true);
  });

  it('lesson 17: effects of removal on Banker and Player', () => {
    const removeOne = (v: number) => dist(FULL8.map((n, i) => (i === v ? n - 1 : n)));
    const rows: [number, string, string][] = [
      [4, '+0.0116%', '−0.0120%'],
      [3, '+0.0065%', '−0.0067%'],
      [6, '−0.0113%', '+0.0113%'],
      [5, '−0.0083%', '+0.0084%'],
    ];
    const fmt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(4)}%`;
    let maxBanker = 0;
    for (let v = 0; v < 10; v++) {
      const d = removeOne(v);
      const db = pct(ev(d, PAYS.banker)) - pct(EV.banker);
      maxBanker = Math.max(maxBanker, Math.abs(db));
      const row = rows.find((r) => r[0] === v);
      if (row) {
        const dp = pct(ev(d, PAYS.player)) - pct(EV.player);
        expect([fmt(db), fmt(dp)]).toEqual([row[1], row[2]]);
        quotes('card-counting', `| ${v} | ${v === 4 || v === 6 ? `**${row[1]}**` : row[1]} | ${row[2]} |`);
      }
      // Dragon 7 effects of removal (the math box), % per card.
      const d7 = (pct(ev(d, PAYS.dragon7)) - pct(EV.dragon7));
      const want = [0.086, 0.05, -0.09, -0.108, -0.268, -0.263, -0.324, -0.358, 0.538, 0.479][v]!;
      expect(d7).toBeCloseTo(want, 3);
    }
    expect(maxBanker).toBeLessThan(0.012);
    expect(maxBanker).toBeGreaterThan(0.0115);
    quotes('card-counting', 'at most 0.012%', 'Effects of removal (fresh 8 decks, % per card, Dragon 7): 0s +0.086, A +0.050, 2 −0.090, 3 −0.108, 4 −0.268,\n5 −0.263, 6 −0.324, 7 −0.358, 8 **+0.538**, 9 **+0.479**');
  });

  it('lesson 17: the count signs follow the Dragon 7 effects of removal', () => {
    // Seeing a card = removing it: 4–7 hurt (count −1), 8 and 9 help (+2), the rest ~0.
    quotes('card-counting', '| Count | −1 | **+2** | 0 |', 'When it\'s **+4 or more**');
  });

  it('lesson 17: the 52-card shoes', () => {
    const d7shoe = dist([17, 4, 5, 5, 5, 5, 5, 5, 0, 1]);
    const d7 = ev(d7shoe, PAYS.dragon7);
    expect(qeq(d7, qs('59135759/183226680'))).toBe(true);
    expect(Math.round(pct(d7))).toBe(32);
    expect(qeq(ev(d7shoe, PAYS.banker), qs('-306007601/24430224000'))).toBe(true);
    expect(qeq(ev(d7shoe, PAYS.panda8), qs('-18323/391510'))).toBe(true);
    expect(edge('dragon7').toFixed(2)).toBe('7.61');
    quotes('card-counting', 'about **+32%**', '−7.61%');
    const noFours = dist([16, 4, 4, 4, 0, 4, 8, 4, 4, 4]);
    const b = ev(noFours, PAYS.banker);
    expect(qeq(b, qs('-10635473/2290333500'))).toBe(true);
    expect(pct(b).toFixed(2)).toBe('-0.46');
    quotes('card-counting', 'the Banker is still at −0.46%', 'a 1.06% edge');
  });

  it('lessons 18 and 24: table choice and hourly costs', () => {
    expect([edge('ezBanker'), edge('banker'), edge('super6Banker'), edge('player')].map((x) => x.toFixed(2))).toEqual(['1.02', '1.06', '1.46', '1.24']);
    quotes('strategy-practical', 'EZ Baccarat (1.02%)', 'commission game (1.06%)', 'Super 6 for Banker bets (1.46%)', 'bet Player there (1.24%)');
    expect([cents(perHour('banker', 5)), cents(perHour('banker', 10)), Math.round(perHour('banker', 25))]).toEqual([3.81, 7.62, 19]);
    quotes('strategy-practical', '$5 Banker costs about $3.81 an hour, $10 about $7.62, $25 about $19');
    expect(cents(perHour('tie8', 10))).toBe(103.39);
    expect(cents(-pct(pairEv(P8.pPair)) / 100 * 5 * 72)).toBe(37.3);
    expect(cents(perHour('banker', 15, 36))).toBe(5.71);
    expect(cents(perHour('player', 10) - perHour('banker', 10))).toBe(1.28);
    expect(cents(perHour('banker', 10, 36))).toBe(3.81);
    quotes('strategy-practical', '| +$103.39 |', '| +$37.30 |', '| +$5.71 |', '| +$1.28 |', '| −$3.81 (saves) |');
    expect(cents(perHour('banker', 10, 12))).toBe(1.27);
    quotes('strategy-practical', 'Expected is about −$1.27 for 12 hands');
    expect(cents(perHour('banker', 25))).toBe(19.04);
    quotes('strategy-practical', '72 × $25 × 1.06% ≈ $19.04 an hour.', 'Player 1.24% beats Super 6 Banker 1.46%.');
    expect(cents(perHour('banker', 25, 144))).toBe(38.08);
    quotes('final-exam', '72 × 2 × $25 × 1.0579% ≈ $38.08.', 'EZ Banker: 1.02%.', 'Banker: 1.06%.', 'about 0.01%');
  });

  it('lesson 20: pairs and Dragon Bonus', () => {
    expect(pct(pairEv(P8.pPair)).toFixed(4)).toBe('-10.3614');
    expect(qeq(pairEv(P8.pPair), qs('-43/415'))).toBe(true);
    expect(qeq(pairEv(P6.pPair), qs('-35/311'))).toBe(true);
    expect(pct(pairEv(P6.pPair)).toFixed(4)).toBe('-11.2540');
    quotes('pairs-and-dragon-bonus', '**10.36%** with 8 decks, and **11.25%** with 6', '−43/415 ≈ −10.3614%', '23/311, EV −35/311 ≈ −11.2540%', 'P(pair) = 13 · 32 · 31 / (416 · 415) = 31/415');
    expect((1 / num(P8.pPair)).toFixed(1)).toBe('13.4');
    expect((1 / num(P8.pPair) - 1).toFixed(1)).toBe('12.4');
    quotes('pairs-and-dragon-bonus', 'once in 13.4\nhands per side', 'about 12.4 to 1');
    expect([edge('dbPlayer'), edge('dbBanker')].map((x) => x.toFixed(2))).toEqual(['2.65', '9.37']);
    quotes('pairs-and-dragon-bonus', 'the edge is **2.65%**', "it's **9.37%**", '−103547854751/3904998652737 ≈ **−2.6517%**');
    const natWin = prob(D8, (c) => pNat(c) && pWin(c));
    expect(qeq(natWin, qs('74989984/461223945'))).toBe(true);
    const natTie = prob(D8, (c) => pNat(c) && bNat(c) && tie(c));
    expect(qeq(natTie, qs('1648498/92244789'))).toBe(true);
    expect([pct(natWin).toFixed(3), pct(natTie).toFixed(3)]).toEqual(['16.259', '1.787']);
    const byM = [4, 5, 6, 7, 8, 9].map((m) => pct(prob(D8, (c) => !(c.pc === 2 && c.bc === 2 && (c.pt >= 8 || c.bt >= 8)) && c.pt - c.bt === m)).toFixed(3));
    expect(byM).toEqual(['3.737', '3.324', '2.826', '1.792', '0.682', '0.368']);
    quotes('pairs-and-dragon-bonus', '74989984/461223945 ≈ 16.259%', '1648498/92244789 ≈ 1.787%', '3.737%, 3.324%, 2.826%, 1.792%, 0.682%, 0.368%');
    expect([cents(perHour('dbPlayer', 5)), cents(perHour('dbBanker', 5)), cents((43 / 415) * 5 * 72)]).toEqual([9.55, 33.74, 37.3]);
    quotes('pairs-and-dragon-bonus', '| Dragon Bonus, Player | 2.65% | $9.55 |', '| Dragon Bonus, Banker | 9.37% | $33.74 |', '| Player Pair or Banker Pair | 10.36% | $37.30 |');
    // The scene: Pair 11:1 on $5, Dragon Bonus 30:1 on $5, Player 1:1 on $10.
    expect([5 * 11, 5 * 30, 10, 55 + 150 + 10]).toEqual([55, 150, 10, 215]);
    quotes('pairs-and-dragon-bonus', '+$55', '**+$150**', 'Total **+$215**', 'once in 270 hands');
    expect(1 / num(prob(D8, (c) => c.pt - c.bt === 9 && !(c.pc === 2 && c.pt >= 8)))).toBeCloseTo(271.5, 0);
  });

  it('lesson 21: Dragon 7, Panda 8 and the other side bets', () => {
    const pD7 = prob(D8, (c) => bWin(c) && c.bc === 3 && c.bt === 7);
    const pP8 = prob(D8, (c) => pWin(c) && c.pc === 3 && c.pt === 8);
    expect(qeq(pD7, qs('19129247848/848912750595'))).toBe(true);
    expect(qeq(pP8, qs('674456106496/19524993263685'))).toBe(true);
    expect([pct(pD7).toFixed(4), pct(pP8).toFixed(4)]).toEqual(['2.2534', '3.4543']);
    expect([Math.round(1 / num(pD7)), (1 / num(pD7) - 1).toFixed(1)]).toEqual([44, '43.4']);
    expect([Math.round(1 / num(pP8)), Math.round(1 / num(pP8) - 1)]).toEqual([29, 28]);
    quotes('ez-side-bets', 'about once in 44 hands', 'about 43.4 to 1', 'about once\nin 29 hands', 'about 28 to 1', 'Edge: **7.61%**', 'Edge: **10.19%**');
    quotes('ez-side-bets', '19129247848/848912750595 ≈ 2.2534%', '−64613588827/848912750595 ≈ **−7.6113%**', '674456106496/19524993263685 ≈ 3.4543%', '−153010345753/1501922558745 ≈ **−10.1876%**');
    expect(edge('panda8').toFixed(2)).toBe('10.19');
    const table: [string, number][] = [
      ['| Either Pair | Either hand starts with a pair | 5:1 | 13.71% |', -pct(eitherEv)],
      ['| Perfect Pair | Either hand starts with a **suited** pair | 25:1 (200:1 both) | 8.05% |', -pct(perfectEv)],
      ['| Lucky 6 | Banker wins with a 6 | 12:1 two cards, 20:1 three cards | 16.68% |', edge('lucky6')],
      ['| Big | The hand uses 5 or 6 cards | 0.54:1 | 4.35% |', edge('big')],
      ['| Small | The hand uses exactly 4 cards | 1.5:1 | 5.28% |', edge('small')],
      ['| Tie at 9:1 | Tie | 9:1 | 4.84% |', edge('tie9')],
    ];
    for (const [row, e] of table) {
      quotes('ez-side-bets', row);
      expect(row).toContain(`| ${e.toFixed(2)}% |`);
    }
    quotes('ez-side-bets', '| Super 6 side bet | Banker wins with a 6 | 12:1 (15:1) | 29.98% (13.82%) |');
    expect([edge('super6Side12').toFixed(2), edge('super6Side15').toFixed(2)]).toEqual(['29.98', '13.82']);
    const l6two = prob(D8, (c) => bWin(c) && c.bt === 6 && c.bc === 2);
    const l6three = prob(D8, (c) => bWin(c) && c.bt === 6 && c.bc === 3);
    expect([pct(l6two).toFixed(4), pct(l6three).toFixed(4)]).toEqual(['3.7247', '1.6617']);
    const four = prob(D8, (c) => c.pc + c.bc === 4);
    expect(qeq(four, qs('140356/370461'))).toBe(true);
    quotes('ez-side-bets', 'two-card 6) ≈ 3.7247%, three-card ≈ 1.6617%; EV ≈ −16.68%', '140356/370461 ≈ 37.887%');
    expect(pct(four).toFixed(3)).toBe('37.887');
    quotes('ez-side-bets', '**Panda 8 pays 25 to 1: +$125**', 'the Player bet +$10');
  });

  it('lesson 22: big wins and costs per hour, and the evening plans', () => {
    const pBig = (f: (c: Cell) => boolean) => 72 * num(prob(D8, f));
    const dbBig = pBig((c) => !(c.pc === 2 && c.pt >= 8) && c.pt - c.bt >= 7);
    expect(dbBig.toFixed(1)).toBe('2.0');
    expect(pBig(tie).toFixed(1)).toBe('6.9');
    expect(pBig((c) => bWin(c) && c.bc === 3 && c.bt === 7).toFixed(1)).toBe('1.6');
    expect(pBig((c) => pWin(c) && c.pc === 3 && c.pt === 8).toFixed(1)).toBe('2.5');
    expect((72 * num(P8.pPair)).toFixed(1)).toBe('5.4');
    const costs = [
      cents(perHour('dbPlayer', 5)),
      cents(perHour('tie9', 5)),
      cents(perHour('dragon7', 5)),
      cents(perHour('panda8', 5)),
      cents((43 / 415) * 5 * 72),
      cents(perHour('tie8', 5)),
    ];
    expect(costs).toEqual([9.55, 17.44, 27.4, 36.68, 37.3, 51.69]);
    quotes('strategy-fun-per-dollar', '| 2.0 (all three) | **$9.55** |', '| 9:1 | 6.9 | $17.44 |', '| 40:1 | 1.6 | $27.40 |', '| 25:1 | 2.5 | $36.68 |', '| 11:1 | 5.4 | $37.30 |', '| 8:1 | 6.9 | $51.69 |');
    const plan = (x: number) => [cents(x), cents(3 * x)];
    expect(plan(perHour('banker', 10))).toEqual([7.62, 22.85]);
    expect(plan(perHour('banker', 10) + perHour('dbPlayer', 5))).toEqual([17.16, 51.49]);
    expect(plan(perHour('banker', 10) + perHour('tie8', 5))).toEqual([59.31, 177.93]);
    quotes('strategy-fun-per-dollar', '| $10 Banker | $7.62 | $22.85 |', '| $10 Banker + $5 Dragon Bonus Player | $17.16 | $51.49 |', '| $10 Banker + $5 Tie (8:1) | $59.31 | $177.93 |', '| $10 Martingale on Banker | $25.32 | $75.96 |', '≈ $17 an hour');
    expect(cents(2 * (perHour('banker', 10) + perHour('dbPlayer', 5)))).toBe(34.33);
    quotes('strategy-fun-per-dollar', '$17.16 an hour × 2 ≈ $34.33.', '2.65%: about $9.55 an hour at $5.');
    // The scene: 720 hands.
    const base = perHour('banker', 10, 720);
    const db = base + perHour('dbPlayer', 5, 720);
    const tie5 = base + perHour('tie8', 5, 720);
    expect([Math.round(base), Math.round(db), Math.round(db - base), Math.round(tie5), Math.round(tie5 - base)]).toEqual([76, 172, 95, 593, 517]);
    quotes('strategy-fun-per-dollar', 'about **$95**', '(**−$172** against **−$76**)', 'about **$517** below, at **−$593**');
    expect(perHour('dbPlayer', 5) / ((43 / 415) * 5 * 72)).toBeCloseTo(0.26, 2);
    quotes('strategy-fun-per-dollar', 'about a quarter of a Pair bet');
  });

  it('lesson 23: commission', () => {
    quotes('at-the-casino', '50¢ for a $10 Banker win', '$20 wins owe $1 each', 'pay **$20** and put **$1** in your box', "you're paid **$19**");
    expect([10 * 0.05, 20 * 0.05, 20 * 0.95]).toEqual([0.5, 1, 19]);
  });
});

// ---------------------------------------------------------------- systems (lesson 19, §7.2)

const pB = num(prob(D8, bWin));
const pP = num(prob(D8, pWin));
const pT = 1 - pB - pP;

type Step = (s: number, won: boolean) => number;
/** E[total bet over `hands`] in units for a progression over integer states (fresh start: state 0). */
function expectedTotal(bet: (s: number) => number, next: Step, target: 'banker' | 'player', hands = 72) {
  const win = target === 'banker' ? pB : pP;
  const lose = target === 'banker' ? pP : pB;
  let dist = new Map<number, number>([[0, 1]]);
  let total = 0;
  for (let h = 0; h < hands; h++) {
    const nd = new Map<number, number>();
    const put = (s: number, p: number) => nd.set(s, (nd.get(s) ?? 0) + p);
    for (const [s, p] of dist) {
      total += p * bet(s);
      put(next(s, true), p * win);
      put(next(s, false), p * lose);
      put(s, p * pT);
    }
    dist = nd;
  }
  return total;
}
const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const SYSTEMS: Record<string, [(s: number) => number, Step]> = {
  flat: [() => 1, () => 0],
  paroli: [(s) => [1, 2, 4][s]!, (s, w) => (w ? (s + 1) % 3 : 0)],
  'one-three-two-six': [(s) => [1, 3, 2, 6][s]!, (s, w) => (w ? (s + 1) % 4 : 0)],
  fibonacci: [(s) => FIB[s]!, (s, w) => (w ? Math.max(0, s - 2) : s === 10 ? 0 : s + 1)],
  martingale: [(s) => 2 ** s, (s, w) => (w ? 0 : s === 6 ? 0 : s + 1)],
  dalembert: [(s) => s + 1, (s, w) => (w ? Math.max(0, s - 1) : Math.min(19, s + 1))],
};
const avgBet = (id: string, target: 'banker' | 'player' = 'banker') =>
  expectedTotal(SYSTEMS[id]![0], SYSTEMS[id]![1], target) / 72;
/** $ per hour at a $10 unit. */
const sysCost = (id: string, target: 'banker' | 'player' = 'banker') =>
  10 * 72 * avgBet(id, target) * -num(target === 'banker' ? EV.banker : EV.player);

/** Pinned (curriculum.md §7.2 and lesson 19): average bet in units and $ per hour, Banker. */
export const SYSTEM_PINS: Record<string, [number, number]> = {
  flat: [1, 7.62],
  paroli: [1.7129, 13.05],
  'one-three-two-six': [1.998, 15.22],
  fibonacci: [2.4565, 18.71],
  martingale: [3.3236, 25.32],
  dalembert: [4.5735, 34.84],
};

describe('lesson 19: the systems cost what the table says (exact DP, D28 caps)', () => {
  it.each(Object.entries(SYSTEM_PINS))('%s: average bet and cost per hour', (id, [avg, cost]) => {
    expect(Math.abs(avgBet(id) - avg)).toBeLessThan(5e-5);
    expect(cents(sysCost(id))).toBe(cost);
  });

  it('the lesson table quotes the pinned figures', () => {
    const rows: Record<string, string> = {
      flat: '| $10.00 | **$7.62** |',
      paroli: '| $17.13 | $13.05 |',
      'one-three-two-six': '| $19.98 | $15.22 |',
      // curriculum.md §5 printed $24.57 (2.4565 rounded twice); the exact 2.45646 units is $24.56.
      fibonacci: '| $24.56 | $18.71 |',
      martingale: '| $33.24 | $25.32 |',
      dalembert: '| $45.73 | $34.84 |', // likewise $45.74 → $45.73 (4.57348 units)
    };
    for (const [id, row] of Object.entries(rows)) {
      quotes('betting-systems', row);
      expect(row).toContain(`$${(10 * avgBet(id)).toFixed(2)} |`);
    }
    quotes('betting-systems', '| Follow the shoe | Flat, on whichever side won last | $10.00 | ≈ $8.25 |', '| ≈ $125 | ≈ $95 (≈ simulated) |');
  });

  it('the math box: Martingale total, follow-the-shoe mix and Player costs', () => {
    expect((72 * avgBet('martingale')).toFixed(2)).toBe('239.30');
    quotes('betting-systems', '239.30\nunits', '239.30 × $10 × 1.0579% = $25.32', 'Banker edge 114753351728/10847218479825');
    const mix = 0.5068 * edge('banker') + 0.4932 * edge('player');
    expect(mix.toFixed(4)).toBe('1.1453');
    expect(cents((mix / 100) * 720)).toBeCloseTo(8.25, 2);
    quotes('betting-systems', '≈ 50.68% × 1.0579% + 49.32% × 1.2351% = 1.1453% of\n$720');
    expect([cents(sysCost('flat', 'player')), cents(sysCost('martingale', 'player'))]).toEqual([8.89, 31.23]);
    quotes('betting-systems', 'flat $8.89, Martingale $31.23');
  });

  it('Martingale: seven losses in a row, and the losing rescue', () => {
    const p7 = (pP / (pB + pP)) ** 7;
    expect(p7).toBeCloseTo(0.0070959, 6);
    expect(Math.round(1 / p7)).toBe(141);
    expect((100 * p7).toFixed(2)).toBe('0.71');
    quotes('betting-systems', 'about once every **141 series**', '= **$1,270**', 'pays $304\nagainst $310 lost, so even the "rescue" loses $6');
    expect([10, 20, 40, 80, 160, 320, 640].reduce((a, b) => a + b)).toBe(1270);
    expect([0.95 * 320, 10 + 20 + 40 + 80 + 160]).toEqual([304, 310]);
    quotes('betting-systems', 'About once every 141 series', 'about 0.71% of the time: $1,270 lost', 'at most 7 bets ($10–$640)');
  });
});

// ---------------------------------------------------------------- engine: the scenes' forced hands

describe('lessons 20, 21, 23: the engine settles the forced hands as the step text says', () => {
  const play = (sid: string) => {
    const s = scene(sid);
    const deal = steps(s).find((st) => st.deals)!;
    const { player, banker } = deal.deals![0]!;
    // The real order: P1 B1 P2 B2, then P3, then B3.
    const seq = [player[0], banker[0], player[1], banker[1], player[2], banker[2]].filter(
      (c): c is string => c !== undefined,
    );
    const cards = parseCards(seq.join(' '));
    let i = 0;
    const hand = { ...playHand(() => cards[i++]!), n: 1, shoeNo: 1, handInShoe: 1, forced: true };
    expect(i).toBe(cards.length);
    // The slip is the betting step's minimum amounts.
    const slip: Partial<Record<BetId, number>> = {};
    const collect = (c: unknown): void => {
      if (typeof c !== 'object' || c === null) return;
      const o = c as Record<string, unknown>;
      if (o.betOnFelt) {
        const b = o.betOnFelt as { bet: BetId; minAmount: number };
        slip[b.bet] = b.minAmount;
      }
      for (const k of ['all', 'any']) if (Array.isArray(o[k])) (o[k] as unknown[]).forEach(collect);
    };
    collect(steps(s)[0]!.completeWhen);
    return settleHand(hand, slip, resolveRules({ variant: s.variant ?? 'punto-banco' }));
  };
  const net = (r: ReturnType<typeof play>, bet: BetId) =>
    r.settlements.find((x) => x.bet === bet)?.profit;

  it('l20-s1: Pair +$55, Dragon Bonus +$150, Player +$10: +$215', () => {
    const r = play('l20-s1');
    expect(r.hand.winner).toBe('player');
    expect([net(r, 'player-pair'), net(r, 'dragon-bonus-player'), net(r, 'player'), r.net]).toEqual([
      5500, 15000, 1000, 21500,
    ]);
  });
  it('l21-s1: Panda 8 +$125, Player +$10', () => {
    const r = play('l21-s1');
    expect([net(r, 'panda-8'), net(r, 'player'), r.net]).toEqual([12500, 1000, 13500]);
  });
  it('l23-s1: a $20 Banker win pays $19 after $1 commission', () => {
    const r = play('l23-s1');
    expect(r.hand.winner).toBe('banker');
    expect(net(r, 'banker')).toBe(1900);
  });
});

// ---------------------------------------------------------------- strategy: the lesson 19 specs

describe("lesson 19: the strategy registry's exact DP gives the lesson's figures for the scene's own specs", () => {
  const SPEC_PIN: Record<string, keyof typeof SYSTEM_PINS> = {
    'flat-banker': 'flat',
    paroli: 'paroli',
    'one-three-two-six': 'one-three-two-six',
    fibonacci: 'fibonacci',
    martingale: 'martingale',
    dalembert: 'dalembert',
  };
  const specs = scene('l19-s1').autoPlay!.compare!.filter((c) => c.id in SPEC_PIN);
  it.each(specs.map((s) => [s.id, s] as const))('%s', (id, spec) => {
    const [avg, cost] = SYSTEM_PINS[SPEC_PIN[id]!]!;
    const units = expectedUnitsBet(spec, 72, { win: pB, lose: pP, push: pT }) / 72;
    expect(Math.abs(units - avg)).toBeLessThan(5e-5);
    expect(units).toBeCloseTo(avgBet(SPEC_PIN[id]!), 9);
    expect(cents((spec.unit / 100) * 72 * units * -num(EV.banker))).toBe(cost);
  });
});
