import { describe, expect, it } from 'vitest';
import { betsOffered } from './bets';
import { BET_IDS_BY_VARIANT, BET_OFFERED_IN, RULE_PRESET_IDS } from './ids';
import { DEFAULT_RULES, VARIANT_RULES } from './rules';
import { BET_IDS, VARIANT_IDS } from './types';

describe('id lists (decisions.md D13)', () => {
  it('has the nine bet ids in display order and the three variants', () => {
    expect([...BET_IDS]).toEqual([
      'player',
      'tie',
      'banker',
      'player-pair',
      'banker-pair',
      'dragon-bonus-player',
      'dragon-bonus-banker',
      'panda-8',
      'dragon-7',
    ]);
    expect([...VARIANT_IDS]).toEqual(['punto-banco', 'ez', 'super-6']);
    expect([...RULE_PRESET_IDS]).toEqual([...VARIANT_IDS]);
    expect(new Set(BET_IDS).size).toBe(BET_IDS.length);
  });
  it('dragon-7 and panda-8 are offered in ez only; every other bet everywhere', () => {
    for (const v of VARIANT_IDS) {
      const offered = betsOffered(VARIANT_RULES[v]);
      expect(offered).toEqual(BET_IDS_BY_VARIANT[v]);
      expect(offered).toEqual(BET_IDS.filter((b) => BET_OFFERED_IN[b].includes(v)));
      for (const id of BET_IDS) {
        const ezOnly = id === 'dragon-7' || id === 'panda-8';
        expect(offered.includes(id)).toBe(ezOnly ? v === 'ez' : true);
      }
    }
    expect(betsOffered(VARIANT_RULES.ez)).toHaveLength(9);
    expect(betsOffered(VARIANT_RULES['punto-banco'])).toHaveLength(7);
    expect(betsOffered(VARIANT_RULES['super-6'])).toHaveLength(7);
    expect(betsOffered({ ...DEFAULT_RULES, tiePays: 9 })).toEqual(betsOffered(DEFAULT_RULES));
  });
  it('returns a fresh array and rejects an unknown variant', () => {
    const a = betsOffered(DEFAULT_RULES);
    a.pop();
    expect(betsOffered(DEFAULT_RULES)).toHaveLength(7);
    expect(() => betsOffered({ ...DEFAULT_RULES, variant: 'mini' as never })).toThrow(/variant/);
  });
  it('keeps the offered bets in display order', () => {
    for (const v of VARIANT_IDS) {
      const idx = betsOffered(VARIANT_RULES[v]).map((b) => BET_IDS.indexOf(b));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });
});

describe('rules data (decisions.md D2, D8, D16)', () => {
  it('defaults: 8 decks, Tie 8:1, 5% commission, cut card 16 from the end', () => {
    expect(DEFAULT_RULES).toMatchObject({
      variant: 'punto-banco',
      decks: 8,
      tiePays: 8,
      commission: [1, 20],
      cutCardFromEnd: 16,
      afterCutCard: 'one-more-hand',
      mainMin: 500,
      mainMax: 500_000,
      sideMin: 100,
      sideMax: 50_000,
    });
  });
  it('variant rules differ from the default only in the variant', () => {
    for (const v of VARIANT_IDS) expect(VARIANT_RULES[v]).toEqual({ ...DEFAULT_RULES, variant: v });
  });
});
