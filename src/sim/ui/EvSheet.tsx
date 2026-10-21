import type { BetId } from '../engine/types';
import type { SlipPreview } from '../math/types';

export interface EvSheetProps {
  /** The preview to show; null while there is none (practice mode before the hand settles). */
  preview: SlipPreview | null;
  /** Bets on the slip (highlighted rows). */
  slip?: readonly BetId[];
  /** Open "Why?" for this bet. */
  whyOpen?: BetId | null;
  onToggleWhy?: (bet: BetId) => void;
  onSelectBet?: (bet: BetId) => void;
  /** Cents per hand to show per-hour figures against (D5: 72). */
  handsPerHour?: number;
}

/** Placeholder: the final props, no content yet. Owned by table-ui. */
export function EvSheet(props: EvSheetProps) {
  return (
    <section
      class="ev-sheet card"
      aria-label="Expected value of every bet"
      data-source={props.preview?.source}
    >
      <h3>EV sheet</h3>
      <p class="muted">Coming soon.</p>
    </section>
  );
}
