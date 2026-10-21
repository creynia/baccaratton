// Monte-Carlo cross-checks (simulator.md 7.2): fixed seeds, every bet's sampled mean within 4σ of
// the exact EV. Sampling and settlement go through the engine only, never through the math code.
import { describe, expect, it } from 'vitest';
import { betDef, betsOffered } from '../engine/bets';
import { cardValue } from '../engine/cards';
import { VARIANT_RULES } from '../engine/rules';
import { profitCents } from '../engine/settle';
import { playHand } from '../engine/tableau';
import type { BetId, Card, TableRules } from '../engine/types';
import { fullShoeEvs } from './edges';
import { toNumber } from './fraction';
import { mulberry32 } from './__tests__/reference';

const AMOUNT = 100;
const HANDS = Number(process.env.MC_HANDS ?? 2_000_000);

class Stats {
  n = 0;
  s = 0;
  q = 0;
  add(x: number): void {
    this.n++;
    this.s += x;
    this.q += x * x;
  }
  get mean(): number {
    return this.s / this.n;
  }
  get se(): number {
    const v = (this.q - (this.s * this.s) / this.n) / (this.n - 1);
    return Math.sqrt(v / this.n);
  }
}

function expectWithin(stats: Map<BetId, Stats>, rules: TableRules): void {
  for (const e of fullShoeEvs(rules)) {
    const st = stats.get(e.bet)!;
    const z = (st.mean - toNumber(e.ev)) / st.se;
    expect([e.bet, Math.abs(z) < 4]).toEqual([e.bet, true]);
  }
}

describe('Monte Carlo: fresh-shoe hands', () => {
  it.each(['punto-banco', 'ez', 'super-6'] as const)(
    '%s: every bet within 4σ',
    (variant) => {
      const rules = VARIANT_RULES[variant];
      const rnd = mulberry32(variant.length * 7919);
      const shoe: Card[] = Array.from({ length: 416 }, (_, i) => i % 52);
      const bets = betsOffered(rules);
      const defs = bets.map((b) => betDef(b));
      const stats = new Map(bets.map((b) => [b, new Stats()]));
      const st = bets.map((b) => stats.get(b)!);
      for (let h = 0; h < HANDS; h++) {
        // A uniform ordered sample of six cards without replacement (partial Fisher-Yates).
        let k = 0;
        const hand = playHand(() => {
          const j = k + Math.floor(rnd() * (416 - k));
          const c = shoe[j]!;
          shoe[j] = shoe[k]!;
          shoe[k] = c;
          k++;
          return c;
        });
        for (let i = 0; i < defs.length; i++) {
          st[i]!.add(profitCents(AMOUNT, defs[i]!.settle(hand.outcome, rules)) / AMOUNT);
        }
      }
      expectWithin(stats, rules);
    },
    300_000,
  );
});

describe('Monte Carlo: 200 real shoes (burn, cut card 16 from the end, one more hand)', () => {
  it('Banker and Player means within 4σ of the full-shoe EV', () => {
    const rules = VARIANT_RULES['punto-banco'];
    const rnd = mulberry32(777);
    const stats = new Map<BetId, Stats>([
      ['banker', new Stats()],
      ['player', new Stats()],
    ]);
    for (let s = 0; s < 200; s++) {
      const order: Card[] = Array.from({ length: 416 }, (_, i) => i % 52);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const first = order[0]!;
      let pos = 1 + (cardValue(first) === 0 ? 10 : cardValue(first));
      const cut = order.length - rules.cutCardFromEnd;
      let cutOut = false;
      for (;;) {
        const hand = playHand(() => order[pos++]!);
        for (const [b, st] of stats) {
          st.add(profitCents(AMOUNT, betDef(b).settle(hand.outcome, rules)) / AMOUNT);
        }
        if (cutOut) break; // that was the one more hand (D8/D17)
        if (pos >= cut) cutOut = true;
      }
    }
    expect(stats.get('banker')!.n).toBeGreaterThan(200 * 70);
    const exact = new Map(
      fullShoeEvs(rules)
        .filter((e) => stats.has(e.bet))
        .map((e) => [e.bet, e.ev]),
    );
    for (const [b, st] of stats) {
      expect(Math.abs(st.mean - toNumber(exact.get(b)!)) / st.se).toBeLessThan(4);
    }
  });
});
