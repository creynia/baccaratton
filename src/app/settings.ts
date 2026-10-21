import { DEFAULT_SIM_SETTINGS } from '../sim';
import type { SimSettings } from '../sim';

/** Persisted settings (architecture.md section 2.4). App-only fields extend the sim's. */
export interface Settings extends SimSettings {
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  defaultBankrollCents: number; // default 50_000 ($500)
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_SIM_SETTINGS,
  theme: 'system',
  reduceMotion: false,
  defaultBankrollCents: 50_000,
};
