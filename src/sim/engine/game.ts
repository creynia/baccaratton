// Game state machine (simulator.md sections 1.2, 1.5, 1.6, 1.8). Pure and immutable: every action
// returns a new GameState plus the events the UI paces. No Date, no Math.random, no DOM.
import { parseCards } from './cards';
import { betsOffered } from './bets';
import { roadEntry } from './roads';
import { resolveRules } from './rules';
import { seedRng } from './rng';
import { settleHand } from './settle';
import { emptyShoe, needsShuffle, newShoe, placeForced, unseenRanks } from './shoe';
import { handTotal, playHand } from './tableau';
import { BET_IDS } from './types';
import { rebetSlip, slipTotal, validateAction, validateForcedHand } from './validate';
import type {
  Action,
  ActionType,
  ApplyResult,
  BetId,
  Card,
  Cents,
  ForcedHand,
  GameEvent,
  GameState,
  HandRecord,
  RoadEntry,
  SessionStats,
  ShoeSetup,
  ShoeState,
  Side,
  Slip,
  TableRules,
  VisibleView,
} from './types';

export interface CreateGameOptions {
  /** resolveRules(variant defaults + overrides); throws if invalid. */
  rules?: Partial<TableRules>;
  /** Money in the rack BEFORE `bets` are placed (they are taken from it). Default 50_000. */
  bankroll?: Cents;
  /** The UI seeds once from crypto.getRandomValues. Default 1. */
  seed?: number;
  /** Preset chips on the felt (validated like set-bet, taken from the bankroll). */
  bets?: Slip;
  forced?: ForcedHand[];
  /**
   * Applied at the first shuffle, which then happens at once (shoe 1 is ready before the first
   * deal, so the Shoe tracker shows the setup's composition; no shuffle/burn events).
   */
  shoe?: ShoeSetup;
  /** Prefill the roads (marked prefilled: true); does not touch the shoe. */
  history?: RoadEntry[];
}

const zeroBets = (): Record<BetId, Cents> =>
  Object.fromEntries(BET_IDS.map((b) => [b, 0])) as Record<BetId, Cents>;

function emptyStats(): SessionStats {
  return {
    hands: 0,
    winners: { player: 0, banker: 0, tie: 0 },
    naturals: 0,
    wagered: zeroBets(),
    net: zeroBets(),
    commissionPaid: 0,
  };
}

function checkForced(hands: readonly ForcedHand[], rules: TableRules, who: string): void {
  hands.forEach((h, i) => {
    const v = validateForcedHand(h, rules);
    if (!v.ok) throw new Error(`${who}: forced hand ${i}: ${v.message}`);
  });
}

/** Throws on invalid options (rules, bets, forced hands, a shoe setup that leaves < 6 unseen). */
export function createGame(opts: CreateGameOptions = {}): GameState {
  const rules = resolveRules(opts.rules);
  const seed = opts.seed ?? 1;
  const forced = [...(opts.forced ?? [])];
  checkForced(forced, rules, 'createGame');
  let state: GameState = {
    version: 1,
    rules,
    bankroll: opts.bankroll ?? 50_000,
    bets: {},
    lastBets: {},
    shoe: emptyShoe(rules),
    history: (opts.history ?? []).map((e) => ({ ...e, prefilled: true })),
    lastResult: null,
    handCount: 0,
    rng: seedRng(seed),
    seed,
    forced,
    stats: emptyStats(),
  };
  if (!Number.isInteger(state.bankroll) || state.bankroll < 0)
    throw new Error(`createGame: bad bankroll ${state.bankroll}`);
  if (opts.shoe) state = shuffleInto(state, opts.shoe, true);
  for (const id of BET_IDS) {
    const amount = opts.bets?.[id] ?? 0;
    if (amount === 0) continue;
    const r = applyAction(state, { type: 'set-bet', bet: id, amount });
    if (!r.ok) throw new Error(`createGame: ${r.error.message}`);
    state = r.state;
  }
  return state;
}

/** Shuffles a new shoe into the state (no events). The first shuffle keeps prefilled history. */
function shuffleInto(
  state: GameState,
  setup: ShoeSetup | undefined,
  keepHistory: boolean,
): GameState {
  const rng = setup?.seed !== undefined ? seedRng(setup.seed) : state.rng;
  const [shoe, next] = newShoe(rng, state.rules, state.shoe.shoeNo + 1, setup);
  return {
    ...state,
    shoe,
    rng: setup?.seed !== undefined ? state.rng : next,
    history: keepHistory ? state.history : [],
  };
}

function shuffleEvents(shoe: ShoeState, decks: number): GameEvent[] {
  return [
    { type: 'shoe-shuffled', shoeNo: shoe.shoeNo, decks },
    { type: 'burn', faceUp: shoe.burn!.faceUp, count: shoe.burn!.count },
  ];
}

/** Forced codes in real deal order: P1 B1 P2 B2, then P3, then B3. */
function forcedOrder(f: ForcedHand): Card[] {
  const p = f.player.map((c) => parseCards(c)[0]!);
  const b = f.banker.map((c) => parseCards(c)[0]!);
  return [p[0]!, b[0]!, p[1]!, b[1]!, ...p.slice(2), ...b.slice(2)];
}

function addTo(slip: Slip, id: BetId, amount: Cents): Slip {
  const out: Partial<Record<BetId, Cents>> = { ...slip };
  if (amount > 0) out[id] = amount;
  else delete out[id];
  return out;
}

/** Moves `slip` onto the felt (the felt's current chips go back to the rack first). */
function placeSlip(state: GameState, slip: Slip): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const id of BET_IDS) {
    const from = state.bets[id] ?? 0;
    const to = slip[id] ?? 0;
    if (from !== to) events.push({ type: 'bet-set', bet: id, from, to });
  }
  return {
    state: {
      ...state,
      bankroll: state.bankroll + slipTotal(state.bets) - slipTotal(slip),
      bets: { ...slip },
    },
    events,
  };
}

function deal(state0: GameState, rebet: boolean): { state: GameState; events: GameEvent[] } {
  let state = state0;
  const events: GameEvent[] = [];
  if (rebet && slipTotal(state.bets) === 0) {
    const r = placeSlip(state, rebetSlip(state));
    state = r.state;
    events.push(...r.events);
  }
  // A new shoe when needed (first deal, after the extra hand, after new-shoe).
  if (needsShuffle(state.shoe)) {
    state = shuffleInto(state, undefined, state.shoe.shoeNo === 0);
    events.push(...shuffleEvents(state.shoe, state.rules.decks));
  }
  // Forced cards are swapped into the next positions; a card with no copy left reshuffles first.
  const head = state.forced[0];
  const isForced = head !== undefined;
  if (head) {
    const cards = forcedOrder(head);
    let placed = placeForced(state.shoe, cards);
    for (let tries = 0; placed === null; tries++) {
      if (tries > 50) throw new Error('deal: cannot place the forced hand');
      // Nothing was dealt from this shoe yet: keep the (prefilled) roads.
      state = shuffleInto(state, undefined, state.shoe.handsThisShoe === 0);
      events.push(...shuffleEvents(state.shoe, state.rules.decks));
      placed = placeForced(state.shoe, cards);
    }
    state = { ...state, shoe: placed, forced: state.forced.slice(1) };
  }

  const shoe0 = state.shoe;
  const extraHand = shoe0.cutCardOut; // the cut card came out in an earlier hand: this is the last
  const order = shoe0.order;
  let pos = shoe0.pos;
  const exposed = [...shoe0.exposed];
  let cutAt = -1; // deal index of the card that reaches the cut card
  const drawn: number[] = [];
  const core = playHand(() => {
    if (pos >= order.length) throw new Error('deal: the shoe ran out of cards');
    if (pos === shoe0.cutIndex && !shoe0.cutCardOut) cutAt = drawn.length;
    const c = order[pos++]!;
    exposed[c] = exposed[c]! + 1;
    drawn.push(c);
    return c;
  });
  const n = state.handCount + 1;
  const handInShoe = shoe0.handsThisShoe + 1;
  const hand: HandRecord = {
    ...core,
    n,
    shoeNo: shoe0.shoeNo,
    handInShoe,
    forced: isForced,
  };

  // Events in the section 1.8 order.
  events.push({ type: 'hand-started', n, shoeNo: shoe0.shoeNo, handInShoe, forced: isForced });
  const dealOrder: [Side, 0 | 1 | 2][] = [
    ['player', 0],
    ['banker', 0],
    ['player', 1],
    ['banker', 1],
  ];
  if (core.player.cards.length === 3) dealOrder.push(['player', 2]);
  if (core.banker.cards.length === 3) dealOrder.push(['banker', 2]);
  const cardEvent = (k: number): void => {
    const [to, index] = dealOrder[k]!;
    if (k === cutAt) events.push({ type: 'cut-card' });
    events.push({ type: 'card-dealt', to, index, card: drawn[k]!, sideways: index === 2 });
  };
  for (let k = 0; k < 4; k++) cardEvent(k);
  events.push({ type: 'pause-point', at: 'two-cards' });
  const pNat = core.player.natural;
  const bNat = core.banker.natural;
  if (pNat || bNat) {
    // A natural ends the hand, so both sides hold two cards and these are the two-card totals.
    events.push({
      type: 'natural',
      side: pNat && bNat ? 'both' : pNat ? 'player' : 'banker',
      player: core.player.total,
      banker: core.banker.total,
    });
  }
  const twoCardTotal = (cards: readonly Card[]) => handTotal(cards.slice(0, 2));
  events.push({
    type: 'draw-decision',
    side: 'player',
    total: twoCardTotal(core.player.cards),
    decision: core.playerRule,
  });
  let k = 4;
  if (core.player.cards.length === 3) cardEvent(k++);
  events.push({ type: 'pause-point', at: 'player-third' });
  events.push({
    type: 'draw-decision',
    side: 'banker',
    total: twoCardTotal(core.banker.cards),
    decision: core.bankerRule,
  });
  if (core.banker.cards.length === 3) cardEvent(k);
  events.push({ type: 'pause-point', at: 'all-cards' });
  events.push({ type: 'hand-result', hand });
  const entry = roadEntry(hand);
  events.push({ type: 'road-updated', entry });

  const result = settleHand(hand, state.bets, state.rules);
  for (const settlement of result.settlements) events.push({ type: 'bet-settled', settlement });
  events.push({ type: 'hand-settled', result });

  const stats: SessionStats = {
    hands: state.stats.hands + 1,
    winners: { ...state.stats.winners, [hand.winner]: state.stats.winners[hand.winner] + 1 },
    naturals: state.stats.naturals + (hand.natural ? 1 : 0),
    wagered: { ...state.stats.wagered },
    net: { ...state.stats.net },
    commissionPaid: state.stats.commissionPaid,
  };
  let returned = 0;
  for (const s of result.settlements) {
    stats.wagered[s.bet] += s.amount;
    stats.net[s.bet] += s.profit;
    stats.commissionPaid += s.commission;
    returned += s.amount + s.profit;
  }
  const cutCardOut = shoe0.cutCardOut || cutAt >= 0;
  const shoe: ShoeState = {
    ...shoe0,
    pos,
    exposed,
    cutCardOut,
    extraHandDealt: extraHand,
    finished: extraHand,
    handsThisShoe: handInShoe,
  };
  if (extraHand) events.push({ type: 'shoe-finished' });
  return {
    state: {
      ...state,
      bankroll: state.bankroll + returned,
      bets: {},
      lastBets: result.wagered > 0 ? { ...state.bets } : state.lastBets,
      shoe,
      history: [...state.history, entry],
      lastResult: result,
      handCount: n,
      stats,
    },
    events,
  };
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  const v = validateAction(state, action);
  if (!v.ok) return { ok: false, state, error: v };
  switch (action.type) {
    case 'set-bet': {
      const from = state.bets[action.bet] ?? 0;
      const to = action.amount;
      return {
        ok: true,
        state: {
          ...state,
          bankroll: state.bankroll - (to - from),
          bets: addTo(state.bets, action.bet, to),
        },
        events: from === to ? [] : [{ type: 'bet-set', bet: action.bet, from, to }],
      };
    }
    case 'clear-bets':
      return {
        ok: true,
        state: { ...state, bankroll: state.bankroll + slipTotal(state.bets), bets: {} },
        events: [{ type: 'bets-cleared' }],
      };
    case 'rebet': {
      const r = placeSlip(state, rebetSlip(state));
      return { ok: true, state: r.state, events: r.events };
    }
    case 'deal': {
      const r = deal(state, action.rebet === true);
      return { ok: true, state: r.state, events: r.events };
    }
    case 'new-shoe':
      return {
        ok: true,
        state: { ...state, shoe: { ...state.shoe, finished: true } },
        events: [{ type: 'shoe-ended-early' }],
      };
  }
}

/** Applies actions in order; throws on the first invalid one. */
export function replay(initial: GameState, actions: readonly Action[]): GameState {
  let s = initial;
  actions.forEach((a, i) => {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`replay: action ${i} (${a.type}) invalid: ${r.error.message}`);
    s = r.state;
  });
  return s;
}

/** What a player can know. Strategies and the Shoe tracker only ever receive this. */
export function visibleView(state: GameState): VisibleView {
  const fresh = needsShuffle(state.shoe);
  return {
    rules: state.rules,
    bankroll: state.bankroll,
    bets: state.bets,
    lastBets: state.lastBets,
    history: state.history,
    lastResult: state.lastResult,
    unseenRanks: fresh
      ? new Array<number>(13).fill(state.rules.decks * 4)
      : unseenRanks(state.shoe, state.rules.decks),
    shoeNo: state.shoe.shoeNo,
    handInShoe: fresh ? 0 : state.shoe.handsThisShoe,
    nextHandNewShoe: fresh,
  };
}

/** Bankroll plus chips on the felt (conserved by every action except a deal's settlement). */
export function equity(state: GameState): Cents {
  return state.bankroll + slipTotal(state.bets);
}

/**
 * The action types that can succeed now. `set-bet` is listed when some offered bet can be
 * changed (chips on the felt, or the rack covers a minimum); validate a concrete amount with
 * `validateAction`.
 */
export function legalActions(state: GameState): ActionType[] {
  const out: ActionType[] = [];
  const onFelt = slipTotal(state.bets) > 0;
  const minimum = Math.min(state.rules.mainMin, state.rules.sideMin);
  if (onFelt || (betsOffered(state.rules).length > 0 && state.bankroll >= minimum))
    out.push('set-bet');
  if (onFelt) out.push('clear-bets');
  if (validateAction(state, { type: 'rebet' }).ok) out.push('rebet');
  if (validateAction(state, { type: 'deal' }).ok) out.push('deal');
  if (state.shoe.shoeNo > 0 && !state.shoe.finished) out.push('new-shoe');
  return out;
}

/** Scenes: replaces the forced-hand queue. Throws on an invalid hand. */
export function queueForced(state: GameState, hands: readonly ForcedHand[]): GameState {
  checkForced(hands, state.rules, 'queueForced');
  return { ...state, forced: [...hands] };
}

/**
 * Scenes: reshuffle now, event-free. `'fresh'` is a normal shuffle and burn; a ShoeSetup applies
 * its removals and start card. The roads are cleared (a new shoe). Throws on a bad setup.
 */
export function startShoe(state: GameState, setup: ShoeSetup | 'fresh'): GameState {
  return shuffleInto(state, setup === 'fresh' ? undefined : setup, false);
}
