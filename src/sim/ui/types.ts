// ===== src/sim/ui/types.ts — WP0 (baton) =====
import type { Cents, TiePays, VariantId } from '../engine/types';

export interface SimSettings {
  variant: VariantId; // default 'punto-banco' (D13)
  tiePays: TiePays; // default 8 (D2)
  animationSpeed: 'normal' | 'fast' | 'instant'; // OS reduced motion forces 'instant'
  fourColorDeck: boolean; // default false
  unitCents: Cents; // default 1_000 ($10): per-hour lines and units
  handsPerHour: number; // default 72 (D5)
  confirmCostlyBets: boolean; // default true: sucker-tier bets need a second tap
  practice: boolean; // default false: hide EV until the hand settles
  shoeTracker: boolean; // default false (D6)
  showRoads: boolean; // default true: Bead plate + Big Road strip in Play
}
export const DEFAULT_SIM_SETTINGS: SimSettings = {
  variant: 'punto-banco',
  tiePays: 8,
  animationSpeed: 'normal',
  fourColorDeck: false,
  unitCents: 1_000,
  handsPerHour: 72,
  confirmCostlyBets: true,
  practice: false,
  shoeTracker: false,
  showRoads: true,
};
/** Session panel figures (D35), computed by the container from SessionStats + full-shoe EVs. */
export interface SessionSummary {
  hands: number;
  totalBet: Cents;
  expectedCents: number; // Σ bet × full-shoe EV (display; exact sum kept as a Fraction in math)
  actualCents: Cents;
  luckCents: number; // actual − expected
  averageEdge: number; // Σ expected ÷ Σ bet, as a fraction (0.0109)
  bankerOnlyEdge: number; // the variant's Banker edge, for the comparison line
  commissionPaid: Cents;
}
