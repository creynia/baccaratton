// Engine ↔ math agreement (simulator.md 7.2, one source of truth): on small shoes, deal EVERY
// ordering of the next six cards through the engine (playHand + settleHand, in cents) and compare
// the exact mean net per bet with betEvs.
import { describe, expect, it } from 'vitest';
import { betsOffered } from '../engine/bets';
import { makeCard } from '../engine/cards';
import { VARIANT_RULES } from '../engine/rules';
import { settleHand } from '../engine/settle';
import { playHand } from '../engine/tableau';
import type { Card, Rank, Slip, Suit, TableRules } from '../engine/types';
import { outcomeDistribution } from './distribution';
import { betEvs } from './evs';
import { frac } from './fraction';
import { mulberry32, randomRanks } from './__tests__/reference';

const AMOUNT = 2000; // $20: every payout is whole cents

function* sixPermutations(cards: readonly Card[]): Generator<Card[]> {
  const used = new Array<boolean>(cards.length).fill(false);
  const seq: Card[] = [];
  function* rec(): Generator<Card[]> {
    if (seq.length === 6) {
      yield seq;
      return;
    }
    for (let i = 0; i < cards.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      seq.push(cards[i]!);
      yield* rec();
      seq.pop();
      used[i] = false;
    }
  }
  yield* rec();
}

function check(ranks: number[], rules: TableRules): void {
  const cards: Card[] = [];
  ranks.forEach((n, r) => {
    for (let k = 0; k < n; k++) cards.push(makeCard(r as Rank, (k % 4) as Suit));
  });
  const bets = betsOffered(rules);
  const slip: Slip = Object.fromEntries(bets.map((b) => [b, AMOUNT]));
  const net = new Map(bets.map((b) => [b, 0n]));
  let count = 0n;
  for (const seq of sixPermutations(cards)) {
    let i = 0;
    const hand = { ...playHand(() => seq[i++]!), n: 1, shoeNo: 1, handInShoe: 1, forced: false };
    for (const s of settleHand(hand, slip, rules).settlements) {
      net.set(s.bet, net.get(s.bet)! + BigInt(s.profit));
    }
    count++;
  }
  const evs = betEvs(outcomeDistribution(ranks), rules);
  expect(count).toBe(outcomeDistribution(ranks).total);
  for (const e of evs) {
    expect([e.bet, frac(net.get(e.bet)!, count * BigInt(AMOUNT))]).toEqual([e.bet, e.ev]);
  }
}

describe('engine ↔ math agreement on every ordering', () => {
  const rnd = mulberry32(31);
  const variants = [VARIANT_RULES['punto-banco'], VARIANT_RULES.ez, VARIANT_RULES['super-6']];
  const cases = Array.from({ length: 30 }, (_, i) => {
    const size = i < 3 ? 12 : 6 + Math.floor(rnd() * 4); // 6..9, plus three of 12
    return [i, randomRanks(rnd, size, 2), variants[i % 3]!] as const;
  });
  it.each(cases)('composition %i', (_i, ranks, rules) => check(ranks, rules), 120_000);
});
