import { Scoreboard, parseRoadString } from '../../sim';
import type { RoadsBlockData } from '../../content/types';
import { safe } from '../bets';

/** A ```roads block: a static Bead plate / Big Road (ui/Scoreboard) from the results string. */
export function RoadsBlock(props: { roads: RoadsBlockData }) {
  const { results, view, caption } = props.roads;
  const entries = safe(() => parseRoadString(results)) ?? [];
  return (
    <div class="roads-block">
      <Scoreboard entries={entries} view={view} {...(caption ? { caption } : {})} />
    </div>
  );
}
