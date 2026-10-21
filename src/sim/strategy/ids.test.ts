import { describe, expect, it } from 'vitest';
import { DRILL_MODES, STRATEGY_IDS, STRATEGY_LENSES } from './ids';

describe('strategy ids (decisions.md D13)', () => {
  it('lists the ten betting systems plus the side-bet sprinkler, all distinct', () => {
    expect(STRATEGY_IDS).toHaveLength(11);
    expect(new Set(STRATEGY_IDS).size).toBe(11);
    expect(STRATEGY_IDS).toContain('martingale');
    expect(STRATEGY_IDS).toContain('follow-the-shoe');
  });
  it('has three lenses and the drill modes', () => {
    expect(STRATEGY_LENSES).toHaveLength(3);
    expect([...DRILL_MODES]).toEqual(['player', 'banker', 'winner', 'payout', 'mixed']);
  });
});
