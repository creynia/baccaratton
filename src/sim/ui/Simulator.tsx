import type { Action, GameEvent, GameState, HandResult } from '../engine/types';
import type { EvClient } from '../jobs/protocol';
import type { SceneConfig } from '../scene/types';
import type { SimSettings } from './types';

// The container's props and events (architecture.md section 2.3). The integration WP owns this
// file and may refine these; `SimSettings` lives in ui/types.ts (a baton, D37).
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
  /** Sandbox query (`?seed=`, `?shoe=`, `?variant=`, `?tie=`, `?system=`, `?speed=`; D33). */
  query?: URLSearchParams;
}

/** Placeholder until the integration WP wires engine + math + jobs + UI + scenes. */
export function Simulator(props: SimulatorProps) {
  return (
    <section class="sim-placeholder card" data-testid="simulator" aria-label="Table">
      <h2>Table</h2>
      <p>The practice table is coming soon.</p>
      <p class="muted">
        {props.mode === 'scene' ? 'Lesson scene' : 'Sandbox'} · {props.settings.variant}
      </p>
    </section>
  );
}
