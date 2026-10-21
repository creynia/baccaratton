import { useEffect, useState } from 'preact/hooks';
import { canInstall, onInstallChange, promptInstall } from '../install';

/** Shown only when the browser offers to install the app. */
export function InstallButton() {
  const [can, setCan] = useState(canInstall());
  useEffect(() => onInstallChange(() => setCan(canInstall())), []);
  if (!can || __SINGLE_FILE__) return null;
  return (
    <button type="button" class="btn btn-ghost" onClick={() => void promptInstall()}>
      Install app
    </button>
  );
}
