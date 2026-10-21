import type { RoadEntry } from '../engine/types';

export type RoadView = 'bead' | 'big';

export interface ScoreboardProps {
  entries: readonly RoadEntry[];
  /** Which roads to draw; default both. */
  view?: readonly RoadView[];
  rows?: number;
  caption?: string;
  /** Tap a road (scenes wait for `tapped: bead-plate | big-road`). */
  onTap?: (road: RoadView) => void;
}

/** Placeholder for the Bead plate and Big Road. */
export function Scoreboard(props: ScoreboardProps) {
  return (
    <figure class="scoreboard card" aria-label="Scoreboard">
      <figcaption>{props.caption ?? 'Scoreboard'}</figcaption>
      <p class="muted">{props.entries.length} hands · coming soon.</p>
    </figure>
  );
}
