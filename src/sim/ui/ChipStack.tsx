// Chips as SVG (on the felt) and the denominations shared with the HTML rack (D16: $1 $5 $25
// $100 $500). Colours come from the --chip-* tokens.
import type { Cents } from '../engine/types';
import { money } from './text';

export const CHIP_DENOMS: readonly Cents[] = [100, 500, 2500, 10_000, 50_000];

export function chipLabel(value: Cents): string {
  const d = value / 100;
  if (d >= 1000 && d % 1000 === 0) return `${d / 1000}K`;
  return Number.isInteger(d) ? `${d}` : d.toFixed(2);
}

/** Greedy breakdown, biggest first. */
export function chipBreakdown(amount: Cents, max = 60): Cents[] {
  const out: Cents[] = [];
  let rest = Math.max(0, Math.round(amount));
  for (const d of [...CHIP_DENOMS].reverse()) {
    while (rest >= d && out.length < max) {
      out.push(d);
      rest -= d;
    }
  }
  if (out.length === 0 && amount > 0) out.push(CHIP_DENOMS[0]!);
  return out;
}

export const chipClass = (denom: Cents): string => `sim-chip sim-chip-${denom}`;

/** One chip face centred on (0, 0). */
export function ChipFace({ denom, r }: { denom: Cents; r: number }) {
  const ring = r * 0.82;
  const dash = (2 * Math.PI * ring) / 12;
  const label = chipLabel(denom);
  return (
    <g class={chipClass(denom)}>
      <circle r={r} class="sim-chip-body" />
      <circle
        r={ring}
        class="sim-chip-edge"
        stroke-width={r * 0.2}
        stroke-dasharray={`${dash * 0.5} ${dash * 0.5}`}
      />
      <circle r={r * 0.6} class="sim-chip-face" />
      <text
        y={r * 0.2}
        text-anchor="middle"
        font-size={r * (label.length > 2 ? 0.5 : 0.62)}
        class="sim-chip-text"
      >
        {label}
      </text>
    </g>
  );
}

export interface ChipStackProps {
  /** Centre of the bottom chip. */
  x: number;
  y: number;
  amount: Cents;
  r: number;
  /** Show the amount pill under the stack. */
  pill?: boolean;
  class?: string;
}

const STACK_LIMIT = 4;

/** Up to four chips (biggest at the bottom) plus an amount pill. Decorative: the spot names it. */
export function ChipStack({ x, y, amount, r, pill = true, class: cls }: ChipStackProps) {
  const chips = chipBreakdown(amount, STACK_LIMIT).reverse();
  const step = Math.max(2.5, r * 0.18);
  const text = money(amount);
  const ph = Math.max(14, r * 0.8);
  const pw = Math.max(r * 1.6, text.length * ph * 0.56 + ph * 0.6);
  return (
    <g
      class={`sim-stack${cls ? ' ' + cls : ''}`}
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
      data-amount={amount}
    >
      {chips.map((d, i) => (
        <g key={i} transform={`translate(0 ${-i * step})`}>
          <ChipFace denom={d} r={r} />
        </g>
      ))}
      {pill ? (
        <g transform={`translate(0 ${r + ph / 2 + 1})`}>
          <rect x={-pw / 2} y={-ph / 2} width={pw} height={ph} rx={ph / 2} class="sim-pill" />
          <text y={ph * 0.33} text-anchor="middle" font-size={ph * 0.72} class="sim-pill-text">
            {text}
          </text>
        </g>
      ) : null}
    </g>
  );
}
