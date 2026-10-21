import { InstallButton } from '../components/InstallButton';
import { Link } from '../components/Link';
import { OfflineLink } from '../components/OfflineLink';
import { ProgressRing } from '../components/ProgressRing';
import { useContent, useStore } from '../context';
import { nextLesson, overallProgress } from '../store';

export function Home() {
  const content = useContent();
  const store = useStore();
  const next = nextLesson(content, store);
  const nextL = content.lessons.find((l) => l.id === next);
  const { done, total } = overallProgress(content, store);
  const started = done > 0 || content.lessons.some((l) => store.status(l.id) === 'progress');
  return (
    <div class="page">
      <section class="hero">
        <ProgressRing done={done} total={total} />
        <div>
          <h1>baccaratton</h1>
          <p class="muted">
            Learn Baccarat from zero to perfect strategy, with a practice table that shows the EV of
            every bet before you confirm it. Nothing here costs real money.
          </p>
        </div>
      </section>
      {nextL ? (
        <Link to={`/learn/${nextL.id}`} class="btn btn-big">
          {started ? 'Continue' : 'Start'}: {nextL.title}
        </Link>
      ) : total > 0 ? (
        <p class="card">All lessons complete. Head to the practice table.</p>
      ) : (
        <p class="card">No lessons yet.</p>
      )}
      <nav class="grid" aria-label="Quick links">
        <Link to="/learn" class="card tile">
          <strong>Learn</strong>
          <span class="muted">All lessons, by chapter</span>
        </Link>
        <Link to="/play" class="card tile">
          <strong>Play</strong>
          <span class="muted">Practice table with the EV of every bet</span>
        </Link>
        <Link to="/drill" class="card tile">
          <strong>Drill</strong>
          <span class="muted">The third-card rule, quick-fire</span>
        </Link>
        <Link to="/bets" class="card tile">
          <strong>Bets</strong>
          <span class="muted">Payouts and house edge of every bet</span>
        </Link>
      </nav>
      <div class="row">
        <OfflineLink />
        <InstallButton />
      </div>
    </div>
  );
}
