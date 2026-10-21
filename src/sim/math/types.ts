// ===== src/sim/math/types.ts — FROZEN =====
import type { BetId, Cents, TableRules, CardValue } from '../engine/types';

/** Exact rational, normalized: den > 0, gcd(|num|, den) = 1. Structured-cloneable. */
export interface Fraction { num: bigint; den: bigint }

/** One cell of the tableau outcome histogram. */
export interface OutcomeCell {
  playerTotal: CardValue; bankerTotal: CardValue;
  playerCards: 2 | 3; bankerCards: 2 | 3;
  /** Number of ordered 6-card sequences (from the unseen cards) that produce this cell. */
  weight: bigint;
}
export interface OutcomeDistribution {
  cardsLeft: number;                 // N unseen cards
  /** N(N−1)(N−2)(N−3)(N−4)(N−5): all ordered sequences of the next six cards. Σ weight = total. */
  total: bigint;
  cells: readonly OutcomeCell[];     // non-zero cells only (205 for any 1–8 deck full shoe)
  /** P(first two cards of a hand have the same rank) = Σ r_k(r_k − 1) / (N(N − 1)). Same for both sides. */
  pPair: Fraction;
  pairCount: bigint;                 // Σ r_k(r_k − 1)
  pairOutOf: bigint;                 // N(N − 1)
}

export type BetTier = 'free' | 'good' | 'fair' | 'costly' | 'sucker';

export interface WhyRow {
  id: string;                        // 'win' | 'push' | 'lose' | 'win-3card-7-push' | 'margin-9' | 'natural-win' …
  label: string;                     // 'Banker wins (you get 0.95)'
  count: bigint;                     // equally likely ordered deals (or card pairs for Pair bets)
  outOf: bigint;
  probability: Fraction;
  /** Net per $1 bet in this row (0.95, 0, −1, 30 …). */
  net: Fraction;
  /** probability × net. Rows sum exactly to ev. */
  contribution: Fraction;
}
export interface WhyBreakdown {
  rows: WhyRow[];
  casesLabel: string;                // 'orderings of the next six cards' | 'two-card starts'
  formula: string;                   // '0.4586 × 0.95 − 0.4462 × 1 = −0.01058'
  note?: string;                     // 'Ties push: excluding ties the edge is 1.17%.'
}

export interface BetEv {
  bet: BetId;
  offered: boolean;
  /** Expected net per $1 bet, per hand (ties push for Player/Banker). */
  ev: Fraction;
  /** House edge per bet placed = −ev (the primary metric). */
  edge: Fraction;
  /** Player/Banker only: edge per resolved bet (ties excluded). */
  edgePerResolved?: Fraction;
  pWin: Fraction; pPush: Fraction; pLose: Fraction;
  /** Standard deviation per $1 (display and charts only). */
  sd: number;
  tier: BetTier;
  why: WhyBreakdown;
}

export interface PreviewRequest {
  rules: TableRules;
  slip: Readonly<Partial<Record<BetId, Cents>>>;
  /** Unseen cards by rank (13). Omit for the full shoe (the EV sheet's default, D6). */
  unseenRanks?: readonly number[];
  handsPerHour: number;              // 72 (D5)
}
export interface SlipLine {
  bet: BetId;
  amount: Cents;
  evCents: Fraction;                 // amount × ev
  perHourCents: Fraction;            // evCents × handsPerHour
  tier: BetTier;
}
export interface Alternative {
  /** The costliest-per-$ bet on the slip that has a cheaper main bet available. */
  from: BetId;
  to: BetId;                          // the lowest-edge offered main bet (banker in punto-banco/ez, player in super-6)
  amount: Cents;                      // same amount moved
  fromEvCents: Fraction; toEvCents: Fraction;
  savingPerHourCents: Fraction;
}
export interface SlipPreview {
  source: 'full-shoe' | 'current-shoe';
  cardsLeft: number;
  /** Every bet the variant offers, BET_IDS order (the EV sheet). */
  sheet: BetEv[];
  lines: SlipLine[];                 // the bets on the slip
  totalWagered: Cents;
  totalEvCents: Fraction;
  perHourCents: Fraction;
  alternative: Alternative | null;
  /** Bets on the slip in the 'sucker' tier: a second tap when confirmCostlyBets is on. */
  needsConfirm: BetId[];
  exact: true;
}

/** Shoe tracker (D6): current-shoe values next to the full-shoe ones. */
export interface TrackerRow {
  bet: BetId;
  ev: Fraction;                      // current shoe
  fullShoeEv: Fraction;
  delta: Fraction;                   // ev − fullShoeEv
  positive: boolean;                 // ev > 0: "the shoe favours this bet right now"
}
export interface TrackerView {
  cardsLeft: number;
  unseenByValue: readonly number[];  // 10 entries, value 0..9
  rows: TrackerRow[];
  nextHandNewShoe: boolean;          // then rows equal the full-shoe values
}
