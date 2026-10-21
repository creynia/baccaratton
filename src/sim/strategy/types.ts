// ===== src/sim/strategy/types.ts — FROZEN (payload of jobs/protocol.ts) =====
import type { BetId, Card, CardValue, Cents, HandResult, Slip, TableauRuleId, TiePays,
  VariantId, VisibleView, Winner } from '../engine/types';

export type StrategyLens = 'lowest-edge' | 'practical' | 'fun';
export type StrategyId =
  | 'flat-banker' | 'flat-player' | 'flat-tie'
  | 'martingale' | 'paroli' | 'one-three-two-six' | 'fibonacci' | 'dalembert' | 'labouchere'
  | 'follow-the-shoe' | 'side-bet-sprinkler';
export interface StrategySpec {
  id: StrategyId;
  unit: Cents;                        // e.g. 1_000
  target?: 'banker' | 'player';       // progressions; default 'banker'
  sideBets?: Partial<Record<BetId, Cents>>; // side-bet-sprinkler (and optional on any preset)
  sequence?: number[];                // labouchere
  /** D28 limits; over a limit the system resets to step 1 (dalembert stays at its cap). */
  maxSteps?: number;                  // martingale 7, fibonacci 11 (the 89-unit step)
  maxUnits?: number;                  // dalembert 20
  maxBetUnits?: number;               // labouchere 100
  label?: string;                     // compare-mode legend
}
export interface StrategyMemory { [k: string]: number | string | boolean | number[] }
export interface Strategy {
  id: StrategyId; name: string; lens: StrategyLens;
  init(spec: StrategySpec): StrategyMemory;
  /** Pure. The slip for the next hand (may be empty = sit out). */
  decide(view: VisibleView, mem: StrategyMemory, spec: StrategySpec): Slip;
  /** Pure. Update memory from the settled hand. */
  update(mem: StrategyMemory, spec: StrategySpec, result: HandResult): StrategyMemory;
}

export interface SimulateRequest {
  strategy: StrategySpec;
  compare?: StrategySpec[];           // same seeds → identical cards hand by hand
  variant: VariantId; tiePays: TiePays;
  hands: number;                      // per session, ≤ 20_000
  sessions: number;                   // 1 | 100 (≤ 1_000)
  seed: number;                       // session i uses seed + i
  bankroll: Cents;
  stopAtBust?: boolean;               // default true: bust = the next bet can't be covered (D28)
  stopWin?: Cents; stopLoss?: Cents;
  handsPerHour: number;               // 72
}
export interface SessionSeries {
  strategy: StrategySpec;
  /** sessions = 1: equity after each hand ([0] = start). */
  equity?: Int32Array;
  /** sessions > 1: percentiles of equity per hand (busted sessions hold their final value). */
  p10?: Float64Array; p50?: Float64Array; p90?: Float64Array;
  /** Mean of Σ bet × full-shoe EV, per hand index (the "expected" line). */
  expected: Float64Array;
  survival?: Float64Array;            // share of sessions still playing after hand i
  finals: Int32Array;
  meanFinal: number; meanFinalCi95: number;
  bustRate: number; probAhead: number;
  handsPlayed: number;
  meanBetPerHand: number;             // cents
  costPerHourCents: number;           // edge-weighted, from the bets placed
  capHits: number;                    // resets forced by a D28 limit or the table maximum
  winners: Record<Winner, number>;
  sideBetHits: Partial<Record<BetId, number>>;
}
export interface SimulateResult { series: SessionSeries[]; ms: number }

// ---------- drill (D11: third-card-rule trainer) ----------
export type DrillMode = 'player' | 'banker' | 'winner' | 'payout' | 'mixed';
/** The 14 categories of curriculum.md §9.1 (D29). */
export type DrillCategoryId =
  | 'hand-total' | 'natural' | 'player-draw'
  | 'banker-player-stood' | 'banker-0-2' | 'banker-3' | 'banker-4' | 'banker-5'
  | 'banker-6' | 'banker-7' | 'banker-mixed'
  | 'who-wins' | 'settle' | 'which-bet';
export const DRILL_CATEGORY_IDS: readonly DrillCategoryId[] = [
  'hand-total', 'natural', 'player-draw', 'banker-player-stood', 'banker-0-2', 'banker-3',
  'banker-4', 'banker-5', 'banker-6', 'banker-7', 'banker-mixed', 'who-wins', 'settle', 'which-bet',
];
/** D29: mode → categories ('mixed' draws all 14 in proportion to real play). */
export const DRILL_MODE_CATEGORIES: Readonly<Record<Exclude<DrillMode, 'mixed'>, readonly DrillCategoryId[]>> = {
  player: ['natural', 'player-draw'],
  banker: ['banker-player-stood', 'banker-0-2', 'banker-3', 'banker-4', 'banker-5', 'banker-6',
    'banker-7', 'banker-mixed'],
  winner: ['who-wins'],
  payout: ['settle'],
};
/** One cell-id syntax (D34): 'p5' (player total), 'b4/p7' (banker total / player third), 'b6/s' (player stood), 'nat'. */
export type TableauCellId = string;
export interface DrillSpot {
  code: string;                       // 'banker-5:3h2c6d.Kd5s' (category, player cards, banker cards)
  category: DrillCategoryId;          // D29
  mode: DrillMode;                    // the mode it belongs to ('mixed' for hand-total, which-bet)
  player: readonly Card[];            // shown so far (2, or 3 for banker questions)
  banker: readonly Card[];            // 2 (3 shown only in winner mode)
  cell: TableauCellId;
  question: string;                   // 'Does the Banker draw?'
  options: readonly string[];         // ['Draw', 'Stand'] | ['Player', 'Banker', 'Tie'] | payout amounts
  /** settle only */
  payout?: { bet: BetId; amount: Cents; variant: VariantId; winner: Winner; bankerTotal: CardValue; bankerCards: 2 | 3 };
  /** which-bet only: a pinned spot of curriculum.md §9.3 (labels may name lesson-only bets) */
  whichBet?: { table: string; a: string; b: string; answer: 'a' | 'b'; edgeA: string; edgeB: string };
}
export interface DrillFilter {
  mode: DrillMode;
  category?: DrillCategoryId;         // D29: `?cat=`; must belong to `mode` unless mode is 'mixed'
  focus?: 'misses' | TableauCellId[]; // `?focus=misses` replays persisted misses
  variant?: VariantId;
}
export interface DrillGrade {
  category: DrillCategoryId;
  correct: boolean;
  answer: string; chosen: string;
  rule: TableauRuleId | null;          // null for hand-total, settle, which-bet
  cell: TableauCellId;
  explanation: string;                 // 'Banker 5 draws when the Player's third card is 4–7 (it was 6).'
}
