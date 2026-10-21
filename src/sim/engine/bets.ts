// The bet registry (simulator.md section 1.4, decisions D2, D3, D13). One BetDef per BetId: data
// plus a pure `settle(outcome, rules)` that reads only the outcome fields its `basis` names. The EV
// module computes every number from these same functions (one source of truth).
import { BET_IDS_BY_VARIANT, BET_OFFERED_IN } from './ids';
import { BET_IDS } from './types';
import type {
  BetDef,
  BetId,
  Odds,
  Payout,
  SettleReason,
  TableRules,
  TableauOutcome,
} from './types';

/** BET_IDS filtered by offeredIn for the rules' variant, in display order. */
export function betsOffered(rules: TableRules): BetId[] {
  const offered = BET_IDS_BY_VARIANT[rules.variant];
  if (!offered) throw new Error(`Unknown variant "${String(rules.variant)}"`);
  return [...offered];
}

/** Is `bet` offered by the rules' variant? */
export function isOffered(bet: BetId, rules: TableRules): boolean {
  return BET_OFFERED_IN[bet].includes(rules.variant);
}

const NONE: Odds = [0, 1];
const win = (gross: Odds, reason: SettleReason, commission: Odds | null = null): Payout => ({
  result: 'win',
  gross,
  commission,
  reason,
});
const push = (reason: SettleReason): Payout => ({
  result: 'push',
  gross: NONE,
  commission: null,
  reason,
});
const lose = (reason: SettleReason): Payout => ({
  result: 'lose',
  gross: NONE,
  commission: null,
  reason,
});

/**
 * Dragon Bonus pay table (one preset in v1): a non-natural win by `margin` points pays
 * `DRAGON_BONUS_TABLE[margin]` to 1; margins under 4 lose. A natural win pays 1:1 and a natural
 * tie pushes.
 */
export const DRAGON_BONUS_TABLE: Readonly<Record<4 | 5 | 6 | 7 | 8 | 9, number>> = {
  9: 30,
  8: 10,
  7: 6,
  6: 4,
  5: 2,
  4: 1,
};
export const DRAGON_BONUS_NATURAL_PAYS = 1;
export const PAIR_PAYS = 11;
export const DRAGON_7_PAYS = 40;
export const PANDA_8_PAYS = 25;

/** A side's final hand is a natural: two cards totalling 8 or 9. */
const naturalOf = (cards: 2 | 3, total: number): boolean => cards === 2 && total >= 8;

function dragonBonus(o: TableauOutcome, side: 'player' | 'banker'): Payout {
  const mine = side === 'player' ? o.playerTotal : o.bankerTotal;
  const theirs = side === 'player' ? o.bankerTotal : o.playerTotal;
  const myNatural = naturalOf(side === 'player' ? o.playerCards : o.bankerCards, mine);
  const theirNatural = naturalOf(side === 'player' ? o.bankerCards : o.playerCards, theirs);
  if (mine === theirs)
    return myNatural && theirNatural ? push('natural-tie-push') : lose('dragon-bonus-loses');
  if (mine < theirs) return lose('dragon-bonus-loses');
  if (myNatural) return win([DRAGON_BONUS_NATURAL_PAYS, 1], 'natural-win');
  const margin = mine - theirs;
  if (margin < 4) return lose('margin-under-4');
  return win([DRAGON_BONUS_TABLE[margin as 4 | 5 | 6 | 7 | 8 | 9], 1], 'win-by-margin');
}

function pct(o: Odds): string {
  const v = (o[0] * 100) / o[1];
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`;
}

const ALL_TABLEAU = { kind: 'side', limits: 'side', basis: 'tableau' } as const;

const DEFS: Readonly<Record<BetId, BetDef>> = {
  player: {
    id: 'player',
    label: 'Player',
    short: 'P',
    kind: 'main',
    limits: 'main',
    basis: 'tableau',
    offeredIn: BET_OFFERED_IN.player,
    payoutText: () => 'Pays 1 to 1',
    settle: (o) =>
      o.playerTotal > o.bankerTotal
        ? win([1, 1], 'side-wins')
        : o.playerTotal === o.bankerTotal
          ? push('tie-push')
          : lose('side-loses'),
  },
  banker: {
    id: 'banker',
    label: 'Banker',
    short: 'B',
    kind: 'main',
    limits: 'main',
    basis: 'tableau',
    offeredIn: BET_OFFERED_IN.banker,
    payoutText: (rules) =>
      rules.variant === 'ez'
        ? 'Pays 1 to 1; a Banker win with a 3-card 7 pushes'
        : rules.variant === 'super-6'
          ? 'Pays 1 to 1; a Banker win with 6 pays 1 to 2'
          : `Pays 1 to 1, less ${pct(rules.commission)} commission`,
    settle: (o, rules) => {
      if (o.bankerTotal === o.playerTotal) return push('tie-push');
      if (o.bankerTotal < o.playerTotal) return lose('side-loses');
      if (rules.variant === 'ez')
        return o.bankerTotal === 7 && o.bankerCards === 3
          ? push('ez-banker-three-card-7-push')
          : win([1, 1], 'side-wins');
      if (rules.variant === 'super-6')
        return o.bankerTotal === 6 ? win([1, 2], 'super-6-half') : win([1, 1], 'side-wins');
      return win([1, 1], 'banker-commission', rules.commission);
    },
  },
  tie: {
    id: 'tie',
    label: 'Tie',
    short: 'T',
    kind: 'main',
    limits: 'side',
    basis: 'tableau',
    offeredIn: BET_OFFERED_IN.tie,
    payoutText: (rules) => `Pays ${rules.tiePays} to 1`,
    settle: (o, rules) =>
      o.playerTotal === o.bankerTotal ? win([rules.tiePays, 1], 'tie-pays') : lose('tie-loses'),
  },
  'player-pair': {
    id: 'player-pair',
    label: 'Player Pair',
    short: 'PP',
    kind: 'side',
    limits: 'side',
    basis: 'player-pair',
    offeredIn: BET_OFFERED_IN['player-pair'],
    payoutText: () => `Pays ${PAIR_PAYS} to 1 when the Player's first two cards are a pair`,
    settle: (o) => (o.playerPair ? win([PAIR_PAYS, 1], 'pair') : lose('no-pair')),
  },
  'banker-pair': {
    id: 'banker-pair',
    label: 'Banker Pair',
    short: 'BP',
    kind: 'side',
    limits: 'side',
    basis: 'banker-pair',
    offeredIn: BET_OFFERED_IN['banker-pair'],
    payoutText: () => `Pays ${PAIR_PAYS} to 1 when the Banker's first two cards are a pair`,
    settle: (o) => (o.bankerPair ? win([PAIR_PAYS, 1], 'pair') : lose('no-pair')),
  },
  'dragon-bonus-player': {
    id: 'dragon-bonus-player',
    label: 'Dragon Bonus Player',
    short: 'DP',
    ...ALL_TABLEAU,
    offeredIn: BET_OFFERED_IN['dragon-bonus-player'],
    payoutText: () =>
      'Player natural win 1 to 1 (natural tie pushes); win by 9: 30 to 1, 8: 10, 7: 6, 6: 4, 5: 2, 4: 1',
    settle: (o) => dragonBonus(o, 'player'),
  },
  'dragon-bonus-banker': {
    id: 'dragon-bonus-banker',
    label: 'Dragon Bonus Banker',
    short: 'DB',
    ...ALL_TABLEAU,
    offeredIn: BET_OFFERED_IN['dragon-bonus-banker'],
    payoutText: () =>
      'Banker natural win 1 to 1 (natural tie pushes); win by 9: 30 to 1, 8: 10, 7: 6, 6: 4, 5: 2, 4: 1',
    settle: (o) => dragonBonus(o, 'banker'),
  },
  'panda-8': {
    id: 'panda-8',
    label: 'Panda 8',
    short: 'P8',
    ...ALL_TABLEAU,
    offeredIn: BET_OFFERED_IN['panda-8'],
    payoutText: () => `Pays ${PANDA_8_PAYS} to 1 when the Player wins with a 3-card 8`,
    settle: (o) =>
      o.playerTotal === 8 && o.playerCards === 3 && o.bankerTotal < 8
        ? win([PANDA_8_PAYS, 1], 'panda-8')
        : lose('no-panda-8'),
  },
  'dragon-7': {
    id: 'dragon-7',
    label: 'Dragon 7',
    short: 'D7',
    ...ALL_TABLEAU,
    offeredIn: BET_OFFERED_IN['dragon-7'],
    payoutText: () => `Pays ${DRAGON_7_PAYS} to 1 when the Banker wins with a 3-card 7`,
    settle: (o) =>
      o.bankerTotal === 7 && o.bankerCards === 3 && o.playerTotal < 7
        ? win([DRAGON_7_PAYS, 1], 'dragon-7')
        : lose('no-dragon-7'),
  },
};

/** The registry, keyed in BET_IDS (display) order. Read it through `betDef(id)` or `BETS[id]`. */
export const BETS: Readonly<Record<BetId, BetDef>> = Object.fromEntries(
  BET_IDS.map((id) => [id, DEFS[id]]),
) as Record<BetId, BetDef>;

/** One BetDef per BetId (payout text and `settle`). */
export function betDef(id: BetId): BetDef {
  const def = BETS[id];
  if (!def) throw new Error(`Unknown bet "${String(id)}"`);
  return def;
}
