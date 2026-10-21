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
  stopAtBust?: boolean;               // default true: bust = equity < the table minimum the system needs
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
  capHits: number;
  winners: Record<Winner, number>;
  sideBetHits: Partial<Record<BetId, number>>;
}
export interface SimulateResult { series: SessionSeries[]; ms: number }

// ---------- drill (D11: third-card-rule trainer) ----------
export type DrillMode = 'player' | 'banker' | 'winner' | 'payout' | 'mixed';
/** A tableau cell: 'p5' (player total), 'b4/p7' (banker total / player third), 'b6/s' (player stood), 'nat'. */
export type TableauCellId = string;
export interface DrillSpot {
  code: string;                       // 'b:3h2c6d.Kd5s' (mode letter, player cards, banker cards)
  mode: Exclude<DrillMode, 'mixed'>;
  player: readonly Card[];            // shown so far (2, or 3 for banker questions)
  banker: readonly Card[];            // 2 (3 shown only in winner mode)
  cell: TableauCellId;
  question: string;                   // 'Does the Banker draw?'
  options: readonly string[];         // ['Draw', 'Stand'] | ['Player', 'Banker', 'Tie'] | payout amounts
  /** payout mode only */
  payout?: { bet: BetId; amount: Cents; variant: VariantId; winner: Winner; bankerTotal: CardValue; bankerCards: 2 | 3 };
}
export interface DrillFilter { mode: DrillMode; focus?: TableauCellId[]; variant?: VariantId; hard?: boolean }
export interface DrillGrade {
  correct: boolean;
  answer: string; chosen: string;
  rule: TableauRuleId | null;          // null in payout mode
  cell: TableauCellId;
  explanation: string;                 // 'Banker 5 draws when the Player's third card is 4–7 (it was 6).'
}
