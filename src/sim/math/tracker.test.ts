import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import type { TableRules, VisibleView } from '../engine/types';
import { fullShoeRanks } from './distribution';
import { fullShoeEvs } from './edges';
import { frac, sub } from './fraction';
import { shoeTracker } from './tracker';

function view(rules: TableRules, unseenRanks: number[], nextHandNewShoe = false): VisibleView {
  return {
    rules,
    bankroll: 100_000,
    bets: {},
    lastBets: {},
    history: [],
    lastResult: null,
    unseenRanks,
    shoeNo: 1,
    handInShoe: 3,
    nextHandNewShoe,
  };
}

describe('shoeTracker (D6)', () => {
  it('a fresh shoe equals the full-shoe values', () => {
    const t = shoeTracker(
      view(VARIANT_RULES.ez, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], true),
    );
    expect(t.nextHandNewShoe).toBe(true);
    expect(t.cardsLeft).toBe(416);
    expect(t.unseenByValue).toEqual([128, 32, 32, 32, 32, 32, 32, 32, 32, 32]);
    expect(t.rows.map((r) => r.bet)).toEqual(fullShoeEvs(VARIANT_RULES.ez).map((e) => e.bet));
    for (const r of t.rows) {
      expect(r.ev).toEqual(r.fullShoeEv);
      expect(r.delta.num).toBe(0n);
      expect(r.positive).toBe(false);
    }
  });

  it('a depleted shoe: delta = ev − full, positive when the shoe favours the bet', () => {
    const ranks = new Array<number>(13).fill(0);
    ranks[8] = 6; // six nines: every hand is a natural 8-8 tie
    const t = shoeTracker(view(VARIANT_RULES['punto-banco'], ranks));
    expect(t.cardsLeft).toBe(6);
    expect(t.unseenByValue[9]).toBe(6);
    const tie = t.rows.find((r) => r.bet === 'tie')!;
    expect(tie.ev).toEqual({ num: 8n, den: 1n });
    expect(tie.positive).toBe(true);
    expect(t.rows.find((r) => r.bet === 'player-pair')!.ev).toEqual({ num: 11n, den: 1n });
    for (const r of t.rows) expect(r.delta).toEqual(sub(r.ev, r.fullShoeEv));
    expect(t.rows.find((r) => r.bet === 'banker')!.positive).toBe(false);
  });

  it('removing all fours or all fives: exact Banker EVs from the Python oracle', () => {
    const banker = (rank: number) => {
      const ranks = fullShoeRanks(8);
      ranks[rank] = 0;
      return shoeTracker(view(VARIANT_RULES['punto-banco'], ranks)).rows.find(
        (r) => r.bet === 'banker',
      )!;
    };
    const no4 = banker(3);
    expect(no4.ev).toEqual(frac(-111435737744n, 15052588566975n));
    expect(no4.delta.num > 0n).toBe(true); // fours favour the Player
    const no5 = banker(4);
    expect(no5.ev).toEqual(frac(-188767945306n, 15052588566975n));
    expect(no5.delta.num < 0n).toBe(true);
  });
});
