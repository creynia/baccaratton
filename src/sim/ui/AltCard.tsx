import './sim.css';
import { useEffect, useRef } from 'preact/hooks';
import type { BetId } from '../engine/types';
import type { BetTier } from '../math/types';
import { TierBadge } from './TierBadge';
import { BET_LABEL } from './text';

export interface AltCardProps {
  /** `confirm`: the Sucker second tap (D19); `alternative`: a cheaper main bet (D31). */
  mode: 'confirm' | 'alternative';
  bet: BetId;
  tier?: BetTier;
  /** The copy (text.ts `suckerPrompt` or `alternativeText`). */
  text: string;
  /** The cheapest main bet, for "Use this" / "Banker instead". */
  to?: BetId | null;
  /** confirm: place the chip anyway. */
  onConfirm?: () => void;
  /** Move the amount to `to` (always the cheapest main bet, D31). */
  onUse?: () => void;
  onDismiss?: () => void;
  /** Focus the first button on mount (the inline confirm takes focus). */
  autoFocus?: boolean;
}

/**
 * The better-alternative card and the inline Sucker confirmation (simulator.md §2.6, §4.2): the
 * sheet never opens by itself; a Sucker bet asks for a second tap here.
 */
export function AltCard({
  mode,
  bet,
  tier,
  text,
  to,
  onConfirm,
  onUse,
  onDismiss,
  autoFocus,
}: AltCardProps) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus]);
  return (
    <div
      class={`sim-alt sim-alt-${mode}`}
      role={mode === 'confirm' ? 'alertdialog' : 'note'}
      aria-label={mode === 'confirm' ? `Confirm ${BET_LABEL[bet]}` : 'A cheaper bet'}
      data-testid={mode === 'confirm' ? 'sucker-confirm' : 'alt-card'}
      data-bet={bet}
    >
      <p class="sim-alt-text">
        {tier ? <TierBadge tier={tier} /> : null} {text}
      </p>
      <div class="sim-alt-actions">
        {mode === 'confirm' ? (
          <button
            ref={first}
            type="button"
            class="sim-btn sim-btn-danger"
            onClick={onConfirm}
            data-action="confirm-bet"
            data-hit="confirm-bet"
          >
            Bet it anyway
          </button>
        ) : null}
        {to && onUse ? (
          <button
            ref={mode === 'alternative' ? first : undefined}
            type="button"
            class={`sim-btn${mode === 'alternative' ? ' sim-btn-primary' : ''}`}
            onClick={onUse}
            data-action="use-alternative"
            data-hit="use-alternative"
          >
            {mode === 'confirm' ? `${BET_LABEL[to]} instead` : `Use this: ${BET_LABEL[to]}`}
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" class="sim-btn" onClick={onDismiss} data-action="dismiss">
            {mode === 'confirm' ? 'Cancel' : 'Keep it'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
