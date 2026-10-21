// The bet registry (simulator.md section 1.4). `betsOffered` is real in WP0 (D37: content, URLs
// and settings need it); the registry itself is TODO(engine).
import { BET_IDS_BY_VARIANT } from './ids';
import type { BetDef, BetId, TableRules } from './types';

/** BET_IDS filtered by offeredIn for the rules' variant, in display order. */
export function betsOffered(rules: TableRules): BetId[] {
  const offered = BET_IDS_BY_VARIANT[rules.variant];
  if (!offered) throw new Error(`Unknown variant "${String(rules.variant)}"`);
  return [...offered];
}

/** One BetDef per BetId (payout text and `settle`). TODO(engine). */
export function betDef(_id: BetId): BetDef {
  throw new Error('TODO(engine): betDef');
}
