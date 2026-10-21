// Exact EV (simulator.md section 2). Signatures are the contract; bodies are TODO(math).
import type { TableRules, VisibleView } from '../engine/types';
import type {
  BetEv,
  BetTier,
  Fraction,
  OutcomeDistribution,
  PreviewRequest,
  SlipPreview,
  TrackerView,
} from './types';

export type * from './types';

const todo = (name: string): never => {
  throw new Error(`TODO(math): ${name}`);
};

/** The tableau enumeration over unseen cards by rank (13 entries). Memoised by key. */
export function outcomeDistribution(_unseenRanks: readonly number[]): OutcomeDistribution {
  return todo('outcomeDistribution');
}
export function betEvs(_dist: OutcomeDistribution, _rules: TableRules): BetEv[] {
  return todo('betEvs');
}
/** Memoised; equals the pinned values of simulator.md section 2.5 in tests. */
export function fullShoeEvs(_rules: TableRules): BetEv[] {
  return todo('fullShoeEvs');
}
/** Synchronous: the EV sheet, the slip, the alternative and `needsConfirm`. */
export function previewSlip(_req: PreviewRequest): SlipPreview {
  return todo('previewSlip');
}
/** Shoe tracker (D6): current-shoe EVs next to the full-shoe ones. */
export function shoeTracker(_view: VisibleView): TrackerView {
  return todo('shoeTracker');
}
/** decisions.md D19: free <= 0 < good <= 2% < fair <= 5% < costly < 9% <= sucker. */
export function betTier(_edge: Fraction): BetTier {
  return todo('betTier');
}
export function perHourCents(_evCents: Fraction, _handsPerHour: number): Fraction {
  return todo('perHourCents');
}
