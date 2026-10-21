import './sim.css';
import { useState } from 'preact/hooks';
import type { HandResult, TableRules } from '../engine/types';
import { BET_LABEL, commissionLine, money, resultHeadline, resultMoney } from './text';

export interface SettleToastProps {
  result: HandResult;
  rules?: Pick<TableRules, 'commission' | 'variant'>;
  /** The commission line was tapped (scene target `commission`, D35; l07-s1, l23-s1). */
  onCommission?: () => void;
  onDismiss?: () => void;
  /** Show the per-bet lines. */
  details?: boolean;
}

/**
 * The settlement toast (D35): "Banker wins 7 to 5. You win $23.75." with a tappable line
 * "$1.25 commission (5% of $25)" that opens a short explainer.
 */
export function SettleToast({ result, rules, onCommission, onDismiss, details }: SettleToastProps) {
  const [open, setOpen] = useState(false);
  const line = commissionLine(result, rules);
  const c = result.settlements.find((s) => s.commission > 0);
  const tone = result.net > 0 ? 'good' : result.net < 0 ? 'bad' : 'info';
  return (
    <div
      class={`sim-settle sim-toast sim-toast-${tone}`}
      role="status"
      aria-live="polite"
      data-testid="settle-toast"
      data-winner={result.hand.winner}
    >
      <p class="sim-settle-head">
        <strong>{resultHeadline(result)}</strong>{' '}
        <span class="sim-money" data-testid="settle-money">
          {resultMoney(result)}
        </span>
      </p>
      {line && c ? (
        <button
          type="button"
          class="sim-settle-commission"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            onCommission?.();
          }}
          data-target="commission"
          data-hit="commission"
        >
          {line}
        </button>
      ) : null}
      {open && c ? (
        <p class="sim-settle-explain" data-testid="commission-explainer">
          A winning Banker bet pays 1 to 1, less 5% of the win: {money(c.amount)} × 5% ={' '}
          {money(c.commission, { cents: 'always' })}, so you get{' '}
          {money(c.profit, { cents: 'always' })}. Banker wins a little more often than Player; the
          commission is what keeps a house edge (1.06%) on it.
        </p>
      ) : null}
      {details && result.settlements.length > 0 ? (
        <ul class="sim-settle-lines">
          {result.settlements.map((s) => (
            <li key={s.bet}>
              {BET_LABEL[s.bet]} {money(s.amount)}:{' '}
              <span class="sim-money">
                {s.result === 'push' ? 'push' : money(s.profit, { sign: true, cents: 'always' })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {onDismiss ? (
        <button type="button" class="sim-icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
