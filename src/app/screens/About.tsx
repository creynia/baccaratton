import { useState } from 'preact/hooks';
import { Link } from '../components/Link';
import { OfflineLink } from '../components/OfflineLink';
import { UPDATE_MESSAGE, checkForUpdates } from '../update';
import type { UpdateCheck } from '../update';

export function About(props: { check?: () => Promise<UpdateCheck> }) {
  const check = props.check ?? checkForUpdates;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>About</h1>
      <dl class="facts">
        <div>
          <dt>Version</dt>
          <dd data-testid="version">{__APP_VERSION__}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd data-testid="build-sha">{__BUILD_SHA__}</dd>
        </div>
        <div>
          <dt>Copy</dt>
          <dd>{__SINGLE_FILE__ ? 'Offline single file' : 'Web app'}</dd>
        </div>
      </dl>
      <p class="row">
        <button
          type="button"
          class="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setMsg('Checking…');
            void check()
              .catch((): UpdateCheck => 'failed')
              .then((r) => {
                setMsg(UPDATE_MESSAGE[r]);
                setBusy(false);
              });
          }}
        >
          Check for updates
        </button>
        <OfflineLink />
      </p>
      <p role="status" class="muted">
        {msg}
      </p>
      <p>
        baccaratton teaches Punto Banco baccarat: the rules, the odds of every bet and what each one
        costs per hour. It is a practice tool: no real money, ever. Every edge shown is exact for an
        8-deck shoe unless it says "simulated".
      </p>
      <p class="muted">
        MIT licensed. Source and releases:{' '}
        <a href="https://github.com/creynia/baccaratton">github.com/creynia/baccaratton</a>.
      </p>
      <p class="muted">
        Please gamble responsibly. If gambling is causing you or someone you know harm, call
        1-800-GAMBLER (US), visit gamcare.org.uk (UK), or find your national problem-gambling
        helpline.
      </p>
    </div>
  );
}
