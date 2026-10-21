/// <reference types="vite/client" />

declare const __SINGLE_FILE__: boolean;
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;

declare module 'virtual:content' {
  const bundle: import('./content/types').ContentBundle;
  export default bundle;
}

interface Window {
  /** Test hook for e2e (src/app/test-hook.ts). */
  __baccaratton?: import('./app/test-hook').BaccaratTestHook;
}
