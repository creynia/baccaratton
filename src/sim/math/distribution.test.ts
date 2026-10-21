import { describe, expect, it } from 'vitest';
import {
  cellAt,
  cellIndex,
  fullShoeRanks,
  histogramBig,
  histogramNumber,
  outcomeDistribution,
  outcomeDistributionBig,
  valueCounts,
} from './distribution';
import { frac } from './fraction';
import { mulberry32, randomRanks, referenceHistogram, referencePairs } from './__tests__/reference';
import type { OutcomeDistribution } from './types';

function asMap(d: OutcomeDistribution): Map<string, bigint> {
  return new Map(
    d.cells.map((c) => [
      `${c.playerTotal},${c.bankerTotal},${c.playerCards},${c.bankerCards}`,
      c.weight,
    ]),
  );
}

describe('outcomeDistribution', () => {
  it('full 8-deck shoe: 205 cells, total N(N-1)...(N-5), pinned hand counts', () => {
    const d = outcomeDistribution(fullShoeRanks(8));
    expect(d.cardsLeft).toBe(416);
    expect(d.total).toBe(4_998_398_275_503_360n);
    expect(d.cells.length).toBe(205);
    expect(d.cells.reduce((a, c) => a + c.weight, 0n)).toBe(d.total);
    let pw = 0n;
    let bw = 0n;
    let tie = 0n;
    for (const c of d.cells) {
      if (c.playerTotal > c.bankerTotal) pw += c.weight;
      else if (c.playerTotal < c.bankerTotal) bw += c.weight;
      else tie += c.weight;
    }
    expect(pw).toBe(2_230_518_282_592_256n);
    expect(bw).toBe(2_292_252_566_437_888n);
    expect(tie).toBe(475_627_426_473_216n);
    expect(frac(pw, d.total)).toEqual(frac(8712962041376n, 19524993263685n));
    expect(d.pPair).toEqual(frac(31n, 415n));
    expect(d.pairCount).toBe(13n * 32n * 31n);
    expect(d.pairOutOf).toBe(416n * 415n);
  });

  it('pinned tableau facts', () => {
    const d = outcomeDistribution(fullShoeRanks(8));
    const p = (f: (c: OutcomeDistribution['cells'][number]) => boolean) =>
      frac(
        d.cells.filter(f).reduce((a, c) => a + c.weight, 0n),
        d.total,
      );
    const natural = (c: OutcomeDistribution['cells'][number]) =>
      c.playerCards === 2 && c.bankerCards === 2 && (c.playerTotal >= 8 || c.bankerTotal >= 8);
    expect(p(natural)).toEqual(frac(158222458n, 461223945n));
    expect(p((c) => c.playerCards === 3)).toEqual(frac(15479099n, 30748263n));
    expect(p((c) => c.bankerCards === 3)).toEqual(frac(4136876519n, 9501213267n));
    expect(p((c) => c.bankerTotal === 7 && c.bankerCards === 3 && c.playerTotal < 7)).toEqual(
      frac(19129247848n, 848912750595n),
    );
    expect(p((c) => c.bankerTotal === 6 && c.playerTotal < 6)).toEqual(
      frac(210337737856n, 3904998652737n),
    );
    const cards = d.cells.reduce(
      (a, c) => a + c.weight * BigInt(c.playerCards + c.bankerCards),
      0n,
    );
    expect(frac(cards, d.total)).toEqual(frac(46924771178n, 9501213267n));
  });

  it('matches the independent reference for 1, 6 and 8 decks', () => {
    for (const decks of [1, 6, 8]) {
      const ranks = fullShoeRanks(decks);
      expect(asMap(outcomeDistribution(ranks))).toEqual(referenceHistogram(ranks));
      const pairs = referencePairs(ranks);
      const d = outcomeDistribution(ranks);
      expect(d.pairCount).toBe(pairs.count);
      expect(d.pairOutOf).toBe(pairs.outOf);
    }
  }, 120_000);

  it('matches the reference on 50 random depleted compositions (sizes 6..416)', () => {
    const rnd = mulberry32(2024);
    for (let i = 0; i < 50; i++) {
      const size = i < 5 ? 6 + i : 6 + Math.floor(rnd() * 411);
      const ranks = randomRanks(rnd, size);
      const d = outcomeDistribution(ranks);
      expect(d.cells.reduce((a, c) => a + c.weight, 0n)).toBe(d.total);
      expect(asMap(d)).toEqual(referenceHistogram(ranks));
    }
  }, 300_000);

  it('Number path equals the bigint path on 200 compositions', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const ranks = randomRanks(rnd, 6 + Math.floor(rnd() * 411));
      const v = valueCounts(ranks);
      expect(Array.from(histogramNumber(v), (x) => BigInt(x))).toEqual(histogramBig(v));
    }
    expect(outcomeDistribution(fullShoeRanks(8))).toEqual(outcomeDistributionBig(fullShoeRanks(8)));
  }, 120_000);

  it('guards: 13 entries, 6 <= N <= 416 (the 2^53 bound)', () => {
    expect(() => outcomeDistribution(new Array(13).fill(33))).toThrow(/2\^53/);
    expect(() => outcomeDistribution([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/needs 6/);
    expect(() => outcomeDistribution([1, 2])).toThrow(/13 entries/);
    expect(() => outcomeDistribution([...new Array(12).fill(1), -1])).toThrow();
    expect(() => outcomeDistribution([...new Array(12).fill(1), 0.5])).toThrow();
  });

  it('memoises by composition', () => {
    const a = outcomeDistribution(fullShoeRanks(6));
    expect(outcomeDistribution(fullShoeRanks(6))).toBe(a);
  });

  it('cellIndex and cellAt are inverse', () => {
    for (let i = 0; i < 400; i++) {
      const c = cellAt(i);
      expect(cellIndex(c.playerTotal, c.bankerTotal, c.playerCards, c.bankerCards)).toBe(i);
    }
  });
});
