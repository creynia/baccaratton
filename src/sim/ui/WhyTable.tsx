import './sim.css';
import type { Fraction, WhyBreakdown } from '../math/types';
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

/** "Why?" (simulator.md §2.6): each deciding outcome, how often, what it pays, what it adds. */
export function WhyTable({ why, edgePerResolved, ev, id }: WhyTableProps) {
  return (
    <div class="sim-why" id={id} data-testid="why-table">
      <table class="sim-why-table">
        <caption>Counted over {why.casesLabel}</caption>
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
                <span class="sim-why-count">
                  {count(r.count)} of {count(r.outOf)}
                </span>
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
          <span class="sim-money">
            {ev.num < 0n ? MINUS : ''}
            {count(ev.num < 0n ? -ev.num : ev.num)}/{count(ev.den)}
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
