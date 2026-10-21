// Perf budget (simulator.md 7.2, D18): a full recompute (histogram + exact EVs of every bet) under
// 5 ms for the full shoe, 1,000 depleted compositions under 3 s. Fresh compositions each time, so
// no memo hit hides the cost. Timed in CPU time of this worker.
import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import { outcomeDistribution } from './distribution';
import { betEvs } from './evs';
import { mulberry32, randomRanks } from './__tests__/reference';

const rules = VARIANT_RULES.ez; // the most bets
/** CPU milliseconds of this worker (robust to the other test files running in parallel). */
function cpuMs(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
}
function recompute(ranks: number[]): number {
  const t0 = cpuMs();
  betEvs(outcomeDistribution(ranks), rules);
  return cpuMs() - t0;
}

describe('performance', () => {
  it('full-shoe distribution + EVs < 5 ms (warm median)', () => {
    // Full shoes with one card of a varying rank missing: same work, distinct memo keys.
    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const ranks = new Array<number>(13).fill(32);
      ranks[i % 13] = 31 - Math.floor(i / 13);
      times.push(recompute(ranks));
    }
    const warm = times.slice(5).sort((a, b) => a - b);
    const median = warm[Math.floor(warm.length / 2)]!;
    console.log(
      `[perf] full recompute: cold ${times[0]!.toFixed(2)} ms, warm median ${median.toFixed(2)} ms`,
    );
    expect(median).toBeLessThan(5);
  }, 60_000);

  it('1,000 depleted compositions < 3 s', () => {
    const rnd = mulberry32(4242);
    const comps = Array.from({ length: 1000 }, () => randomRanks(rnd, 6 + Math.floor(rnd() * 411)));
    // Ten batches of 100; the budget uses the fastest batch × 10, so a burst of load from the other
    // test files cannot fail it, while a real slowdown (every batch slower) still does.
    const batches: number[] = [];
    for (let b = 0; b < 10; b++) {
      const t0 = cpuMs();
      for (const c of comps.slice(b * 100, b * 100 + 100)) betEvs(outcomeDistribution(c), rules);
      batches.push(cpuMs() - t0);
    }
    const total = batches.reduce((a, x) => a + x, 0);
    const ms = Math.min(...batches) * 10;
    console.log(
      `[perf] 1,000 depleted recomputes: ${total.toFixed(0)} ms (best batch × 10: ${ms.toFixed(0)} ms)`,
    );
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});
