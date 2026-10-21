// Final-equity histogram (simulator.md section 6.4) for one series, plus who won the hands.
// Bars are anchored to the baseline with a 2 px gap; every bar has a hover/focus readout and the
// counts are repeated in a table (never colour or picture alone).
import { useState } from 'preact/hooks';
import { betDef } from '../engine/bets';
import { formatMoney } from '../engine/money';
import type { BetId } from '../engine/types';
import type { SessionSeries } from '../strategy/types';
import { niceTicks, seriesColor, seriesLabel } from './BankrollChart';

const W = 360;
const H = 130;
const PAD = { l: 30, r: 10, t: 10, b: 24 };

export interface Bin {
  lo: number;
  hi: number;
  count: number;
}

/** Equal-width bins over the finals, edges on round dollar amounts. */
export function binFinals(finals: ArrayLike<number>, maxBins = 12): Bin[] {
  if (finals.length === 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < finals.length; i++) {
    lo = Math.min(lo, finals[i]!);
    hi = Math.max(hi, finals[i]!);
  }
  if (lo === hi) return [{ lo, hi: hi + 100, count: finals.length }];
  const ticks = niceTicks(lo, hi, maxBins);
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : hi - lo;
  const start = Math.floor(lo / step) * step;
  const n = Math.max(1, Math.ceil((hi - start + 1) / step));
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    lo: start + i * step,
    hi: start + (i + 1) * step,
    count: 0,
  }));
  for (let i = 0; i < finals.length; i++) {
    const b = Math.min(n - 1, Math.floor((finals[i]! - start) / step));
    bins[b]!.count++;
  }
  return bins;
}

export interface OutcomeHistogramProps {
  series: SessionSeries;
  bankroll: number;
  /** Colour slot of this series in the compare legend. */
  index?: number;
  /** The hand winners are the same cards for every compared system: show them once. */
  showWinners?: boolean;
}

export function OutcomeHistogram({
  series,
  bankroll,
  index = 0,
  showWinners = true,
}: OutcomeHistogramProps) {
  const [active, setActive] = useState<number | null>(null);
  const bins = binFinals(series.finals);
  const n = series.finals.length;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const lo = bins[0]?.lo ?? bankroll;
  const hi = bins[bins.length - 1]?.hi ?? bankroll + 100;
  const x = (v: number): number => PAD.l + ((W - PAD.l - PAD.r) * (v - lo)) / (hi - lo);
  const y = (c: number): number => PAD.t + (H - PAD.t - PAD.b) * (1 - c / max);
  const base = H - PAD.b;
  const w = bins.length ? x(bins[0]!.hi) - x(bins[0]!.lo) : 0;
  const decided = series.winners.player + series.winners.banker + series.winners.tie;
  const share = (k: number): string => (decided ? `${((100 * k) / decided).toFixed(1)}%` : '0%');
  const label = (b: Bin): string =>
    `${formatMoney(b.lo)} to ${formatMoney(b.hi)}: ${b.count} of ${n} sessions`;
  const showStart = bankroll >= lo && bankroll <= hi;
  return (
    <div data-testid="outcome-histogram" style={{ display: 'grid', gap: '6px' }}>
      <h4 style={{ margin: '4px 0 0', fontSize: '14px' }}>
        Where {n > 1 ? `the ${n} sessions` : 'the session'} finished ·{' '}
        {seriesLabel(series.strategy)}
      </h4>
      {n > 1 ? (
        <figure style={{ margin: 0 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`Final bankroll histogram. ${bins
              .filter((b) => b.count)
              .map(label)
              .join('; ')}.`}
            style={{ maxWidth: '560px', display: 'block' }}
          >
            {bins.map((b, i) => {
              const bx = x(b.lo) + 1;
              const bw = Math.max(1, w - 2);
              const top = y(b.count);
              const h = base - top;
              const r = Math.min(4, bw / 2, h);
              return (
                <g key={i}>
                  {b.count > 0 ? (
                    <path
                      d={`M${bx} ${base}V${top + r}Q${bx} ${top} ${bx + r} ${top}H${bx + bw - r}Q${bx + bw} ${top} ${bx + bw} ${top + r}V${base}Z`}
                      fill={seriesColor(index)}
                      opacity={active === null || active === i ? 1 : 0.55}
                      data-testid="bin"
                    />
                  ) : null}
                  <rect
                    x={x(b.lo)}
                    y={PAD.t}
                    width={w}
                    height={base - PAD.t}
                    fill="transparent"
                    tabIndex={b.count ? 0 : -1}
                    aria-label={label(b)}
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onPointerUp={() => setActive(null)}
                    onPointerCancel={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              );
            })}
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={base}
              y2={base}
              stroke="var(--muted)"
              opacity="0.5"
            />
            {showStart ? (
              <g>
                <line
                  x1={x(bankroll)}
                  x2={x(bankroll)}
                  y1={PAD.t}
                  y2={base}
                  stroke="var(--text)"
                  stroke-dasharray="2 3"
                />
                <text x={x(bankroll) + 3} y={PAD.t + 8} font-size="9" fill="var(--muted)">
                  start
                </text>
              </g>
            ) : null}
            <text x={PAD.l} y={H - 8} font-size="9" fill="var(--muted)">
              {formatMoney(lo)}
            </text>
            <text x={W - PAD.r} y={H - 8} text-anchor="end" font-size="9" fill="var(--muted)">
              {formatMoney(hi)}
            </text>
            <text x={PAD.l - 4} y={y(max) + 3} text-anchor="end" font-size="9" fill="var(--muted)">
              {max}
            </text>
          </svg>
          <div role="status" aria-live="polite" style={{ minHeight: '1.45em', fontSize: '12px' }}>
            {active !== null && bins[active] ? label(bins[active]) : null}
          </div>
          <figcaption style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {(series.probAhead * 100).toFixed(0)}% of sessions finished ahead (≈ simulated).
          </figcaption>
        </figure>
      ) : null}
      {showWinners ? (
        <table
          aria-label="Who won the hands"
          style={{
            borderCollapse: 'collapse',
            fontSize: '13px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <tbody>
            {(['banker', 'player', 'tie'] as const).map((w) => (
              <tr key={w}>
                <th
                  scope="row"
                  style={{ textAlign: 'left', fontWeight: 400, paddingRight: '12px' }}
                >
                  {w === 'banker' ? 'Banker won' : w === 'player' ? 'Player won' : 'Tie'}
                </th>
                <td style={{ textAlign: 'right' }}>
                  {series.winners[w].toLocaleString('en-US')} ({share(series.winners[w])})
                </td>
              </tr>
            ))}
            {Object.entries(series.sideBetHits).map(([bet, k]) => (
              <tr key={bet}>
                <th
                  scope="row"
                  style={{ textAlign: 'left', fontWeight: 400, paddingRight: '12px' }}
                >
                  {betDef(bet as BetId).label} hits
                </th>
                <td style={{ textAlign: 'right' }}>{k.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
