// Shoe tracker (D6): exact current-shoe EVs next to the full-shoe ones, from what a player can see.
import type { VisibleView } from '../engine/types';
import { fullShoeRanks, outcomeDistribution, valueCounts } from './distribution';
import { fullShoeEvs } from './edges';
import { betEvs } from './evs';
import { sign, sub } from './fraction';
import type { TrackerView } from './types';

/** Shoe tracker (D6): current-shoe EVs next to the full-shoe ones. */
export function shoeTracker(view: VisibleView): TrackerView {
  const { rules } = view;
  const full = fullShoeEvs(rules);
  const ranks = view.nextHandNewShoe ? fullShoeRanks(rules.decks) : view.unseenRanks;
  const current = view.nextHandNewShoe ? full : betEvs(outcomeDistribution(ranks), rules);
  return {
    cardsLeft: ranks.reduce((a, b) => a + b, 0),
    unseenByValue: valueCounts(ranks),
    rows: current.map((e, i) => {
      const fullShoeEv = full[i]!.ev;
      return {
        bet: e.bet,
        ev: e.ev,
        fullShoeEv,
        delta: sub(e.ev, fullShoeEv),
        positive: sign(e.ev) > 0,
      };
    }),
    nextHandNewShoe: view.nextHandNewShoe,
  };
}
