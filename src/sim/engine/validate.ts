// Action validation (simulator.md section 1.7). Pure; the first failure wins.
import { betDef, isOffered } from './bets';
import { cardValue, parseCards } from './cards';
import { bankerDraws, handTotal, playerDraws } from './tableau';
import { BET_IDS } from './types';
import type {
  Action,
  BetId,
  Cents,
  ForcedHand,
  GameState,
  Slip,
  TableRules,
  Validation,
  ValidationCode,
} from './types';

const OK: Validation = { ok: true };
const bad = (code: ValidationCode, message: string): Validation => ({ ok: false, code, message });
const dollars = (c: Cents): string => `$${(c / 100).toLocaleString('en-US')}`;

export function slipTotal(slip: Slip): Cents {
  let t = 0;
  for (const id of BET_IDS) t += slip[id] ?? 0;
  return t;
}

/** Limits of one bet: [min, max] in cents. */
export function betLimits(bet: BetId, rules: TableRules): [Cents, Cents] {
  return betDef(bet).limits === 'main'
    ? [rules.mainMin, rules.mainMax]
    : [rules.sideMin, rules.sideMax];
}

function checkAmount(bet: BetId, amount: number, rules: TableRules): Validation {
  if (!(BET_IDS as readonly string[]).includes(bet))
    return bad('not-offered', `There is no "${String(bet)}" bet`);
  if (!isOffered(bet, rules))
    return bad('not-offered', `${betDef(bet).label} is not offered in ${rules.variant}`);
  if (!Number.isInteger(amount) || amount < 0 || amount % rules.betUnit !== 0)
    return bad('bad-amount', `Bets are whole multiples of ${dollars(rules.betUnit)}`);
  if (amount === 0) return OK;
  const [min, max] = betLimits(bet, rules);
  if (amount < min) return bad('below-min', `${betDef(bet).label} minimum is ${dollars(min)}`);
  if (amount > max) return bad('above-max', `${betDef(bet).label} maximum is ${dollars(max)}`);
  return OK;
}

/** The part of `lastBets` that can still be placed (offered bets only). */
export function rebetSlip(state: GameState): Slip {
  const out: Partial<Record<BetId, Cents>> = {};
  for (const id of BET_IDS) {
    const a = state.lastBets[id] ?? 0;
    if (a > 0 && isOffered(id, state.rules)) out[id] = a;
  }
  return out;
}

function checkRebet(state: GameState): Validation {
  const slip = rebetSlip(state);
  if (slipTotal(slip) === 0) return bad('no-last-bets', 'There is no last bet to repeat');
  for (const id of BET_IDS) {
    const a = slip[id];
    if (a === undefined) continue;
    const v = checkAmount(id, a, state.rules);
    if (!v.ok) return v;
  }
  // Rebet replaces what is on the felt, so the felt's chips count as available.
  if (slipTotal(slip) > state.bankroll + slipTotal(state.bets))
    return bad('insufficient-funds', `Not enough chips to rebet ${dollars(slipTotal(slip))}`);
  return OK;
}

export function validateAction(state: GameState, action: Action): Validation {
  switch (action.type) {
    case 'set-bet': {
      const v = checkAmount(action.bet, action.amount, state.rules);
      if (!v.ok) return v;
      const delta = action.amount - (state.bets[action.bet] ?? 0);
      if (delta > state.bankroll)
        return bad(
          'insufficient-funds',
          `Not enough chips: ${dollars(state.bankroll)} in the rack`,
        );
      return OK;
    }
    case 'rebet':
      return checkRebet(state);
    case 'deal': {
      if (action.rebet && slipTotal(state.bets) === 0) {
        const v = checkRebet(state);
        if (!v.ok) return v;
      }
      const head = state.forced[0];
      if (head) {
        const v = validateForcedHand(head, state.rules);
        if (!v.ok) return v;
      }
      return OK;
    }
    case 'clear-bets':
    case 'new-shoe':
      return OK;
    default: {
      // Exhaustive: a new Action type fails to compile here; a malformed one at runtime throws.
      const unknown: never = action;
      throw new Error(`Unknown action "${String((unknown as { type: unknown }).type)}"`);
    }
  }
}

/**
 * 2-3 cards per side, every code parses, at most `decks` copies of a code, and the third cards
 * present exactly when the tableau draws (simulator.md sections 1.7, 5.4).
 */
export function validateForcedHand(hand: ForcedHand, rules: TableRules): Validation {
  const fail = (m: string) => bad('bad-forced-hand', `Forced hand: ${m}`);
  if (!hand || !Array.isArray(hand.player) || !Array.isArray(hand.banker))
    return fail('needs player and banker card lists');
  const one = (c: unknown): number => {
    if (typeof c !== 'string') throw new Error(`${String(c)} is not a card code`);
    const cards = parseCards(c);
    if (cards.length !== 1) throw new Error(`"${c}" is not one card`);
    return cards[0]!;
  };
  let p: number[];
  let b: number[];
  try {
    p = (hand.player as readonly unknown[]).map(one);
    b = (hand.banker as readonly unknown[]).map(one);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (p.length < 2 || p.length > 3) return fail(`the Player has ${p.length} cards (2 or 3)`);
  if (b.length < 2 || b.length > 3) return fail(`the Banker has ${b.length} cards (2 or 3)`);
  const copies = new Map<number, number>();
  for (const c of [...p, ...b]) copies.set(c, (copies.get(c) ?? 0) + 1);
  for (const [c, n] of copies)
    if (n > rules.decks) return fail(`${n} copies of one card in ${rules.decks} deck(s) (${c})`);
  const p2 = handTotal(p.slice(0, 2));
  const b2 = handTotal(b.slice(0, 2));
  const pd = playerDraws(p2, b2);
  if (pd.draws !== (p.length === 3))
    return fail(
      `the Player ${pd.draws ? 'draws' : 'stands'} on ${p2} (${pd.rule}), so ${pd.draws ? '3' : '2'} cards`,
    );
  const bd = bankerDraws(b2, p2, p.length === 3 ? cardValue(p[2]!) : null);
  if (bd.draws !== (b.length === 3))
    return fail(
      `the Banker ${bd.draws ? 'draws' : 'stands'} on ${b2} (${bd.rule}), so ${bd.draws ? '3' : '2'} cards`,
    );
  return OK;
}
