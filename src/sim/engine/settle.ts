import type { Cents, HandRecord, HandResult, Payout, Slip, TableRules } from './types';

const todo = (name: string): never => {
  throw new Error(`TODO(engine): ${name}`);
};

/** win: floor(amount * gross) - ceil(amount * commission); push 0; lose -amount (section 1.5). */
export function profitCents(_amount: Cents, _payout: Payout): Cents {
  return todo('profitCents');
}
export function settleHand(_hand: HandRecord, _bets: Slip, _rules: TableRules): HandResult {
  return todo('settleHand');
}
