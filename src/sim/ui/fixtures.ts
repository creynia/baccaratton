// Fixtures for the component tests and the gallery's fallback. Cards and settlements come from the
// REAL engine (playHand, settleHand). EV values are simulator.md §2.5's pinned fractions, used only
// until the math WP's previewSlip lands (the gallery switches to the real module automatically).
import { parseCards } from '../engine/cards';
import { settleHand } from '../engine/settle';
import { playHand } from '../engine/tableau';
import { BET_IDS_BY_VARIANT } from '../engine/ids';
import type {
  BetId,
  Cents,
  GameEvent,
  HandRecord,
  HandResult,
  Slip,
  TableRules,
} from '../engine/types';
import type {
  Alternative,
  BetEv,
  BetTier,
  Fraction,
  SlipLine,
  SlipPreview,
  TrackerView,
  WhyRow,
} from '../math/types';
import { frac, fracMul, fracNeg, tierOfEdge } from './text';
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

// ---------- EV (pinned fractions, simulator.md §2.5) ----------

const TOTAL = 4_998_398_275_503_360n;
const P_PLAYER = frac(8712962041376n, 19524993263685n);
const P_BANKER = frac(8954111587648n, 19524993263685n);
const P_TIE = frac(619306544887n, 6508331087895n);

const add = (a: Fraction, b: Fraction) => frac(a.num * b.den + b.num * a.den, a.den * b.den);
const mul = (a: Fraction, b: Fraction) => frac(a.num * b.num, a.den * b.den);
const sub = (a: Fraction, b: Fraction) => add(a, fracNeg(b));
const ONE = frac(1n);

interface Pin {
  ev: Fraction;
  pWin: Fraction;
  pPush: Fraction;
  sd: number;
  /** Net per $1 on a win (for the generic Why rows). */
  winNet: Fraction;
  resolved?: Fraction;
}

function pinOf(bet: BetId, rules: TableRules): Pin {
  const zero = frac(0n);
  switch (bet) {
    case 'banker':
      if (rules.variant === 'ez')
        return {
          ev: frac(-66274384744n, 6508331087895n),
          pWin: frac(436064n, 1_000_000n),
          pPush: frac(117690n, 1_000_000n),
          sd: 0.9393,
          winNet: ONE,
        };
      if (rules.variant === 'super-6')
        return {
          ev: frac(-284694798368n, 19524993263685n),
          pWin: P_BANKER,
          pPush: P_TIE,
          sd: 0.9296,
          winNet: ONE,
        };
      return {
        ev: frac(-114753351728n, 10847218479825n),
        pWin: P_BANKER,
        pPush: P_TIE,
        sd: 0.9274,
        winNet: frac(19n, 20n),
        resolved: frac(21516253449n, 1840320169690n),
      };
    case 'player':
      return {
        ev: frac(-241149546272n, 19524993263685n),
        pWin: P_PLAYER,
        pPush: P_TIE,
        sd: 0.9512,
        winNet: ONE,
        resolved: frac(7535923321n, 552096050907n),
      };
    case 'tie':
      return rules.tiePays === 9
        ? {
            ev: frac(-63053127805n, 1301666217579n),
            pWin: P_TIE,
            pPush: zero,
            sd: 2.9343,
            winNet: frac(9n),
          }
        : {
            ev: frac(-103841353768n, 723147898655n),
            pWin: P_TIE,
            pPush: zero,
            sd: 2.6409,
            winNet: frac(8n),
          };
    case 'player-pair':
    case 'banker-pair':
      return {
        ev: frac(-43n, 415n),
        pWin: frac(31n, 415n),
        pPush: zero,
        sd: 3.1549,
        winNet: frac(11n),
      };
    case 'dragon-bonus-player':
      return {
        ev: frac(-103547854751n, 3904998652737n),
        pWin: frac(289887n, 1_000_000n),
        pPush: frac(17871n, 1_000_000n),
        sd: 2.4736,
        winNet: ONE,
      };
    case 'dragon-bonus-banker':
      return {
        ev: frac(-9683026823n, 103306842665n),
        pWin: frac(282795n, 1_000_000n),
        pPush: frac(17871n, 1_000_000n),
        sd: 2.3045,
        winNet: ONE,
      };
    case 'dragon-7':
      return {
        ev: frac(-64613588827n, 848912750595n),
        pWin: frac(22534n, 1_000_000n),
        pPush: zero,
        sd: 6.0849,
        winNet: frac(40n),
      };
    case 'panda-8':
      return {
        ev: frac(-153010345753n, 1501922558745n),
        pWin: frac(34543n, 1_000_000n),
        pPush: zero,
        sd: 4.7481,
        winNet: frac(25n),
      };
  }
}

function row(id: string, label: string, p: Fraction, net: Fraction, outOf: bigint): WhyRow {
  return {
    id,
    label,
    count: (p.num * outOf) / p.den,
    outOf,
    probability: p,
    net,
    contribution: mul(p, net),
  };
}

function whyOf(bet: BetId, pin: Pin, pLose: Fraction): BetEv['why'] {
  if (bet === 'player-pair' || bet === 'banker-pair')
    return {
      rows: [
        row('pair', 'A pair (pays 11)', frac(31n, 415n), frac(11n), 172_640n),
        row('no-pair', 'No pair', frac(384n, 415n), frac(-1n), 172_640n),
      ],
      casesLabel: 'two-card starts',
      formula: '31/415 × 11 − 384/415 = −43/415 = −0.1036',
    };
  const rows = [
    row(
      'win',
      `Wins (you get ${pin.winNet.num}${pin.winNet.den > 1n ? `/${pin.winNet.den}` : ''})`,
      pin.pWin,
      pin.winNet,
      TOTAL,
    ),
  ];
  if (pin.pPush.num > 0n) rows.push(row('push', 'Push', pin.pPush, frac(0n), TOTAL));
  rows.push(row('lose', 'Loses', pLose, frac(-1n), TOTAL));
  const e = Number((pin.ev.num * 100000n) / pin.ev.den) / 100000;
  return {
    rows,
    casesLabel: 'orderings of the next six cards',
    formula: `${(Number((pin.pWin.num * 10000n) / pin.pWin.den) / 10000).toFixed(4)} × ${Number(pin.winNet.num) / Number(pin.winNet.den)} − ${(Number((pLose.num * 10000n) / pLose.den) / 10000).toFixed(4)} × 1 = ${e.toFixed(5)}`,
    note:
      bet === 'banker' && pin.resolved
        ? 'Banker wins more often, so the casino charges 5% on Banker wins.'
        : undefined,
  };
}

/** The full-shoe EV sheet for a variant (pinned values). */
export function fixtureSheet(rules: TableRules): BetEv[] {
  const offered = BET_IDS_BY_VARIANT[rules.variant];
  return offered.map((bet) => {
    const pin = pinOf(bet, rules);
    // pLose so that pWin × winNet − pLose = ev exactly (rows sum to the EV).
    const pLose = sub(mul(pin.pWin, pin.winNet), pin.ev);
    const edge = fracNeg(pin.ev);
    const tier: BetTier = tierOfEdge(edge);
    return {
      bet,
      offered: true,
      ev: pin.ev,
      edge,
      edgePerResolved: pin.resolved,
      pWin: pin.pWin,
      pPush: pin.pPush,
      pLose,
      sd: pin.sd,
      tier,
      why: whyOf(bet, pin, pLose),
    };
  });
}

/** A SlipPreview shaped like math's previewSlip, from the pinned sheet. */
export function fixturePreview(
  rules: TableRules,
  slip: Slip,
  handsPerHour = 72,
  sheet: BetEv[] = fixtureSheet(rules),
  source: SlipPreview['source'] = 'full-shoe',
  cardsLeft = 416,
): SlipPreview {
  const lines: SlipLine[] = [];
  let total: Cents = 0;
  let totalEv = frac(0n);
  for (const b of sheet) {
    const amount = slip[b.bet] ?? 0;
    if (amount <= 0) continue;
    const evCents = fracMul(b.ev, amount);
    lines.push({
      bet: b.bet,
      amount,
      evCents,
      perHourCents: fracMul(evCents, handsPerHour),
      tier: b.tier,
    });
    total += amount;
    totalEv = add(totalEv, evCents);
  }
  const mains = sheet.filter((b) => b.bet === 'banker' || b.bet === 'player');
  const best = mains.reduce((a, b) => (b.edge.num * a.edge.den < a.edge.num * b.edge.den ? b : a));
  let alternative: Alternative | null = null;
  for (const l of lines) {
    const from = sheet.find((b) => b.bet === l.bet)!;
    if (from.bet === best.bet) continue;
    if (from.edge.num * best.edge.den <= best.edge.num * from.edge.den) continue;
    const toEv = fracMul(best.ev, l.amount);
    const saving = fracMul(sub(toEv, l.evCents), handsPerHour);
    if (
      !alternative ||
      saving.num * alternative.savingPerHourCents.den >
        alternative.savingPerHourCents.num * saving.den
    )
      alternative = {
        from: l.bet,
        to: best.bet,
        amount: l.amount,
        fromEvCents: l.evCents,
        toEvCents: toEv,
        savingPerHourCents: saving,
      };
  }
  return {
    source,
    cardsLeft,
    sheet,
    lines,
    totalWagered: total,
    totalEvCents: totalEv,
    perHourCents: fracMul(totalEv, handsPerHour),
    alternative,
    needsConfirm: lines.filter((l) => l.tier === 'sucker').map((l) => l.bet),
    exact: true,
  };
}

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
