// Small real data the content tests, URLs and settings need (decisions.md D13).
import { BET_IDS, VARIANT_IDS } from './types';
import type { BetId, VariantId } from './types';

/** Bets offered per variant, in display order (simulator.md section 1.4). */
export const BET_IDS_BY_VARIANT: Readonly<Record<VariantId, readonly BetId[]>> = {
  'punto-banco': BET_IDS.filter((b) => b !== 'dragon-7' && b !== 'panda-8'),
  ez: BET_IDS,
  'super-6': BET_IDS.filter((b) => b !== 'dragon-7' && b !== 'panda-8'),
};

export function betsOffered(variant: VariantId): readonly BetId[] {
  return BET_IDS_BY_VARIANT[variant];
}

/** Rule preset ids are the variant ids: one shoe (8 decks, burn, cut card 16 from the end). */
export const RULE_PRESET_IDS: readonly VariantId[] = VARIANT_IDS;
export const DEFAULT_VARIANT: VariantId = 'punto-banco';
