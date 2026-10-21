import { useState } from 'preact/hooks';
import { UPDATE_MESSAGE, checkForUpdates, updatesSupported } from '../update';
import type { UpdateCheck } from '../update';

/** "Check for updates" (Settings and About). The single offline file has no update path. */
export function CheckUpdates(props: {
  check?: () => Promise<UpdateCheck>;
  supported?: () => boolean;
}) {
  const check = props.check ?? checkForUpdates;
  const supported = (props.supported ?? updatesSupported)();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="check-updates">
      <button
        type="button"
        class="btn"
        disabled={busy || !supported}
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
      <p role="status" class="muted" data-testid="update-status">
        {supported ? msg : UPDATE_MESSAGE.unsupported}
      </p>
    </div>
  );
}
