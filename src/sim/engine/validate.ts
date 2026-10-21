import type { Action, ForcedHand, GameState, TableRules, Validation } from './types';

const todo = (name: string): never => {
  throw new Error(`TODO(engine): ${name}`);
};

export function validateAction(_state: GameState, _action: Action): Validation {
  return todo('validateAction');
}
/** 2-3 cards per side, third card exactly when the tableau draws (simulator.md section 5.4). */
export function validateForcedHand(_hand: ForcedHand, _rules: TableRules): Validation {
  return todo('validateForcedHand');
}
