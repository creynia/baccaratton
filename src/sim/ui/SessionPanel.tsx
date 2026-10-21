import './sim.css';
import { useState } from 'preact/hooks';
import type { VariantId } from '../engine/types';
import type { SessionSummary } from './types';
import { BET_LABEL, money, pct } from './text';

export interface SessionPanelProps {
  summary: SessionSummary;
  variant?: VariantId;
  /** Tapping the panel (scene target `session`, D35; l14, l18). */
  onTap?: () => void;
  defaultOpen?: boolean;
}

const m = (c: number, sign = false) => money(c, { sign, cents: 'always' });

/**
 * The session panel (curriculum.md §8.4, D35): hands, total bet, expected (Σ bet × full-shoe EV),
 * actual, luck, the average edge against the cheapest main bet, and the commission paid.
 */
export function SessionPanel({
  summary: s,
  variant = 'punto-banco',
  onTap,
  defaultOpen = true,
}: SessionPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const best = variant === 'super-6' ? 'player' : 'banker';
  return (
    <section class="sim-session" aria-label="Session" data-testid="session-panel">
      <button
        type="button"
        class="sim-session-head"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          onTap?.();
        }}
        data-target="session"
        data-hit="session"
      >
        <span>Session</span>
        <span class="sim-money">
          {s.hands} {s.hands === 1 ? 'hand' : 'hands'} · {m(s.actualCents, true)}
        </span>
      </button>
      {open ? (
        <div class="sim-session-body">
          <dl class="sim-session-row">
            <div>
              <dt>Hands</dt>
              <dd data-testid="session-hands">{s.hands}</dd>
            </div>
            <div>
              <dt>Total bet</dt>
              <dd class="sim-money">{money(s.totalBet)}</dd>
            </div>
            <div>
              <dt>Expected</dt>
              <dd class="sim-money" data-testid="session-expected">
                {m(s.expectedCents, true)}
              </dd>
            </div>
            <div>
              <dt>Actual</dt>
              <dd class="sim-money" data-testid="session-actual">
                {m(s.actualCents, true)}
              </dd>
            </div>
            <div>
              <dt>Luck</dt>
              <dd class="sim-money" data-testid="session-luck">
                {m(s.luckCents, true)}
              </dd>
            </div>
          </dl>
          <p>
            <strong>Your average edge</strong>: {s.totalBet > 0 ? pct(s.averageEdge) : '—'}{' '}
            <span class="sim-muted">
              ({BET_LABEL[best]} only: {pct(s.bankerOnlyEdge)})
            </span>
          </p>
          {variant === 'punto-banco' || s.commissionPaid > 0 ? (
            <p data-testid="session-commission">
              <strong>Commission paid</strong>: {m(s.commissionPaid)}.
            </p>
          ) : null}
          <p class="sim-muted">
            Expected uses the full-shoe EV of every bet you placed; luck is the rest.
          </p>
        </div>
      ) : null}
    </section>
  );
}
