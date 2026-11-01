// "Install app": keeps the browser's deferred install prompt (Chrome on Android) for Home.
import { trackEvent } from './analytics';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenForInstallPrompt(): void {
  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as InstallPromptEvent;
      listeners.forEach((l) => l());
    });
    window.addEventListener('appinstalled', () => {
      trackEvent('install');
      deferred = null;
      listeners.forEach((l) => l());
    });
  } catch {
    /* no window */
  }
}

export const canInstall = () => deferred !== null;

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<void> {
  const d = deferred;
  deferred = null;
  listeners.forEach((l) => l());
  if (d) await d.prompt();
}
