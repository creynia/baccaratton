import type { BetTier } from '../../sim';
import { TIER_TEXT } from '../bets';

/** Tier badge: colour plus its text label, never colour alone (curriculum.md section 8.2). */
export function TierBadge(props: { tier: BetTier }) {
  return <span class={`badge tier-${props.tier}`}>{TIER_TEXT[props.tier]}</span>;
}
