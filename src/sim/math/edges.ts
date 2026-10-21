// Full-shoe EVs (D6: the EV sheet's default), memoised per rules, plus the pinned test oracles of
// simulator.md section 2.5 (D25). The app always computes from the registry; PINNED is only for tests.
import type { BetId, TableRules, TiePays, VariantId } from '../engine/types';
import { fullShoeRanks, outcomeDistribution } from './distribution';
import { betEvs } from './evs';
import { frac, mul } from './fraction';
import type { BetEv, Fraction } from './types';

const memo = new Map<string, BetEv[]>();

/** The memo key: everything a payout or the composition may read. */
export function rulesKey(rules: TableRules): string {
  return [rules.variant, rules.tiePays, rules.decks, rules.commission.join(':')].join('|');
}

/** Memoised; equals the pinned values of simulator.md section 2.5 in tests. */
export function fullShoeEvs(rules: TableRules): BetEv[] {
  const key = rulesKey(rules);
  let hit = memo.get(key);
  if (!hit) {
    hit = betEvs(outcomeDistribution(fullShoeRanks(rules.decks)), rules);
    memo.set(key, hit);
  }
  return hit;
}

/** evCents × hands per hour (exact). */
export function perHourCents(evCents: Fraction, handsPerHour: number): Fraction {
  if (!Number.isInteger(handsPerHour) || handsPerHour < 0) {
    throw new RangeError(`handsPerHour must be a whole number, got ${handsPerHour}`);
  }
  return mul(evCents, frac(BigInt(handsPerHour)));
}

export interface PinnedValue {
  variant: VariantId;
  tiePays: TiePays;
  bet: BetId;
  ev: Fraction;
  /** Rounded to 6 places, as in the table. */
  pWin: string;
  pPush: string;
  /** Rounded to 4 places. */
  sd: string;
  /** $/hour at $10 × 72, to the cent (a loss, positive). */
  perHour: string;
}

const f = (n: bigint, d: bigint): Fraction => frac(n, d);
const PB = 'punto-banco' as const;

/** simulator.md section 2.5, 8 decks, per bet placed, ties push. */
export const PINNED: readonly PinnedValue[] = [
  {
    variant: PB,
    tiePays: 8,
    bet: 'banker',
    ev: f(-114753351728n, 10847218479825n),
    pWin: '0.458597',
    pPush: '0.095156',
    sd: '0.9274',
    perHour: '7.62',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'player',
    ev: f(-241149546272n, 19524993263685n),
    pWin: '0.446247',
    pPush: '0.095156',
    sd: '0.9512',
    perHour: '8.89',
  },
  {
    variant: 'ez',
    tiePays: 8,
    bet: 'player',
    ev: f(-241149546272n, 19524993263685n),
    pWin: '0.446247',
    pPush: '0.095156',
    sd: '0.9512',
    perHour: '8.89',
  },
  {
    variant: 'super-6',
    tiePays: 8,
    bet: 'player',
    ev: f(-241149546272n, 19524993263685n),
    pWin: '0.446247',
    pPush: '0.095156',
    sd: '0.9512',
    perHour: '8.89',
  },
  {
    variant: 'ez',
    tiePays: 8,
    bet: 'banker',
    ev: f(-66274384744n, 6508331087895n),
    pWin: '0.436064',
    pPush: '0.117690',
    sd: '0.9393',
    perHour: '7.33',
  },
  {
    variant: 'super-6',
    tiePays: 8,
    bet: 'banker',
    ev: f(-284694798368n, 19524993263685n),
    pWin: '0.458597',
    pPush: '0.095156',
    sd: '0.9296',
    perHour: '10.50',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'tie',
    ev: f(-103841353768n, 723147898655n),
    pWin: '0.095156',
    pPush: '0.000000',
    sd: '2.6409',
    perHour: '103.39',
  },
  {
    variant: PB,
    tiePays: 9,
    bet: 'tie',
    ev: f(-63053127805n, 1301666217579n),
    pWin: '0.095156',
    pPush: '0.000000',
    sd: '2.9343',
    perHour: '34.88',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'player-pair',
    ev: f(-43n, 415n),
    pWin: '0.074699',
    pPush: '0.000000',
    sd: '3.1549',
    perHour: '74.60',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'banker-pair',
    ev: f(-43n, 415n),
    pWin: '0.074699',
    pPush: '0.000000',
    sd: '3.1549',
    perHour: '74.60',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'dragon-bonus-player',
    ev: f(-103547854751n, 3904998652737n),
    pWin: '0.289887',
    pPush: '0.017871',
    sd: '2.4736',
    perHour: '19.09',
  },
  {
    variant: PB,
    tiePays: 8,
    bet: 'dragon-bonus-banker',
    ev: f(-9683026823n, 103306842665n),
    pWin: '0.282795',
    pPush: '0.017871',
    sd: '2.3045',
    perHour: '67.49',
  },
  {
    variant: 'ez',
    tiePays: 8,
    bet: 'dragon-7',
    ev: f(-64613588827n, 848912750595n),
    pWin: '0.022534',
    pPush: '0.000000',
    sd: '6.0849',
    perHour: '54.80',
  },
  {
    variant: 'ez',
    tiePays: 8,
    bet: 'panda-8',
    ev: f(-153010345753n, 1501922558745n),
    pWin: '0.034543',
    pPush: '0.000000',
    sd: '4.7481',
    perHour: '73.35',
  },
];

/** Per resolved bet (ties excluded), punto-banco. */
export const PINNED_PER_RESOLVED: Readonly<Partial<Record<BetId, Fraction>>> = {
  banker: f(21516253449n, 1840320169690n),
  player: f(7535923321n, 552096050907n),
};
