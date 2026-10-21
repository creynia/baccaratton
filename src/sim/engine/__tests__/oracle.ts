/**
 * Independent oracle for the tableau and the settlement (simulator.md section 7.1). Written from
 * the prose of sections 1.3 and 1.4 as nested if/else. Deliberately does NOT import tableau.ts,
 * bets.ts or settle.ts (only the frozen types), so a shared bug cannot hide.
 */
import type { BetId, TableRules, TableauOutcome, TableauRuleId, Winner } from '../types';

export interface OracleHand {
  /** Card values in deal order as they were used (4, 5 or 6 of the input). */
  player: number[];
  banker: number[];
  playerTotal: number;
  bankerTotal: number;
  playerDraws: boolean;
  bankerDraws: boolean;
  playerRule: TableauRuleId;
  bankerRule: TableauRuleId;
  winner: Winner;
  natural: boolean;
  /** How many of the input values the hand consumed. */
  used: number;
}

const last = (n: number): number => n % 10;

/**
 * Plays a hand from a list of card VALUES (0..9) in shoe order: P1 B1 P2 B2, then the next
 * card(s) as needed. The list must hold at least 6 values.
 */
export function oraclePlay(values: readonly number[]): OracleHand {
  const player = [values[0]!, values[2]!];
  const banker = [values[1]!, values[3]!];
  let used = 4;
  const p2 = last(player[0]! + player[1]!);
  const b2 = last(banker[0]! + banker[1]!);
  let playerRule: TableauRuleId;
  let bankerRule: TableauRuleId;
  let playerDraws = false;
  let bankerDraws = false;
  if (p2 === 8 || p2 === 9 || b2 === 8 || b2 === 9) {
    // a natural: both stand
    playerRule = 'natural';
    bankerRule = 'natural';
  } else {
    if (p2 <= 5) {
      playerDraws = true;
      playerRule = 'player-0-5-draws';
      player.push(values[used]!);
      used++;
    } else {
      playerRule = 'player-6-7-stands';
    }
    if (!playerDraws) {
      if (b2 <= 5) {
        bankerDraws = true;
        bankerRule = 'banker-player-stood-0-5-draws';
      } else {
        bankerRule = 'banker-player-stood-6-7-stands';
      }
    } else {
      const p = player[2]!;
      if (b2 === 0 || b2 === 1 || b2 === 2) {
        bankerRule = 'banker-0-2-draws';
        bankerDraws = true;
      } else if (b2 === 3) {
        bankerRule = 'banker-3-draws-unless-8';
        bankerDraws = p !== 8;
      } else if (b2 === 4) {
        bankerRule = 'banker-4-draws-on-2-7';
        bankerDraws = p >= 2 && p <= 7;
      } else if (b2 === 5) {
        bankerRule = 'banker-5-draws-on-4-7';
        bankerDraws = p >= 4 && p <= 7;
      } else if (b2 === 6) {
        bankerRule = 'banker-6-draws-on-6-7';
        bankerDraws = p === 6 || p === 7;
      } else {
        bankerRule = 'banker-7-stands';
        bankerDraws = false;
      }
    }
    if (bankerDraws) {
      banker.push(values[used]!);
      used++;
    }
  }
  let ps = 0;
  for (const v of player) ps += v;
  let bs = 0;
  for (const v of banker) bs += v;
  const playerTotal = last(ps);
  const bankerTotal = last(bs);
  let winner: Winner;
  if (playerTotal > bankerTotal) winner = 'player';
  else if (bankerTotal > playerTotal) winner = 'banker';
  else winner = 'tie';
  return {
    player,
    banker,
    playerTotal,
    bankerTotal,
    playerDraws,
    bankerDraws,
    playerRule,
    bankerRule,
    winner,
    natural: p2 >= 8 || b2 >= 8,
    used,
  };
}

export interface OracleSettle {
  result: 'win' | 'push' | 'lose';
  /** Net in cents for the given amount (exact; the amount is on a grid where nothing rounds). */
  net: number;
}

/**
 * The payout of `bet` on `o` for `amount` cents, restated from the section 1.4 table. Exact
 * rational arithmetic on integers; throws if a result is not a whole number of cents.
 */
export function oracleSettle(
  bet: BetId,
  o: TableauOutcome,
  rules: TableRules,
  amount: number,
): OracleSettle {
  const P = o.playerTotal;
  const B = o.bankerTotal;
  const winTimes = (num: number, den: number): OracleSettle => {
    if ((amount * num) % den !== 0) throw new Error('oracle: rounding needed');
    return { result: 'win', net: (amount * num) / den };
  };
  const PUSH: OracleSettle = { result: 'push', net: 0 };
  const LOSE: OracleSettle = { result: 'lose', net: -amount };
  switch (bet) {
    case 'player':
      if (P === B) return PUSH;
      return P > B ? winTimes(1, 1) : LOSE;
    case 'banker':
      if (P === B) return PUSH;
      if (B < P) return LOSE;
      if (rules.variant === 'punto-banco') {
        // 1 to 1 less commission: amount - amount * c
        const [c0, c1] = rules.commission;
        return winTimes(c1 - c0, c1);
      }
      if (rules.variant === 'ez') {
        if (B === 7 && o.bankerCards === 3) return PUSH;
        return winTimes(1, 1);
      }
      // super-6
      if (B === 6) return winTimes(1, 2);
      return winTimes(1, 1);
    case 'tie':
      return P === B ? winTimes(rules.tiePays, 1) : LOSE;
    case 'player-pair':
      return o.playerPair ? winTimes(11, 1) : LOSE;
    case 'banker-pair':
      return o.bankerPair ? winTimes(11, 1) : LOSE;
    case 'dragon-7':
      if (B > P && B === 7 && o.bankerCards === 3) return winTimes(40, 1);
      return LOSE;
    case 'panda-8':
      if (P > B && P === 8 && o.playerCards === 3) return winTimes(25, 1);
      return LOSE;
    case 'dragon-bonus-player':
    case 'dragon-bonus-banker': {
      const forPlayer = bet === 'dragon-bonus-player';
      const mine = forPlayer ? P : B;
      const other = forPlayer ? B : P;
      const myCards = forPlayer ? o.playerCards : o.bankerCards;
      const otherCards = forPlayer ? o.bankerCards : o.playerCards;
      const iAmNatural = myCards === 2 && mine >= 8;
      const otherIsNatural = otherCards === 2 && other >= 8;
      if (mine === other) {
        if (iAmNatural && otherIsNatural) return PUSH;
        return LOSE;
      }
      if (mine < other) return LOSE;
      if (iAmNatural) return winTimes(1, 1);
      const by = mine - other;
      if (by === 9) return winTimes(30, 1);
      if (by === 8) return winTimes(10, 1);
      if (by === 7) return winTimes(6, 1);
      if (by === 6) return winTimes(4, 1);
      if (by === 5) return winTimes(2, 1);
      if (by === 4) return winTimes(1, 1);
      return LOSE;
    }
  }
}
