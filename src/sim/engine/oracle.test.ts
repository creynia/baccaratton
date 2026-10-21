import { describe, expect, it } from 'vitest';
import { makeCard } from './cards';
import { bankerDraws, playHand } from './tableau';
import { oraclePlay } from './__tests__/oracle';
import type { Card, CardValue, Rank } from './types';

/** A card of baccarat value v; `alt` picks a different rank of value 0 (T, J, Q, K) or a suit. */
const card = (v: number, alt = 0): Card =>
  v === 0 ? makeCard((9 + (alt % 4)) as Rank, 0) : makeCard((v - 1) as Rank, (alt % 4) as 0);

describe('tableau oracle (section 7.1): every deal class', () => {
  it('playHand equals the if/else oracle on all 10^6 value sequences of six cards', () => {
    const vals = [0, 0, 0, 0, 0, 0];
    let checked = 0;
    const classes = new Set<string>();
    for (let code = 0; code < 1_000_000; code++) {
      let x = code;
      for (let i = 5; i >= 0; i--) {
        vals[i] = x % 10;
        x = Math.floor(x / 10);
      }
      const o = oraclePlay(vals);
      let i = 0;
      const h = playHand(() => card(vals[i]!, i++));
      if (
        i !== o.used ||
        h.player.total !== o.playerTotal ||
        h.banker.total !== o.bankerTotal ||
        h.winner !== o.winner ||
        h.playerRule.rule !== o.playerRule ||
        h.bankerRule.rule !== o.bankerRule ||
        h.playerRule.draws !== o.playerDraws ||
        h.bankerRule.draws !== o.bankerDraws ||
        h.natural !== o.natural ||
        h.player.cards.length !== o.player.length ||
        h.banker.cards.length !== o.banker.length
      )
        expect({ vals, h, o }).toBe('equal'); // fails with the full context
      // The sequences that use fewer than 6 cards repeat; count distinct deal classes.
      classes.add(vals.slice(0, o.used).join(''));
      checked++;
    }
    expect(checked).toBe(1_000_000);
    // 10^4 two-card starts; distinct classes = every reachable (4, 5 or 6)-card sequence.
    expect(classes.size).toBeGreaterThan(10_000);
  }, 60_000);
  it('outcome fields: card counts, totals, pairs (same rank, not same value)', () => {
    let i = 0;
    const seq = [makeCard(12, 0), makeCard(3, 0), makeCard(12, 1), makeCard(3, 1), makeCard(11, 2)];
    const h = playHand(() => seq[i++]!);
    // P K K (0) vs B 4 4 (8): a Banker natural, so the Player does not draw.
    expect(i).toBe(4);
    expect(h.outcome).toEqual({
      playerTotal: 0,
      bankerTotal: 8,
      playerCards: 2,
      bankerCards: 2,
      playerPair: true,
      bankerPair: true,
    });
    i = 0;
    const kq = [12, 0, 11, 1, 9, 4].map((r) => makeCard(r as Rank, 0));
    const h2 = playHand(() => kq[i++]!);
    expect(h2.outcome.playerPair).toBe(false); // K-Q is not a pair
    expect(h2.player.cards).toHaveLength(3);
  });
  it('bankerDraws equals the oracle on all 8 x 11 TABLEAU cells', () => {
    for (let b = 0; b <= 7; b++) {
      // Player stood (6), and each Player third card value after a Player 0 two-card total.
      const stood = oraclePlay([6, b, 0, 0, 0, 0]);
      expect(bankerDraws(b as CardValue, 6, null).draws).toBe(stood.bankerDraws);
      for (let p = 0; p <= 9; p++) {
        const o = oraclePlay([0, b, 0, 0, p, 0]);
        expect(bankerDraws(b as CardValue, 0, p as CardValue)).toEqual({
          draws: o.bankerDraws,
          rule: o.bankerRule,
        });
      }
    }
  });
});
