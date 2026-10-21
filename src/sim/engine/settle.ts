// Settlement in integer cents (simulator.md section 1.5, D15). Pure.
import { betDef } from './bets';
import { BET_IDS } from './types';
import type {
  BetSettlement,
  Cents,
  HandRecord,
  HandResult,
  Payout,
  Slip,
  TableRules,
} from './types';

/** Gross win in cents, rounded DOWN (toward the house). */
export function grossCents(amount: Cents, payout: Payout): Cents {
  if (payout.result !== 'win') return 0;
  return Math.floor((amount * payout.gross[0]) / payout.gross[1]);
}

/** Commission in cents on a win, rounded UP (toward the house); 0 when there is none. */
export function commissionCents(amount: Cents, payout: Payout): Cents {
  if (payout.result !== 'win' || !payout.commission) return 0;
  return Math.ceil((amount * payout.commission[0]) / payout.commission[1]);
}

/**
 * win: floor(amount * gross) - ceil(amount * commission); push 0; lose -amount (section 1.5).
 * With whole-dollar bets and the shipped odds the rounding never fires (registry grid test).
 */
export function profitCents(amount: Cents, payout: Payout): Cents {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Bad amount ${amount}`);
  if (payout.result === 'push') return 0;
  if (payout.result === 'lose') return -amount;
  if (payout.result !== 'win') throw new Error(`Bad payout result "${String(payout.result)}"`);
  return grossCents(amount, payout) - commissionCents(amount, payout);
}

/** Settles one bet on a hand. */
export function settleBet(
  hand: HandRecord,
  bet: BetSettlement['bet'],
  amount: Cents,
  rules: TableRules,
): BetSettlement {
  const payout = betDef(bet).settle(hand.outcome, rules);
  return {
    bet,
    amount,
    result: payout.result,
    profit: profitCents(amount, payout),
    commission: commissionCents(amount, payout),
    reason: payout.reason,
  };
}

/** Settles every placed bet (amount > 0) in BET_IDS order. Pure; validation happens earlier. */
export function settleHand(hand: HandRecord, bets: Slip, rules: TableRules): HandResult {
  const settlements: BetSettlement[] = [];
  let wagered = 0;
  let net = 0;
  for (const id of BET_IDS) {
    const amount = bets[id] ?? 0;
    if (amount <= 0) continue;
    const s = settleBet(hand, id, amount, rules);
    settlements.push(s);
    wagered += amount;
    net += s.profit;
  }
  return { hand, settlements, wagered, net };
}
