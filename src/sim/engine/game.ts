// Game state machine (simulator.md section 1.2). Signatures are the contract; bodies are TODO(engine).
import type {
  Action,
  ActionType,
  ApplyResult,
  Cents,
  ForcedHand,
  GameState,
  RoadEntry,
  ShoeSetup,
  Slip,
  TableRules,
  VisibleView,
} from './types';

export interface CreateGameOptions {
  rules?: Partial<TableRules>;
  bankroll?: Cents;
  seed?: number;
  bets?: Slip;
  forced?: ForcedHand[];
  shoe?: ShoeSetup;
  history?: RoadEntry[];
}

const todo = (name: string): never => {
  throw new Error(`TODO(engine): ${name}`);
};

export function createGame(_opts?: CreateGameOptions): GameState {
  return todo('createGame');
}
export function applyAction(_state: GameState, _action: Action): ApplyResult {
  return todo('applyAction');
}
export function replay(_initial: GameState, _actions: readonly Action[]): GameState {
  return todo('replay');
}
export function visibleView(_state: GameState): VisibleView {
  return todo('visibleView');
}
/** bankroll + chips on the felt. */
export function equity(_state: GameState): Cents {
  return todo('equity');
}
export function legalActions(_state: GameState): ActionType[] {
  return todo('legalActions');
}
/** Scenes: replaces the forced-hand queue. */
export function queueForced(_state: GameState, _hands: readonly ForcedHand[]): GameState {
  return todo('queueForced');
}
/** Scenes: reshuffle now (event-free). */
export function startShoe(_state: GameState, _setup: ShoeSetup | 'fresh'): GameState {
  return todo('startShoe');
}
