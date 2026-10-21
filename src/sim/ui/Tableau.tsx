export type TableauView = 'player' | 'banker' | 'both';

export interface TableauProps {
  view: TableauView;
  /** Cells to highlight: `B<0-7>-P<0-9|none>` for the Banker table, `P<0-9>` for the Player rule. */
  highlight?: readonly string[];
  /** Makes cells tappable (Rules screen: open a Drill or a forced deal on that cell). */
  onCell?: (cell: string) => void;
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
