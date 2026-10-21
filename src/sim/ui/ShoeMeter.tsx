import './sim.css';

export interface ShoeMeterProps {
  /** Cards left in the shoe (unseen, incl. behind the cut card). */
  cardsLeft: number;
  total?: number;
  /** Cards left at which the cut card sits (16, D8). */
  cutAt?: number;
  cutCardOut?: boolean;
  /** The next Deal reshuffles. */
  finished?: boolean;
}

/** "312 cards left" with a bar and the cut-card mark; "Last hand" after the cut card (D17). */
export function ShoeMeter({
  cardsLeft,
  total = 416,
  cutAt = 16,
  cutCardOut,
  finished,
}: ShoeMeterProps) {
  const frac = Math.max(0, Math.min(1, cardsLeft / total));
  const flag = finished ? 'New shoe next' : cutCardOut ? 'Last hand' : null;
  return (
    <div class="sim-shoe" data-testid="shoe-meter">
      <span class="sim-shoe-text">
        {cardsLeft} cards left{flag ? <strong class="sim-shoe-flag"> · {flag}</strong> : null}
      </span>
      <span
        class="sim-shoe-bar"
        role="meter"
        aria-label="Cards left in the shoe"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={cardsLeft}
      >
        <span class="sim-shoe-fill" style={`transform:scaleX(${frac})`} />
        <span class="sim-shoe-cut" style={`left:${(cutAt / total) * 100}%`} aria-hidden="true" />
      </span>
    </div>
  );
}
