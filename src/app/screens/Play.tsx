import { Simulator } from '../../sim';
import { useStore } from '../context';
import { getEvClient } from '../evClient';
import { simSettings } from '../theme';

/**
 * The sandbox (`#/play`). The query (`?seed= ?shoe= ?variant= ?tie= ?system= ?speed=`) goes to
 * the Simulator, which parses and validates it; a preset deal never overwrites the saved session.
 */
export function Play({ query }: { query: URLSearchParams }) {
  const store = useStore();
  const preset = [...query.keys()].length > 0;
  return (
    <div class="page page-wide">
      <h1 class="sr">Practice table</h1>
      <Simulator
        key={query.toString()}
        mode="sandbox"
        settings={simSettings(store.settings)}
        evClient={getEvClient()}
        query={query}
        {...(preset ? {} : { persistKey: 'baccaratton:sandbox' })}
      />
      <p class="muted">
        <a href="#/rules" class="inline-link">
          Drawing rules
        </a>{' '}
        ·{' '}
        <a href="#/bets" class="inline-link">
          Bets & paytables
        </a>
      </p>
    </div>
  );
}
