// Hand-rolled SVG (holdumb's BankrollChart). One session: the equity line against the dashed
// expected line. Many sessions: a p10–p90 band, the median and the expected line (simulator.md
// section 6.4). Each series has its own colour AND dash pattern (never colour alone), a legend,
// and a crosshair tooltip; an aria-label summary stands in for the picture.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { betDef } from '../engine/bets';
import { formatMoney } from '../engine/money';
import type { BetId } from '../engine/types';
import { STRATEGY_NAMES } from '../strategy/presets';
import type { SessionSeries, StrategySpec } from '../strategy/types';

// Categorical slots in fixed order (validated light on #fff and dark on #231918, 8 slots).
const LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
];
const DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];
export const SERIES_COLORS: readonly string[] = LIGHT.map((l, i) => `light-dark(${l}, ${DARK[i]})`);
export const SERIES_DASHES: readonly string[] = [
  '',
  '7 3',
  '2 2',
  '9 3 2 3',
  '4 4',
  '1 3',
  '12 4',
  '6 2 2 2',
];
export const seriesColor = (k: number): string => SERIES_COLORS[k % SERIES_COLORS.length]!;
export const seriesDash = (k: number): string => SERIES_DASHES[k % SERIES_DASHES.length]!;

/** Legend name: the spec's label, else the preset name (+ "on Player" for a Player target). */
export function seriesLabel(spec: StrategySpec): string {
  if (spec.label) return spec.label;
  const base = STRATEGY_NAMES[spec.id];
  const name =
    spec.target === 'player' && !spec.id.startsWith('flat-') ? `${base} on Player` : base;
  const sides = spec.id === 'side-bet-sprinkler' ? [] : Object.entries(spec.sideBets ?? {});
  return sides.reduce(
    (n, [bet, amount]) =>
      amount ? `${n} + ${formatMoney(amount)} ${betDef(bet as BetId).label}` : n,
    name,
  );
}

export const W = 360;
const H = 190;
export const PAD = { l: 52, r: 10, t: 10, b: 22 };

export function pathOf(
  a: ArrayLike<number>,
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  // Thin to ≤ ~400 points so a 20,000-hand path stays light on a phone.
  const step = Math.max(1, Math.floor(a.length / 400));
  let d = '';
  for (let i = 0; i < a.length; i += step)
    d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(a[i]!).toFixed(1)}`;
  const last = a.length - 1;
  if (last > 0 && last % step !== 0) d += `L${x(last).toFixed(1)} ${y(a[last]!).toFixed(1)}`;
  return d;
}

function extent(series: readonly SessionSeries[], bankroll: number): [number, number] {
  let lo = bankroll;
  let hi = bankroll;
  const add = (a?: ArrayLike<number>): void => {
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  };
  for (const s of series) {
    add(s.equity);
    add(s.p10);
    add(s.p90);
    add(s.expected);
  }
  if (hi === lo) hi = lo + 100;
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

/** Round tick values (cents) for a range. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag) || 100;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

/** Equity at hand i for the headline line of a series (median for many sessions). */
const lineOf = (s: SessionSeries): ArrayLike<number> | undefined => s.p50 ?? s.equity;

export interface BankrollChartProps {
  series: readonly SessionSeries[];
  bankroll: number;
  hands: number;
  handsPerHour?: number;
  class?: string;
}

export function BankrollChart({
  series,
  bankroll,
  hands,
  handsPerHour = 72,
  class: cls,
}: BankrollChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const many = series.some((s) => s.p10 !== undefined);
  const [lo, hi] = extent(series, bankroll);
  const x = (i: number): number => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, hands);
  const y = (v: number): number => PAD.t + ((H - PAD.t - PAD.b) * (hi - v)) / (hi - lo);
  const ticks = niceTicks(lo, hi);
  const hours = hands / handsPerHour;
  const summary = series
    .map((s) => {
      const line = lineOf(s)!;
      const end = line[line.length - 1]!;
      return `${seriesLabel(s.strategy)}: ${many ? 'median ends' : 'ends'} ${formatMoney(end)} (expected ${formatMoney(s.expected[s.expected.length - 1]!)})`;
    })
    .join('. ');
  const onMove = (e: JSX.TargetedPointerEvent<SVGRectElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    setHover(Math.max(0, Math.min(hands, Math.round(fx * hands))));
  };
  const tipX = hover === null ? 0 : x(hover);
  return (
    <figure class={cls} style={{ margin: 0 }} data-testid="bankroll-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Bankroll over ${hands.toLocaleString('en-US')} hands. ${summary}.`}
        style={{ maxWidth: '560px', display: 'block', touchAction: 'pan-y' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--muted)"
              opacity="0.18"
            />
            <text x={PAD.l - 4} y={y(t) + 3} text-anchor="end" font-size="9" fill="var(--muted)">
              {formatMoney(t)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(bankroll)}
          y2={y(bankroll)}
          stroke="var(--muted)"
          stroke-dasharray="2 3"
          data-testid="start-line"
        />
        {series.map((s, k) => {
          const color = seriesColor(k);
          const dash = seriesDash(k);
          return (
            <g key={`${s.strategy.id}-${k}`} data-series={k}>
              {k === 0 && s.p10 && s.p90 ? (
                <path
                  d={`${pathOf(s.p90, x, y)}L${pathOf(Array.from(s.p10).reverse(), (i) => x(hands - i), y).slice(1)}Z`}
                  fill={color}
                  opacity="0.16"
                  data-testid="band"
                />
              ) : null}
              {lineOf(s) ? (
                <path
                  d={pathOf(lineOf(s)!, x, y)}
                  fill="none"
                  stroke={color}
                  stroke-width="2"
                  stroke-dasharray={dash}
                  stroke-linejoin="round"
                  data-testid={s.p50 ? 'median' : 'equity'}
                />
              ) : null}
              <path
                d={pathOf(s.expected, x, y)}
                fill="none"
                stroke={color}
                stroke-width="1"
                stroke-dasharray={dash}
                opacity="0.75"
                data-testid="expected"
              />
            </g>
          );
        })}
        <text x={PAD.l} y={H - 6} font-size="9" fill="var(--muted)">
          0
        </text>
        <text x={W - PAD.r} y={H - 6} text-anchor="end" font-size="9" fill="var(--muted)">
          {hands.toLocaleString('en-US')} hands
          {Number.isInteger(hours) ? ` (${hours} h)` : ''}
        </text>
        {hover !== null ? (
          <line
            x1={tipX}
            x2={tipX}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--text)"
            opacity="0.4"
            data-testid="crosshair"
          />
        ) : null}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={() => setHover(null)}
          onPointerCancel={() => setHover(null)}
        />
      </svg>
      <div
        role="status"
        aria-live="polite"
        data-testid="chart-readout"
        style={{
          minHeight: `${1.45 * (series.length + 1)}em`,
          fontSize: '12px',
          color: 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hover === null ? (
          <div style={{ color: 'var(--muted)' }}>Touch or hover the chart to read the values.</div>
        ) : (
          <div data-testid="chart-tooltip">
            <div style={{ color: 'var(--muted)' }}>Hand {hover.toLocaleString('en-US')}</div>
            {series.map((s, k) => {
              const line = lineOf(s);
              return (
                <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <Swatch k={k} />
                  {seriesLabel(s.strategy)}: {line ? formatMoney(line[hover]!) : '—'}
                  {s.p10 && s.p90
                    ? ` (${formatMoney(s.p10[hover]!)} to ${formatMoney(s.p90[hover]!)})`
                    : ''}
                  , expected {formatMoney(s.expected[hover]!)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Legend series={series} />
      <figcaption style={{ fontSize: '12px', color: 'var(--muted)' }}>
        {many
          ? 'Shaded band: the middle 80% of sessions (p10 to p90); solid line: the median. '
          : ''}
        Dotted line: expected (house edge × money bet). Grey dashed line: the starting bankroll.
      </figcaption>
    </figure>
  );
}

export function Swatch({ k }: { k: number }) {
  return (
    <svg width="26" height="8" aria-hidden="true" style={{ flex: 'none' }}>
      <line
        x1="0"
        x2="26"
        y1="4"
        y2="4"
        stroke={seriesColor(k)}
        stroke-width="2.5"
        stroke-dasharray={seriesDash(k)}
      />
    </svg>
  );
}

export function Legend({ series }: { series: readonly SessionSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul
      aria-label="Legend"
      data-testid="legend"
      style={{
        listStyle: 'none',
        margin: '4px 0 0',
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        fontSize: '12px',
        color: 'var(--text)',
      }}
    >
      {series.map((s, k) => (
        <li key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Swatch k={k} />
          {seriesLabel(s.strategy)}
        </li>
      ))}
    </ul>
  );
}
