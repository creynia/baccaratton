import './sim.css';
import type { BetTier } from '../math/types';
import { TIER_SHORT, tierLabel } from './text';

/** A different shape per tier, so colour is never the only signal (D19). */
export const TIER_ICON: Readonly<Record<BetTier, { d: string; filled: boolean }>> = {
  free: { d: 'M2.5 7.5l3 3 6-7', filled: false }, // check
  good: { d: 'M7 3a4 4 0 1 0 0.01 0Z', filled: true }, // dot
  fair: { d: 'M3 7h8', filled: false }, // dash
  costly: { d: 'M7 2.5 12 11.5H2Z', filled: true }, // triangle
  sucker: { d: 'M3 3l8 8M11 3l-8 8', filled: false }, // cross
};

export function TierIcon({ tier, size = 14 }: { tier: BetTier; size?: number }) {
  const s = TIER_ICON[tier];
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-hidden="true"
      class="sim-tier-icon"
      focusable="false"
    >
      <path
        d={s.d}
        fill={s.filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export interface TierBadgeProps {
  tier: BetTier;
  /** Shoe tracker wording: `free` reads "Edge to you". */
  tracker?: boolean;
  /** Use the short label ("Good", "Sucker"). */
  short?: boolean;
  /** Extra text after the label ("−1.06%"). */
  detail?: string;
}

/** The tier as an icon plus a text label, always (D19). */
export function TierBadge({ tier, tracker, short, detail }: TierBadgeProps) {
  const label =
    short && !(tracker && tier === 'free') ? TIER_SHORT[tier] : tierLabel(tier, tracker);
  return (
    <span class={`sim-badge sim-badge-${tier}`} data-tier={tier}>
      <TierIcon tier={tier} />
      <span class="sim-badge-text">
        {label}
        {detail ? <span class="sim-badge-detail"> · {detail}</span> : null}
      </span>
    </span>
  );
}
