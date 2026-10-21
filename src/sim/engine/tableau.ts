// The drawing rules of Punto Banco (simulator.md section 1.3). Real in WP0: content validation,
// Drill and the quiz checker all need them. `playHand` deals one hand by these rules.
import { cardValue, rankOf } from './cards';
import type {
  Card,
  CardValue,
  DrawDecision,
  HandCards,
  HandRecord,
  TableauOutcome,
  TableauRuleId,
} from './types';

/** Sum of the card values, last digit only. */
export function handTotal(cards: readonly Card[]): CardValue {
  let sum = 0;
  for (const c of cards) sum += cardValue(c);
  return (sum % 10) as CardValue;
}

/** A natural is a two-card total of 8 or 9. */
export function isNatural(twoCardTotal: CardValue): boolean {
  return twoCardTotal >= 8;
}

function assertTotal(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 0 || n > 9)
    throw new RangeError(`${what} must be 0..9, got ${n}`);
}

/**
 * Does the Player draw? `bankerTotal` is the Banker's two-card total (it only matters for the
 * natural check: a Banker 8 or 9 ends the hand before the Player acts).
 */
export function playerDraws(total: CardValue, bankerTotal: CardValue): DrawDecision {
  assertTotal(total, 'Player total');
  assertTotal(bankerTotal, 'Banker total');
  if (isNatural(total) || isNatural(bankerTotal)) return { draws: false, rule: 'natural' };
  return total <= 5
    ? { draws: true, rule: 'player-0-5-draws' }
    : { draws: false, rule: 'player-6-7-stands' };
}

/**
 * Banker's draw rule as a literal table. Rows: Banker two-card total 0-7. Columns: index 0 is
 * "the Player stood" (no third card); index 1 + p is "the Player's third card has value p"
 * (p = 0..9). `true` = the Banker draws. Matches curriculum.md section 2.2.
 */
export const TABLEAU: readonly (readonly boolean[])[] = [
  // stood, p = 0 1 2 3 4 5 6 7 8 9
  [true, true, true, true, true, true, true, true, true, true, true], // Banker 0
  [true, true, true, true, true, true, true, true, true, true, true], // Banker 1
  [true, true, true, true, true, true, true, true, true, true, true], // Banker 2
  [true, true, true, true, true, true, true, true, true, false, true], // Banker 3 (not on 8)
  [true, false, false, true, true, true, true, true, true, false, false], // Banker 4 (2-7)
  [true, false, false, false, false, true, true, true, true, false, false], // Banker 5 (4-7)
  [false, false, false, false, false, false, false, true, true, false, false], // Banker 6 (6-7)
  [false, false, false, false, false, false, false, false, false, false, false], // Banker 7
];

const BANKER_RULE_AFTER_DRAW: readonly TableauRuleId[] = [
  'banker-0-2-draws',
  'banker-0-2-draws',
  'banker-0-2-draws',
  'banker-3-draws-unless-8',
  'banker-4-draws-on-2-7',
  'banker-5-draws-on-4-7',
  'banker-6-draws-on-6-7',
  'banker-7-stands',
];

/**
 * Does the Banker draw? `bankerTotal` and `playerTotal2` are the two-card totals;
 * `playerThird` is the value of the Player's third card, or null when the Player stood.
 * Throws if the Player must have drawn (total 0-5, no natural) but `playerThird` is null.
 */
export function bankerDraws(
  bankerTotal: CardValue,
  playerTotal2: CardValue,
  playerThird: CardValue | null,
): DrawDecision {
  assertTotal(bankerTotal, 'Banker total');
  assertTotal(playerTotal2, 'Player total');
  if (isNatural(bankerTotal) || isNatural(playerTotal2)) return { draws: false, rule: 'natural' };
  const row = TABLEAU[bankerTotal]!;
  if (playerThird === null) {
    if (playerTotal2 <= 5) throw new RangeError('The Player draws on 0-5, so a third card exists');
    return bankerTotal <= 5
      ? { draws: true, rule: 'banker-player-stood-0-5-draws' }
      : { draws: false, rule: 'banker-player-stood-6-7-stands' };
  }
  if (playerTotal2 > 5) throw new RangeError('The Player stands on 6-7, so there is no third card');
  assertTotal(playerThird, 'Player third card');
  return { draws: row[1 + playerThird]!, rule: BANKER_RULE_AFTER_DRAW[bankerTotal]! };
}

/**
 * Plays one hand from a card source: P1 B1 P2 B2, then the Player's third card if the Player
 * draws, then the Banker's if the Banker draws. `next` is called once per card, in deal order.
 */
export function playHand(
  next: () => Card,
): Omit<HandRecord, 'n' | 'shoeNo' | 'handInShoe' | 'forced'> {
  const p = [next()];
  const b = [next()];
  p.push(next());
  b.push(next());
  const p2 = handTotal(p);
  const b2 = handTotal(b);
  const playerRule = playerDraws(p2, b2);
  if (playerRule.draws) p.push(next());
  const bankerRule = bankerDraws(b2, p2, p.length === 3 ? cardValue(p[2]!) : null);
  if (bankerRule.draws) b.push(next());
  const pt = handTotal(p);
  const bt = handTotal(b);
  const player: HandCards = { cards: p, total: pt, natural: isNatural(p2) };
  const banker: HandCards = { cards: b, total: bt, natural: isNatural(b2) };
  const outcome: TableauOutcome = {
    playerTotal: pt,
    bankerTotal: bt,
    playerCards: p.length as 2 | 3,
    bankerCards: b.length as 2 | 3,
    playerPair: rankOf(p[0]!) === rankOf(p[1]!),
    bankerPair: rankOf(b[0]!) === rankOf(b[1]!),
  };
  return {
    player,
    banker,
    playerRule,
    bankerRule,
    winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie',
    natural: player.natural || banker.natural,
    outcome,
  };
}
