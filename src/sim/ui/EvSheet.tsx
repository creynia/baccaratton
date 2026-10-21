import './sim.css';
import { useEffect, useId, useRef } from 'preact/hooks';
import type { BetId, Cents, TableRules } from '../engine/types';
import type { Alternative, BetEv, SlipPreview } from '../math/types';
import { AltCard } from './AltCard';
import { TierBadge } from './TierBadge';
import { WhyTable } from './WhyTable';
import {
  BET_LABEL,
  alternativeText,
  bestMainBet,
  costLine,
  fracMul,
  fracNeg,
  money,
  moneyC,
  payoutShort,
  perfectStrategyLine,
  pct,
  tierOfEdge,
} from './text';

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
  /** Payout texts and the alternative copy (tie pays, variant). */
  rules?: TableRules;
  /** The Shoe tracker's current-shoe preview (D6): a second "This shoe" line per bet. */
  tracker?: SlipPreview | null;
  /** The amount shown for bets not on the slip (one table unit; default $10). */
  unitCents?: Cents;
  /** "Use this" on the alternative card: move the amount to the cheapest main bet (D31). */
  onUseAlternative?: (alt: Alternative) => void;
  /** `dialog`: a focus-trapped modal (portrait); `panel`: the landscape rail; `inline`: plain. */
  mode?: 'dialog' | 'panel' | 'inline';
  onClose?: () => void;
}

const FOCUSABLE =
  'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

function Row({
  b,
  amount,
  onSlip,
  best,
  hph,
  rules,
  trackerRow,
  trackerCards,
  why,
  onToggleWhy,
  onSelect,
}: {
  b: BetEv;
  amount: Cents;
  onSlip: boolean;
  best: boolean;
  hph: number;
  rules?: TableRules;
  trackerRow?: BetEv;
  trackerCards: number;
  why: boolean;
  onToggleWhy?: (bet: BetId) => void;
  onSelect?: (bet: BetId) => void;
}) {
  const whyId = useId();
  const c = costLine(b.ev, amount, hph);
  const label = BET_LABEL[b.bet];
  return (
    <li
      class={`sim-evrow${onSlip ? ' is-on-slip' : ''}`}
      data-bet={b.bet}
      data-tier={b.tier}
      data-testid={`ev-row-${b.bet}`}
    >
      <div class="sim-evrow-head">
        {onSelect ? (
          <button type="button" class="sim-evrow-name sim-link" onClick={() => onSelect(b.bet)}>
            {label}
          </button>
        ) : (
          <span class="sim-evrow-name">{label}</span>
        )}
        {rules ? <span class="sim-evrow-pay">{payoutShort(b.bet, rules)}</span> : null}
        <TierBadge tier={b.tier} />
        {best ? <span class="sim-best">Lowest edge on this table</span> : null}
      </div>
      <p class="sim-evrow-line">
        <strong class="sim-money">
          {label} {money(amount)}
        </strong>
        : <strong class="sim-money">{c.perHand}</strong> · house edge <strong>{pct(b.edge)}</strong>
      </p>
      <p class="sim-evrow-sub sim-money">
        {onSlip
          ? c.perHour
          : `About ${moneyC(fracNeg(fracMul(b.ev, amount * hph)))} an hour at ${hph} hands`}
      </p>
      {trackerRow ? (
        <p class="sim-evrow-tracker" data-testid={`tracker-line-${b.bet}`}>
          <strong>This shoe</strong>: {pct(trackerRow.ev)} (exact for the {trackerCards} cards left)
          {trackerRow.ev.num > 0n ? (
            <>
              {' '}
              <TierBadge tier={tierOfEdge(trackerRow.edge)} tracker />
            </>
          ) : null}
        </p>
      ) : null}
      {onToggleWhy ? (
        <button
          type="button"
          class="sim-why-toggle"
          aria-expanded={why}
          aria-controls={whyId}
          onClick={() => onToggleWhy(b.bet)}
          data-action={`why-${b.bet}`}
        >
          Why?
        </button>
      ) : null}
      {why ? (
        <WhyTable id={whyId} why={b.why} edgePerResolved={b.edgePerResolved} ev={b.ev} />
      ) : null}
    </li>
  );
}

/**
 * The EV sheet (simulator.md §2.6, curriculum.md §8.1): every offered bet with its edge, tier
 * badge (text always), cost per hand and per hour, the cheapest-main-bet mark, "Why?", the slip
 * totals and the better alternative. Full-shoe values first; the Shoe tracker line second (D6).
 */
export function EvSheet({
  preview,
  slip = [],
  whyOpen = null,
  onToggleWhy,
  onSelectBet,
  handsPerHour = 72,
  rules,
  tracker,
  unitCents = 1_000,
  onUseAlternative,
  mode = 'inline',
  onClose,
}: EvSheetProps) {
  const root = useRef<HTMLElement>(null);
  const titleId = useId();
  const dialog = mode === 'dialog';
  useEffect(() => {
    if (!dialog) return;
    const opener = typeof document === 'undefined' ? null : document.activeElement;
    root.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [dialog]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!dialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab' || !root.current) return;
    const els = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (els.length === 0) return;
    const first = els[0]!;
    const last = els[els.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const lines = new Map((preview?.lines ?? []).map((l) => [l.bet, l]));
  const offered = (preview?.sheet ?? []).filter((b) => b.offered);
  const best = preview ? bestMainBet(preview.sheet) : null;
  const trackerOf = new Map((tracker?.sheet ?? []).map((b) => [b.bet, b]));
  const alt = preview?.alternative ?? null;
  return (
    <section
      ref={root}
      class={`ev-sheet sim-ev sim-ev-${mode}`}
      aria-label={dialog ? undefined : 'Expected value of every bet'}
      aria-labelledby={dialog ? titleId : undefined}
      role={dialog ? 'dialog' : undefined}
      aria-modal={dialog ? 'true' : undefined}
      data-source={preview?.source}
      data-testid="ev-sheet"
      onKeyDown={onKeyDown}
    >
      <header class="sim-ev-head">
        <h3 id={titleId}>Every bet, before you deal</h3>
        {onClose ? (
          <button type="button" class="sim-btn" onClick={onClose} data-action="close-ev">
            Close
          </button>
        ) : null}
      </header>
      {!preview ? (
        <p class="sim-muted">Practice mode: the EV shows after the hand settles.</p>
      ) : (
        <>
          <p class="sim-ev-strategy">{perfectStrategyLine(preview.sheet)}</p>
          {preview.source === 'current-shoe' ? (
            <p class="sim-muted">Exact for the {preview.cardsLeft} cards left in this shoe.</p>
          ) : (
            <p class="sim-muted">Exact, full 8-deck shoe. Ties push Player and Banker bets.</p>
          )}
          {alt && rules ? (
            <AltCard
              mode="alternative"
              bet={alt.from}
              tier={preview.sheet.find((b) => b.bet === alt.from)?.tier}
              text={alternativeText(alt, preview.sheet, rules, handsPerHour)}
              to={alt.to}
              onUse={onUseAlternative ? () => onUseAlternative(alt) : undefined}
            />
          ) : null}
          <ul class="sim-evlist">
            {offered.map((b) => {
              const line = lines.get(b.bet);
              return (
                <Row
                  key={b.bet}
                  b={b}
                  amount={line?.amount ?? unitCents}
                  onSlip={!!line || slip.includes(b.bet)}
                  best={b.bet === best}
                  hph={handsPerHour}
                  rules={rules}
                  trackerRow={trackerOf.get(b.bet)}
                  trackerCards={tracker?.cardsLeft ?? 0}
                  why={whyOpen === b.bet}
                  onToggleWhy={onToggleWhy}
                  onSelect={onSelectBet}
                />
              );
            })}
          </ul>
          <p class="sim-ev-foot sim-money" data-testid="ev-slip-total">
            {preview.totalWagered > 0 ? (
              <>
                <strong>This slip</strong>: {money(preview.totalWagered)} per hand, expected{' '}
                {moneyC(preview.totalEvCents)} per hand, {moneyC(preview.perHourCents)}/hour
              </>
            ) : (
              <>No chips on the felt. Lines show {money(unitCents)} on each bet.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}
