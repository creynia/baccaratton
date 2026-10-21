import { Tableau } from '../../sim';
import type { TableauBlockData } from '../../content/types';
import { describeCell } from '../tableauText';
import { Link } from './Link';

/** A ```tableau block: the drawing-rule chart (ui/Tableau) plus the highlighted cells in words. */
export function TableauBlock(props: { tableau: TableauBlockData }) {
  const { view, highlight = [] } = props.tableau;
  return (
    <div class="tableau-block" data-view={view}>
      <Tableau view={view} highlight={highlight} />
      {highlight.length > 0 && (
        <ul class="plain cell-notes">
          {highlight.map((c) => (
            <li key={c}>{describeCell(c)}</li>
          ))}
        </ul>
      )}
      <p class="muted">
        <Link to={highlight[0] ? `/rules?highlight=${highlight[0]}` : '/rules'}>
          Open the full drawing rules
        </Link>
      </p>
    </div>
  );
}
