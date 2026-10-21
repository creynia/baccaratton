// Pins curriculum.md section 7.2: the exact 72-hand costs the lessons quote, from the same
// progression code auto-play runs (D28 caps, fresh session, bankroll never runs out).
import { describe, expect, it } from 'vitest';
import { randBelow, seedRng } from '../engine/rng';
import { expectedUnitsBet, P_BANKER, P_PLAYER, P_TIE, targetProbabilities } from './costs';
import { betUnits, initMemory, stepMemory } from './presets';
import type { StrategyId, StrategySpec } from './types';

const BANKER_EDGE = 114753351728 / 10847218479825;
const PLAYER_EDGE = 241149546272 / 19524993263685;
const perHour = (units: number, edge: number): string => (10 * units * 72 * edge).toFixed(2);

// [id, banker avg units, banker $/h, player avg units, player $/h] (curriculum.md section 7.2)
const TABLE: [StrategyId, number, string, number, string][] = [
  ['paroli', 1.7129, '13.05', 1.6931, '15.06'],
  ['one-three-two-six', 1.998, '15.22', 1.9693, '17.51'],
  ['fibonacci', 2.4565, '18.71', 2.6983, '23.99'],
  ['martingale', 3.3236, '25.32', 3.5118, '31.23'],
  ['dalembert', 4.5735, '34.84', 5.0061, '44.52'],
];

describe('exact 72-hand system costs (curriculum.md section 7.2)', () => {
  it('the hand probabilities sum to 1', () => {
    expect(P_BANKER + P_PLAYER + P_TIE).toBeCloseTo(1, 14);
  });
  it('flat costs $7.62 (Banker) and $8.89 (Player) per hour at $10', () => {
    expect(perHour(1, BANKER_EDGE)).toBe('7.62');
    expect(perHour(1, PLAYER_EDGE)).toBe('8.89');
    expect(
      expectedUnitsBet({ id: 'flat-banker', unit: 1000 }, 72, targetProbabilities('banker')),
    ).toBe(72);
  });
  it.each(TABLE)('%s: average bet and $/hour on Banker and Player', (id, bu, bh, pu, ph) => {
    const b =
      expectedUnitsBet({ id, unit: 1000, target: 'banker' }, 72, targetProbabilities('banker')) /
      72;
    const p =
      expectedUnitsBet({ id, unit: 1000, target: 'player' }, 72, targetProbabilities('player')) /
      72;
    expect(b.toFixed(4)).toBe(bu.toFixed(4));
    expect(p.toFixed(4)).toBe(pu.toFixed(4));
    expect(perHour(b, BANKER_EDGE)).toBe(bh);
    expect(perHour(p, PLAYER_EDGE)).toBe(ph);
  });
  it('Martingale E[total bet over 72 hands] = 239.30 units (lesson 19 math box)', () => {
    const t = expectedUnitsBet({ id: 'martingale', unit: 1000 }, 72, targetProbabilities('banker'));
    expect(t.toFixed(2)).toBe('239.30');
  });
  it('Labouchère ≈ 12.46 units on Banker (≈ $94.93/h), ≈ simulated', () => {
    const s: StrategySpec = { id: 'labouchere', unit: 1000 };
    const p = targetProbabilities('banker');
    let rng = seedRng(19);
    const N = 40_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      let m = initMemory(s);
      let t = 0;
      for (let h = 0; h < 72; h++) {
        t += betUnits(m, s);
        const [u, r] = randBelow(rng, 1 << 30);
        rng = r;
        const x = u / (1 << 30);
        m = stepMemory(m, s, x < p.win ? 'win' : x < p.win + p.lose ? 'lose' : 'push');
      }
      sum += t / 72;
      sumSq += (t / 72) ** 2;
    }
    const mean = sum / N;
    const se = Math.sqrt((sumSq / N - mean ** 2) / N);
    expect(Math.abs(mean - 12.46)).toBeLessThan(4 * se + 0.005);
  });
});
