// Survival curve (simulator.md section 6.4): the share of sessions not yet busted after each hand,
// one line per strategy (colour + dash, as in BankrollChart). Many-session runs only.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { SessionSeries } from '../strategy/types';
import {
  Legend,
  PAD,
  pathOf,
  seriesColor,
  seriesDash,
  seriesLabel,
  Swatch,
  W,
} from './BankrollChart';

const H = 110;

export interface SurvivalChartProps {
  series: readonly SessionSeries[];
  hands: number;
  class?: string;
}

const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;

export function SurvivalChart({ series, hands, class: cls }: SurvivalChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const withSurvival = series.filter((s) => s.survival);
  if (withSurvival.length === 0) return null;
  const x = (i: number): number => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, hands);
  const y = (v: number): number => PAD.t + (H - PAD.t - PAD.b) * (1 - v);
  const summary = series
    .map((s) =>
      s.survival ? `${seriesLabel(s.strategy)} ${pct(s.survival[s.survival.length - 1]!)}` : '',
    )
    .filter(Boolean)
    .join(', ');
  const onMove = (e: JSX.TargetedPointerEvent<SVGRectElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    setHover(Math.max(0, Math.min(hands, Math.round(fx * hands))));
  };
  return (
    <figure class={cls} style={{ margin: 0 }} data-testid="survival-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Sessions not busted after ${hands.toLocaleString('en-US')} hands: ${summary}.`}
        style={{ maxWidth: '560px', display: 'block', touchAction: 'pan-y' }}
      >
        {[0, 0.5, 1].map((t) => (
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
              {pct(t)}
            </text>
          </g>
        ))}
        {series.map((s, k) =>
          s.survival ? (
            <path
              key={k}
              d={pathOf(s.survival, x, y)}
              fill="none"
              stroke={seriesColor(k)}
              stroke-width="2"
              stroke-dasharray={seriesDash(k)}
              data-testid="survival-line"
            />
          ) : null,
        )}
        <text x={W - PAD.r} y={H - 6} text-anchor="end" font-size="9" fill="var(--muted)">
          {hands.toLocaleString('en-US')} hands
        </text>
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--text)"
            opacity="0.4"
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
        style={{
          minHeight: `${1.45 * Math.min(series.length + 1, 3)}em`,
          fontSize: '12px',
          color: 'var(--text)',
        }}
      >
        {hover === null ? null : (
          <div data-testid="survival-tooltip">
            <div style={{ color: 'var(--muted)' }}>Hand {hover.toLocaleString('en-US')}</div>
            {series.map((s, k) =>
              s.survival ? (
                <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <Swatch k={k} />
                  {seriesLabel(s.strategy)}: {pct(s.survival[hover]!)} still playing
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <Legend series={series} />
      <figcaption style={{ fontSize: '12px', color: 'var(--muted)' }}>
        Sessions not busted (≈ simulated). Bust: the next bet can't be covered.
      </figcaption>
    </figure>
  );
}
