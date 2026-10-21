import type { TableauCellId } from '../strategy/types';

export type TableauView = 'player' | 'banker' | 'full';

export interface TableauProps {
  view: TableauView;
  /** Cells to highlight (D34 `TableauCellId`): `b4/p7`, `b6/s` (Player stood), `p5` (Player rule). */
  highlight?: readonly TableauCellId[];
  /** Makes cells tappable (Rules screen: open a Drill or a forced deal on that cell). */
  onCell?: (cell: TableauCellId) => void;
}

/** Placeholder for the drawing-rule chart, generated later from the engine's TABLEAU. */
export function Tableau(props: TableauProps) {
  return (
    <figure class="tableau card" data-view={props.view} aria-label="Drawing rules">
      <figcaption>Drawing rules</figcaption>
      <p class="muted">Coming soon.</p>
    </figure>
  );
}
