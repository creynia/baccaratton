// Fixtures for the component tests and the gallery. Cards, settlements and EVs come from the REAL
// engine (playHand, settleHand) and math (fullShoeEvs, previewSlip).
import { parseCards } from '../engine/cards';
import { settleHand } from '../engine/settle';
import { playHand } from '../engine/tableau';
import type { BetId, GameEvent, HandRecord, HandResult, Slip, TableRules } from '../engine/types';
import type { BetEv, Fraction, SlipPreview, TrackerView } from '../math/types';
import { fullShoeEvs, previewSlip } from '../math';
import { frac } from './text';
import type { SessionSummary } from './types';

// ---------- hands (real engine) ----------

/** Plays a hand from explicit side cards ('Ah 2d [5c]'); throws if the tableau disagrees. */
export function forcedHand(player: string, banker: string, n = 1): HandRecord {
  const p = parseCards(player);
  const b = parseCards(banker);
  const order = [p[0]!, b[0]!, p[1]!, b[1]!, ...p.slice(2), ...b.slice(2)];
  let i = 0;
  const h = playHand(() => {
    const c = order[i++];
    if (c === undefined) throw new Error(`forcedHand: the tableau wants more cards`);
    return c;
  });
  if (i !== order.length) throw new Error(`forcedHand: the tableau does not draw these cards`);
  return { ...h, n, shoeNo: 1, handInShoe: n, forced: true };
}

/** A settled hand from the real settlement code. */
export function settled(hand: HandRecord, bets: Slip, rules: TableRules): HandResult {
  return settleHand(hand, bets, rules);
}

/** The events of one `deal` in simulator.md §1.8 order (until the engine's applyAction lands). */
export function dealEvents(
  result: HandResult,
  opts: { newShoe?: { faceUp: number; count: number } } = {},
): GameEvent[] {
  const h = result.hand;
  const ev: GameEvent[] = [];
  if (opts.newShoe) {
    ev.push({ type: 'shoe-shuffled', shoeNo: h.shoeNo, decks: 8 });
    ev.push({ type: 'burn', faceUp: opts.newShoe.faceUp, count: opts.newShoe.count });
  }
  ev.push({
    type: 'hand-started',
    n: h.n,
    shoeNo: h.shoeNo,
    handInShoe: h.handInShoe,
    forced: h.forced,
  });
  const p = h.player.cards;
  const b = h.banker.cards;
  ev.push({ type: 'card-dealt', to: 'player', index: 0, card: p[0]!, sideways: false });
  ev.push({ type: 'card-dealt', to: 'banker', index: 0, card: b[0]!, sideways: false });
  ev.push({ type: 'card-dealt', to: 'player', index: 1, card: p[1]!, sideways: false });
  ev.push({ type: 'card-dealt', to: 'banker', index: 1, card: b[1]!, sideways: false });
  ev.push({ type: 'pause-point', at: 'two-cards' });
  ev.push({ type: 'draw-decision', side: 'player', total: h.player.total, decision: h.playerRule });
  if (p[2] !== undefined)
    ev.push({ type: 'card-dealt', to: 'player', index: 2, card: p[2], sideways: true });
  ev.push({ type: 'pause-point', at: 'player-third' });
  ev.push({ type: 'draw-decision', side: 'banker', total: h.banker.total, decision: h.bankerRule });
  if (b[2] !== undefined)
    ev.push({ type: 'card-dealt', to: 'banker', index: 2, card: b[2], sideways: true });
  ev.push({ type: 'pause-point', at: 'all-cards' });
  ev.push({ type: 'hand-result', hand: h });
  for (const s of result.settlements) ev.push({ type: 'bet-settled', settlement: s });
  ev.push({ type: 'hand-settled', result });
  return ev;
}

// ---------- EV (the REAL math module) ----------

/** The full-shoe EV sheet for a variant (math's memoised fullShoeEvs). */
export function fixtureSheet(rules: TableRules): BetEv[] {
  return fullShoeEvs(rules);
}

/** The real previewSlip for a slip (full shoe). */
export function fixturePreview(rules: TableRules, slip: Slip, handsPerHour = 72): SlipPreview {
  return previewSlip({ rules, slip, handsPerHour });
}

const add = (a: Fraction, b: Fraction) => frac(a.num * b.den + b.num * a.den, a.den * b.den);

/** A late-shoe tracker view (illustrative numbers: Dragon 7 has turned positive). */
export function fixtureTracker(rules: TableRules): TrackerView {
  const sheet = fixtureSheet(rules);
  const shift: Partial<Record<BetId, Fraction>> = {
    banker: frac(3n, 10_000n),
    player: frac(-4n, 10_000n),
    tie: frac(-20n, 10_000n),
    'dragon-7': frac(1100n, 10_000n),
    'panda-8': frac(-300n, 10_000n),
    'dragon-bonus-player': frac(50n, 10_000n),
  };
  return {
    cardsLeft: 52,
    unseenByValue: [12, 5, 6, 4, 0, 5, 8, 4, 4, 4],
    nextHandNewShoe: false,
    rows: sheet.map((b) => {
      const d = shift[b.bet] ?? frac(0n);
      const ev = add(b.ev, d);
      return { bet: b.bet, ev, fullShoeEv: b.ev, delta: d, positive: ev.num > 0n };
    }),
  };
}

/** curriculum.md §8.4's example. */
export const SESSION_FIXTURE: SessionSummary = {
  hands: 42,
  totalBet: 52_000,
  expectedCents: -565,
  actualCents: 3500,
  luckCents: 4065,
  averageEdge: 0.0109,
  bankerOnlyEdge: 0.010579,
  commissionPaid: 475,
};

/** Road strings for the scoreboard (simulator.md §3.3's pinned fixtures plus a mixed shoe). */
export const ROAD_FIXTURES = {
  dragonTail: 'T B B B B B B B P T P B',
  blockedTail: 'B B B B B B B B P P P P P P P',
  mixed: 'B Bb P T B Pp B B P Pn9 T T B Bn8 P P P B T B Pbp B P B B',
};
