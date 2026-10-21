import './sim.css';
import type { Cents } from '../engine/types';
import type { Num } from './text';
import { money, moneyC } from './text';

export type ActionId = 'deal' | 'rebet' | 'clear' | 'ev';

export interface ActionBarProps {
  /** Σ of the chips on the felt. */
  slipTotal: Cents;
  /** Expected cents per hand of the slip (null hides it: practice mode or no preview). */
  evCents?: Num | null;
  /** Σ of lastBets (for "Rebet & Deal"). */
  lastTotal?: Cents;
  /** `rebet` is allowed and lastBets is non-empty (D30). */
  canRebet?: boolean;
  canDeal?: boolean;
  onDeal?: (opts: { rebet: boolean }) => void;
  onRebet?: () => void;
  onClear?: () => void;
  /** Omit to hide the EV button. */
  onEv?: () => void;
  evOpen?: boolean;
  /** Actions a scene highlights (`target: 'deal'` …). */
  highlight?: readonly ActionId[];
  /** Actions the step does not allow (hidden). */
  hidden?: readonly ActionId[];
  /** A hand is animating: buttons wait. */
  busy?: boolean;
  layout?: 'bar' | 'rail';
}

/**
 * The action bar (simulator.md section 4.2): Deal (primary, "Slip $35 · EV −$1.70"; it reads
 * "Rebet & Deal" when the felt is empty, rebet is allowed and lastBets is non-empty, D30), Rebet,
 * Clear and EV. Every button is ≥ 52 px high.
 */
export function ActionBar({
  slipTotal,
  evCents,
  lastTotal = 0,
  canRebet,
  canDeal = true,
  onDeal,
  onRebet,
  onClear,
  onEv,
  evOpen,
  highlight = [],
  hidden = [],
  busy,
  layout = 'bar',
}: ActionBarProps) {
  const empty = slipTotal === 0;
  const rebetDeal = empty && !!canRebet && lastTotal > 0;
  const show = (a: ActionId) => !hidden.includes(a);
  const hl = (a: ActionId) => (highlight.includes(a) ? ' is-hl' : '');
  const sub = rebetDeal
    ? `Slip ${money(lastTotal)}`
    : empty
      ? 'No bet: watch a hand'
      : `Slip ${money(slipTotal)}${evCents != null ? ` · EV ${moneyC(evCents)}` : ''}`;
  return (
    <div class={`sim-actions sim-actions-${layout}`} role="group" aria-label="Actions">
      {show('deal') ? (
        <button
          type="button"
          class={`sim-act sim-act-primary${hl('deal')}`}
          disabled={!canDeal || busy}
          onClick={() => onDeal?.({ rebet: rebetDeal })}
          data-action="deal"
          data-hit="deal"
        >
          <span class="sim-act-label">{rebetDeal ? 'Rebet & Deal' : 'Deal'}</span>
          <span class="sim-act-sub sim-money">{sub}</span>
        </button>
      ) : null}
      {show('rebet') && onRebet ? (
        <button
          type="button"
          class={`sim-act${hl('rebet')}`}
          disabled={!canRebet || busy || lastTotal === 0}
          onClick={onRebet}
          data-action="rebet"
          data-hit="rebet"
        >
          <span class="sim-act-label">Rebet</span>
          {lastTotal > 0 ? <span class="sim-act-sub sim-money">{money(lastTotal)}</span> : null}
        </button>
      ) : null}
      {show('clear') && onClear ? (
        <button
          type="button"
          class={`sim-act${hl('clear')}`}
          disabled={empty || busy}
          onClick={onClear}
          data-action="clear"
          data-hit="clear"
        >
          <span class="sim-act-label">Clear</span>
        </button>
      ) : null}
      {show('ev') && onEv ? (
        <button
          type="button"
          class={`sim-act${hl('ev')}`}
          aria-expanded={evOpen}
          onClick={onEv}
          data-action="ev"
          data-hit="ev"
        >
          <span class="sim-act-label">EV</span>
          <span class="sim-act-sub">every bet</span>
        </button>
      ) : null}
    </div>
  );
}
