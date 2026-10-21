// previewSlip (simulator.md section 2.6): the EV sheet, the slip lines and totals, the better
// alternative (D19, D31) and `needsConfirm`. Synchronous; full-shoe values are memoised.
import { betsOffered } from '../engine/bets';
import type { BetId, TableRules } from '../engine/types';
import { BET_IDS } from '../engine/types';
import { outcomeDistribution } from './distribution';
import { fullShoeEvs, perHourCents } from './edges';
import { betEvs } from './evs';
import { add, cmp, frac, mul, sub, ZERO } from './fraction';
import type { Alternative, BetEv, PreviewRequest, SlipLine, SlipPreview } from './types';

/** Main bets "Use this" may move money to (D31). Tie is main but never the cheapest. */
const MAIN_TARGETS: readonly BetId[] = ['banker', 'player'];

/** The lowest-edge offered main bet; exact ties of the edge go to Banker. */
export function cheapestMain(sheet: readonly BetEv[]): BetEv {
  let best: BetEv | null = null;
  for (const id of MAIN_TARGETS) {
    const e = sheet.find((s) => s.bet === id);
    if (e && (!best || cmp(e.edge, best.edge) < 0)) best = e;
  }
  if (!best) throw new Error('No main bet offered');
  return best;
}

/** The EV sheet for the request: full shoe by default (D6), or the given unseen cards. */
export function sheetFor(
  rules: TableRules,
  unseenRanks?: readonly number[],
): { sheet: BetEv[]; source: SlipPreview['source']; cardsLeft: number } {
  if (!unseenRanks) {
    return { sheet: fullShoeEvs(rules), source: 'full-shoe', cardsLeft: rules.decks * 52 };
  }
  const dist = outcomeDistribution(unseenRanks);
  return { sheet: betEvs(dist, rules), source: 'current-shoe', cardsLeft: dist.cardsLeft };
}

/**
 * Synchronous: the EV sheet, the slip, the alternative and `needsConfirm`. Bets the variant does
 * not offer (a stale slip after a variant switch) and zero amounts are left out of the lines.
 */
export function previewSlip(req: PreviewRequest): SlipPreview {
  const { rules, slip, handsPerHour } = req;
  const { sheet, source, cardsLeft } = sheetFor(rules, req.unseenRanks);
  const offered = new Set(betsOffered(rules));
  const byBet = new Map(sheet.map((e) => [e.bet, e]));
  const lines: SlipLine[] = [];
  for (const bet of BET_IDS) {
    const amount = slip[bet] ?? 0;
    if (!amount || !offered.has(bet)) continue;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Bad amount ${amount}`);
    const e = byBet.get(bet)!;
    const evCents = mul(e.ev, frac(BigInt(amount)));
    lines.push({
      bet,
      amount,
      evCents,
      perHourCents: perHourCents(evCents, handsPerHour),
      tier: e.tier,
    });
  }
  const totalWagered = lines.reduce((a, l) => a + l.amount, 0);
  const totalEvCents = lines.reduce((a, l) => add(a, l.evCents), ZERO);
  return {
    source,
    cardsLeft,
    sheet,
    lines,
    totalWagered,
    totalEvCents,
    perHourCents: perHourCents(totalEvCents, handsPerHour),
    alternative: alternativeFor(sheet, lines, handsPerHour),
    needsConfirm: lines.filter((l) => l.tier === 'sucker').map((l) => l.bet),
    exact: true,
  };
}

/**
 * The better alternative (section 2.6, D31): among slip lines whose edge exceeds the cheapest main
 * bet's, the one whose amount moved to that bet saves the most per hour (exact ties: the costlier
 * per $1, then BET_IDS order). Null when nothing on the slip is costlier than the cheapest main bet.
 */
export function alternativeFor(
  sheet: readonly BetEv[],
  lines: readonly SlipLine[],
  handsPerHour: number,
): Alternative | null {
  const best = cheapestMain(sheet);
  let pick: Alternative | null = null;
  let pickEdge = ZERO;
  for (const l of lines) {
    if (l.bet === best.bet) continue;
    const e = sheet.find((s) => s.bet === l.bet)!;
    if (cmp(e.edge, best.edge) <= 0) continue;
    const toEvCents = mul(best.ev, frac(BigInt(l.amount)));
    const saving = perHourCents(sub(toEvCents, l.evCents), handsPerHour);
    const c = pick ? cmp(saving, pick.savingPerHourCents) : 1;
    if (c > 0 || (c === 0 && cmp(e.edge, pickEdge) > 0)) {
      pick = {
        from: l.bet,
        to: best.bet,
        amount: l.amount,
        fromEvCents: l.evCents,
        toEvCents,
        savingPerHourCents: saving,
      };
      pickEdge = e.edge;
    }
  }
  return pick;
}
