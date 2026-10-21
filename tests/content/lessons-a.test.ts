// content-a: lessons 1-8 and the shared JSON files (curriculum.md sections 4-7, decisions D13, D24,
// D26, D27, D30, D34, D38). Every scene is validated, every forced hand and quiz hand is replayed
// through the drawing rules, and every number the prose quotes is recomputed here from an
// independent exact enumeration of the 8-deck tableau.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent, readSources } from '../../src/content/load';
import type { Lesson, Quiz } from '../../src/content/types';
import {
  BET_IDS,
  DEFAULT_RULES,
  bankerDraws,
  cardCode,
  handTotal,
  isNatural,
  parseCards,
  playerDraws,
} from '../../src/sim/engine';
import type { Card, CardValue, ForcedHand } from '../../src/sim/engine';
import { fullShoeEvs } from '../../src/sim/math';
import { validateScene } from '../../src/sim/scene';
import type { SceneConfig } from '../../src/sim/scene/types';
import { STRATEGY_IDS } from '../../src/sim/strategy';

const root = process.cwd();
const bundle = buildContent(root);
const src = readSources(root);

const IDS = [
  'welcome',
  'card-values',
  'naturals-and-player-rule',
  'banker-when-player-stands',
  'banker-third-card-table',
  'third-card-practice',
  'settling-bets',
  'expected-value',
] as const;
type Id = (typeof IDS)[number];
const FILES = IDS.map((id, i) => `${String(i + 1).padStart(2, '0')}-${id}.md`);
const text = (id: Id) => readFileSync(join(root, 'content/lessons', FILES[IDS.indexOf(id)]!), 'utf8');
const lesson = (id: Id): Lesson => {
  const l = bundle.lessons.find((x) => x.id === id);
  if (!l) throw new Error(`lesson ${id} missing`);
  return l;
};
const scenesOf = (id: Id): SceneConfig[] =>
  lesson(id).blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene] : []));
const quizzesOf = (id: Id): Quiz[] =>
  lesson(id).blocks.flatMap((b) => (b.kind === 'quiz' ? [b.quiz] : []));

// ---------- the course map (curriculum.md section 4) ----------

describe('course map', () => {
  it('has the 7 chapters in order, with the curriculum titles', () => {
    expect(src.chapters.map((c) => [c.id, c.title])).toEqual([
      ['foundations', 'Foundations'],
      ['third-card-rule', 'The third-card rule'],
      ['ev-basics', 'EV basics'],
      ['perfect-lowest-edge', 'Perfect strategy I: lowest edge'],
      ['perfect-practical', 'Perfect strategy II: practical'],
      ['perfect-fun', 'Perfect strategy III: fun per dollar'],
      ['real-casino', 'The real casino'],
    ]);
    for (const c of src.chapters) expect(c.summary.length).toBeGreaterThan(10);
  });

  it('lists lessons 1-8 first, in order, in their chapters', () => {
    expect(bundle.lessons.slice(0, 8).map((l) => l.id)).toEqual([...IDS]);
    const chapterOf = Object.fromEntries(bundle.lessons.map((l) => [l.id, l.chapterId]));
    expect(IDS.map((id) => chapterOf[id])).toEqual([
      'foundations',
      'foundations',
      'third-card-rule',
      'third-card-rule',
      'third-card-rule',
      'third-card-rule',
      'ev-basics',
      'ev-basics',
    ]);
  });

  it('carries the curriculum front matter', () => {
    const want: Record<Id, [string, number]> = {
      welcome: ['Welcome to baccarat', 4],
      'card-values': ['Counting a hand: only the last digit', 4],
      'naturals-and-player-rule': ['Naturals, and when the Player draws', 5],
      'banker-when-player-stands': ["The Banker's turn, part 1: when the Player stood", 4],
      'banker-third-card-table': ["The Banker's turn, part 2: the table", 8],
      'third-card-practice': ['Calling the hand like a dealer', 6],
      'settling-bets': ['Who gets paid: commission, ties and pushes', 5],
      'expected-value': ['EV and the house edge, in plain English', 7],
    };
    for (const id of IDS) {
      const l = lesson(id);
      expect([l.title, l.minutes], id).toEqual(want[id]);
    }
  });

  it('bets.json and systems.json cover exactly the engine and strategy ids (D13)', () => {
    expect(Object.keys(src.bets).sort()).toEqual([...BET_IDS].sort());
    expect(Object.keys(src.systems).sort()).toEqual([...STRATEGY_IDS].sort());
  });

  it('keeps edges and probabilities out of the JSON files', () => {
    for (const f of ['bets.json', 'systems.json', 'glossary.json']) {
      // The 5% commission is a rule, not an edge.
      const raw = readFileSync(join(root, 'content', f), 'utf8').replace(/(?<![\d.])5%/g, '');
      expect(raw, f).not.toMatch(/\d%|\d\.\d+%|house edge of \d/);
    }
  });
});

// ---------- scenes (simulator.md section 5.1, D26-D27) ----------

interface Played {
  player: Card[];
  banker: Card[];
  p: CardValue;
  b: CardValue;
  winner: 'player' | 'banker' | 'tie';
}

/** Checks the forced hand against the tableau (a third card exactly where the rule draws). */
function play(h: ForcedHand | { player: readonly string[]; banker: readonly string[] }): Played {
  const player = parseCards(h.player.join(' '));
  const banker = parseCards(h.banker.join(' '));
  const all = [...player, ...banker];
  expect(new Set(all).size, 'a forced hand repeats a card').toBe(all.length);
  expect(player.length >= 2 && player.length <= 3 && banker.length >= 2 && banker.length <= 3).toBe(
    true,
  );
  const p2 = handTotal(player.slice(0, 2));
  const b2 = handTotal(banker.slice(0, 2));
  const pd = playerDraws(p2, b2).draws;
  expect(player.length === 3, `Player ${p2} ${pd ? 'draws' : 'stands'}`).toBe(pd);
  const third = pd ? handTotal([player[2]!]) : null;
  const bd = isNatural(p2) || isNatural(b2) ? false : bankerDraws(b2, p2, third).draws;
  expect(banker.length === 3, `Banker ${b2} ${bd ? 'draws' : 'stands'}`).toBe(bd);
  const p = handTotal(player);
  const b = handTotal(banker);
  return { player, banker, p, b, winner: p > b ? 'player' : b > p ? 'banker' : 'tie' };
}

/** What each forced hand must produce, as the step texts describe it. */
const OUTCOMES: Record<string, [Played['winner'], number, number]> = {
  'l01-s2/deal': ['player', 7, 6],
  'l02-s1/total': ['player', 8, 7],
  'l03-s1/natural': ['player', 9, 8],
  'l03-s2/draws': ['player', 9, 7],
  'l03-s2/stands': ['banker', 6, 8],
  'l04-s1/banker-draws': ['banker', 7, 9],
  'l04-s1/tie': ['tie', 6, 6],
  'l05-s1/b3-p8': ['banker', 1, 3],
  'l05-s1/b4-p2': ['banker', 6, 7],
  'l05-s1/b5-p3': ['player', 8, 5],
  'l05-s1/b6-p7': ['banker', 7, 8],
  'l05-s1/b6-p5': ['player', 7, 6],
  'l07-s1/deal': ['banker', 2, 7],
  'l07-s2/deal': ['tie', 6, 6],
};

describe('scenes', () => {
  it('validate, are numbered lNN-sN, and each lesson ends with a quiz', () => {
    IDS.forEach((id, i) => {
      const scenes = scenesOf(id);
      expect(scenes.length, id).toBeGreaterThan(0);
      scenes.forEach((s, j) => {
        expect(s.id).toBe(`l${String(i + 1).padStart(2, '0')}-s${j + 1}`);
        const v = validateScene(s);
        expect(v.errors, s.id).toEqual([]);
        expect(v.ok).toBe(true);
      });
      expect(lesson(id).blocks.at(-1)?.kind, id).toBe('quiz');
    });
  });

  it('play every forced hand by the tableau, with the outcome the text describes', () => {
    const seen: string[] = [];
    for (const id of IDS)
      for (const s of scenesOf(id)) {
        expect(s.deals, `${s.id}: forced hands go on the step that deals them`).toBeUndefined();
        const steps = s.steps ?? [];
        steps.forEach((st, k) => {
          if (!st.deals) return;
          expect(st.deals).toHaveLength(1);
          const key = `${s.id}/${st.id}`;
          seen.push(key);
          const r = play(st.deals[0]!);
          expect([r.winner, r.p, r.b], key).toEqual(OUTCOMES[key]);
          // "X wins A to B" in this or the next step's text matches the cards.
          const said = `${st.text} ${steps[k + 1]?.text ?? ''}`;
          for (const m of said.matchAll(/(Player|Banker) wins (\d) to (\d)/g)) {
            const winTotal = Number(m[2]);
            const loseTotal = Number(m[3]);
            expect(r.winner, key).toBe(m[1]!.toLowerCase());
            expect([winTotal, loseTotal], key).toEqual(
              r.winner === 'player' ? [r.p, r.b] : [r.b, r.p],
            );
          }
        });
      }
    expect(seen.sort()).toEqual(Object.keys(OUTCOMES).sort());
  });

  it('follow the step rules of D26/D27', () => {
    for (const id of IDS)
      for (const s of scenesOf(id))
        for (const st of s.steps ?? []) {
          const where = `${s.id}/${st.id}`;
          const cw = st.completeWhen as Record<string, unknown>;
          if (st.predict) {
            expect(st.allowedActions, where).toEqual(['deal']);
            expect(st.pauseAt, where).toBeDefined();
            if (st.deals) expect(cw, where).toEqual({ predicted: { count: 1 } });
            else {
              expect(s.onDealsExhausted, where).toBe('random');
              expect(st.skipNaturals, where).toBe(true);
              expect((cw.predicted as { correct?: boolean }).correct, where).toBe(true);
            }
          }
          if ('acknowledged' in cw) {
            expect(st.allowedActions, where).toEqual([]);
            expect(st.advance, where).toBe('button');
          }
          if ('betOnFelt' in cw || 'all' in cw)
            expect(st.allowedActions, `${where}: betting steps lock Deal`).toEqual([
              'set-bet',
              'clear-bets',
            ]);
          if (st.deals && !st.predict) expect(st.allowedActions, where).toEqual(['deal']);
        }
  });

  it('show the EV sheet from lesson 8 on, and not before', () => {
    IDS.forEach((id, i) => {
      for (const s of scenesOf(id)) expect(s.showEV, s.id).toBe(i === 7);
    });
  });

  it('prediction steps ask what the forced cards really do', () => {
    // [scene/step, the right call]
    const calls: [string, 'draw' | 'stand' | number][] = [
      ['l02-s1/total', 5],
      ['l03-s1/natural', 'stand'],
      ['l03-s2/draws', 'draw'],
      ['l03-s2/stands', 'stand'],
      ['l04-s1/banker-draws', 'draw'],
      ['l04-s1/tie', 'stand'],
      ['l05-s1/b3-p8', 'stand'],
      ['l05-s1/b4-p2', 'draw'],
      ['l05-s1/b5-p3', 'stand'],
      ['l05-s1/b6-p7', 'draw'],
      ['l05-s1/b6-p5', 'stand'],
    ];
    const steps = new Map(
      IDS.flatMap((id) => scenesOf(id)).flatMap((s) =>
        (s.steps ?? []).map((st) => [`${s.id}/${st.id}`, st] as const),
      ),
    );
    for (const [key, want] of calls) {
      const st = steps.get(key)!;
      const r = play(st.deals![0]!);
      if (st.predict!.kind === 'hand-total') {
        expect(handTotal(r[st.predict!.side!].slice(0, 2)), key).toBe(want);
      } else {
        const side = st.predict!.kind === 'player-draws' ? r.player : r.banker;
        expect(side.length === 3 ? 'draw' : 'stand', key).toBe(want);
      }
    }
  });
});

// ---------- quizzes ----------

describe('quizzes', () => {
  it('every quiz hand follows the drawing rules', () => {
    let n = 0;
    for (const id of IDS)
      for (const q of quizzesOf(id))
        if (q.hand) {
          n++;
          const codes = (cs: Card[]) => cs.map(cardCode);
          // Round-trip through the same checker the scenes use.
          const r = play({ player: codes(q.hand.player), banker: codes(q.hand.banker) });
          expect(r.player).toEqual(q.hand.player);
        }
    expect(n).toBe(2);
  });

  it('draw questions are answered by the tableau', () => {
    // [lesson, quiz index, Banker two-card total, Player two-card total, Player third card or null]
    const qs: [Id, number, CardValue, CardValue, CardValue | null][] = [
      ['banker-when-player-stands', 0, 5, 7, null],
      ['banker-third-card-table', 0, 3, 0, 9],
      ['banker-third-card-table', 1, 4, 0, 1],
      ['banker-third-card-table', 2, 6, 0, 6],
      ['banker-third-card-table', 3, 5, 0, 0],
      ['third-card-practice', 1, 5, 4, 7],
      ['third-card-practice', 2, 3, 4, 8],
      ['third-card-practice', 3, 7, 1, 4],
    ];
    for (const [id, i, b, p, third] of qs) {
      const q = quizzesOf(id)[i]!;
      const draws = bankerDraws(b, p, third).draws;
      expect(q.choices[q.answer], `${id} q${i + 1}`).toBe(draws ? 'Draws' : 'Stands');
    }
    // Lesson 6 q2-q4 quote the cards: check they make those totals.
    expect(handTotal(parseCards('4c Kd'))).toBe(4);
    expect(handTotal(parseCards('5h Qc'))).toBe(5);
    expect(handTotal(parseCards('2c 2d'))).toBe(4);
    expect(handTotal(parseCards('Jd 3s'))).toBe(3);
    expect(handTotal(parseCards('Ah Ts'))).toBe(1);
    expect(handTotal(parseCards('7c Kc'))).toBe(7);
    // Lesson 2: the card-value questions.
    const cv = quizzesOf('card-values');
    expect(cv[0]!.choices[cv[0]!.answer]).toBe(String(handTotal(parseCards('8h 7c'))));
    expect(cv[1]!.choices[cv[1]!.answer]).toBe(String(handTotal(parseCards('Qs 9d'))));
    expect(cv[2]!.choices[cv[2]!.answer]).toBe(String(handTotal(parseCards('6c 4h Ks'))));
  });
});

// ---------- pinned numbers ----------

/** Exact 8-deck tableau, enumerated by card value over ordered 6-card sequences. */
function enumerate() {
  const counts = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
  const N = 416;
  // tail[k] = (N-k)(N-k-1)...(N-5): the unused positions of a six-card sequence. Exact below 2^53.
  const tail = (k: number) => {
    let t = 1;
    for (let i = k; i < 6; i++) t *= N - i;
    return t;
  };
  const acc = { player: 0, banker: 0, tie: 0, natural: 0, pDraws: 0, bDraws: 0 };
  const take = (v: number) => counts[v]--;
  const back = (v: number) => counts[v]++;
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = counts[p1]!;
    take(p1);
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = w1 * counts[b1]!;
      take(b1);
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = w2 * counts[p2]!;
        take(p2);
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = w3 * counts[b2]!;
          if (w4 === 0) continue;
          take(b2);
          const pt = ((p1 + p2) % 10) as CardValue;
          const bt = ((b1 + b2) % 10) as CardValue;
          const settle = (p: number, b: number, w: number) => {
            if (p > b) acc.player += w;
            else if (b > p) acc.banker += w;
            else acc.tie += w;
          };
          if (isNatural(pt) || isNatural(bt)) {
            acc.natural += w4 * tail(4);
            settle(pt, bt, w4 * tail(4));
          } else if (playerDraws(pt, bt).draws) {
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = w4 * counts[p3]!;
              if (w5 === 0) continue;
              take(p3);
              const pf = (pt + p3) % 10;
              acc.pDraws += w5 * tail(5);
              if (bankerDraws(bt, pt, p3 as CardValue).draws) {
                acc.bDraws += w5 * tail(5);
                for (let b3 = 0; b3 < 10; b3++) settle(pf, (bt + b3) % 10, w5 * counts[b3]!);
              } else settle(pf, bt, w5 * tail(5));
              back(p3);
            }
          } else if (bankerDraws(bt, pt, null).draws) {
            for (let b3 = 0; b3 < 10; b3++) {
              const w5 = w4 * counts[b3]!;
              acc.bDraws += w5 * tail(5);
              settle(pt, (bt + b3) % 10, w5 * tail(5));
            }
          } else settle(pt, bt, w4 * tail(4));
          back(b2);
        }
        back(p2);
      }
      back(b1);
    }
    back(p1);
  }
  return { total: tail(0), ...acc };
}

interface Frac {
  n: bigint;
  d: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
const frac = (n: bigint, d: bigint): Frac => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, k: Frac) => frac(a.n * k.n, a.d * k.d);
const str = (f: Frac) => `${f.n < 0n ? '−' : ''}${f.n < 0n ? -f.n : f.n}/${f.d}`;
const num = (f: Frac) => Number(f.n) / Number(f.d);
const pct = (f: Frac, dp: number) => `${(num(f) * 100).toFixed(dp)}%`;
const money = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(x).toFixed(2)}`;

const E = enumerate();
const T = BigInt(E.total);
const P = frac(BigInt(E.player), T);
const B = frac(BigInt(E.banker), T);
const TIE = frac(BigInt(E.tie), T);
const ONE = frac(1n, 1n);
const [cn, cd] = DEFAULT_RULES.commission; // 1/20
const BANKER_PAYS = sub(ONE, frac(BigInt(cn), BigInt(cd))); // 0.95
const EV_PLAYER = sub(P, B);
const EV_BANKER = sub(mul(B, BANKER_PAYS), P);
const EV_TIE = sub(mul(TIE, frac(BigInt(DEFAULT_RULES.tiePays), 1n)), sub(ONE, TIE));

describe('pinned numbers (independent exact enumeration)', () => {
  it('the enumeration is complete', () => {
    expect(E.player + E.banker + E.tie).toBe(E.total);
    expect(E.total.toLocaleString('en-US')).toBe('4,998,398,275,503,360');
  });

  const pins = (id: Id, list: [string, string][]) =>
    it(`${id} quotes exact figures`, () => {
      const t = text(id);
      for (const [quoted, computed] of list) {
        expect(computed, `${id}: computed value for "${quoted}"`).toBe(quoted);
        expect(t, `${id}: ${quoted}`).toContain(quoted);
      }
    });

  const nat = frac(BigInt(E.natural), T);
  const pDraws = frac(BigInt(E.pDraws), T);
  const bDraws = frac(BigInt(E.bDraws), T);
  const payout = (bet: number) => (bet * Number(BANKER_PAYS.n)) / Number(BANKER_PAYS.d);
  const tiePays = DEFAULT_RULES.tiePays;

  pins('welcome', [
    ['win $9.50', `win ${money(payout(10))}`],
    ['win $80', `win $${10 * tiePays}`],
    ['$20 − $1 = $19', `$20 − $${20 - payout(20)} = $${payout(20)}`],
  ]);
  pins('naturals-and-player-rule', [
    ['158222458/461223945', str(nat)],
    ['15479099/30748263', str(pDraws)],
    ['4136876519/9501213267', str(bDraws)],
    ['34.30%', pct(nat, 2)],
    ['50.34%', pct(pDraws, 2)],
    ['43.54%', pct(bDraws, 2)],
    ['(34.3%)', `(${pct(nat, 1)})`],
    ['(50.3%)', `(${pct(pDraws, 1)})`],
    ['34.3% of hands', `${pct(nat, 1)} of hands`],
  ]);
  pins('banker-when-player-stands', [['**+$9.50**', `**+${money(payout(10))}**`]]);
  pins('banker-third-card-table', [
    ['43.5% of all hands', `${pct(bDraws, 1)} of all hands`],
    ["Player's 50.3%", `Player's ${pct(pDraws, 1)}`],
  ]);
  pins('settling-bets', [
    ['**$9.50**', `**${money(payout(10))}**`],
    ['**$19.00**', `**${money(payout(20))}**`],
    ['**$23.75**', `**${money(payout(25))}**`],
    ['**$95.00**', `**${money(payout(100))}**`],
    ['$1.25', money(25 - payout(25))],
    ['$5.00', money(100 - payout(100))],
    ['wins $40', `wins $${5 * tiePays}`],
    ['**+$40**', `**+$${5 * tiePays}**`],
    ['you won **$19**', `you won **$${payout(20)}**`],
    ['$47.50', money(payout(50))],
  ]);
  pins('expected-value', [
    ['8712962041376/19524993263685', str(P)],
    ['8954111587648/19524993263685', str(B)],
    ['619306544887/6508331087895', str(TIE)],
    ['−241149546272/19524993263685', str(EV_PLAYER)],
    ['−114753351728/10847218479825', str(EV_BANKER)],
    ['−103841353768/723147898655', str(EV_TIE)],
    ['≈ 0.446247', `≈ ${num(P).toFixed(6)}`],
    ['≈ 0.458597', `≈ ${num(B).toFixed(6)}`],
    ['≈ 0.095156', `≈ ${num(TIE).toFixed(6)}`],
    ['**−1.2351%**', `**−${pct(frac(-EV_PLAYER.n, EV_PLAYER.d), 4)}**`],
    ['**−1.0579%**', `**−${pct(frac(-EV_BANKER.n, EV_BANKER.d), 4)}**`],
    ['**−14.3596%**', `**−${pct(frac(-EV_TIE.n, EV_TIE.d), 4)}**`],
    ['Player wins 44.62%', `Player wins ${pct(P, 2)}`],
    ['Banker wins 45.86%', `Banker wins ${pct(B, 2)}`],
    ['9.52% are ties', `${pct(TIE, 2)} are ties`],
    ['× 44.62% = +$4.46', `× ${pct(P, 2)} = +${money(10 * num(P))}`],
    ['× 45.86% = −$4.59', `× ${pct(B, 2)} = ${money(-10 * num(B))}`],
    ['**−$0.12**', `**${money(10 * num(EV_PLAYER))}**`],
    ['That −1.24%', `That −${(-num(EV_PLAYER) * 100).toFixed(2)}%`],
    ['about 12 cents', `about ${Math.round(-1000 * num(EV_PLAYER))} cents`],
    ['1.24% of the bet', `${(-num(EV_PLAYER) * 100).toFixed(2)}% of the bet`],
    ['**−$0.11**, 1.06%', `**${money(10 * num(EV_BANKER))}**, ${(-num(EV_BANKER) * 100).toFixed(2)}%`],
    ['**$1.44** per $10', `**${money(-10 * num(EV_TIE))}** per $10`],
    [
      'over 13 times',
      `over ${Math.floor(num(EV_TIE) / num(EV_BANKER))} times`,
    ],
    ['Banker: 1.06%. Player: 1.24%. Tie: 14.36%.', `Banker: ${(-num(EV_BANKER) * 100).toFixed(2)}%. Player: ${(-num(EV_PLAYER) * 100).toFixed(2)}%. Tie: ${(-num(EV_TIE) * 100).toFixed(2)}%.`],
    ['a house edge of 1.06%', `a house edge of ${(-num(EV_BANKER) * 100).toFixed(2)}%`],
  ]);

  // The math WP's exact EVs must agree once it lands (fullShoeEvs is a TODO stub until then).
  let mathEvs: ReturnType<typeof fullShoeEvs> | null = null;
  try {
    mathEvs = fullShoeEvs(DEFAULT_RULES);
  } catch (e) {
    if (!(e instanceof Error) || !/TODO/.test(e.message)) throw e;
  }
  it.skipIf(mathEvs === null)('agree with the math registry (fullShoeEvs)', () => {
    const ev = (bet: string) => {
      const x = mathEvs!.find((b) => b.bet === bet)!.ev;
      return str(frac(x.num, x.den));
    };
    expect(ev('player')).toBe(str(EV_PLAYER));
    expect(ev('banker')).toBe(str(EV_BANKER));
    expect(ev('tie')).toBe(str(EV_TIE));
  });
});

// ---------- wording (decisions.md D26, D30, D34) ----------

describe('wording', () => {
  const banned: [RegExp, string][] = [
    [/\$10 chip/, 'there is no $10 chip (D16, D30)'],
    [/Natural, nobody draws/, 'no natural button (D26)'],
    [/round(?:s|ed)? (?:the )?commission down/i, 'commission rounding note is superseded (D15)'],
    [/continuous shuffl/i, 'real shoe only (D8)'],
    [/\bExpensive\b|\bTrap\b/, 'tier names are Good / Fair / Costly / Sucker bet (D19, D30)'],
    [/view: both/, 'tableau view is full (D34)'],
    [/place-bet|predict:\s*\{[^}]*hand:|rules:\s*\{/, 'simulator SceneConfig dialect only (D26)'],
    [/\bremaining:/, 'shoe setups use removed (D26)'],
  ];
  for (const id of IDS)
    it(`${id} has no stale wording`, () => {
      const t = text(id);
      for (const [re, why] of banned) expect(t, `${id}: ${why}`).not.toMatch(re);
    });
});
