// Independent reference for the math tests (simulator.md section 7.2). It enumerates card by card
// over the 13 rank counts, by recursion, in bigint throughout, with the drawing rules restated from
// the prose of section 1.3. It shares no code with distribution.ts or the engine.

/** Baccarat value of a rank (0 = ace ... 12 = king). */
const rankValue = (r: number): number => (r >= 9 ? 0 : r + 1);

/** Player rule: given the two-card totals, does the Player take a third card? */
function playerTakes(p: number, b: number): boolean {
  if (p === 8 || p === 9 || b === 8 || b === 9) return false;
  return p <= 5;
}

/** Banker rule. `third` is the Player's third-card value, or null when the Player stood. */
function bankerTakes(b: number, p: number, third: number | null): boolean {
  if (p === 8 || p === 9 || b === 8 || b === 9) return false;
  if (third === null) return b <= 5;
  switch (b) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return third !== 8;
    case 4:
      return [2, 3, 4, 5, 6, 7].includes(third);
    case 5:
      return [4, 5, 6, 7].includes(third);
    case 6:
      return third === 6 || third === 7;
    default:
      return false;
  }
}

export interface RefCell {
  pt: number;
  bt: number;
  pn: number;
  bn: number;
}
/** Key 'pt,bt,pn,bn' → number of ordered six-card sequences. */
export type RefHistogram = Map<string, bigint>;

/** Number of ordered six-card sequences per outcome (cards left by rank, 13 entries). */
export function referenceHistogram(ranks: readonly number[]): RefHistogram {
  const counts = ranks.map((x) => BigInt(x));
  const n = counts.reduce((a, b) => a + b, 0n);
  const out: RefHistogram = new Map();
  const dealt: number[] = []; // values in deal order

  const finish = (weight: bigint, used: number, cell: RefCell): void => {
    // The unused positions of the six: any of the remaining cards, in order.
    let w = weight;
    for (let k = used; k < 6; k++) w *= n - BigInt(k);
    const key = `${cell.pt},${cell.bt},${cell.pn},${cell.bn}`;
    out.set(key, (out.get(key) ?? 0n) + w);
  };

  // Called after each card; decides what happens next from the cards dealt so far.
  const step = (weight: bigint): void => {
    const k = dealt.length;
    if (k < 4) {
      draw(weight);
      return;
    }
    const p2 = (dealt[0]! + dealt[2]!) % 10;
    const b2 = (dealt[1]! + dealt[3]!) % 10;
    const pDrew = playerTakes(p2, b2);
    if (k === 4) {
      if (pDrew) {
        draw(weight);
        return;
      }
      if (bankerTakes(b2, p2, null)) {
        draw(weight);
        return;
      }
      finish(weight, 4, { pt: p2, bt: b2, pn: 2, bn: 2 });
      return;
    }
    if (k === 5) {
      if (pDrew) {
        const third = dealt[4]!;
        const pt = (p2 + third) % 10;
        if (bankerTakes(b2, p2, third)) {
          draw(weight);
          return;
        }
        finish(weight, 5, { pt, bt: b2, pn: 3, bn: 2 });
        return;
      }
      finish(weight, 5, { pt: p2, bt: (b2 + dealt[4]!) % 10, pn: 2, bn: 3 });
      return;
    }
    // k === 6: both drew.
    finish(weight, 6, {
      pt: (p2 + dealt[4]!) % 10,
      bt: (b2 + dealt[5]!) % 10,
      pn: 3,
      bn: 3,
    });
  };

  const draw = (weight: bigint): void => {
    for (let r = 0; r < 13; r++) {
      const left = counts[r]!;
      if (left === 0n) continue;
      counts[r] = left - 1n;
      dealt.push(rankValue(r));
      step(weight * left);
      dealt.pop();
      counts[r] = left;
    }
  };

  draw(1n);
  return out;
}

/** P(pair) numerator over two-card starts, by brute force over ordered rank pairs. */
export function referencePairs(ranks: readonly number[]): { count: bigint; outOf: bigint } {
  let count = 0n;
  let outOf = 0n;
  for (let a = 0; a < 13; a++) {
    for (let b = 0; b < 13; b++) {
      const ways =
        a === b ? BigInt(ranks[a]!) * BigInt(ranks[a]! - 1) : BigInt(ranks[a]!) * BigInt(ranks[b]!);
      outOf += ways;
      if (a === b) count += ways;
    }
  }
  return { count, outOf };
}

/** Seeded PRNG for tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random depleted composition with exactly `size` cards (each rank at most decks × 4). */
export function randomRanks(rnd: () => number, size: number, decks = 8): number[] {
  const ranks = new Array<number>(13).fill(0);
  let left = size;
  while (left > 0) {
    const r = Math.floor(rnd() * 13);
    if (ranks[r]! < decks * 4) {
      ranks[r]!++;
      left--;
    }
  }
  return ranks;
}
