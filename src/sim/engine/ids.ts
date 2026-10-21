// Small real data the content tests, URLs and settings need (decisions.md D13).
import { BET_IDS, VARIANT_IDS } from './types';
import type { BetId, VariantId } from './types';

/**
 * The variants each bet is offered in (`BetDef.offeredIn`, simulator.md section 1.4): Dragon 7
 * and Panda 8 in `ez` only (D3), every other bet everywhere. The engine WP's registry reads this.
 */
export const BET_OFFERED_IN: Readonly<Record<BetId, readonly VariantId[]>> = Object.fromEntries(
  BET_IDS.map((id) => [id, id === 'dragon-7' || id === 'panda-8' ? ['ez'] : VARIANT_IDS]),
) as Record<BetId, readonly VariantId[]>;

const offeredIn = (v: VariantId): readonly BetId[] =>
  BET_IDS.filter((b) => BET_OFFERED_IN[b].includes(v));

/** Bets offered per variant, in display order (BET_IDS filtered by offeredIn). */
export const BET_IDS_BY_VARIANT: Readonly<Record<VariantId, readonly BetId[]>> = {
  'punto-banco': offeredIn('punto-banco'),
  ez: offeredIn('ez'),
  'super-6': offeredIn('super-6'),
};

/** Rule preset ids are the variant ids: one shoe (8 decks, burn, cut card 16 from the end). */
export const RULE_PRESET_IDS: readonly VariantId[] = VARIANT_IDS;
export const DEFAULT_VARIANT: VariantId = 'punto-banco';
