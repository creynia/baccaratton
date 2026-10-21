// The tableau enumeration (simulator.md section 2.3): every ordered sequence of the next six unseen
// cards, grouped into 400 outcome cells (playerTotal x bankerTotal x playerCards x bankerCards).
// Two paths: plain `number` (exact: every weight and partial sum stays below 2^53 for N <= 416)
// and `bigint` (tests only; must give the identical histogram).
import { frac } from './fraction';
import type { OutcomeCell, OutcomeDistribution } from './types';
import type { CardValue } from '../engine/types';

/** 416 = 8 decks: 416 x 415 x ... x 411 < 2^53, the exactness bound of the Number path. */
export const MAX_CARDS = 416;
/** A hand needs at most six cards (D36: a setup may leave as few as six). */
export const MIN_CARDS = 6;
export const CELL_COUNT = 400;

/**
 * BANKER_DRAWS[b * 11 + p + 1]: does the Banker (two-card total b, 0..7, no natural) draw when the
 * Player's third card is p (0..9), or p = -1 when the Player stood. Built from the rule prose of
 * simulator.md section 1.3 (the engine's TABLEAU is checked against it in tests).
 */
const BANKER_DRAWS: boolean[] = [];
for (let b = 0; b < 10; b++) {
  for (let p = -1; p < 10; p++) {
    let d: boolean;
    if (p < 0) d = b <= 5;
    else if (b <= 2) d = true;
    else if (b === 3) d = p !== 8;
    else if (b === 4) d = p >= 2 && p <= 7;
    else if (b === 5) d = p >= 4 && p <= 7;
    else if (b === 6) d = p === 6 || p === 7;
    else d = false;
    BANKER_DRAWS[b * 11 + p + 1] = d;
  }
}

/** Index of a cell in the 400-cell histogram. */
export function cellIndex(pt: number, bt: number, pn: 2 | 3, bn: 2 | 3): number {
  return ((pt * 10 + bt) * 2 + (pn - 2)) * 2 + (bn - 2);
}
/** Inverse of `cellIndex`. */
export function cellAt(i: number): Omit<OutcomeCell, 'weight'> {
  return {
    playerTotal: Math.floor(i / 40) as CardValue,
    bankerTotal: (Math.floor(i / 4) % 10) as CardValue,
    playerCards: (2 + (Math.floor(i / 2) % 2)) as 2 | 3,
    bankerCards: (2 + (i % 2)) as 2 | 3,
  };
}

/** Unseen counts by value class (10 entries, class 0 = T/J/Q/K) from counts by rank (13). */
export function valueCounts(unseenRanks: readonly number[]): number[] {
  const c = new Array<number>(10).fill(0);
  unseenRanks.forEach((n, r) => {
    const v = r >= 9 ? 0 : r + 1;
    c[v] = c[v]! + n;
  });
  return c;
}

function checkRanks(unseenRanks: readonly number[]): number {
  if (unseenRanks.length !== 13) {
    throw new RangeError(`unseenRanks needs 13 entries, got ${unseenRanks.length}`);
  }
  let n = 0;
  for (const x of unseenRanks) {
    if (!Number.isInteger(x) || x < 0) throw new RangeError(`Bad unseen count ${x}`);
    n += x;
  }
  if (n > MAX_CARDS) {
    throw new RangeError(`${n} unseen cards: the exact Number path needs N <= ${MAX_CARDS} (2^53)`);
  }
  if (n < MIN_CARDS) throw new RangeError(`${n} unseen cards: a hand needs ${MIN_CARDS}`);
  return n;
}

/** The 400-cell histogram in plain numbers (exact for N <= 416). */
export function histogramNumber(values: readonly number[]): Float64Array {
  const c = Float64Array.from(values);
  let n = 0;
  for (const x of c) n += x;
  const h = new Float64Array(CELL_COUNT);
  const pad4 = (n - 4) * (n - 5);
  const pad5 = n - 5;
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = c[p1]!;
    if (!w1) continue;
    c[p1] = w1 - 1;
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = c[b1]!;
      if (!w2) continue;
      c[b1] = w2 - 1;
      const w12 = w1 * w2;
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = c[p2]!;
        if (!w3) continue;
        c[p2] = w3 - 1;
        const pt = (p1 + p2) % 10;
        const w123 = w12 * w3;
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = c[b2]!;
          if (!w4) continue;
          c[b2] = w4 - 1;
          const W4 = w123 * w4;
          const bt = (b1 + b2) % 10;
          const base = pt * 40 + bt * 4; // cellIndex(pt, bt, 2, 2)
          if (pt >= 8 || bt >= 8 || (pt >= 6 && bt >= 6)) {
            {
              const k = base;
              h[k] = h[k]! + W4 * pad4;
            }
          } else if (pt >= 6) {
            // Player stands on 6-7; the Banker (0-5) draws.
            const W = W4 * pad5;
            for (let b3 = 0; b3 < 10; b3++) {
              const w6 = c[b3]!;
              if (w6) {
                const k = pt * 40 + ((bt + b3) % 10) * 4 + 1;
                h[k] = h[k]! + W * w6;
              }
            }
          } else {
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = c[p3]!;
              if (!w5) continue;
              c[p3] = w5 - 1;
              const pt3 = (pt + p3) % 10;
              const W5 = W4 * w5;
              if (BANKER_DRAWS[bt * 11 + p3 + 1]) {
                for (let b3 = 0; b3 < 10; b3++) {
                  const w6 = c[b3]!;
                  if (w6) {
                    const k = pt3 * 40 + ((bt + b3) % 10) * 4 + 3;
                    h[k] = h[k]! + W5 * w6;
                  }
                }
              } else {
                {
                  const k = pt3 * 40 + bt * 4 + 2;
                  h[k] = h[k]! + W5 * pad5;
                }
              }
              c[p3] = w5;
            }
          }
          c[b2] = w4;
        }
        c[p2] = w3;
      }
      c[b1] = w2;
    }
    c[p1] = w1;
  }
  return h;
}

/** The same enumeration in bigint (tests: must equal `histogramNumber` exactly). */
export function histogramBig(values: readonly number[]): bigint[] {
  const c = values.map(BigInt);
  let n = 0n;
  for (const x of c) n += x;
  const h = new Array<bigint>(CELL_COUNT).fill(0n);
  const pad4 = (n - 4n) * (n - 5n);
  const pad5 = n - 5n;
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = c[p1]!;
    if (!w1) continue;
    c[p1] = w1 - 1n;
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = c[b1]!;
      if (!w2) continue;
      c[b1] = w2 - 1n;
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = c[p2]!;
        if (!w3) continue;
        c[p2] = w3 - 1n;
        const pt = (p1 + p2) % 10;
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = c[b2]!;
          if (!w4) continue;
          c[b2] = w4 - 1n;
          const W4 = w1 * w2 * w3 * w4;
          const bt = (b1 + b2) % 10;
          if (pt >= 8 || bt >= 8 || (pt >= 6 && bt >= 6)) {
            h[cellIndex(pt, bt, 2, 2)]! += W4 * pad4;
          } else if (pt >= 6) {
            for (let b3 = 0; b3 < 10; b3++) {
              const w6 = c[b3]!;
              if (w6) h[cellIndex(pt, (bt + b3) % 10, 2, 3)]! += W4 * w6 * pad5;
            }
          } else {
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = c[p3]!;
              if (!w5) continue;
              c[p3] = w5 - 1n;
              const pt3 = (pt + p3) % 10;
              const W5 = W4 * w5;
              if (BANKER_DRAWS[bt * 11 + p3 + 1]) {
                for (let b3 = 0; b3 < 10; b3++) {
                  const w6 = c[b3]!;
                  if (w6) h[cellIndex(pt3, (bt + b3) % 10, 3, 3)]! += W5 * w6;
                }
              } else {
                h[cellIndex(pt3, bt, 3, 2)]! += W5 * pad5;
              }
              c[p3] = w5;
            }
          }
          c[b2] = w4;
        }
        c[p2] = w3;
      }
      c[b1] = w2;
    }
    c[p1] = w1;
  }
  return h;
}

function build(
  unseenRanks: readonly number[],
  n: number,
  weights: readonly bigint[],
): OutcomeDistribution {
  let total = 1n;
  for (let i = 0n; i < 6n; i++) total *= BigInt(n) - i;
  const cells: OutcomeCell[] = [];
  weights.forEach((weight, i) => {
    if (weight !== 0n) cells.push({ ...cellAt(i), weight });
  });
  let pairCount = 0n;
  for (const r of unseenRanks) pairCount += BigInt(r) * BigInt(r - 1);
  const pairOutOf = BigInt(n) * BigInt(n - 1);
  return {
    cardsLeft: n,
    total,
    cells,
    pPair: frac(pairCount, pairOutOf),
    pairCount,
    pairOutOf,
  };
}

/** The bigint path end to end (tests and the 2^53 cross-check; never used at runtime). */
export function outcomeDistributionBig(unseenRanks: readonly number[]): OutcomeDistribution {
  const n = checkRanks(unseenRanks);
  return build(unseenRanks, n, histogramBig(valueCounts(unseenRanks)));
}

const MEMO_LIMIT = 64;
const memo = new Map<string, OutcomeDistribution>();

/** The tableau enumeration over unseen cards by rank (13 entries). Memoised by key. */
export function outcomeDistribution(unseenRanks: readonly number[]): OutcomeDistribution {
  const key = unseenRanks.join(',');
  const hit = memo.get(key);
  if (hit) {
    memo.delete(key);
    memo.set(key, hit); // most recently used last
    return hit;
  }
  const n = checkRanks(unseenRanks);
  const h = histogramNumber(valueCounts(unseenRanks));
  const dist = build(
    unseenRanks,
    n,
    Array.from(h, (x) => BigInt(x)),
  );
  memo.set(key, dist);
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value!);
  return dist;
}

/** The full shoe of `decks` decks by rank: decks x 4 of each of the 13 ranks. */
export function fullShoeRanks(decks: number): number[] {
  return new Array<number>(13).fill(decks * 4);
}
