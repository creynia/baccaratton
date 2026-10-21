import { describe, expect, it } from 'vitest';
import { DRILL_MODES, STRATEGY_IDS, STRATEGY_LENSES } from './ids';
import { DRILL_CATEGORY_IDS, DRILL_MODE_CATEGORIES } from './types';

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

  it('has the 14 drill categories, grouped by mode per D29', () => {
    expect(DRILL_CATEGORY_IDS).toHaveLength(14);
    expect(new Set(DRILL_CATEGORY_IDS).size).toBe(14);
    const grouped = Object.values(DRILL_MODE_CATEGORIES).flat();
    expect(new Set(grouped).size).toBe(grouped.length); // no category in two modes
    expect(DRILL_CATEGORY_IDS.filter((c) => !grouped.includes(c))).toEqual([
      'hand-total',
      'which-bet',
    ]); // mixed only
    expect(DRILL_MODE_CATEGORIES.banker.every((c) => c.startsWith('banker-'))).toBe(true);
    expect(DRILL_CATEGORY_IDS.filter((c) => c.startsWith('banker-'))).toEqual([
      ...DRILL_MODE_CATEGORIES.banker,
    ]);
    expect(Object.keys(DRILL_MODE_CATEGORIES)).toEqual(DRILL_MODES.filter((m) => m !== 'mixed'));
  });
});
