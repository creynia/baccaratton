import type { BetDef, BetId } from './types';

/** The bet registry: one BetDef per BetId (payout text and `settle`). TODO(engine). */
export function betDef(_id: BetId): BetDef {
  throw new Error('TODO(engine): betDef');
}
