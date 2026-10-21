import { createStorage, load, save } from './storage';
import type { KeyValueStorage } from './storage';
import type { Settings } from './settings';

const SAVE_DELAY_MS = 300;

/** App state with a tiny subscribe API; `save` is debounced, `flush` writes now. */
export class Store {
  settings: Settings;
  /** False when storage is blocked (private window, file://): progress lives in memory only. */
  readonly persistent: boolean;
  private readonly storage: KeyValueStorage;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(storage?: { storage: KeyValueStorage; persistent: boolean }) {
    const s = storage ?? createStorage();
    this.storage = s.storage;
    this.persistent = s.persistent;
    this.settings = load(this.storage).settings;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.changed();
  }

  flush(): void {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    this.dirty = false;
    save(this.storage, { version: 1, settings: this.settings });
  }

  private changed(): void {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    this.listeners.forEach((l) => l());
  }
}
