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
import { cellAt, cellIndex, CELL_COUNT } from './distribution';
import { div, frac, mul, neg, ONE, sub, toNumber, ZERO } from './fraction';
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

/** One settled case kind of a bet: its "Why?" row id, net per $1 and result. */
interface RowKind {
  id: string;
  net: Fraction;
  result: Payout['result'];
}
/**
 * How a bet settles on every one of the 400 cells (or on pair / no pair). Settlement depends only
 * on the rules and the cell, never on the composition, so this is built once per rules from the
 * registry and reused for every shoe.
 */
interface SettleTable {
  bet: BetId;
  basis: BetDef['basis'];
  kinds: RowKind[];
  /** Tableau bets: kind index per cell index. */
  cellKind: Int8Array;
  /** Pair bets: kind index for [pair, no pair]. */
  pairKind: [number, number];
  /** lcm of the nets' denominators. */
  lcm: bigint;
}

const gcdBig = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcdBig(b, a % b));

function settleTable(bet: BetId, def: BetDef, rules: TableRules): SettleTable {
  const kinds: RowKind[] = [];
  const index = new Map<string, number>();
  const kindOf = (o: TableauOutcome): number => {
    const p = def.settle(o, rules);
    const net = payoutNet(p);
    const id = rowIdOf(p.reason, o);
    const key = `${id}|${net.num}/${net.den}|${p.result}`;
    let k = index.get(key);
    if (k === undefined) {
      k = kinds.length;
      kinds.push({ id, net, result: p.result });
      index.set(key, k);
    }
    return k;
  };
  const cellKind = new Int8Array(CELL_COUNT).fill(-1);
  const pairKind: [number, number] = [-1, -1];
  if (def.basis === 'tableau') {
    for (let i = 0; i < CELL_COUNT; i++) {
      cellKind[i] = kindOf({ ...cellAt(i), playerPair: false, bankerPair: false });
    }
  } else {
    const base = { ...cellAt(0), playerPair: false, bankerPair: false };
    const flagged = (flag: boolean): TableauOutcome => ({
      ...base,
      playerPair: def.basis === 'player-pair' && flag,
      bankerPair: def.basis === 'banker-pair' && flag,
    });
    pairKind[0] = kindOf(flagged(true));
    pairKind[1] = kindOf(flagged(false));
  }
  let lcm = 1n;
  for (const k of kinds) lcm = (lcm * k.net.den) / gcdBig(lcm, k.net.den);
  return { bet, basis: def.basis, kinds, cellKind, pairKind, lcm };
}

/** The memo key: everything a payout or the composition may read. */
export function rulesKey(rules: TableRules): string {
  return [rules.variant, rules.tiePays, rules.decks, rules.commission.join(':')].join('|');
}
const tableMemo = new Map<string, SettleTable[]>();

function tablesFor(rules: TableRules, lookup: BetLookup): SettleTable[] {
  const build = () => betsOffered(rules).map((bet) => settleTable(bet, lookup(bet), rules));
  if (lookup !== betDef) return build();
  const key = rulesKey(rules);
  let t = tableMemo.get(key);
  if (!t) {
    t = build();
    tableMemo.set(key, t);
  }
  return t;
}

/** P(the hand is a tie) from the distribution. */
export function pTie(dist: OutcomeDistribution): Fraction {
  let w = 0n;
  for (const c of dist.cells) if (c.playerTotal === c.bankerTotal) w += c.weight;
  return frac(w, dist.total);
}

function evOf(
  t: SettleTable,
  dist: OutcomeDistribution,
  cellIdx: readonly number[],
  tie: Fraction,
  rules: TableRules,
): BetEv {
  const counts = new Array<bigint>(t.kinds.length).fill(0n);
  let outOf: bigint;
  if (t.basis === 'tableau') {
    outOf = dist.total;
    dist.cells.forEach((c, i) => {
      const k = t.cellKind[cellIdx[i]!]!;
      counts[k] = counts[k]! + c.weight;
    });
  } else {
    outOf = dist.pairOutOf;
    counts[t.pairKind[0]] = counts[t.pairKind[0]]! + dist.pairCount;
    counts[t.pairKind[1]] = counts[t.pairKind[1]]! + dist.pairOutOf - dist.pairCount;
  }
  // Σ count × net over the common denominator outOf × lcm (and lcm² for the second moment).
  let s1 = 0n;
  let s2 = 0n;
  const byResult = { win: 0n, push: 0n, lose: 0n };
  const drafts: RowDraft[] = [];
  t.kinds.forEach((k, i) => {
    const n = counts[i]!;
    if (n === 0n) return;
    const scaled = k.net.num * (t.lcm / k.net.den);
    s1 += n * scaled;
    s2 += n * scaled * scaled;
    byResult[k.result] += n;
    drafts.push({ id: k.id, count: n, net: k.net });
  });
  const ev = frac(s1, outOf * t.lcm);
  const edge = neg(ev);
  const variance = sub(frac(s2, outOf * t.lcm * t.lcm), mul(ev, ev));
  const out: BetEv = {
    bet: t.bet,
    offered: true,
    ev,
    edge,
    pWin: frac(byResult.win, outOf),
    pPush: frac(byResult.push, outOf),
    pLose: frac(byResult.lose, outOf),
    sd: Math.sqrt(Math.max(0, toNumber(variance))),
    tier: betTier(edge),
    why: { rows: [], casesLabel: '', formula: '' },
  };
  // Per resolved bet (D14, D32); undefined when every hand left is a tie.
  if ((t.bet === 'player' || t.bet === 'banker') && tie.num !== tie.den) {
    out.edgePerResolved = div(edge, sub(ONE, tie));
  }
  out.why = buildWhy(
    t.bet,
    drafts,
    outOf,
    t.basis === 'tableau' ? 'orderings of the next six cards' : 'two-card starts',
    out,
    rules,
  );
  return out;
}

/** `betEvs` with an explicit registry lookup (tests pass a modified registry). */
export function betEvsWith(
  dist: OutcomeDistribution,
  rules: TableRules,
  lookup: BetLookup,
): BetEv[] {
  const tie = pTie(dist);
  const cellIdx = dist.cells.map((c) =>
    cellIndex(c.playerTotal, c.bankerTotal, c.playerCards, c.bankerCards),
  );
  return tablesFor(rules, lookup).map((t) => evOf(t, dist, cellIdx, tie, rules));
}

/** EV, edge, probabilities, sd, tier and "Why?" of every offered bet, from the registry. */
export function betEvs(dist: OutcomeDistribution, rules: TableRules): BetEv[] {
  return betEvsWith(dist, rules, betDef);
}
