import './sim.css';
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Fraction, WhyBreakdown, WhyRow } from '../math/types';
import { MINUS, count, pct, signedNum } from './text';

export interface WhyTableProps {
  why: WhyBreakdown;
  /** The ties-excluded edge (D32: only here and in More → Bets, never in the headline). */
  edgePerResolved?: Fraction;
  /** The bet's exact EV per $1, shown as a fraction under the table. */
  ev?: Fraction;
  id?: string;
}

const typographic = (s: string) => s.replace(/(^|[\s(=])-(?=\d|\$)/g, `$1${MINUS}`);
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** A long count with a break opportunity after every comma (never mid-group). */
export function breakable(n: bigint | number): ComponentChildren {
  const parts = count(n).split(',');
  return parts.map((p, i) => (
    <>
      {p}
      {i < parts.length - 1 ? (
        <>
          ,<wbr />
        </>
      ) : null}
    </>
  ));
}

/** "≈ 2.29 × 10¹⁵" for counts of 10 million and more; null when the full count is short. */
export function approxCount(n: bigint): string | null {
  if (n < 10_000_000n) return null;
  const s = n.toString();
  const exp = s.length - 1;
  const mant = Number(`${s[0]}.${s.slice(1, 4)}`).toFixed(2);
  const sup = String(exp)
    .split('')
    .map((d) => SUP[Number(d)])
    .join('');
  return `≈ ${mant} × 10${sup}`;
}

function CountCell({ r }: { r: WhyRow }) {
  const [open, setOpen] = useState(false);
  const approx = approxCount(r.count);
  if (!approx) return <span class="sim-why-count is-short">{breakable(r.count)}</span>;
  return (
    <span class="sim-why-count">
      <button
        type="button"
        class="sim-why-approx"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${approx} cases (${pct(r.probability, 4)}); show the exact count`}
      >
        {approx} ({pct(r.probability, 4)})
      </button>
      <span class={`sim-why-full${open ? ' is-open' : ''}`}>{breakable(r.count)}</span>
    </span>
  );
}

/** "Why?" (simulator.md §2.6): each deciding outcome, how often, what it pays. */
export function WhyTable({ why, edgePerResolved, ev, id }: WhyTableProps) {
  const outOf = why.rows[0]?.outOf;
  return (
    <div class="sim-why" id={id} data-testid="why-table">
      <table class="sim-why-table">
        <caption>
          Counted over {outOf !== undefined ? <span class="sim-money">{count(outOf)}</span> : null}{' '}
          {why.casesLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col" class="num">
              Chance
            </th>
            <th scope="col" class="num">
              Net per $1
            </th>
          </tr>
        </thead>
        <tbody>
          {why.rows.map((r) => (
            <tr key={r.id} data-row={r.id}>
              <th scope="row">
                {r.label}
                <CountCell r={r} />
              </th>
              <td class="num">{pct(r.probability, 4)}</td>
              <td class="num">{signedNum(r.net, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="sim-why-formula">{typographic(why.formula)}</p>
      {ev ? (
        <p class="sim-why-exact">
          Exact EV per $1:{' '}
          <span class="sim-why-frac">
            {ev.num < 0n ? MINUS : ''}
            {breakable(ev.num < 0n ? -ev.num : ev.num)}/<wbr />
            {breakable(ev.den)}
          </span>
        </p>
      ) : null}
      {why.note ? <p class="sim-why-note">{why.note}</p> : null}
      {edgePerResolved && !why.note?.includes(pct(edgePerResolved)) ? (
        <p class="sim-why-note" data-testid="why-resolved">
          Counting only decided hands (ties left out): {pct(edgePerResolved)}.
        </p>
      ) : null}
    </div>
  );
}
