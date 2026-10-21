// Exact EV of every offered bet from an outcome distribution (simulator.md section 2.3).
// One source of truth: payouts come only from the engine registry's `BetDef.settle`; this module
// turns each `Payout` into an exact net per $1 and never restates a pay table.
import { betDef, betsOffered } from '../engine/bets';
import type {
  BetDef,
  BetId,
  Payout,
  SettleReason,
  TableRules,
  TableauOutcome,
} from '../engine/types';
import { buildWhy, type RowDraft } from './explain';
import { add, div, frac, mul, neg, ONE, sub, toNumber, ZERO } from './fraction';
import { betTier } from './tiers';
import type { BetEv, Fraction, OutcomeDistribution } from './types';

export type BetLookup = (id: BetId) => BetDef;

/** Net per $1 of a payout: gross − commission on a win, 0 on a push, −1 on a loss. */
export function payoutNet(p: Payout): Fraction {
  if (p.result === 'push') return ZERO;
  if (p.result === 'lose') return neg(ONE);
  const g = frac(BigInt(p.gross[0]), BigInt(p.gross[1]));
  return p.commission ? sub(g, frac(BigInt(p.commission[0]), BigInt(p.commission[1]))) : g;
}

/** The "Why?" row a settled case belongs to. */
export function rowIdOf(reason: SettleReason, o: TableauOutcome): string {
  switch (reason) {
    case 'side-wins':
    case 'banker-commission':
    case 'tie-pays':
    case 'pair':
    case 'dragon-7':
    case 'panda-8':
      return 'win';
    case 'side-loses':
    case 'tie-loses':
    case 'no-pair':
    case 'margin-under-4':
    case 'dragon-bonus-loses':
    case 'no-dragon-7':
    case 'no-panda-8':
      return 'lose';
    case 'tie-push':
      return 'push';
    case 'ez-banker-three-card-7-push':
      return 'win-3card-7-push';
    case 'super-6-half':
      return 'win-6-half';
    case 'natural-win':
    case 'natural-tie-push':
      return reason;
    case 'win-by-margin':
      return `margin-${Math.abs(o.playerTotal - o.bankerTotal)}`;
    default:
      return reason;
  }
}

interface Acc {
  draft: RowDraft;
  result: Payout['result'];
}

function addCase(rows: Map<string, Acc>, id: string, count: bigint, p: Payout): void {
  const net = payoutNet(p);
  const key = `${id}|${net.num}/${net.den}`;
  const acc = rows.get(key);
  if (acc) acc.draft.count += count;
  else rows.set(key, { draft: { id, count, net }, result: p.result });
}

/** P(the hand is a tie) from the distribution. */
export function pTie(dist: OutcomeDistribution): Fraction {
  let w = 0n;
  for (const c of dist.cells) if (c.playerTotal === c.bankerTotal) w += c.weight;
  return frac(w, dist.total);
}

/** `betEvs` with an explicit registry lookup (tests pass an independent oracle). */
export function betEvsWith(
  dist: OutcomeDistribution,
  rules: TableRules,
  lookup: BetLookup,
): BetEv[] {
  const tie = pTie(dist);
  return betsOffered(rules).map((bet) => {
    const def = lookup(bet);
    const rows = new Map<string, Acc>();
    let outOf: bigint;
    if (def.basis === 'tableau') {
      outOf = dist.total;
      for (const c of dist.cells) {
        const o: TableauOutcome = {
          playerTotal: c.playerTotal,
          bankerTotal: c.bankerTotal,
          playerCards: c.playerCards,
          bankerCards: c.bankerCards,
          playerPair: false,
          bankerPair: false,
        };
        const p = def.settle(o, rules);
        addCase(rows, rowIdOf(p.reason, o), c.weight, p);
      }
    } else {
      outOf = dist.pairOutOf;
      const base = dist.cells[0]!;
      for (const flag of [true, false]) {
        const o: TableauOutcome = {
          playerTotal: base.playerTotal,
          bankerTotal: base.bankerTotal,
          playerCards: base.playerCards,
          bankerCards: base.bankerCards,
          playerPair: def.basis === 'player-pair' && flag,
          bankerPair: def.basis === 'banker-pair' && flag,
        };
        const p = def.settle(o, rules);
        const count = flag ? dist.pairCount : dist.pairOutOf - dist.pairCount;
        if (count > 0n) addCase(rows, rowIdOf(p.reason, o), count, p);
      }
    }
    let evNum = ZERO;
    let sq = ZERO;
    const counts = { win: 0n, push: 0n, lose: 0n };
    for (const { draft, result } of rows.values()) {
      counts[result] += draft.count;
      const c = frac(draft.count, outOf);
      evNum = add(evNum, mul(c, draft.net));
      sq = add(sq, mul(c, mul(draft.net, draft.net)));
    }
    const ev = evNum;
    const edge = neg(ev);
    const variance = sub(sq, mul(ev, ev));
    const out: BetEv = {
      bet,
      offered: true,
      ev,
      edge,
      pWin: frac(counts.win, outOf),
      pPush: frac(counts.push, outOf),
      pLose: frac(counts.lose, outOf),
      sd: Math.sqrt(Math.max(0, toNumber(variance))),
      tier: betTier(edge),
      why: ZERO_WHY,
    };
    if (bet === 'player' || bet === 'banker') {
      out.edgePerResolved = div(edge, sub(ONE, tie));
    }
    out.why = buildWhy(
      bet,
      [...rows.values()].map((r) => r.draft),
      outOf,
      def.basis === 'tableau' ? 'orderings of the next six cards' : 'two-card starts',
      out,
      rules,
    );
    return out;
  });
}

const ZERO_WHY: BetEv['why'] = { rows: [], casesLabel: '', formula: '' };

/** EV, edge, probabilities, sd, tier and "Why?" of every offered bet, from the registry. */
export function betEvs(dist: OutcomeDistribution, rules: TableRules): BetEv[] {
  return betEvsWith(dist, rules, betDef);
}
