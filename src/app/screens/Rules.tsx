import { Tableau, TABLEAU } from '../../sim';
import type { TableauCellId } from '../../sim';
import { Link } from '../components/Link';
import { useContent } from '../context';
import { navigate } from '../router';
import { bankerRowText, describeCell, drillModeForCell, isCell } from '../tableauText';

/**
 * Drawing rules (`#/rules`, no tab): card values, naturals, the Player rule and the Banker
 * tableau, all generated from the engine's TABLEAU / playerDraws / bankerDraws.
 * `?highlight=<TableauCellId>` deep-links a cell (D34); tapping a cell opens a Drill on it.
 */
const RULES_LESSON = 'banker-third-card-table';

export function Rules({ query }: { query: URLSearchParams }) {
  const hasLesson = useContent().lessons.some((l) => l.id === RULES_LESSON);
  const highlight = (query.get('highlight') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && isCell(c));
  const drillHref = (cell: TableauCellId) =>
    `/drill?mode=${drillModeForCell(cell)}&focus=${encodeURIComponent(cell)}`;
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Drawing rules</h1>
      <p class="lead">
        Nobody decides anything at the table: the dealer applies these rules to both hands.
      </p>
      {highlight.length > 0 && (
        <section class="card highlight-note" data-testid="highlight" aria-label="Highlighted cell">
          {highlight.map((c) => (
            <p key={c}>
              <strong>{describeCell(c)}</strong>{' '}
              <Link to={drillHref(c)} class="inline-link">
                Drill this cell
              </Link>
            </p>
          ))}
        </section>
      )}
      <Tableau view="full" highlight={highlight} onCell={(cell) => navigate(drillHref(cell))} />

      <section class="card" aria-labelledby="r-values">
        <h2 id="r-values">Card values and totals</h2>
        <ul>
          <li>An ace counts 1, two to nine count their face value.</li>
          <li>A ten-value card (10, J, Q, K) counts 0.</li>
          <li>
            A hand's total is the sum, last digit only: 7 + 8 = 15, so the total is 5. Totals run 0
            to 9.
          </li>
        </ul>
      </section>

      <section class="card" aria-labelledby="r-natural">
        <h2 id="r-natural">Naturals</h2>
        <p>
          If either hand has 8 or 9 on its first two cards, that is a natural: both hands stand and
          the higher total wins.
        </p>
      </section>

      <section class="card" aria-labelledby="r-player">
        <h2 id="r-player">The Player</h2>
        <p>The Player draws a third card on 0 to 5 and stands on 6 or 7.</p>
      </section>

      <section class="card" aria-labelledby="r-banker">
        <h2 id="r-banker">The Banker</h2>
        <p>If the Player stood, the Banker uses the same rule: draw on 0 to 5, stand on 6 or 7.</p>
        <p>If the Player drew a third card, it depends on that card:</p>
        <ul data-testid="banker-rows">
          {TABLEAU.map((_row, b) => (
            <li key={b}>{bankerRowText(b)}</li>
          ))}
        </ul>
        <p class="muted">A ten-value third card counts 0.</p>
      </section>

      <p class="row">
        <Link to="/drill" class="btn">
          Practise in the Drill
        </Link>
        {hasLesson && (
          <Link to={`/learn/${RULES_LESSON}`} class="btn btn-ghost">
            The lesson
          </Link>
        )}
      </p>
    </div>
  );
}
