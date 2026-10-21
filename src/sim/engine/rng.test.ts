import { describe, expect, it } from 'vitest';
import { nextU32, randBelow, seedRng, shuffle } from './rng';

describe('rng (verbatim from holdumb)', () => {
  it('is deterministic and does not mutate state', () => {
    const r = seedRng(42);
    const frozen = JSON.stringify(r);
    expect(nextU32(r)[0]).toBe(nextU32(r)[0]);
    expect(JSON.stringify(r)).toBe(frozen);
  });
  it("holdumb's golden sequence for seed 42", () => {
    let r = seedRng(42);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [u, n] = nextU32(r);
      out.push(u);
      r = n;
    }
    expect(out).toEqual([660444221, 3652823732, 77672526, 910233633]);
  });
  it('randBelow stays in range and rejects bad n', () => {
    let r = seedRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [x, n] = randBelow(r, 52);
      r = n;
      seen.add(x);
    }
    expect(seen.size).toBe(52);
    expect([...seen].every((x) => x >= 0 && x < 52)).toBe(true);
    expect(() => randBelow(r, 0)).toThrow();
    expect(randBelow(r, 1)[0]).toBe(0);
  });
  it('shuffle of 416 cards: a permutation, exactly 415 randBelow calls, input untouched', () => {
    const xs = Array.from({ length: 416 }, (_, i) => i % 52);
    const [ys, after] = shuffle(seedRng(9), xs);
    expect([...ys].sort((a, b) => a - b)).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[1]).toBe(1);
    let q = seedRng(9);
    for (let i = 415; i > 0; i--) q = randBelow(q, i + 1)[1];
    expect(after).toEqual(q);
  });
  it('chi-square: card ids are uniform at the first, middle and last shoe positions', () => {
    const N = 6000;
    const deck = Array.from({ length: 416 }, (_, i) => i % 52);
    const counts = [0, 207, 415].map(() => new Array<number>(52).fill(0));
    let r = seedRng(2024);
    for (let i = 0; i < N; i++) {
      const [ys, n] = shuffle(r, deck);
      r = n;
      [0, 207, 415].forEach((p, k) => counts[k]![ys[p]!]!++);
    }
    for (const c of counts) {
      const e = N / 52;
      const chi = c.reduce((s, o) => s + (o - e) ** 2 / e, 0);
      expect(chi).toBeLessThan(87.97); // 51 d.o.f., p = 0.001
    }
  }, 30_000);
});
