import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DRILL_CATEGORY_IDS,
  DRILL_MODES,
  DRILL_MODE_CATEGORIES,
  Tableau,
  cardCode,
  gradeCopy,
  gradeSpot,
  modeOf,
  nextSpot,
  spotFromCode,
} from '../../sim';
import type {
  Card,
  DrillCategoryId,
  DrillFilter,
  DrillGrade,
  DrillMode,
  DrillSpot,
  RngState,
} from '../../sim';
import { HandPair } from '../components/Cards';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { isCell } from '../tableauText';

/** The strategy module's drill API (frozen types); tests pass fakes. */
export interface DrillDeps {
  nextSpot(rng: RngState, filter: DrillFilter): { spot: DrillSpot; rng: RngState };
  gradeSpot(spot: DrillSpot, chosen: string): DrillGrade;
  spotFromCode(code: string): DrillSpot;
}
export const defaultDrillDeps: DrillDeps = { nextSpot, gradeSpot, spotFromCode };

export const MODE_LABEL: Record<DrillMode, string> = {
  mixed: 'Mixed',
  player: 'Player',
  banker: 'Banker',
  winner: 'Who wins',
  payout: 'Payouts',
};

export const CATEGORY_LABEL: Record<DrillCategoryId, string> = {
  'hand-total': 'Hand totals',
  natural: 'Naturals',
  'player-draw': 'Player draws',
  'banker-player-stood': 'Player stood',
  'banker-0-2': 'Banker 0–2',
  'banker-3': 'Banker 3',
  'banker-4': 'Banker 4',
  'banker-5': 'Banker 5',
  'banker-6': 'Banker 6',
  'banker-7': 'Banker 7',
  'banker-mixed': 'Any Banker',
  'who-wins': 'Who wins',
  settle: 'Payouts',
  'which-bet': 'Which bet?',
};

/** Categories a mode drills ('mixed': all 14). */
export function categoriesOf(mode: DrillMode): readonly DrillCategoryId[] {
  return mode === 'mixed' ? DRILL_CATEGORY_IDS : DRILL_MODE_CATEGORIES[mode];
}

export interface DrillQuery {
  mode: DrillMode;
  category?: DrillCategoryId;
  focus?: 'misses' | string[];
}

/** `?mode=`, `?cat=` (one category, D29) and `?focus=misses | <TableauCellId,...>`. */
export function parseDrillQuery(q: URLSearchParams): DrillQuery {
  const m = q.get('mode');
  const c = q.get('cat');
  const f = q.get('focus');
  const category = (DRILL_CATEGORY_IDS as readonly string[]).includes(c ?? '')
    ? (c as DrillCategoryId)
    : undefined;
  let mode: DrillMode = (DRILL_MODES as readonly string[]).includes(m ?? '')
    ? (m as DrillMode)
    : category
      ? modeOf(category)
      : 'mixed';
  if (category && mode !== 'mixed' && !categoriesOf(mode).includes(category))
    mode = modeOf(category);
  const out: DrillQuery = { mode, ...(category ? { category } : {}) };
  if (f === 'misses') out.focus = 'misses';
  else if (f) {
    const cells = f.split(',').filter(isCell);
    if (cells.length) out.focus = cells;
  }
  return out;
}

export function drillHref(q: DrillQuery): string {
  const p = new URLSearchParams();
  if (q.mode !== 'mixed') p.set('mode', q.mode);
  if (q.category) p.set('cat', q.category);
  if (q.focus) p.set('focus', q.focus === 'misses' ? 'misses' : q.focus.join(','));
  const s = p.toString().replace(/%2F/g, '/').replace(/%2C/g, ',');
  return s ? `/drill?${s}` : '/drill';
}

/** splitmix32 → the engine's four-word RNG state. */
export function rngFromSeed(seed: number): RngState {
  let x = seed >>> 0;
  const next = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  return { s: [next(), next(), next(), next()] };
}

/** Forced shoe in deal order P1 B1 P2 B2 (P3) (B3), for "Play it out" (`#/play?shoe=`). */
export function shoeParam(player: readonly Card[], banker: readonly Card[]): string {
  const order = [player[0], banker[0], player[1], banker[1], player[2], banker[2]];
  return order
    .filter((c): c is Card => c !== undefined)
    .map(cardCode)
    .join(',');
}

const pctOf = (s?: { answered: number; correct: number }) =>
  s && s.answered ? `${Math.round((100 * s.correct) / s.answered)}%` : '–';

/**
 * Drill (`#/drill`, D11): the third-card-rule trainer. Spots and grading come from
 * strategy/drill.ts; this screen asks, records the answer per category (D29) and links the rule.
 */
export function Drill(props: { query: URLSearchParams; deps?: DrillDeps }) {
  const deps = props.deps ?? defaultDrillDeps;
  const store = useStore();
  const q = parseDrillQuery(props.query);
  const key = drillHref(q);
  const rng = useRef<RngState>(rngFromSeed(Date.now()));
  const missQueue = useRef<string[]>([]);
  const [spot, setSpot] = useState<DrillSpot | null>(null);
  const [grade, setGrade] = useState<DrillGrade | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const deal = () => {
    setGrade(null);
    try {
      if (q.focus === 'misses') {
        const code = missQueue.current.shift();
        if (code === undefined) {
          setSpot(null);
          setReviewDone(true);
          return;
        }
        setSpot(deps.spotFromCode(code));
      } else {
        const filter: DrillFilter = {
          mode: q.mode,
          variant: store.settings.variant,
          ...(q.category ? { category: q.category } : {}),
          ...(q.focus ? { focus: q.focus } : {}),
        };
        const r = deps.nextSpot(rng.current, filter);
        rng.current = r.rng;
        setSpot(r.spot);
      }
      setUnavailable(false);
    } catch {
      setSpot(null);
      setUnavailable(true);
    }
  };
  useEffect(() => {
    missQueue.current = q.focus === 'misses' ? [...store.drill.recentMisses] : [];
    setReviewDone(false);
    deal();
  }, [key]);

  const choose = (option: string) => {
    if (!spot || grade) return;
    try {
      const g = deps.gradeSpot(spot, option);
      store.recordDrill(g.category, g.correct, spot.code);
      setGrade(g);
    } catch {
      setUnavailable(true);
    }
  };

  const d = store.drill;
  const cats = categoriesOf(q.mode);
  const keypad = spot?.category === 'hand-total';
  const copy = grade ? gradeCopy(grade) : null;
  const showRule = grade !== null && grade.rule !== null && grade.cell !== '';
  const statCats = q.mode === 'mixed' ? cats.filter((c) => d.byCategory[c]?.answered) : cats;

  return (
    <div class="page">
      <h1>Drill</h1>
      <p class="muted">Call the hand like a dealer: who draws, who wins, what's paid.</p>
      <nav class="segmented" aria-label="Drill mode">
        {(['mixed', 'player', 'banker', 'winner', 'payout'] as const).map((m) => (
          <Link
            key={m}
            to={drillHref({ mode: m })}
            class="seg"
            aria-current={m === q.mode && !q.focus ? 'page' : undefined}
          >
            {MODE_LABEL[m]}
          </Link>
        ))}
      </nav>
      {q.mode !== 'mixed' && cats.length > 1 && (
        <nav class="chips" aria-label="Category">
          <Link
            to={drillHref({ mode: q.mode })}
            class="chip"
            aria-current={!q.category ? 'page' : undefined}
          >
            All
          </Link>
          {cats.map((c) => (
            <Link
              key={c}
              to={drillHref({ mode: q.mode, category: c })}
              class="chip"
              aria-current={q.category === c ? 'page' : undefined}
            >
              {CATEGORY_LABEL[c]}
            </Link>
          ))}
        </nav>
      )}
      {q.focus === 'misses' && <p class="lead">Reviewing your recent misses.</p>}
      {Array.isArray(q.focus) && (
        <p class="lead">
          Practising one cell of the chart: {q.focus.join(', ')}.{' '}
          <Link to={drillHref({ mode: q.mode })}>All spots</Link>
        </p>
      )}

      <section class="card drill-stats" aria-label="Your drill stats" data-testid="drill-stats">
        <span>
          Streak <strong data-testid="streak">{store.drillStreak}</strong>
        </span>
        <span>
          Best <strong data-testid="best-streak">{d.bestStreak}</strong>
        </span>
        {statCats.map((c) => (
          <span key={c} data-cat={c}>
            {CATEGORY_LABEL[c]} <strong>{pctOf(d.byCategory[c])}</strong>
          </span>
        ))}
      </section>

      {unavailable && (
        <section class="card" data-testid="drill-unavailable" role="status">
          <h2>Spots are on their way</h2>
          <p class="muted">
            The Drill needs the strategy module, which is not part of this build yet. Meanwhile,
            study the <Link to="/rules">drawing rules</Link>.
          </p>
        </section>
      )}

      {reviewDone && (
        <section class="card" role="status" data-testid="review-done">
          <h2>All caught up</h2>
          <p>
            {d.recentMisses.length
              ? `${d.recentMisses.length} spots are still on your misses list.`
              : 'No misses left to review.'}
          </p>
          <Link to={drillHref({ mode: 'mixed' })} class="btn">
            Back to the Drill
          </Link>
        </section>
      )}

      {spot && (
        <section
          class="card drill-spot"
          data-testid="drill-spot"
          data-category={spot.category}
          aria-label="Spot"
        >
          {(spot.player.length > 0 || spot.banker.length > 0) && (
            <HandPair player={spot.player} banker={spot.banker} />
          )}
          {spot.whichBet && (
            <p class="muted">
              {spot.whichBet.table} table: {spot.whichBet.a} or {spot.whichBet.b}
            </p>
          )}
          <h2 class="drill-q">{spot.question}</h2>
          <div class={keypad ? 'keypad' : 'choice-row'} role="group" aria-label="Your answer">
            {spot.options.map((o) => {
              const state = grade
                ? o === grade.answer
                  ? 'right'
                  : o === grade.chosen
                    ? 'wrong'
                    : ''
                : '';
              return (
                <button
                  key={o}
                  type="button"
                  class={`btn ${grade && o !== grade.chosen ? 'btn-ghost' : ''} ${state}`.trim()}
                  disabled={grade !== null}
                  aria-pressed={grade?.chosen === o}
                  onClick={() => choose(o)}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {spot && grade && (
        <section
          class={`card drill-result ${grade.correct ? 'ok' : 'no'}`}
          data-testid="drill-result"
          data-correct={String(grade.correct)}
        >
          <p role="status">
            <strong>{copy?.headline}</strong> {copy?.body}
          </p>
          {showRule && (
            <Tableau
              view={grade.cell.startsWith('b') ? 'banker' : 'player'}
              highlight={[grade.cell]}
            />
          )}
          <div class="row">
            <button type="button" class="btn" onClick={deal}>
              Next
            </button>
            {showRule && (
              <Link to={`/rules?highlight=${grade.cell}`} class="btn btn-ghost">
                See the chart
              </Link>
            )}
            {spot.player.length >= 2 && spot.banker.length >= 2 && (
              <Link to={`/play?shoe=${shoeParam(spot.player, spot.banker)}`} class="btn btn-ghost">
                Play it out
              </Link>
            )}
          </div>
        </section>
      )}

      {q.mode === 'banker' && (
        <section class="card" aria-labelledby="drill-rows" data-testid="banker-rows">
          <h2 id="drill-rows">Your accuracy by Banker row</h2>
          <table class="bets">
            <tbody>
              {DRILL_MODE_CATEGORIES.banker.map((c) => (
                <tr key={c}>
                  <td>{CATEGORY_LABEL[c]}</td>
                  <td class="num">
                    {pctOf(d.byCategory[c])}
                    <span class="muted"> ({d.byCategory[c]?.answered ?? 0})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.recentMisses.length > 0 && q.focus !== 'misses' && (
        <p>
          <Link to={drillHref({ mode: 'mixed', focus: 'misses' })} class="btn btn-ghost">
            Review misses ({d.recentMisses.length})
          </Link>
        </p>
      )}
    </div>
  );
}
