import { describe, expect, it } from 'vitest';
import { cardValue, makeCard, parseCards } from './cards';
import { TABLEAU, bankerDraws, handTotal, isNatural, playerDraws } from './tableau';
import type { Card, CardValue, TableauRuleId } from './types';

const V = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const satisfies readonly CardValue[];

/** A card with the given baccarat value (suit and rank are irrelevant to the rules). */
const withValue = (v: CardValue): Card => makeCard(v === 0 ? 9 : ((v - 1) as 0), 0);

describe('handTotal', () => {
  it('is the last digit of the sum for every pair of the 52 cards', () => {
    for (let a = 0; a < 52; a++)
      for (let b = 0; b < 52; b++) {
        expect(handTotal([a, b])).toBe((cardValue(a) + cardValue(b)) % 10);
      }
  });
  it('covers all 10 x 10 two-card total combinations', () => {
    const seen = new Set<string>();
    for (const x of V)
      for (const y of V) {
        const t = handTotal([withValue(x), withValue(y)]);
        expect(t).toBe((x + y) % 10);
        seen.add(`${x},${y}`);
      }
    expect(seen.size).toBe(100);
  });
  it('handles one, three and zero cards, and the lesson examples', () => {
    expect(handTotal([])).toBe(0);
    expect(handTotal(parseCards('7h'))).toBe(7);
    expect(handTotal(parseCards('7h 8d'))).toBe(5);
    expect(handTotal(parseCards('4h 2c 9d'))).toBe(5);
    expect(handTotal(parseCards('Kh Qd Jc'))).toBe(0);
    expect(handTotal(parseCards('9h 9d 9c'))).toBe(7);
  });
});

describe('isNatural', () => {
  it('is true exactly for 8 and 9', () => {
    expect(V.filter((t) => isNatural(t))).toEqual([8, 9]);
  });
});

// ---- An independent oracle: the prose of simulator.md section 1.3 as nested if/else. ----------
interface Oracle {
  draws: boolean;
  rule: TableauRuleId;
}
function oraclePlayer(p: number, b: number): Oracle {
  if (p >= 8 || b >= 8) return { draws: false, rule: 'natural' };
  if (p <= 5) return { draws: true, rule: 'player-0-5-draws' };
  return { draws: false, rule: 'player-6-7-stands' };
}
function oracleBanker(b: number, p2: number, third: number | null): Oracle {
  if (p2 >= 8 || b >= 8) return { draws: false, rule: 'natural' };
  if (third === null) {
    return b <= 5
      ? { draws: true, rule: 'banker-player-stood-0-5-draws' }
      : { draws: false, rule: 'banker-player-stood-6-7-stands' };
  }
  if (b <= 2) return { draws: true, rule: 'banker-0-2-draws' };
  if (b === 3) return { draws: third !== 8, rule: 'banker-3-draws-unless-8' };
  if (b === 4) return { draws: third >= 2 && third <= 7, rule: 'banker-4-draws-on-2-7' };
  if (b === 5) return { draws: third >= 4 && third <= 7, rule: 'banker-5-draws-on-4-7' };
  if (b === 6) return { draws: third === 6 || third === 7, rule: 'banker-6-draws-on-6-7' };
  return { draws: false, rule: 'banker-7-stands' };
}

describe('playerDraws', () => {
  it('matches the oracle on all 10 x 10 (Player total, Banker total) pairs', () => {
    for (const p of V) for (const b of V) expect(playerDraws(p, b)).toEqual(oraclePlayer(p, b));
  });
  it('draws on 0-5, stands on 6-7, and a natural on either side ends the hand', () => {
    expect(V.filter((p) => playerDraws(p, 0).draws)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const p of [6, 7] as const) expect(playerDraws(p, 0).rule).toBe('player-6-7-stands');
    for (const p of V) {
      expect(playerDraws(p, 8)).toEqual({ draws: false, rule: 'natural' });
      expect(playerDraws(p, 9)).toEqual({ draws: false, rule: 'natural' });
    }
    expect(playerDraws(8, 0).rule).toBe('natural');
    expect(playerDraws(9, 3).rule).toBe('natural');
  });
  it('rejects totals outside 0-9', () => {
    expect(() => playerDraws(10 as CardValue, 0)).toThrow(RangeError);
    expect(() => playerDraws(0, -1 as CardValue)).toThrow(RangeError);
  });
});

describe('bankerDraws', () => {
  it('matches the oracle on every consistent (Banker, Player two-card, Player third) state', () => {
    let states = 0;
    for (const b of V)
      for (const p2 of V) {
        const natural = b >= 8 || p2 >= 8;
        const thirds: (CardValue | null)[] = !natural && p2 <= 5 ? [...V] : [null];
        for (const third of thirds) {
          expect(bankerDraws(b, p2, third)).toEqual(oracleBanker(b, p2, third));
          states++;
        }
      }
    // 8 Banker rows x (6 drawing totals x 10 thirds + 2 standing totals) + the natural states
    expect(states).toBeGreaterThan(8 * (6 * 10 + 2));
  });
  it('a natural ends the hand whatever the third card would have been', () => {
    for (const b of [8, 9] as const)
      for (const p2 of V)
        expect(bankerDraws(b, p2, null)).toEqual({ draws: false, rule: 'natural' });
    for (const p2 of [8, 9] as const)
      for (const b of V)
        expect(bankerDraws(b, p2, null)).toEqual({ draws: false, rule: 'natural' });
  });
  it('throws on states that cannot happen', () => {
    expect(() => bankerDraws(3, 4, null)).toThrow(RangeError); // Player 4 must draw
    expect(() => bankerDraws(3, 6, 5)).toThrow(RangeError); // Player 6 stands
    expect(() => bankerDraws(3, 4, 10 as CardValue)).toThrow(RangeError);
  });
});

// curriculum.md section 2.2, as the text a reader sees: Banker total -> third cards it draws on.
const DRAWS_ON: Record<number, readonly number[]> = {
  0: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  3: [0, 1, 2, 3, 4, 5, 6, 7, 9],
  4: [2, 3, 4, 5, 6, 7],
  5: [4, 5, 6, 7],
  6: [6, 7],
  7: [],
};

describe('TABLEAU', () => {
  it('has 8 rows (Banker 0-7) of 11 cells (stood, then Player third 0-9)', () => {
    expect(TABLEAU).toHaveLength(8);
    for (const row of TABLEAU) expect(row).toHaveLength(11);
  });
  it("equals curriculum.md's chart on all 88 cells", () => {
    for (let b = 0; b <= 7; b++) {
      const row = TABLEAU[b]!;
      for (const p of V)
        expect(row[1 + p], `Banker ${b}, Player third ${p}`).toBe(DRAWS_ON[b]!.includes(p));
      expect(row[0], `Banker ${b}, Player stood`).toBe(b <= 5);
    }
  });
  it('equals bankerDraws on all 88 cells', () => {
    for (let b = 0; b <= 7; b++) {
      const bt = b as CardValue;
      // Player stood: a 6 or 7 on two cards.
      expect(bankerDraws(bt, 6, null).draws).toBe(TABLEAU[b]![0]);
      expect(bankerDraws(bt, 7, null).draws).toBe(TABLEAU[b]![0]);
      for (const p of V) expect(bankerDraws(bt, 3, p).draws).toBe(TABLEAU[b]![1 + p]);
    }
  });
  it('has the sliding window the lesson teaches: the top end is always 7', () => {
    for (const b of [4, 5, 6]) {
      const draws = DRAWS_ON[b]!;
      expect(Math.max(...draws)).toBe(7);
      expect(Math.min(...draws)).toBe((b - 4) * 2 + 2);
    }
  });
});
