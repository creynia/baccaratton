// Service worker registration + update flow. No-op in dev, in the single-file build,
// and on file:// / content:// (protocol check).
//
// Hook API for the app (architecture.md §5.2):
// - registerSW()             main.tsx, once.
// - <UpdateToast />          "Update available — Reload" (./UpdateToast).
// - updatesSupported()       false in the offline file, dev and file://: Settings can hide or
//                            disable "Check for updates" and say "Download a new copy instead".
// - checkForUpdates()        Settings → "Check for updates"; resolves to an UpdateCheck:
//                            'update-available' (toast shown too), 'up-to-date', 'unsupported'
//                            (see updatesSupported()), or 'failed' (offline, sw.js fetch error,
//                            the new worker failed to install, or no result within 30 s).
// - onUpdateAvailable(fn)    for a custom prompt; fn(apply) where apply() reloads into the update.
// - __BUILD_SHA__            the build code shown in About (also on window.__baccaratton).

type UpdateListener = (apply: () => void) => void;

let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateListener>();

function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING');
}

function notify(worker: ServiceWorker): void {
  waiting = worker;
  listeners.forEach((l) => l(applyUpdate));
}

/** Subscribe to "a new version is ready"; call `apply()` to activate it (page then reloads). */
export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (waiting) listener(applyUpdate);
  return () => listeners.delete(listener);
}

/** True when this copy can update itself through a service worker (hosted PWA build only). */
export function updatesSupported(): boolean {
  if (__SINGLE_FILE__ || import.meta.env.DEV) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  return location.protocol === 'https:' || location.protocol === 'http:';
}

/** Result of checkForUpdates(); see the header comment. */
export type UpdateCheck = 'unsupported' | 'update-available' | 'up-to-date' | 'failed';

/**
 * Settings → "Check for updates". Asks the browser to re-fetch sw.js and resolves with the
 * outcome ('unsupported' in dev, the single-file build, file:// and browsers without SW).
 * When an update is found the onUpdateAvailable listeners fire (toast), as for the automatic check.
 */
const CHECK_TIMEOUT_MS = 30_000;

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!updatesSupported()) return 'unsupported';
  try {
    // Called before the load-time registration finished: use the existing registration.
    registration ??= (await navigator.serviceWorker.getRegistration()) ?? null;
    if (!registration) return 'unsupported';
    await registration.update();
    // A newer installing worker beats an older waiting one.
    const found = registration.installing ?? registration.waiting;
    if (!found || !navigator.serviceWorker.controller) return 'up-to-date';
    if (found.state === 'installed') {
      notify(found);
      return 'update-available';
    }
    const settled = await new Promise<'installed' | 'redundant' | 'timeout'>((done) => {
      const timer = setTimeout(() => done('timeout'), CHECK_TIMEOUT_MS);
      const onChange = () => {
        if (found.state !== 'installed' && found.state !== 'redundant') return;
        clearTimeout(timer);
        found.removeEventListener('statechange', onChange);
        done(found.state);
      };
      found.addEventListener('statechange', onChange);
      onChange();
    });
    if (settled !== 'installed') return 'failed';
    notify(found);
    return 'update-available';
  } catch {
    return 'failed';
  }
}

export function registerSW(): void {
  // Literal guard (not only updatesSupported()) so the bundler drops the registration code from
  // the single-file build entirely; finalize-single fails if `serviceWorker.register` survives.
  if (__SINGLE_FILE__ || import.meta.env.DEV) return;
  if (!updatesSupported()) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return; // first claim on a fresh install: don't reload
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notify(installing);
            }
          });
        });
      })
      .catch(() => {
        /* offline support is best-effort */
      });
  });
}
