import './sim.css';
import type { TrackerView } from '../math/types';
import { TierBadge } from './TierBadge';
import { BET_LABEL, fracNeg, pct, pctSigned, tierOfEdge, toNum } from './text';

export interface ShoeTrackerProps {
  view: TrackerView;
  onClose?: () => void;
}

const VALUE_LABEL = ['0 (10 J Q K)', '1 (A)', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The Shoe tracker (D6, off by default): the exact EV of every bet for the cards left, next to the
 * full-shoe value. A positive value is badged "Edge to you", as information, never a
 * recommendation (curriculum.md §8.5).
 */
export function ShoeTracker({ view, onClose }: ShoeTrackerProps) {
  const max = Math.max(1, ...view.unseenByValue);
  return (
    <section class="sim-tracker" aria-label="Shoe tracker" data-testid="shoe-tracker">
      <header class="sim-ev-head">
        <h3>Shoe tracker</h3>
        {onClose ? (
          <button type="button" class="sim-btn" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>
      <p class="sim-muted">
        {view.nextHandNewShoe
          ? 'The next hand starts a new shoe, so these are the full-shoe values.'
          : `Exact for the ${view.cardsLeft} cards left in this shoe.`}
      </p>
      <table class="sim-tracker-table">
        <thead>
          <tr>
            <th scope="col">Bet</th>
            <th scope="col" class="num">
              Full shoe
            </th>
            <th scope="col" class="num">
              This shoe
            </th>
            <th scope="col" class="num">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => {
            const d = toNum(r.delta);
            return (
              <tr key={r.bet} class={r.positive ? 'is-positive' : undefined} data-bet={r.bet}>
                <th scope="row">
                  {BET_LABEL[r.bet]}
                  {r.positive ? (
                    <>
                      {' '}
                      <TierBadge tier={tierOfEdge(fracNeg(r.ev))} tracker />
                    </>
                  ) : null}
                </th>
                <td class="num">{pct(r.fullShoeEv)}</td>
                <td class="num">
                  <strong>{pctSigned(r.ev)}</strong>
                </td>
                <td class="num">{pctSigned(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="sim-tracker-values" aria-label="Unseen cards by value">
        {view.unseenByValue.map((n, v) => (
          <div key={v} class="sim-tracker-value">
            <span
              class="sim-tracker-bar"
              style={`transform:scaleY(${n / max})`}
              aria-hidden="true"
            />
            <span class="sim-tracker-n">{n}</span>
            <span class="sim-tracker-v" title={VALUE_LABEL[v]}>
              {v}
            </span>
          </div>
        ))}
      </div>
      <p class="sim-muted">
        EV per $1 bet. A bet with the edge to you is rare, small and late in the shoe; casinos limit
        it (lesson 17).
      </p>
    </section>
  );
}
