// ===== src/sim/scene/types.ts — FROZEN =====
import type { Action, ActionType, BetId, Cents, ForcedHand, GameEvent, PausePoint,
  RoadEntry, ShoeSetup, TiePays, VariantId, Winner } from '../engine/types';
import type { StrategyId, StrategySpec } from '../strategy/types';

export type RoadId = 'bead-plate' | 'big-road';
/** Things a learner can tap that scenes can wait for (emitted even when set-bet is gated). */
export type TapTarget = BetId | 'commission' | 'bead-plate' | 'big-road' | 'shoe-tracker' | 'ev-sheet' | 'session';
export type PredictKind = 'player-draws' | 'banker-draws' | 'hand-total' | 'winner';
export type HistoryCode = 'B' | 'P' | 'T' | RoadEntry;  // 'B' = banker win, no pairs, total 7

export interface SceneUi {
  orientation?: 'auto' | 'portrait' | 'landscape';
  chips?: Cents[]; defaultChip?: Cents;
  showChipRack?: boolean; showBankroll?: boolean; showSession?: boolean;
  roads?: RoadId[];                   // default ['bead-plate', 'big-road'] when showRoads
  shoeTracker?: boolean;              // default false (D6)
  showSettings?: boolean;             // default false in scenes
  speed?: 'normal' | 'fast' | 'instant';
  compact?: boolean;
}

export interface SceneConfig {
  id: string;                         // 'l07-s1'
  version: 1;
  title?: string;
  variant?: VariantId;                // default 'punto-banco'
  tiePays?: TiePays;
  bankroll?: Cents;                   // default 50_000
  bets?: Partial<Record<BetId, Cents>>; // preset chips on the felt
  seed?: number;                      // default 1 in guided scenes, random in free ones
  shoe?: 'fresh' | ShoeSetup;         // default 'fresh'
  deals?: ForcedHand[];               // scene-level queue (prefer step deals)
  onDealsExhausted?: 'random' | 'block'; // default 'random'
  history?: HistoryCode[];            // prefill the roads (does not touch the shoe)
  allowedActions?: ActionType[];      // default all
  allowedBets?: BetId[];              // default all offered
  highlight?: (BetId | TapTarget)[];
  showEV?: boolean;                   // default true
  evDetail?: 'basic' | 'full';        // basic = edge + badge; full = + alternative + Why?
  whyOpen?: BetId;                    // open "Why?" for this bet
  practice?: boolean;                 // hide EV until the hand settles
  ui?: SceneUi;
  autoPlay?: {
    enabled: boolean;
    strategies?: StrategyId[];
    defaultStrategy?: StrategySpec;
    handOptions?: number[];           // default [72, 720, 7200] (1 h, 10 h, 100 h)
    sessions?: number[];              // default [1, 100]
    compare?: StrategySpec[];         // side-by-side on the same seed
  };
  steps?: SceneStep[];
}

export interface SceneStep {
  id: string;
  text: string;                       // **bold**, _italic_, {{Kh 7d}} inline cards
  hint?: string;                      // after a rejected action, a wrong prediction or 20 s idle
  math?: string;                      // "Show the math" body
  setup?: { bankroll?: Cents; bets?: Partial<Record<BetId, Cents>> };
  /** Replaces the deal queue at step start. Put forced hands ON THE STEP THAT DEALS THEM. */
  deals?: ForcedHand[];
  /** Reshuffle at step start ('fresh' or a rich/poor shoe). */
  shoe?: 'fresh' | ShoeSetup;
  allowedActions?: ActionType[];
  allowedBets?: BetId[];
  highlight?: SceneConfig['highlight'];
  expect?: ActionMatcher[];           // only matching actions are accepted
  /** Staged reveal: stop the deal animation here (with predict, wait for the answer). */
  pauseAt?: PausePoint;
  predict?: { kind: PredictKind; side?: 'player' | 'banker' }; // side for hand-total
  completeWhen: Condition;
  advance?: 'auto' | 'button';        // default 'auto'
  showEV?: boolean;
  ui?: Pick<SceneUi, 'shoeTracker' | 'roads'>;
}

export interface ActionMatcher {
  type: ActionType;
  bet?: BetId | BetId[];              // set-bet only
  amount?: Cents; minAmount?: Cents; maxAmount?: Cents;
}

export type Condition =
  | { all: Condition[] } | { any: Condition[] }
  | { action: ActionMatcher; count?: number }               // accepted since step start
  | { event: GameEvent['type']; count?: number }
  | { hands: number }                                       // hands settled since step start
  | { handResult: { winner?: Winner; natural?: boolean; minNet?: Cents } }
  | { betOnFelt: { bet: BetId; minAmount?: Cents } }
  | { bankrollAtLeast: Cents } | { bankrollAtMost: Cents }  // equity
  | { previewed: { bet?: BetId; whyOpened?: boolean } }     // EV sheet / spot sheet opened on that bet
  | { tapped: TapTarget }
  | { predicted: { correct?: boolean; count?: number; kind?: PredictKind } }
  | { autoPlayCompleted: { minHands?: number; strategy?: StrategyId } }
  | { trackerPositive: { bet?: BetId } }                    // the Shoe tracker shows a +EV bet
  | { acknowledged: true };

export interface SceneRuntime {
  stepIndex: number; stepStartHand: number; counters: Record<string, number>;
  done: boolean; satisfied?: boolean;
}
export type SceneInput =
  | { kind: 'action'; action: Action; events: GameEvent[] }
  | { kind: 'previewed'; bet: BetId; whyOpened: boolean }
  | { kind: 'tapped'; target: TapTarget }
  | { kind: 'predicted'; predict: PredictKind; answer: string; correct: boolean }
  | { kind: 'tracker'; positive: BetId[] }
  | { kind: 'acknowledged' }
  | { kind: 'auto-play-completed'; hands: number; strategy: StrategyId };
