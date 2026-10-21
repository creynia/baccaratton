// A bet spot on the felt (simulator.md sections 4.2 and 4.5): label, payout, chips and, when EV is
// on, a tier badge with the EV ("Good · −1.06%"). The whole rect is the tap target (≥ 44 px).
import { useRef } from 'preact/hooks';
import type { BetId, Cents } from '../engine/types';
import type { BetTier } from '../math/types';
import { ChipStack } from './ChipStack';
import type { Rect } from './layouts';
import { BET_LABEL, SPOT_LINES, TIER_LABEL, TIER_SHORT, money } from './text';

export interface SpotEv {
  tier: BetTier;
  /** EV per $1, as shown on the badge ("−1.06%"). */
  evText: string;
  /** House edge, spoken ("house edge 1.06%"). */
  edgeText: string;
}

export interface BetSpotProps {
  bet: BetId;
  rect: Rect;
  amount: Cents;
  payout: string;
  payoutSpoken: string;
  /** Omitted when EV is hidden (practice mode). */
  ev?: SpotEv | null;
  minTap: number;
  onTap?: (bet: BetId) => void;
  /** Long-press (or the context menu) opens the spot sheet. */
  onLongPress?: (bet: BetId) => void;
  highlight?: boolean;
  /** After a hand: this bet won / pushed / lost (glow, plain, dim). */
  result?: 'win' | 'push' | 'lose' | null;
  /** A Sucker tap is waiting for its second tap (D19). */
  confirming?: boolean;
  /** The chips are the next hand's intent, not live bets. */
  ghost?: boolean;
  disabled?: boolean;
}

const LONG_PRESS_MS = 500;

/** Estimated text width at a font size (system UI, bold-ish). */
const textW = (s: string, fs: number) => s.length * fs * 0.56;

function FeltBadge({
  ev,
  cx,
  cy,
  maxW,
  fs,
}: {
  ev: SpotEv;
  cx: number;
  cy: number;
  maxW: number;
  fs: number;
}) {
  const text = `${TIER_SHORT[ev.tier]} · ${ev.evText}`;
  const natural = textW(text, fs);
  const tw = Math.min(natural, maxW - 8);
  const w = tw + 8;
  const h = fs + 5;
  return (
    <g class={`sim-felt-badge sim-felt-badge-${ev.tier}`} aria-hidden="true" data-tier={ev.tier}>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={h / 2} />
      <text
        x={cx}
        y={cy + fs * 0.35}
        text-anchor="middle"
        font-size={fs}
        {...(natural > tw ? { textLength: tw, lengthAdjust: 'spacingAndGlyphs' } : {})}
      >
        {text}
      </text>
    </g>
  );
}

export function spotAriaLabel(
  bet: BetId,
  amount: Cents,
  payoutSpoken: string,
  ev?: SpotEv | null,
  ghost?: boolean,
): string {
  const on = amount > 0 ? `${money(amount)} on it` : 'no bet';
  const tier = ev ? ` ${TIER_LABEL[ev.tier]}, house edge ${ev.edgeText}.` : '';
  return `${ghost ? 'Next hand: ' : ''}${BET_LABEL[bet]}, ${on}. ${payoutSpoken}.${tier}`;
}

export function BetSpot({
  bet,
  rect: r,
  amount,
  payout,
  payoutSpoken,
  ev,
  minTap,
  onTap,
  onLongPress,
  highlight,
  result,
  confirming,
  ghost,
  disabled,
}: BetSpotProps) {
  const interactive = !!onTap && !disabled;
  const small = r.h < 80;
  const lines = SPOT_LINES[bet];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const down = () => {
    longFired.current = false;
    if (!onLongPress || disabled) return;
    clear();
    timer.current = setTimeout(() => {
      longFired.current = true;
      onLongPress(bet);
    }, LONG_PRESS_MS);
  };
  const activate = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    onTap?.(bet);
  };
  const hit = {
    x: r.x + Math.min(0, (r.w - minTap) / 2),
    y: r.y + Math.min(0, (r.h - minTap) / 2),
    w: Math.max(minTap, r.w),
    h: Math.max(minTap, r.h),
  };
  const cls = [
    'sim-spot',
    `sim-spot-${bet}`,
    small ? 'is-small' : 'is-main',
    amount > 0 ? 'has-bet' : '',
    highlight ? 'is-hl' : '',
    result ? `is-${result}` : '',
    confirming ? 'is-confirm' : '',
    ghost ? 'is-ghost' : '',
    interactive ? 'is-tap' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = spotAriaLabel(bet, amount, payoutSpoken, ev, ghost);
  const cx = r.x + r.w / 2;
  return (
    <g class={cls} data-spot={bet}>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={small ? 10 : 14} class="sim-spot-box" />
      {small ? (
        <>
          {lines.map((l, i) => (
            <text
              key={l}
              x={r.x + 7}
              y={r.y + 14 + i * 11 - (lines.length - 1) * 2}
              class="sim-spot-label is-small"
              aria-hidden="true"
            >
              {l}
            </text>
          ))}
          {amount > 0 ? (
            <ChipStack x={r.x + r.w - 15} y={r.y + 16} amount={amount} r={10} pill={false} />
          ) : null}
          <text
            x={r.x + 7}
            y={r.y + r.h - 22}
            class={amount > 0 ? 'sim-spot-amount is-small' : 'sim-spot-payout is-small'}
            aria-hidden="true"
          >
            {amount > 0 ? money(amount) : payout}
          </text>
          {ev ? <FeltBadge ev={ev} cx={cx} cy={r.y + r.h - 9} maxW={r.w - 4} fs={9} /> : null}
        </>
      ) : (
        <>
          <text x={cx} y={r.y + 20} text-anchor="middle" class="sim-spot-label" aria-hidden="true">
            {lines[0]}
          </text>
          <text x={cx} y={r.y + 35} text-anchor="middle" class="sim-spot-payout" aria-hidden="true">
            {payout}
          </text>
          {amount > 0 ? <ChipStack x={cx} y={r.y + r.h * 0.52} amount={amount} r={13} /> : null}
          {ev ? <FeltBadge ev={ev} cx={cx} cy={r.y + r.h - 10} maxW={r.w - 8} fs={10} /> : null}
        </>
      )}
      <rect
        role={interactive ? 'button' : 'img'}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        aria-disabled={onTap && disabled ? 'true' : undefined}
        onClick={interactive ? activate : undefined}
        onPointerDown={interactive ? down : undefined}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={
          onLongPress && !disabled
            ? (e: Event) => {
                e.preventDefault();
                clear();
                onLongPress(bet);
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap?.(bet);
                }
              }
            : undefined
        }
        x={hit.x}
        y={hit.y}
        width={hit.w}
        height={hit.h}
        rx={small ? 10 : 14}
        class="sim-hit"
        data-hit={bet}
        fill="transparent"
      />
    </g>
  );
}
