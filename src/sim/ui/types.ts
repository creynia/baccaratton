import type { Action, GameEvent, GameState, HandResult, TiePays, VariantId } from '../engine/types';
import type { EvClient } from '../jobs/protocol';
import type { SceneConfig } from '../scene/types';

/**
 * The settings the simulator reads (architecture.md section 2.4, decisions.md D13: one `variant`
 * field replaces the early `commission` field; `tiePays` is its own setting). The app's Settings
 * extends this. There is deliberately no squeeze and no continuous-shuffle setting (D7, D8).
 */
export interface SimSettings {
  animationSpeed: 'normal' | 'fast' | 'instant';
  fourColorDeck: boolean;
  variant: VariantId;
  tiePays: TiePays;
  /** Cents per betting unit; per-hour lines scale by it. */
  unitCents: number;
  /** D5: 72 for every cost-per-hour figure. */
  handsPerHour: number;
  /** Sucker-tier bets need a second tap (D19). */
  confirmCostlyBets: boolean;
  /** Hide EV until the hand settles. */
  practice: boolean;
  /** D6: live exact current-shoe EV next to the full-shoe EV. Off by default. */
  shoeTracker: boolean;
  /** Bead plate + Big Road strip in Play. */
  showRoads: boolean;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  animationSpeed: 'normal',
  fourColorDeck: false,
  variant: 'punto-banco',
  tiePays: 8,
  unitCents: 1_000,
  handsPerHour: 72,
  confirmCostlyBets: true,
  practice: false,
  shoeTracker: false,
  showRoads: true,
};

export type SimulatorEvent =
  | { type: 'ready' }
  | { type: 'action-confirmed'; action: Action; events: GameEvent[]; state: GameState }
  | { type: 'action-rejected'; action: Action; reason: string }
  | { type: 'hand-settled'; result: HandResult; state: GameState }
  | { type: 'step-started'; stepId: string }
  | { type: 'step-completed'; stepId: string }
  | { type: 'scene-completed'; sceneId: string }
  | { type: 'auto-play-completed'; hands: number; strategy: string };

export interface SimulatorProps {
  scene?: SceneConfig;
  mode?: 'sandbox' | 'scene';
  settings: SimSettings;
  /** Injected; the app creates one EvClient per page. */
  evClient: EvClient;
  onEvent?: (e: SimulatorEvent) => void;
  persistKey?: string;
  /** Sandbox query (`?seed=`, `?shoe=`, `?variant=`, `?system=`, `?speed=`). */
  query?: URLSearchParams;
}
