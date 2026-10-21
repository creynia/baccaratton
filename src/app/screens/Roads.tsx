import { useMemo, useState } from 'preact/hooks';
import { Scoreboard, applyAction, createGame, parseRoadString } from '../../sim';
import type { GameState, RoadEntry } from '../../sim';
import { Link } from '../components/Link';
import { useContent } from '../context';
import { safe } from '../bets';

/** Shown while the engine cannot deal yet (and as the first screenful for a fixed seed). */
const DEMO = 'B Bbp P5 P Pn9 T B B B P Bp B Tn8 P P P B Pb B';
const SEED = 20_261_021;
const FALLACY_LESSON = 'roads-and-streaks';

/** Deals `n` more no-money hands (D20) on the real engine; null while the engine is a stub. */
function dealMore(state: GameState, n: number): GameState | null {
  return safe(() => {
    let s = state;
    for (let i = 0; i < n; i++) {
      const r = applyAction(s, { type: 'deal' });
      if (!r.ok) break;
      s = r.state;
    }
    return s;
  });
}

/**
 * Roads explainer (`#/roads`, no tab): the Bead plate and Big Road drawn by the real ui/Scoreboard
 * from a seeded shoe, "Deal 10 more", how ties and pairs are marked, and the derived roads,
 * which are explained only (D4).
 */
export function Roads() {
  const hasLesson = useContent().lessons.some((l) => l.id === FALLACY_LESSON);
  const initial = useMemo(() => {
    const g = safe(() => createGame({ seed: SEED, bankroll: 0 }));
    return g ? dealMore(g, 20) : null;
  }, []);
  const [game, setGame] = useState<GameState | null>(initial);
  const entries: readonly RoadEntry[] = game ? game.history : parseRoadString(DEMO);
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Roads</h1>
      <p class="lead">
        The scoreboard records who won each hand of the shoe. It is a record, not a forecast.
      </p>
      <Scoreboard entries={entries} caption="This shoe so far" />
      <p class="row">
        {game ? (
          <button
            type="button"
            class="btn"
            onClick={() => setGame((g) => (g ? (dealMore(g, 10) ?? g) : g))}
          >
            Deal 10 more
          </button>
        ) : (
          <span class="muted" data-testid="roads-demo">
            A sample shoe. Live dealing arrives with the table engine.
          </span>
        )}
      </p>

      <section class="card" aria-labelledby="rd-bead">
        <h2 id="rd-bead">Bead plate</h2>
        <p>
          One circle per hand, in columns of six, top to bottom then left to right: red for Banker,
          blue for Player, green for Tie, each with its letter. A small dot in a corner marks a
          pair: top left for a Banker pair, bottom right for a Player pair.
        </p>
      </section>
      <section class="card" aria-labelledby="rd-big">
        <h2 id="rd-big">Big Road</h2>
        <p>
          Each streak gets its own column: Banker wins in red rings, Player wins in blue rings. A
          new column starts when the winner changes. A long streak turns right along the bottom (the
          "dragon tail"). Ties do not get a cell: a green slash goes through the last ring, with a
          number when there was more than one.
        </p>
      </section>
      <section class="card" aria-labelledby="rd-derived">
        <h2 id="rd-derived">Derived roads (explained only)</h2>
        <p>
          Casinos also show the Big Eye Boy, the Small Road and the Cockroach Pig. Each compares the
          Big Road's columns with the ones one, two or three columns earlier and marks "repeat"
          (red) or "change" (blue). They are patterns of patterns: the cards do not read them.
        </p>
      </section>
      <section class="card tip" aria-labelledby="rd-honest">
        <h2 id="rd-honest">Past results don't change the next hand</h2>
        <p>
          Every hand comes from the same shoe with the same drawing rules. A run of six Bankers does
          not make Player "due", and betting with the streak does not help either: the house edge of
          every bet stays the same, whatever the road shows.
        </p>
        {hasLesson && (
          <p>
            <Link to={`/learn/${FALLACY_LESSON}`}>The gambler's fallacy lesson</Link>
          </p>
        )}
      </section>
    </div>
  );
}
