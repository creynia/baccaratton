/**
 * content-b (lessons 9-16): the files compile, every scene is valid SceneConfig in the D26-D28/D38
 * dialect, every forced hand and quiz hand obeys the drawing rules, and every number the prose
 * quotes is recomputed here. The exact values come from a local, independent enumerator of the
 * Punto Banco tableau over the shoe's composition (curriculum.md section 12.1); where the math and
 * strategy packages are real, their results are cross-checked against it as well.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileLesson } from '../../src/content/compile';
import { buildContent, readSources } from '../../src/content/load';
import type { Block, Quiz } from '../../src/content/types';
import {
  BET_OFFERED_IN,
  VARIANT_RULES,
  bankerDraws,
  cardValue,
  playHand,
  settleHand,
  handTotal,
  parseCards,
  parseRoadString,
  playerDraws,
} from '../../src/sim/engine';
import type { BetId, VariantId } from '../../src/sim/engine';
import * as math from '../../src/sim/math';
import { validateScene } from '../../src/sim/scene';
import type { Condition, SceneConfig, SceneStep } from '../../src/sim/scene';
import * as strategy from '../../src/sim/strategy';
import type { StrategySpec } from '../../src/sim/strategy';

const root = process.cwd();

// ---------------------------------------------------------------- the lessons (curriculum §4)
const LESSONS = [
  { n: 9, id: 'banker-vs-player', chapter: 'ev-basics', minutes: 6, title: 'Why the Banker wins more often' },
  { n: 10, id: 'the-tie-bet', chapter: 'ev-basics', minutes: 5, title: "The Tie bet: 8 to 1 isn't enough" },
  { n: 11, id: 'strategy-lowest-edge', chapter: 'perfect-lowest-edge', minutes: 5, title: 'Perfect strategy I: the lowest edge' },
  { n: 12, id: 'table-variants', chapter: 'perfect-lowest-edge', minutes: 7, title: 'Choosing a table: commission, EZ and Super 6' },
  { n: 13, id: 'checkpoint-strategy', chapter: 'perfect-lowest-edge', minutes: 8, title: 'Checkpoint: rules and the best bet' },
  { n: 14, id: 'edge-and-hourly-cost', chapter: 'perfect-practical', minutes: 6, title: 'House edge, per hand and per hour' },
  { n: 15, id: 'variance-and-bankroll', chapter: 'perfect-practical', minutes: 8, title: 'Swings, sessions and bankroll' },
  { n: 16, id: 'roads-and-streaks', chapter: 'perfect-practical', minutes: 8, title: "Scoreboards, streaks and the gambler's fallacy" },
] as const;
type LId = (typeof LESSONS)[number]['id'];

const fileOf = (id: LId) => {
  const l = LESSONS.find((x) => x.id === id)!;
  return `content/lessons/${String(l.n).padStart(2, '0')}-${id}.md`;
};
const RAW = new Map<LId, string>(LESSONS.map((l) => [l.id, readFileSync(join(root, fileOf(l.id)), 'utf8')]));
const raw = (id: LId) => RAW.get(id)!;

const sources = readSources(root);
const glossarySlugs = new Set(sources.glossary.map((g) => g.slug));
const glossaryTerms = new Map(sources.glossary.map((g) => [g.term.toLowerCase(), g.slug] as const));
const COMPILED = new Map(
  LESSONS.map((l) => [l.id, compileLesson(raw(l.id), fileOf(l.id), { glossarySlugs, glossaryTerms })]),
);
const blocks = (id: LId): Block[] => COMPILED.get(id)!.blocks;
const quizzes = (id: LId): Quiz[] => blocks(id).flatMap((b) => (b.kind === 'quiz' ? [b.quiz] : []));
const scenes = (id: LId): SceneConfig[] => blocks(id).flatMap((b) => (b.kind === 'scene' ? [b.scene] : []));
const allScenes = () => LESSONS.flatMap((l) => scenes(l.id).map((s) => ({ lesson: l, scene: s })));
/** Prose only: the text a learner reads, without scene YAML. */
const prose = (id: LId) => raw(id);

// ---------------------------------------------------------------- exact rationals
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
class Q {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd < 0n) [nn, dd] = [-nn, -dd];
    const g = gcd(nn, dd) || 1n;
    this.n = nn / g;
    this.d = dd / g;
  }
  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q) {
    return this.add(o.neg());
  }
  mul(o: Q | number) {
    const q = typeof o === 'number' ? Q.of(o) : o;
    return new Q(this.n * q.n, this.d * q.d);
  }
  div(o: Q) {
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Q(-this.n, this.d);
  }
  get v() {
    return Number(this.n) / Number(this.d);
  }
  toString() {
    return `${this.n}/${this.d}`;
  }
  /** Exact decimal-safe constructor for 0.95, 0.5 etc. */
  static of(x: number) {
    const s = 1_000_000;
    return new Q(Math.round(x * s), s);
  }
}
const ONE = new Q(1);
const parseQ = (s: string) => {
  const [a, b] = s.replace('−', '-').replace('+', '').split('/');
  return new Q(BigInt(a!), BigInt(b!));
};

// ---------------------------------------------------------------- an independent tableau
/** curriculum.md §2.2, written out again: does the Banker (two-card total b) draw? p3 = null if the Player stood. */
function bankerRule(b: number, p3: number | null): boolean {
  if (p3 === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}
interface Played {
  pt: number;
  bt: number;
  pc: number;
  bc: number;
  natural: boolean;
  winner: 'player' | 'banker' | 'tie';
}
/** Plays a two-sided hand given as values (P1 P2 [P3], B1 B2 [B3]); checks the third cards. */
function playValues(p: number[], b: number[]): Played {
  const p2 = (p[0]! + p[1]!) % 10;
  const b2 = (b[0]! + b[1]!) % 10;
  const natural = p2 >= 8 || b2 >= 8;
  const pDraws = !natural && p2 <= 5;
  if (pDraws !== (p.length === 3)) throw new Error(`Player ${p2}: third card ${pDraws ? 'missing' : 'not allowed'}`);
  const bDraws = !natural && bankerRule(b2, pDraws ? p[2]! : null);
  if (bDraws !== (b.length === 3)) throw new Error(`Banker ${b2}: third card ${bDraws ? 'missing' : 'not allowed'}`);
  const pt = p.reduce((s, x) => s + x, 0) % 10;
  const bt = b.reduce((s, x) => s + x, 0) % 10;
  return { pt, bt, pc: p.length, bc: b.length, natural, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}
const valuesOf = (codes: readonly string[]) => codes.map((c) => cardValue(parseCards(c)[0]!));
const playCodes = (player: readonly string[], banker: readonly string[]) => {
  const all = [...player, ...banker];
  if (new Set(all).size !== all.length) throw new Error(`duplicate card in ${all.join(' ')}`);
  return playValues(valuesOf(player), valuesOf(banker));
};
/** The engine's own rule functions must agree with the independent table. */
function engineAgrees(player: readonly string[], banker: readonly string[]): boolean {
  const p = parseCards(player.join(' '));
  const b = parseCards(banker.join(' '));
  const p2 = handTotal(p.slice(0, 2));
  const b2 = handTotal(b.slice(0, 2));
  const pd = playerDraws(p2, b2).draws;
  const bd = bankerDraws(b2, p2, pd ? cardValue(p[2]!) : null).draws;
  return pd === (p.length === 3) && bd === (b.length === 3);
}

// ---------------------------------------------------------------- exact enumeration of the shoe
interface Cell {
  pt: number;
  bt: number;
  pc: number;
  bc: number;
  pNat: boolean;
  bNat: boolean;
  w: bigint;
}
interface Dist {
  total: bigint;
  cells: Cell[];
  pairP: Q;
}
/**
 * Every ordered deal of the next (up to) six cards from `counts` (value classes 0..9), weighted by
 * the number of card sequences; cards not dealt are summed out. All partial sums stay below the
 * total N(N-1)...(N-5), which for 8 decks (≈5.0e15) is under 2^53, so plain numbers are exact.
 */
function enumerate(counts: number[], ranks: number[]): Dist {
  const N = counts.reduce((s, x) => s + x, 0);
  const ff = (from: number, k: number) => {
    let r = 1;
    for (let i = 0; i < k; i++) r *= from - i;
    return r;
  };
  const tail = [0, 1, 2, 3, 4, 5, 6].map((used) => ff(N - used, 6 - used));
  const acc = new Map<string, number>();
  const put = (k: string, w: number) => acc.set(k, (acc.get(k) ?? 0) + w);
  const c = [...counts];
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = c[p1]!;
    if (!w1) continue;
    c[p1]!--;
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = c[b1]!;
      if (!w2) continue;
      c[b1]!--;
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = c[p2]!;
        if (!w3) continue;
        c[p2]!--;
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = c[b2]!;
          if (!w4) continue;
          c[b2]!--;
          const w = w1 * w2 * w3 * w4;
          const pt2 = (p1 + p2) % 10;
          const bt2 = (b1 + b2) % 10;
          const pN = pt2 >= 8;
          const bN = bt2 >= 8;
          if (pN || bN) put(`${pt2},${bt2},2,2,${+pN},${+bN}`, w * tail[4]!);
          else if (pt2 <= 5) {
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = c[p3]!;
              if (!w5) continue;
              c[p3]!--;
              const pt = (pt2 + p3) % 10;
              if (bankerRule(bt2, p3)) {
                for (let b3 = 0; b3 < 10; b3++) {
                  const w6 = c[b3]!;
                  if (!w6) continue;
                  put(`${pt},${(bt2 + b3) % 10},3,3,0,0`, w * w5 * w6 * tail[6]!);
                }
              } else put(`${pt},${bt2},3,2,0,0`, w * w5 * tail[5]!);
              c[p3]!++;
            }
          } else if (bankerRule(bt2, null)) {
            for (let b3 = 0; b3 < 10; b3++) {
              const w5 = c[b3]!;
              if (!w5) continue;
              put(`${pt2},${(bt2 + b3) % 10},2,3,0,0`, w * w5 * tail[5]!);
            }
          } else put(`${pt2},${bt2},2,2,0,0`, w * tail[4]!);
          c[b2]!++;
        }
        c[p2]!++;
      }
      c[b1]!++;
    }
    c[p1]!++;
  }
  const cells: Cell[] = [...acc].map(([k, w]) => {
    const [pt, bt, pc, bc, pn, bn] = k.split(',').map(Number);
    if (!Number.isSafeInteger(w)) throw new Error('weight overflow');
    return { pt: pt!, bt: bt!, pc: pc!, bc: bc!, pNat: pn === 1, bNat: bn === 1, w: BigInt(w) };
  });
  const total = BigInt(tail[0]!);
  const sum = cells.reduce((s, x) => s + x.w, 0n);
  if (sum !== total) throw new Error(`weights sum to ${sum}, not ${total}`);
  const pairs = ranks.reduce((s, r) => s + BigInt(r * (r - 1)), 0n);
  return { total, cells, pairP: new Q(pairs, BigInt(N * (N - 1))) };
}
const shoe = (decks: number) => ({
  counts: [16 * decks, ...Array<number>(9).fill(4 * decks)],
  ranks: Array<number>(13).fill(4 * decks),
});

/** A bet as net-per-$1 for every cell; returns EV, SD, P(win/push/lose). */
function bet(d: Dist, net: (c: Cell) => Q) {
  let ev = new Q(0);
  let ex2 = new Q(0);
  let win = 0n;
  let push = 0n;
  for (const c of d.cells) {
    const x = net(c);
    const p = new Q(c.w, d.total);
    ev = ev.add(p.mul(x));
    ex2 = ex2.add(p.mul(x).mul(x));
    if (x.n > 0n) win += c.w;
    else if (x.n === 0n) push += c.w;
  }
  const sd = Math.sqrt(ex2.sub(ev.mul(ev)).v);
  return { ev, edge: ev.neg(), sd, pWin: new Q(win, d.total), pPush: new Q(push, d.total) };
}
const P = (d: Dist, f: (c: Cell) => boolean) => new Q(d.cells.filter(f).reduce((s, c) => s + c.w, 0n), d.total);
const bw = (c: Cell) => c.bt > c.pt;
const pw = (c: Cell) => c.pt > c.bt;
const tie = (c: Cell) => c.pt === c.bt;
const L = ONE.neg();

const banker = (d: Dist, commission: Q) => bet(d, (c) => (bw(c) ? ONE.sub(commission) : pw(c) ? L : new Q(0)));
const player = (d: Dist) => bet(d, (c) => (pw(c) ? ONE : bw(c) ? L : new Q(0)));
const tieBet = (d: Dist, pays: number) => bet(d, (c) => (tie(c) ? new Q(pays) : L));
const ezBanker = (d: Dist) =>
  bet(d, (c) => (bw(c) ? (c.bc === 3 && c.bt === 7 ? new Q(0) : ONE) : pw(c) ? L : new Q(0)));
const super6Banker = (d: Dist) =>
  bet(d, (c) => (bw(c) ? (c.bt === 6 ? new Q(1, 2) : ONE) : pw(c) ? L : new Q(0)));
const dragon7 = (d: Dist) => bet(d, (c) => (bw(c) && c.bc === 3 && c.bt === 7 ? new Q(40) : L));
const DB_PAYS: Record<number, number> = { 9: 30, 8: 10, 7: 6, 6: 4, 5: 2, 4: 1 };
const dragonBonus = (d: Dist, side: 'player' | 'banker') =>
  bet(d, (c) => {
    const mine = side === 'player' ? c.pt : c.bt;
    const theirs = side === 'player' ? c.bt : c.pt;
    const nat = side === 'player' ? c.pNat : c.bNat;
    if (c.pNat && c.bNat && mine === theirs) return new Q(0);
    if (mine > theirs) return nat ? ONE : DB_PAYS[mine - theirs] ? new Q(DB_PAYS[mine - theirs]!) : L;
    return L;
  });

const D8 = (() => {
  const s = shoe(8);
  return enumerate(s.counts, s.ranks);
})();
const D6 = (() => {
  const s = shoe(6);
  return enumerate(s.counts, s.ranks);
})();
const FIVE = new Q(1, 20);
const X = {
  pB: P(D8, bw),
  pP: P(D8, pw),
  pT: P(D8, tie),
  banker: banker(D8, FIVE),
  banker4: banker(D8, new Q(1, 25)),
  banker0: banker(D8, new Q(0)),
  player: player(D8),
  tie8: tieBet(D8, 8),
  tie9: tieBet(D8, 9),
  ez: ezBanker(D8),
  super6: super6Banker(D8),
  dragon7: dragon7(D8),
  dbPlayer: dragonBonus(D8, 'player'),
  dbBanker: dragonBonus(D8, 'banker'),
  pD7: P(D8, (c) => bw(c) && c.bc === 3 && c.bt === 7),
  pB6: P(D8, (c) => bw(c) && c.bt === 6),
  banker6: banker(D6, FIVE),
  player6: player(D6),
};
const pairEv = D8.pairP.mul(12).sub(ONE);
const pairSd = Math.sqrt(D8.pairP.mul(121).add(ONE.sub(D8.pairP)).sub(pairEv.mul(pairEv)).v);
const pBdecided = X.pB.div(X.pB.add(X.pP));
const perResolved = (ev: Q) => ev.div(ONE.sub(X.pT)).neg();
const breakEvenCommission = ONE.sub(X.pP.div(X.pB));

// ---------------------------------------------------------------- formatting like the lessons
const pct = (q: Q | number, d: number) => ((typeof q === 'number' ? q : q.v) * 100).toFixed(d);
const money = (x: number) => `$${x.toFixed(2)}`;
const dollars = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const HPH = 72;
const hourly = (edge: Q, betDollars: number, hands = HPH) => edge.v * betDollars * hands;
const squash = (t: string) => t.replace(/\s+/g, ' ');
const expectQuoted = (id: LId, s: string) =>
  expect(squash(prose(id)).includes(squash(s)), `${id} should quote: ${JSON.stringify(s)}`).toBe(true);

/** D19 tiers on the edge per bet placed. */
const tierOf = (edge: number) =>
  edge <= 0 ? 'free' : edge <= 0.02 ? 'good' : edge <= 0.05 ? 'fair' : edge < 0.09 ? 'costly' : 'sucker';
const TIER_LABEL = { free: 'No house edge', good: 'Good bet', fair: 'Fair', costly: 'Costly', sucker: 'Sucker bet' };

/** Normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7). */
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Can math / strategy be called yet (stubs throw TODO until those packages land)? */
const ready = (f: () => unknown) => {
  try {
    f();
    return true;
  } catch {
    return false;
  }
};

// =================================================================== tests
describe('lessons 9-16: files and front matter', () => {
  it('exist under content/lessons with the curriculum §4 ids, titles, chapters and minutes', () => {
    for (const l of LESSONS) {
      expect(existsSync(join(root, fileOf(l.id)))).toBe(true);
      const c = COMPILED.get(l.id)!;
      expect(c.id).toBe(l.id);
      expect(c.title).toBe(l.title);
      expect(c.chapter).toBe(l.chapter);
      expect(c.minutes).toBe(l.minutes);
      expect(c.summary.length).toBeGreaterThan(10);
      expect(blocks(l.id).some((b) => b.kind === 'quiz')).toBe(true);
    }
    expect(raw('checkpoint-strategy')).toMatch(/^checkpoint: true$/m);
  });

  it('every lesson ends with its quiz, and quiz ids are the default <lessonId>-qN', () => {
    for (const l of LESSONS) {
      const b = blocks(l.id);
      expect(b[b.length - 1]!.kind).toBe('quiz');
      quizzes(l.id).forEach((q, i) => expect(q.id).toBe(`${l.id}-q${i + 1}`));
    }
  });

  it('sits in the right chapters, in course order, once chapters.json lists them', () => {
    if (sources.samplesActive) return; // content-a's chapters.json has not landed yet
    const bundle = buildContent(root);
    for (const chapter of ['ev-basics', 'perfect-lowest-edge', 'perfect-practical']) {
      const want = LESSONS.filter((l) => l.chapter === chapter).map((l) => l.id);
      const listed = bundle.chapters.find((c) => c.id === chapter)?.lessons ?? [];
      const mine = listed.filter((id) => (want as readonly string[]).includes(id));
      expect(mine).toEqual(want);
    }
    for (const l of LESSONS) expect(bundle.lessons.find((x) => x.id === l.id)?.chapterId).toBe(l.chapter);
  });

  it('uses no stale wording (D26, D30, D33, D34)', () => {
    for (const l of LESSONS) {
      const r = raw(l.id);
      expect(r).not.toMatch(/place-bet|predict:\s*\{[^}]*\bhand:|remaining:|rules:\s*\{|\bbet: (player|banker|tie) *[,}].*unit/);
      expect(r).not.toMatch(/Natural, nobody draws|Unfavourable|unfavorable|confirmUnfavorable/i);
      expect(r).not.toMatch(/\bin the worker\b|simulateMany|previewBets/);
      expect(r).not.toMatch(/view:\s*both/);
    }
  });
});

describe('lessons 9-16: scenes', () => {
  it('there are the eleven scenes curriculum §5 has, with unique lNN-sN ids', () => {
    const ids = allScenes().map((x) => x.scene.id);
    expect(ids).toEqual([
      'l09-s1',
      'l10-s1',
      'l11-s1',
      'l12-s1',
      'l12-s2',
      'l13-s1',
      'l13-s2',
      'l14-s1',
      'l15-s1',
      'l16-s1',
    ]);
    for (const { lesson, scene } of allScenes()) expect(scene.id.startsWith(`l${String(lesson.n).padStart(2, '0')}-s`)).toBe(true);
  });

  it('every scene passes validateScene', () => {
    for (const { scene } of allScenes()) {
      const res = validateScene(JSON.parse(JSON.stringify(scene)));
      expect(res.errors, scene.id).toEqual([]);
      expect(res.ok).toBe(true);
    }
  });

  const condKinds = (c: Condition): string[] => {
    const k = Object.keys(c).filter((x) => x !== 'count');
    return k.flatMap((x) => (x === 'all' || x === 'any' ? (c as { all: Condition[] })[x as 'all'].flatMap(condKinds) : [x]));
  };
  const allowed = (s: SceneConfig, st: SceneStep) => st.allowedActions ?? s.allowedActions ?? ['set-bet', 'clear-bets', 'deal', 'rebet'];
  const HAND_KINDS = ['hands', 'handResult', 'predicted', 'trackerPositive'];

  it('follows the D26-D28 and D38 step rules', () => {
    for (const { scene: s } of allScenes())
      for (const st of s.steps ?? []) {
        const where = `${s.id}/${st.id}`;
        const kinds = condKinds(st.completeWhen);
        const acts = allowed(s, st);
        if (kinds.includes('acknowledged')) {
          expect(st.advance, where).toBe('button');
          expect(st.allowedActions, where).toEqual([]);
        }
        if (kinds.includes('autoPlayCompleted')) {
          expect(s.autoPlay?.enabled, where).toBe(true);
          expect(st.allowedActions, `${where}: D38 run steps set allowedActions: []`).toEqual([]);
        }
        const needsHand = kinds.some((k) => HAND_KINDS.includes(k));
        if (needsHand) expect(acts, where).toContain('deal');
        else expect(acts, `${where}: deal is locked while the step waits for something else`).not.toContain('deal');
        if (kinds.includes('betOnFelt')) {
          expect(acts, where).toContain('set-bet');
          expect(acts, where).not.toContain('deal');
        }
        if (st.predict) {
          expect(acts, where).toEqual(['deal']);
          expect(st.pauseAt, where).toBeDefined();
          if (st.predict.kind === 'banker-draws') expect(st.pauseAt).toBe('player-third');
        }
        if (kinds.includes('predicted')) {
          expect(st.predict, where).toBeDefined();
          const p = JSON.stringify(st.completeWhen);
          if (p.includes('"correct":true')) expect(s.onDealsExhausted ?? 'random', where).toBe('random');
        }
        if (kinds.includes('tapped')) {
          const t = JSON.stringify(st.completeWhen);
          if (t.includes('session')) expect(s.ui?.showSession, where).toBe(true);
          for (const road of ['bead-plate', 'big-road'])
            if (t.includes(road)) expect(st.ui?.roads ?? s.ui?.roads ?? [], where).toContain(road);
        }
      }
  });

  it('uses only bets the variant offers, in whole dollars within the D16 limits', () => {
    for (const { scene: s } of allScenes()) {
      const variant: VariantId = s.variant ?? 'punto-banco';
      const offered = (b: BetId) => BET_OFFERED_IN[b].includes(variant);
      const json = JSON.stringify(s);
      for (const m of json.matchAll(/"bet":"([a-z0-9-]+)"/g)) expect(offered(m[1] as BetId), `${s.id} ${m[1]}`).toBe(true);
      for (const b of [...(s.allowedBets ?? []), ...(s.steps ?? []).flatMap((st) => st.allowedBets ?? [])])
        expect(offered(b), `${s.id} ${b}`).toBe(true);
      for (const [b, amt] of Object.entries(s.bets ?? {})) {
        expect(offered(b as BetId)).toBe(true);
        expect(amt % 100).toBe(0);
        expect(amt).toBeGreaterThanOrEqual(500);
      }
      for (const m of json.matchAll(/"minAmount":(\d+)/g)) {
        const a = Number(m[1]);
        expect(a % 100).toBe(0);
        expect(a).toBeGreaterThanOrEqual(500);
        expect(a).toBeLessThanOrEqual(s.bankroll ?? 50_000);
      }
      expect((s.bankroll ?? 50_000) % 100).toBe(0);
    }
  });

  it('names real auto-play strategies with $10 units (StrategySpec, D9, D21)', () => {
    const specs: StrategySpec[] = [];
    for (const { scene: s } of allScenes()) {
      if (!s.autoPlay) continue;
      expect(s.ui?.speed).toBe('fast');
      for (const h of s.autoPlay.handOptions ?? []) expect([72, 720, 7200]).toContain(h);
      if (s.autoPlay.defaultStrategy) specs.push(s.autoPlay.defaultStrategy);
      specs.push(...(s.autoPlay.compare ?? []));
    }
    expect(specs.map((x) => x.id).sort()).toEqual(['flat-banker', 'flat-banker', 'flat-banker', 'flat-player', 'flat-tie']);
    for (const spec of specs) {
      expect(strategy.STRATEGY_IDS).toContain(spec.id);
      expect(spec.unit).toBe(1000);
      expect(Object.keys(spec)).not.toContain('bet'); // D26: bet -> target
      expect(Object.keys(spec)).not.toContain('side');
    }
  });

  it.runIf(ready(() => strategy.getStrategy('flat-banker')))('the strategy registry knows every preset the scenes run', () => {
    for (const id of ['flat-banker', 'flat-player', 'flat-tie'] as const) expect(strategy.getStrategy(id)).toBeTruthy();
  });

  it('every forced hand obeys the tableau and settles as the step text says', () => {
    const forced = allScenes().flatMap(({ scene }) =>
      [...(scene.deals ?? []), ...(scene.steps ?? []).flatMap((st) => st.deals ?? [])].map((h) => ({ scene, h })),
    );
    expect(forced.length).toBe(2);
    for (const { scene, h } of forced) {
      expect(engineAgrees(h.player, h.banker), scene.id).toBe(true);
      const r = playCodes(h.player, h.banker);
      if (scene.id === 'l12-s1') {
        // "Banker won 7 to 5 with three cards: a Dragon 7. In EZ that win pushes"
        expect(r).toMatchObject({ winner: 'banker', bt: 7, pt: 5, bc: 3 });
        const net = ezBanker({ total: 1n, cells: [{ ...r, pNat: false, bNat: false, w: 1n }], pairP: ONE }).ev;
        expect(net.n).toBe(0n);
      } else if (scene.id === 'l12-s2') {
        // "Banker wins 6 to 4. At Super 6 that pays half: +$5 instead of $10."
        expect(r).toMatchObject({ winner: 'banker', bt: 6, pt: 4 });
        const net = super6Banker({ total: 1n, cells: [{ ...r, pNat: false, bNat: false, w: 1n }], pairP: ONE }).ev;
        expect(net.mul(10).v).toBe(5);
        expectQuoted('table-variants', '**+$5** instead of $10');
      } else throw new Error(`unexpected forced hand in ${scene.id}`);
    }
  });

  it('l16-s1 prefills six Bankers in a row at the end of the history', () => {
    const s = scenes('roads-and-streaks')[0]!;
    const h = (s.history ?? []).map((x) => (typeof x === 'string' ? parseRoadString(x)[0]!.winner : x.winner));
    expect(h.slice(-6)).toEqual(Array(6).fill('banker'));
    expect(h[h.length - 7]).not.toBe('banker');
  });
});

describe('lessons 9-16: quizzes', () => {
  it('every quiz hand (and every two-sided {{cards}} hand in quiz text) obeys the drawing rules', () => {
    let checked = 0;
    for (const l of LESSONS)
      for (const q of quizzes(l.id))
        if (q.hand) {
          const pv = q.hand.player.map((c) => cardValue(c));
          const bv = q.hand.banker.map((c) => cardValue(c));
          expect(() => playValues(pv, bv), q.id).not.toThrow();
          checked++;
        }
    // checkpoint q1: "Player {{5c Kd =5}} draws a {{4s}}. Banker has {{6h 9c =5}}. What does the Banker do?" -> Draws
    const q1 = quizzes('checkpoint-strategy')[0]!;
    const cards = [...q1.prompt.matchAll(/\{\{([^}=]+?)\s*(?:=(\d))?\}\}/g)].map((m) => ({ codes: m[1]!.trim().split(/\s+/), total: m[2] }));
    expect(cards.map((c) => c.codes)).toEqual([['5c', 'Kd'], ['4s'], ['6h', '9c']]);
    for (const c of cards) if (c.total) expect(String(handTotal(parseCards(c.codes.join(' '))))).toBe(c.total);
    for (const b3 of ['Ac', '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc'].filter((x) => x !== '5c' && x !== '9c'))
      expect(() => playCodes(['5c', 'Kd', '4s'], ['6h', '9c', b3])).not.toThrow(); // the Banker draws
    expect(() => playCodes(['5c', 'Kd', '4s'], ['6h', '9c'])).toThrow(/Banker 5: third card missing/);
    expect(q1.choices[q1.answer]).toBe('Draws');
    checked++;
    // checkpoint q4: "Banker 6, and the Player stood on 7" -> stands and loses 7 to 6
    expect(bankerRule(6, null)).toBe(false);
    expect(quizzes('checkpoint-strategy')[3]!.choices[quizzes('checkpoint-strategy')[3]!.answer]).toMatch(/stands and loses 7 to 6/);
    expect(checked).toBeGreaterThan(0);
  });

  it('every quiz has distinct options, an answer in range and an explanation', () => {
    for (const l of LESSONS)
      for (const q of quizzes(l.id)) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.explanation.length).toBeGreaterThan(5);
      }
  });
});

describe('pinned numbers (simulator.md §2.5, curriculum §11) recomputed', () => {
  it('the enumerator reproduces the published 8-deck counts', () => {
    expect(D8.total).toBe(4998398275503360n);
    expect(D8.cells.length).toBe(205);
    expect(X.pB.mul(new Q(D8.total)).n).toBe(2292252566437888n);
    expect(X.pP.mul(new Q(D8.total)).n).toBe(2230518282592256n);
    expect(X.pT.mul(new Q(D8.total)).n).toBe(475627426473216n);
    expect(D6.total).toBe(878869206895680n);
    expect(D8.pairP.toString()).toBe('31/415');
  });

  it('every long fraction a lesson quotes is the exact value it names', () => {
    const named: [LId, string, Q][] = [
      ['banker-vs-player', '+241149546272/19524993263685', X.banker0.ev],
      ['banker-vs-player', '7535923321/279815987114', breakEvenCommission],
      ['banker-vs-player', '2925372930848/488124831592125', X.banker4.edge],
      ['the-tie-bet', '619306544887/6508331087895', X.pT],
      ['the-tie-bet', '−103841353768/723147898655', X.tie8.ev],
      ['the-tie-bet', '−63053127805/1301666217579', X.tie9.ev],
      ['table-variants', '19129247848/848912750595', X.pD7],
      ['table-variants', '−66274384744/6508331087895', X.ez.ev],
      ['table-variants', '210337737856/3904998652737', X.pB6],
      ['table-variants', '−284694798368/19524993263685', X.super6.ev],
      ['checkpoint-strategy', '21516253449/1840320169690', perResolved(X.banker.ev)],
      ['checkpoint-strategy', '7535923321/552096050907', perResolved(X.player.ev)],
      ['roads-and-streaks', '279815987114/552096050907', pBdecided],
    ];
    for (const [id, s, q] of named) {
      expectQuoted(id, s);
      expect(parseQ(s).toString(), s).toBe(q.toString());
    }
    // nothing else: every a/b with long digits in lessons 9-16 is one of the named ones
    const listed = new Set(named.map(([, s]) => s.replace(/^[−+]/, '')));
    for (const l of LESSONS)
      for (const m of raw(l.id).matchAll(/(\d{4,})\/(\d{4,})/g)) expect(listed, `${l.id}: ${m[0]}`).toContain(m[0]);
    // the curriculum §11 fractions for the edges the prose rounds
    expect(X.banker.ev.toString()).toBe('-114753351728/10847218479825');
    expect(X.player.ev.toString()).toBe('-241149546272/19524993263685');
    expect(X.dbPlayer.ev.toString()).toBe('-103547854751/3904998652737');
    expect(X.dbBanker.ev.toString()).toBe('-9683026823/103306842665');
    expect(X.dragon7.ev.toString()).toBe('-64613588827/848912750595');
    expect(pairEv.toString()).toBe('-43/415');
    expect(X.banker6.ev.toString()).toBe('-460294100/43594702723');
    expect(X.player6.ev.toString()).toBe('-18880657128/1525814595305');
  });

  it('lesson 9: who wins, and where the commission sits', () => {
    const id = 'banker-vs-player';
    expectQuoted(id, `**${pct(X.pB, 2)}%**`);
    expectQuoted(id, `**${pct(X.pP, 2)}%**`);
    expectQuoted(id, `| ${pct(X.pT, 2)}% |`);
    expectQuoted(id, `**${pct(pBdecided, 2)}%** of the hands that are decided`);
    expectQuoted(id, `+${pct(X.banker0.ev, 2)}%, exactly the mirror of the Player\nbet's −${pct(X.player.edge, 2)}%`);
    expect(X.banker0.ev.toString()).toBe(X.player.ev.neg().toString());
    expectQuoted(id, `to **−${pct(X.banker.edge, 2)}%**`);
    expectQuoted(id, `about ${pct(X.banker.edge, 2)}¢ per dollar against\n${pct(X.player.edge, 2)}¢`);
    expectQuoted(id, `≈ +${pct(X.banker0.ev, 4)}%`);
    expectQuoted(id, `At c = 5%: −${pct(X.banker.edge, 4)}%`);
    expectQuoted(id, `≈ **${pct(breakEvenCommission, 2)}%**`);
    expectQuoted(id, `≈ **${pct(X.banker4.edge, 4)}%**`);
    // the auto-play read step: expected lines over 720 $10 hands, and one SD of luck
    expectQuoted(id, `**−${dollars(hourly(X.banker.edge, 10, 720))}** for Banker and **−${dollars(hourly(X.player.edge, 10, 720))}** for Player`);
    for (const sd of [X.banker.sd, X.player.sd]) expect(Math.abs(sd * Math.sqrt(720) * 10 - 250)).toBeLessThan(10);
    expectQuoted(id, '±$250');
    expect(quizzes(id)[2]!.explanation).toBe(`Banker ${pct(X.banker.edge, 2)}% vs Player ${pct(X.player.edge, 2)}%.`);
  });

  it('lesson 10: the Tie bet', () => {
    const id = 'the-tie-bet';
    expectQuoted(id, `about **${pct(X.pT, 1)}%** of hands, roughly one in every ${(1 / X.pT.v).toFixed(1)}`);
    const per1000 = 1000 * X.pT.v;
    expectQuoted(
      id,
      `About ${Math.round(per1000)} are ties (${per1000.toFixed(1)}), each paying $8: about $${Math.round(8 * per1000)} in winnings`,
    );
    expectQuoted(id, `other ${Math.round(1000 - per1000)} lose $1 each: −$${Math.round(1000 - per1000)}`);
    expectQuoted(id, `about **−$${Math.round(X.tie8.edge.v * 1000)}** per 1,000 hands, or **${pct(X.tie8.edge, 2)}%**`);
    expectQuoted(id, `about **${(1 / X.pT.v - 1).toFixed(1)} to 1**`);
    expectQuoted(id, `to **${pct(X.tie9.edge, 2)}%**`);
    expect(X.tie9.edge.v).toBeGreaterThan(4 * X.banker.edge.v); // "still more than four times the Banker bet"
    expectQuoted(id, `| 8 to 1 (default) | ${pct(X.tie8.edge, 2)}% | **${money(hourly(X.tie8.edge, 10))}** |`);
    expectQuoted(id, `| 9 to 1 | ${pct(X.tie9.edge, 2)}% | ${money(hourly(X.tie9.edge, 10))} |`);
    expectQuoted(id, `| (Banker, for comparison) | ${pct(X.banker.edge, 2)}% | ${money(hourly(X.banker.edge, 10))} |`);
    expect(Math.round((1 - X.pT.v) * 10)).toBe(9); // "loses about 9 hands out of 10"
    expectQuoted(id, `≈ ${X.pT.v.toFixed(7)}, about 1 in ${(1 / X.pT.v).toFixed(2)}`);
    expectQuoted(id, `≈ **−${pct(X.tie8.edge, 4)}%**`);
    expectQuoted(id, `≈ **−${pct(X.tie9.edge, 4)}%**`);
    expectQuoted(id, `≈ ${(1 / X.pT.v - 1).toFixed(3)} to 1`);
    expectQuoted(id, `near **−${dollars(hourly(X.banker.edge, 10, 720))}**, and Tie's near **−${dollars(hourly(X.tie8.edge, 10, 720))}**`);
    const q = quizzes(id);
    expect(q[0]!.explanation).toContain(`${pct(X.pT, 2)}% of hands, about 1 in ${(1 / X.pT.v).toFixed(1)}`);
    expect(q[1]!.explanation).toBe(`1 ÷ ${X.pT.v.toFixed(4)} − 1 ≈ ${(1 / X.pT.v - 1).toFixed(2)}.`);
    expect(q[2]!.choices[q[2]!.answer]).toBe(`${pct(X.tie9.edge, 2)}%`);
    expect(q[3]!.explanation).toBe(`72 × $10 × ${pct(X.tie8.edge, 2)}% ≈ ${money(hourly(X.tie8.edge, 10))}.`);
    expect(q[3]!.choices).toContain(`About ${money(hourly(X.banker.edge, 10))}`);
    expect(q[3]!.choices).toContain(`About ${money(hourly(X.tie9.edge, 10))}`);
  });

  it('lesson 11: every bet on the default table, ranked, with D19 tier labels', () => {
    const id = 'strategy-lowest-edge';
    const rows: [string, { edge: Q } | Q, boolean][] = [
      ['**Banker**', X.banker, true],
      ['Player', X.player, false],
      ['Dragon Bonus on Player', X.dbPlayer, false],
      ['Dragon Bonus on Banker', X.dbBanker, false],
      ['Player Pair / Banker Pair', pairEv.neg(), false],
      ['Tie 8:1', X.tie8, false],
    ];
    let last = 0;
    for (const [name, b, bold] of rows) {
      const edge = b instanceof Q ? b : b.edge;
      expect(edge.v).toBeGreaterThan(last); // cheapest first
      last = edge.v;
      const e = `${pct(edge, 2)}%`;
      const h = money(hourly(edge, 10));
      const label = TIER_LABEL[tierOf(edge.v)];
      const tierCell = bold ? `${label} · lowest on this table` : label;
      expectQuoted(id, bold ? `| ${name} | **${e}** | ${tierCell} | **${h}** |` : `| ${name} | ${e} | ${tierCell} | ${h} |`);
    }
    const diff = (a: Q, b: Q) => money(hourly(a, 10) - hourly(b, 10));
    expectQuoted(id, `at $10 a hand it's ${diff(X.player.edge, X.banker.edge)} an hour`);
    expectQuoted(id, `blend of ${pct(X.banker.edge, 2)}% and ${pct(X.player.edge, 2)}%`);
    expect(quizzes(id)[1]!.explanation).toContain(`${pct(X.banker.edge, 2)}%`);
    expect(quizzes(id)[2]!.explanation).toBe(
      `Player costs ${diff(X.player.edge, X.banker.edge)} an hour more than Banker; Tie costs ${diff(X.tie8.edge, X.banker.edge)} more.`,
    );
    expect(scenes(id)[0]!.steps![1]!.hint).toBe(`Banker: ${pct(X.banker.edge, 2)}%, the lowest on this table.`);
  });

  it('lesson 12: table variants', () => {
    const id = 'table-variants';
    expectQuoted(id, `about once every ${Math.round(1 / X.pD7.v)} hands. The Banker edge\nis **${pct(X.ez.edge, 2)}%**`);
    expectQuoted(id, `commission game's ${pct(X.banker.edge, 2)}%`);
    expectQuoted(id, `about once every ${Math.round(1 / X.pB6.v)} hands`);
    expectQuoted(id, `the Banker edge is **${pct(X.super6.edge, 2)}%**, worse than both`);
    expect(X.super6.edge.v).toBeGreaterThan(X.player.edge.v);
    const p = `${pct(X.player.edge, 2)}%`;
    const rows: [string, Q, string, string][] = [
      ['4% commission (rare)', X.banker4.edge, `${pct(X.banker4.edge, 2)}%`, p],
      ['EZ Baccarat', X.ez.edge, `**${pct(X.ez.edge, 2)}%**`, p],
      ['6 decks, 5% commission', X.banker6.edge, `${pct(X.banker6.edge, 2)}% (${pct(X.banker6.edge, 4)}%)`, `${pct(X.player6.edge, 2)}% (${pct(X.player6.edge, 4)}%)`],
      ['**8 decks, 5% commission (default)**', X.banker.edge, `**${pct(X.banker.edge, 2)}%** (${pct(X.banker.edge, 4)}%)`, `${p} (${pct(X.player.edge, 4)}%)`],
      ['Super 6', X.super6.edge, `${pct(X.super6.edge, 2)}%`, p],
    ];
    let last = 0;
    for (const [name, edge, e, pe] of rows) {
      expect(edge.v).toBeGreaterThan(last);
      last = edge.v;
      const h = money(hourly(edge, 10));
      const hh = name.startsWith('**8 decks') ? `**${h}**` : h;
      expectQuoted(id, `| ${name} | ${e} | ${pe} | ${hh} |`);
    }
    expectQuoted(id, `Player (${p}) is the cheapest main bet`);
    expectQuoted(id, `9 to 1 (${pct(X.tie9.edge, 2)}%) instead of 8 to 1 (${pct(X.tie8.edge, 2)}%)`);
    expectQuoted(id, `≈ ${pct(X.pD7, 4)}% (1 in ${(1 / X.pD7.v).toFixed(1)})`);
    expectQuoted(id, `≈ **−${pct(X.ez.edge, 4)}%**`);
    expectQuoted(id, `≈ ${pct(X.pB6, 4)}% (1 in ${(1 / X.pB6.v).toFixed(1)})`);
    expectQuoted(id, `≈ **−${pct(X.super6.edge, 4)}%**`);
    // EZ: the push replaces the commission; Super 6: half pay on a 6
    expect(X.ez.ev.toString()).toBe(X.pB.sub(X.pD7).sub(X.pP).toString());
    expect(X.super6.ev.toString()).toBe(X.pB.sub(X.pB6.mul(new Q(1, 2))).sub(X.pP).toString());
    const [s1, s2] = scenes(id);
    expect(s1!.steps![0]!.text).toContain(`${pct(X.ez.edge, 2)}%, no commission`);
    expect(s2!.steps![0]!.text).toContain(`**${pct(X.super6.edge, 2)}%**, more than the Player bet`);
    const q = quizzes(id);
    expect(q[1]!.explanation).toBe(`Super 6: ${pct(X.super6.edge, 2)}%, worse than the Player bet's ${p}.`);
    expect(q[2]!.explanation).toBe(`Player is ${p} everywhere, and Super 6 Banker is ${pct(X.super6.edge, 2)}%.`);
    expect(q[3]!.choices[q[3]!.answer]).toBe(`No: ${pct(X.banker6.edge, 4)}% vs ${pct(X.banker.edge, 4)}%`);
  });

  it('lesson 13: per resolved bet, settling, and the best bet at each table', () => {
    const id = 'checkpoint-strategy';
    const rb = perResolved(X.banker.ev);
    const rp = perResolved(X.player.ev);
    expectQuoted(id, `quoted as **${pct(rb, 2)}%** and Player as **${pct(rp, 2)}%**`);
    expectQuoted(id, `which gives ${pct(X.banker.edge, 2)}% and ${pct(X.player.edge, 2)}%`);
    expectQuoted(id, `≈ ${pct(rb, 4)}%, Player`);
    expectQuoted(id, `≈ ${pct(rp, 4)}%.`);
    const q = quizzes(id);
    expect(q[1]!.choices[q[1]!.answer]).toBe(`$${40 * 0.95}`);
    expect(q[2]!.explanation).toBe(`EZ ${pct(X.ez.edge, 2)}% < standard ${pct(X.banker.edge, 2)}% < Super 6 ${pct(X.super6.edge, 2)}%.`);
    expect(q[4]!.choices[q[4]!.answer]).toBe(`It pays less than the fair ${(1 / X.pT.v - 1).toFixed(1)} to 1`);
    expect(q[4]!.explanation).toBe(`Ties come about 1 in ${(1 / X.pT.v).toFixed(1)}, so 8 to 1 leaves a ${pct(X.tie8.edge, 2)}% edge.`);
    const s2 = scenes(id)[1]!;
    expect(s2.variant).toBe('super-6');
    expect(X.player.edge.v).toBeLessThan(X.super6.edge.v); // the expected bet is Player
    expect(s2.steps![0]!.hint).toBe(`At Super 6, Banker is ${pct(X.super6.edge, 2)}% and Player ${pct(X.player.edge, 2)}%.`);
  });

  it('lesson 14: per hand and per hour at 72 hands', () => {
    const id = 'edge-and-hourly-cost';
    for (const b of [5, 10, 25, 100]) {
      const hand = money(X.banker.edge.v * b);
      const hour = money(hourly(X.banker.edge, b));
      const push = `$${(b * HPH).toLocaleString('en-US')}`;
      expectQuoted(id, b === 10 ? `| $${b} | ${hand} | **${hour}** | ${push} |` : `| $${b} | ${hand} | ${hour} | ${push} |`);
    }
    const h = (e: Q, b: number, n = HPH) => hourly(e, b, n);
    expectQuoted(id, `costs ${money(h(X.banker.edge, 25) - h(X.banker.edge, 10))} more an hour`);
    expectQuoted(id, `at $10 costs ${money(h(X.player.edge, 10) - h(X.banker.edge, 10))}`);
    expectQuoted(id, `then costs ${money(h(X.banker.edge, 10, 40))} an hour`);
    expectQuoted(id, `(Banker ${pct(perResolved(X.banker.ev), 2)}%, Player ${pct(perResolved(X.player.ev), 2)}%)`);
    const s = scenes(id)[0]!;
    expect(s.steps![0]!.text).toContain(`**−${money(X.banker.edge.v * 25)}** a hand, **−${money(h(X.banker.edge, 25))}** an hour`);
    expect(s.steps![1]!.text).toContain(`about ${Math.round(X.banker.edge.v * 2500)} cents a hand`);
    const q = quizzes(id);
    expect(q[0]!.choices[q[0]!.answer]).toBe(`About ${money(h(X.banker.edge, 20))}`);
    expect(q[0]!.explanation).toBe(`72 × $20 × ${pct(X.banker.edge, 4)}% ≈ ${money(h(X.banker.edge, 20))}.`);
    expect(q[1]!.explanation).toBe(
      `Switching to Player costs ${money(h(X.player.edge, 10) - h(X.banker.edge, 10))} more. Slowing to 40 hands saves ${money(h(X.banker.edge, 10) - h(X.banker.edge, 10, 40))}.`,
    );
    expect(q[2]!.explanation).toContain(`${pct(perResolved(X.banker.ev), 2)}% is per decided bet. ${pct(X.banker.edge, 2)}%`);
  });

  it('lesson 15: swings (normal approx.), standard deviations and bankroll survival (exact DP)', () => {
    const id = 'variance-and-bankroll';
    expectQuoted(id, `loses about ${Math.round(X.banker.edge.v * 1000)} cents on average`);
    expectQuoted(id, `about **${money(X.banker.sd * 10)} up or down**`);
    for (const [label, n] of [['1 hour', 72], ['10 hours', 720], ['100 hours', 7200]] as const) {
      const e = hourly(X.banker.edge, 10, n);
      const exp = n === 72 ? money(e) : dollars(e);
      const swing = dollars(X.banker.sd * Math.sqrt(n) * 10);
      const ahead = Math.round(phi((-X.banker.edge.v * Math.sqrt(n)) / X.banker.sd) * 100);
      expectQuoted(id, `| ${label} | −${exp} | ±${swing} | ${ahead}% |`);
    }
    expect(X.banker.sd * Math.sqrt(72) * 10 / hourly(X.banker.edge, 10)).toBeGreaterThan(10); // "luck is ten times bigger"
    const sds: [string, number][] = [
      ['Banker', X.banker.sd],
      ['Player', X.player.sd],
      ['Dragon Bonus on Player', X.dbPlayer.sd],
      ['Tie', X.tie8.sd],
      ['Pair', pairSd],
      ['Dragon 7', dragon7(D8).sd],
    ];
    expectQuoted(id, sds.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(', '));
    expectQuoted(id, `≈ ${X.banker.sd.toFixed(4)}. Player: ${X.player.sd.toFixed(4)}. Tie 8:1: ${X.tie8.sd.toFixed(4)}.`);
    expectQuoted(id, `that's ${(X.banker.sd * Math.sqrt(72)).toFixed(2)} bets, or ${money(X.banker.sd * Math.sqrt(72) * 10)} at $10`);
    expect(pairSd.toFixed(4)).toBe('3.1549'); // D30
    // ruin: flat $10 Banker, independent hands, in 50-cent steps (+19 / -20 / 0), bust below $10
    const ruin = (bankroll: number, hands: number) => {
      const start = bankroll * 2;
      const size = start + 19 * hands + 1;
      let cur = new Float64Array(size);
      cur[start] = 1;
      let busted = 0;
      const [pw2, pl, pt] = [X.pB.v, X.pP.v, X.pT.v];
      for (let h = 0; h < hands; h++) {
        const nxt = new Float64Array(size);
        for (let s = 0; s < size; s++) {
          const m = cur[s]!;
          if (!m) continue;
          nxt[s + 19]! += m * pw2;
          nxt[s]! += m * pt;
          if (s - 20 < 20) busted += m * pl;
          else nxt[s - 20]! += m * pl;
        }
        cur = nxt;
      }
      return busted;
    };
    const table: [number, string, string, string][] = [
      [100, '26%', '54%', '78%'],
      [200, '1.8%', '19%', '54%'],
      [300, '0.02%', '4.4%', '33%'],
      [500, '0.00%', '0.05%', '8.3%'],
    ];
    for (const [b, ...cells] of table) {
      const got = [72, 216, 720].map((n, i) => {
        const dec = (cells[i]!.split('.')[1] ?? '%').length - 1;
        return `${(ruin(b, n) * 100).toFixed(dec)}%`;
      });
      expect(got, `$${b}`).toEqual(cells);
      expectQuoted(id, `| $${b} (${b / 10} bets) | ${cells.join(' | ')} |`);
    }
    const r500 = ruin(500, 720);
    expect(Math.round(r500 * 100)).toBe(8); // l15-s1: "About 8 in 100 run out within 10 hours with $500"
    const s = scenes(id)[0]!;
    expect(s.bankroll).toBe(50_000);
    expect(s.steps![1]!.text).toContain(`close to **−${dollars(hourly(X.banker.edge, 10, 720))}**`);
    const q = quizzes(id);
    expect(q[0]!.explanation).toBe(`Expected −${money(hourly(X.banker.edge, 10))}; typical swing about ±${dollars(X.banker.sd * Math.sqrt(72) * 10)}.`);
    expect(dragon7(D8).sd).toBeGreaterThan(Math.max(X.tie8.sd, X.player.sd, X.banker.sd));
    expect(q[1]!.choices[q[1]!.answer]).toBe('Dragon 7');
    expect(q[1]!.explanation).toContain(`SD ≈ ${dragon7(D8).sd.toFixed(2)} per $1`);
    expect(q[2]!.choices[q[2]!.answer]).toBe(`$${20 * 2 * 10} to $${30 * 2 * 10}`);
  });

  it('lesson 16: the next hand after a streak, and how common streaks are', () => {
    const id = 'roads-and-streaks';
    expectQuoted(id, `still Banker ${pct(X.pB, 2)}%, Player ${pct(X.pP, 2)}%, Tie ${pct(X.pT, 2)}%`);
    expectQuoted(id, `≈ ${pct(pBdecided, 2)}%`);
    // P(longest run of one winner >= k) in 73 decided hands, independent with P(B | decided)
    const p = pBdecided.v;
    const n = 73;
    const atLeast = (k: number) => {
      // state: run length 1..k-1 for each side; probability of never reaching k
      let b = new Float64Array(k);
      let pl = new Float64Array(k);
      b[1] = p;
      pl[1] = 1 - p;
      for (let h = 1; h < n; h++) {
        const nb = new Float64Array(k);
        const np = new Float64Array(k);
        const sb = b.reduce((s, x) => s + x, 0);
        const sp = pl.reduce((s, x) => s + x, 0);
        for (let r = 1; r < k - 1; r++) {
          nb[r + 1] = b[r]! * p;
          np[r + 1] = pl[r]! * (1 - p);
        }
        nb[1] = sp * p;
        np[1] = sb * (1 - p);
        b = nb;
        pl = np;
      }
      return 1 - b.reduce((s, x) => s + x, 0) - pl.reduce((s, x) => s + x, 0);
    };
    for (const [k, share] of [[5, 92], [6, 69], [7, 43], [8, 24], [10, 6]] as const) {
      expect(Math.round(atLeast(k) * 100), `run >= ${k}`).toBe(share);
      expectQuoted(id, `| ${k} | ${share}% |`);
    }
    let mean = 0;
    for (let k = 1; k <= n; k++) mean += k === 1 ? 1 : atLeast(k);
    expect(Math.abs(mean - 6.5)).toBeLessThan(0.1);
    expectQuoted(id, 'averages about **6.5** hands');
    expect(quizzes(id)[2]!.explanation).toBe(`About ${Math.round(atLeast(6) * 100)}% of shoes have one.`);
    expect(quizzes(id)[0]!.choices[quizzes(id)[0]!.answer]).toBe(`About ${pct(X.pB, 1)}%, the same as always`);
    // removing one card from a fresh 8-deck shoe moves the Banker EV by at most 0.012%
    const s8 = shoe(8);
    const effects = Array.from({ length: 10 }, (_, v) => {
      const counts = [...s8.counts];
      counts[v]!--;
      const ranks = [...s8.ranks];
      ranks[v === 0 ? 9 : v - 1]!--;
      return banker(enumerate(counts, ranks), FIVE).ev.v - X.banker.ev.v;
    });
    const maxAbs = Math.max(...effects.map(Math.abs));
    expect((maxAbs * 100).toFixed(3)).toBe('0.012');
    expect(effects.indexOf(Math.max(...effects))).toBe(4); // removing a 4 helps the Banker most
    expect(effects.indexOf(Math.min(...effects))).toBe(6); // a 6 hurts it most
    expectQuoted(
      id,
      'at most **0.012%** (removing a 4 helps the Banker most,\nremoving a 6 hurts it most',
    );
  });
});

describe('cross-checks with the real packages (run once they land)', () => {
  const mathReady = ready(() => math.fullShoeEvs(VARIANT_RULES['punto-banco']));
  it.runIf(mathReady)('math.fullShoeEvs equals the enumerator for every bet lessons 9-16 quote', () => {
    const pick = (v: VariantId, b: BetId, tiePays: 8 | 9 = 8, commission?: [number, number]) => {
      const rules = { ...VARIANT_RULES[v], tiePays, ...(commission ? { commission } : {}) };
      const e = math.fullShoeEvs(rules).find((x) => x.bet === b)!;
      return `${e.ev.num}/${e.ev.den}`;
    };
    expect(pick('punto-banco', 'banker')).toBe(X.banker.ev.toString());
    expect(pick('punto-banco', 'player')).toBe(X.player.ev.toString());
    expect(pick('punto-banco', 'tie')).toBe(X.tie8.ev.toString());
    expect(pick('punto-banco', 'tie', 9)).toBe(X.tie9.ev.toString());
    expect(pick('ez', 'banker')).toBe(X.ez.ev.toString());
    expect(pick('super-6', 'banker')).toBe(X.super6.ev.toString());
    expect(pick('punto-banco', 'player-pair')).toBe(pairEv.toString());
    expect(pick('punto-banco', 'dragon-bonus-player')).toBe(X.dbPlayer.ev.toString());
    expect(pick('punto-banco', 'dragon-bonus-banker')).toBe(X.dbBanker.ev.toString());
    expect(pick('ez', 'dragon-7')).toBe(X.dragon7.ev.toString());
    const banker = math.fullShoeEvs(VARIANT_RULES['punto-banco']).find((x) => x.bet === 'banker')!;
    expect(banker.edgePerResolved && `${banker.edgePerResolved.num}/${banker.edgePerResolved.den}`).toBe(
      perResolved(X.banker.ev).toString(),
    );
    expect(banker.sd).toBeCloseTo(X.banker.sd, 4);
    for (const e of math.fullShoeEvs(VARIANT_RULES['punto-banco']))
      if (e.offered) expect(e.tier).toBe(tierOf(Number(e.edge.num) / Number(e.edge.den)));
  });
  it.runIf(ready(() => math.perHourCents({ num: -1n, den: 1n }, 72)))('math.perHourCents gives the $7.62 an hour of lessons 10, 11 and 14', () => {
    const evCents = X.banker.ev.mul(1000);
    const h = math.perHourCents({ num: evCents.n, den: evCents.d }, HPH);
    expect((Number(h.num) / Number(h.den) / 100).toFixed(2)).toBe('-7.62');
  });

  const engineReady = ready(() => settleHand);
  it.runIf(engineReady)('the engine settles the forced hands and the $40 quiz as the text says', () => {
    const handOf = (player: readonly string[], banker: readonly string[]) => {
      const p = parseCards(player.join(' '));
      const b = parseCards(banker.join(' '));
      const order = [p[0]!, b[0]!, p[1]!, b[1]!, ...p.slice(2), ...b.slice(2)];
      let k = 0;
      const h = playHand(() => order[k++]!);
      expect(k).toBe(order.length);
      return { ...h, n: 1, shoeNo: 1, handInShoe: 1, forced: true };
    };
    const profit = (v: VariantId, h: ReturnType<typeof handOf>, amount: number) =>
      settleHand(h, { banker: amount }, VARIANT_RULES[v]).settlements[0]!.profit;
    const ez = scenes('table-variants')[0]!.steps![1]!.deals![0]!;
    const s6 = scenes('table-variants')[1]!.steps![1]!.deals![0]!;
    expect(profit('ez', handOf(ez.player, ez.banker), 1000)).toBe(0); // "your $10 comes back"
    expect(profit('super-6', handOf(s6.player, s6.banker), 1000)).toBe(500); // "+$5"
    expect(profit('punto-banco', handOf(s6.player, s6.banker), 4000)).toBe(3800); // l13 quiz: $38
  });
  it.runIf(mathReady)('strategy.systemCost gives the expected lines the auto-play scenes quote', () => {
    const cost = (spec: StrategySpec, hands: number) =>
      (strategy.systemCost(spec, 'punto-banco', 8).costPerHourCents! * hands) / HPH / 100;
    for (const { scene } of allScenes()) {
      const specs = [...(scene.autoPlay?.compare ?? []), ...(scene.autoPlay?.defaultStrategy ? [scene.autoPlay.defaultStrategy] : [])];
      for (const spec of specs) {
        const want = { 'flat-banker': X.banker.edge, 'flat-player': X.player.edge, 'flat-tie': X.tie8.edge }[spec.id as 'flat-banker'];
        expect(cost(spec, 720)).toBeCloseTo(hourly(want, 10, 720), 2);
      }
    }
  });
});
