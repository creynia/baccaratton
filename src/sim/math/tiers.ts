// Bet tiers (decisions.md D19, simulator.md section 2.4). Exact comparisons on edge per bet placed.
import { frac, lt, lte, ZERO } from './fraction';
import type { BetTier, Fraction } from './types';

export const GOOD_MAX: Fraction = frac(2n, 100n);
export const FAIR_MAX: Fraction = frac(5n, 100n);
/** Costly below this, sucker at or above it. */
export const SUCKER_MIN: Fraction = frac(9n, 100n);

/** free <= 0 < good <= 2% < fair <= 5% < costly < 9% <= sucker. */
export function betTier(edge: Fraction): BetTier {
  if (lte(edge, ZERO)) return 'free';
  if (lte(edge, GOOD_MAX)) return 'good';
  if (lte(edge, FAIR_MAX)) return 'fair';
  if (lt(edge, SUCKER_MIN)) return 'costly';
  return 'sucker';
}
