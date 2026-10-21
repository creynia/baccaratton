import { Link } from '../components/Link';

export function Home() {
  return (
    <div class="page">
      <section class="hero">
        <div>
          <h1>baccaratton</h1>
          <p class="muted">
            Learn Baccarat from zero to perfect strategy, with a practice table that shows the EV of
            every bet before you confirm it.
          </p>
        </div>
      </section>
      <nav class="grid" aria-label="Quick links">
        <Link to="/learn" class="card">
          Learn
        </Link>
        <Link to="/play" class="card">
          Play
        </Link>
        <Link to="/drill" class="card">
          Drill
        </Link>
        <Link to="/bets" class="card">
          Bets
        </Link>
      </nav>
    </div>
  );
}
