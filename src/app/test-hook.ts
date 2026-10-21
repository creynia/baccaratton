// Test hook for e2e (architecture.md section 11): the store and the version. The app WP adds a
// `deal(seed)` smoke once the engine lands.
import { Store } from './store';

export interface BaccaratTestHook {
  version: string;
  buildSha: string;
  singleFile: boolean;
  store?: Store;
}

export function installTestHook(store: Store): void {
  window.__baccaratton = {
    version: __APP_VERSION__,
    buildSha: __BUILD_SHA__,
    singleFile: __SINGLE_FILE__,
    store,
  };
}
