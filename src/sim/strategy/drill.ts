// Drill: the third-card trainer (simulator.md section 6.5, curriculum.md section 9, D11, D22, D29).
// Pure and seeded. Spots are dealt from a fresh 8-deck composition and kept only when they match
// the category; every answer comes from the engine's own rules (playHand, playerDraws,
// bankerDraws, settleHand), never a separate copy.
import { cardCode, cardValue, parseCards } from '../engine/cards';
import { randBelow } from '../engine/rng';
import { settleHand } from '../engine/settle';
import { bankerDraws, handTotal, playerDraws, playHand } from '../engine/tableau';
import type {
  BetId,
  Card,
  CardValue,
  Cents,
  HandRecord,
  RngState,
  TableauRuleId,
  VariantId,
  Winner,
} from '../engine/types';
import { VARIANT_IDS } from '../engine/types';
import { formatMoney } from '../engine/money';
import { rulesFor } from './metrics';
import { DRILL_CATEGORY_IDS, DRILL_MODE_CATEGORIES } from './types';
import type {
  DrillCategoryId,
  DrillFilter,
  DrillGrade,
  DrillMode,
  DrillSpot,
  TableauCellId,
} from './types';

const DECKS = 8;
const MAX_ATTEMPTS = 200_000;

// ---------- pinned "which bet?" spots (curriculum.md section 9.3) ----------
export interface WhichBetSpot {
  table: string;
  a: string;
  b: string;
  answer: 'a' | 'b';
  edgeA: string;
  edgeB: string;
  /** Per-hour saving of the cheaper one at $10 (or of the slips shown), exact where the edge is. */
  savingPerHour: string;
  /** True when edgeA / edgeB are already $ per hour (the last two spots). */
  perHour?: boolean;
}
export const WHICH_BET_SPOTS: readonly WhichBetSpot[] = [
  {
    table: 'standard',
    a: 'Banker',
    b: 'Player',
    answer: 'a',
    edgeA: '1.06%',
    edgeB: '1.24%',
    savingPerHour: '$1.28',
  },
  {
    table: 'super-6',
    a: 'Banker',
    b: 'Player',
    answer: 'b',
    edgeA: '1.46%',
    edgeB: '1.24%',
    savingPerHour: '$1.61',
  },
  {
    table: 'standard vs EZ',
    a: 'Banker (5%)',
    b: 'EZ Banker',
    answer: 'b',
    edgeA: '1.06%',
    edgeB: '1.02%',
    savingPerHour: '$0.29',
  },
  {
    table: 'standard',
    a: 'Tie 8:1',
    b: 'Dragon Bonus Banker',
    answer: 'b',
    edgeA: '14.36%',
    edgeB: '9.37%',
    savingPerHour: '$35.90',
  },
  {
    table: 'standard',
    a: 'Player Pair',
    b: 'Dragon Bonus Player',
    answer: 'b',
    edgeA: '10.36%',
    edgeB: '2.65%',
    savingPerHour: '$55.51',
  },
  {
    table: 'EZ',
    a: 'Dragon 7',
    b: 'Panda 8',
    answer: 'a',
    edgeA: '7.61%',
    edgeB: '10.19%',
    savingPerHour: '$18.55',
  },
  {
    table: 'any',
    a: 'Tie 9:1',
    b: 'Dragon 7',
    answer: 'a',
    edgeA: '4.84%',
    edgeB: '7.61%',
    savingPerHour: '$19.92',
  },
  {
    table: 'any',
    a: 'Big',
    b: 'Small',
    answer: 'a',
    edgeA: '4.35%',
    edgeB: '5.28%',
    savingPerHour: '$6.70',
  },
  {
    table: 'any',
    a: 'Perfect Pair 25/200',
    b: 'Either Pair 5:1',
    answer: 'a',
    edgeA: '8.05%',
    edgeB: '13.71%',
    savingPerHour: '$40.75',
  },
  {
    table: '4% table vs EZ',
    a: 'Banker 4%',
    b: 'EZ Banker',
    answer: 'a',
    edgeA: '0.60%',
    edgeB: '1.02%',
    savingPerHour: '$3.02',
  },
  {
    table: 'per hour',
    a: '$25 Banker',
    b: '$10 Player + $5 Tie',
    answer: 'a',
    edgeA: '$19.04/h',
    edgeB: '$60.59/h',
    savingPerHour: '$41.55',
    perHour: true,
  },
  {
    table: 'per hour',
    a: '$10 Martingale (Banker)',
    b: '$25 flat Banker',
    answer: 'b',
    edgeA: '$25.32/h',
    edgeB: '$19.04/h',
    savingPerHour: '$6.28',
    perHour: true,
  },
];

// ---------- copy (curriculum.md section 9.2) ----------
export const CATEGORY_REMINDER: Readonly<Record<DrillCategoryId, string>> = {
  'hand-total': 'Tens and faces are 0. Keep only the last digit.',
  natural: 'An 8 or 9 on two cards, on either side, ends the hand.',
  'player-draw': 'Player: 0 to 5 draws, 6 and 7 stand.',
  'banker-player-stood': 'Player stood, so the Banker copies the rule: 0 to 5 draws.',
  'banker-0-2': 'Banker 0, 1 or 2 always draws.',
  'banker-3': 'Banker 3 draws on anything except a Player 8.',
  'banker-4': 'Banker 4 draws on a Player third card of 2 to 7.',
  'banker-5': 'Banker 5 draws on 4 to 7.',
  'banker-6': 'Banker 6 draws on 6 or 7 only.',
  'banker-7': 'Banker 7 always stands.',
  'banker-mixed': '',
  'who-wins': 'Closest to 9 wins. Equal totals tie.',
  settle: 'Banker wins pay 95¢ per $1. Tie pays 8 to 1. Pairs 11 to 1.',
  'which-bet': '',
};
export const RULE_REMINDER: Readonly<Record<TableauRuleId, string>> = {
  natural: CATEGORY_REMINDER.natural,
  'player-0-5-draws': CATEGORY_REMINDER['player-draw'],
  'player-6-7-stands': CATEGORY_REMINDER['player-draw'],
  'banker-player-stood-0-5-draws': CATEGORY_REMINDER['banker-player-stood'],
  'banker-player-stood-6-7-stands': CATEGORY_REMINDER['banker-player-stood'],
  'banker-0-2-draws': CATEGORY_REMINDER['banker-0-2'],
  'banker-3-draws-unless-8': CATEGORY_REMINDER['banker-3'],
  'banker-4-draws-on-2-7': CATEGORY_REMINDER['banker-4'],
  'banker-5-draws-on-4-7': CATEGORY_REMINDER['banker-5'],
  'banker-6-draws-on-6-7': CATEGORY_REMINDER['banker-6'],
  'banker-7-stands': CATEGORY_REMINDER['banker-7'],
};

const DRAW_STAND = ['Draw', 'Stand'] as const;
const WHO = ['Player', 'Banker', 'Tie'] as const;
const KEYPAD = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const WINNER_LABEL: Record<Winner, string> = { player: 'Player', banker: 'Banker', tie: 'Tie' };

// ---------- weighting (curriculum.md section 9.1) ----------
/** Banker categories with boundary-cell weighting: share of spots whose P3 is in `set`. */
export const BANKER_WEIGHTING: Readonly<
  Partial<Record<DrillCategoryId, { share: number; set: readonly number[] }>>
> = {
  'banker-3': { share: 0.3, set: [8] },
  'banker-4': { share: 0.5, set: [0, 1, 8, 9] },
  'banker-5': { share: 0.4, set: [3, 8] },
  'banker-6': { share: 0.6, set: [5, 6, 7, 8] },
};
/**
 * Mixed mode: fixed teaching weights (not measured frequencies). Every category appears; the
 * questions a learner meets on every hand (Player draw, Banker decisions, totals) weigh more.
 */
export const MIXED_WEIGHTS: Readonly<Record<DrillCategoryId, number>> = {
  'hand-total': 2,
  natural: 2,
  'player-draw': 3,
  'banker-player-stood': 1,
  'banker-0-2': 1,
  'banker-3': 1,
  'banker-4': 1,
  'banker-5': 1,
  'banker-6': 1,
  'banker-7': 1,
  'banker-mixed': 3,
  'who-wins': 2,
  settle: 1,
  'which-bet': 1,
};
const SETTLE_BETS: readonly BetId[] = [
  'banker',
  'tie',
  'player-pair',
  'banker-pair',
  'dragon-bonus-player',
  'dragon-bonus-banker',
];
const SETTLE_AMOUNTS: readonly Cents[] = [500, 1_000, 2_500, 10_000];

export function modeOf(category: DrillCategoryId): DrillMode {
  for (const [mode, cats] of Object.entries(DRILL_MODE_CATEGORIES) as [
    DrillMode,
    readonly DrillCategoryId[],
  ][])
    if (cats.includes(category)) return mode;
  return 'mixed';
}

// ---------- hand helpers ----------
interface Dealt {
  player: Card[];
  banker: Card[];
  hand: Omit<HandRecord, 'n' | 'shoeNo' | 'handInShoe' | 'forced'>;
}
/** Plays the engine's hand from 6 cards in deal order (P1 B1 P2 B2, then P3, then B3). */
function playFrom(cards: readonly Card[]): Dealt {
  let i = 0;
  const hand = playHand(() => cards[i++]!);
  return { player: [...hand.player.cards], banker: [...hand.banker.cards], hand };
}
/** Deal order of a finished hand's cards (inverse of playFrom). */
function dealOrder(player: readonly Card[], banker: readonly Card[]): Card[] {
  const out = [player[0]!, banker[0]!, player[1]!, banker[1]!];
  if (player[2] !== undefined) out.push(player[2]);
  if (banker[2] !== undefined) out.push(banker[2]);
  return out;
}

/** Draws `k` cards from a fresh `DECKS`-deck shoe, without replacement. */
function drawFresh(rng: RngState, k: number): [Card[], RngState] {
  const left = new Array<number>(52).fill(DECKS);
  let n = 52 * DECKS;
  let r = rng;
  const out: Card[] = [];
  for (let i = 0; i < k; i++) {
    const [j, next] = randBelow(r, n);
    r = next;
    let acc = 0;
    let c = 0;
    for (; c < 52; c++) {
      acc += left[c]!;
      if (j < acc) break;
    }
    left[c]!--;
    n--;
    out.push(c);
  }
  return [out, r];
}

const v = (c: Card | undefined): CardValue | null => (c === undefined ? null : cardValue(c));

// ---------- building spots (shared by nextSpot and spotFromCode) ----------
interface SettleExtra {
  bet: BetId;
  amount: Cents;
  variant: VariantId;
}

function bankerCell(bt: CardValue, p3: CardValue | null): TableauCellId {
  return p3 === null ? `b${bt}/s` : `b${bt}/p${p3}`;
}
function handCell(player: readonly Card[], banker: readonly Card[]): TableauCellId {
  const pt = handTotal(player.slice(0, 2));
  const bt = handTotal(banker.slice(0, 2));
  if (pt >= 8 || bt >= 8) return 'nat';
  return bankerCell(bt, v(player[2]));
}
const codeOf = (cs: readonly Card[]): string => cs.map(cardCode).join('');

function fail(code: string, why: string): never {
  throw new Error(`Bad spot code "${code}": ${why}`);
}

/** Settles a full hand for one bet with the engine (profit in cents). */
function settleProfit(player: readonly Card[], banker: readonly Card[], x: SettleExtra): number {
  const { hand } = playFrom(dealOrder(player, banker));
  const rec: HandRecord = { ...hand, n: 1, shoeNo: 1, handInShoe: 1, forced: false };
  const res = settleHand(rec, { [x.bet]: x.amount }, rulesFor(x.variant, 8));
  return res.settlements[0]?.profit ?? 0;
}

function settleOptions(profit: number, amount: number): string[] {
  const cands = [
    profit,
    profit + amount,
    amount,
    Math.round(amount * 0.95),
    2 * amount,
    3 * amount,
  ];
  const picked: number[] = [profit];
  for (const c of cands) if (picked.length < 3 && c > 0 && !picked.includes(c)) picked.push(c);
  return picked.sort((a, b) => a - b).map((c) => formatMoney(c));
}

function build(
  code: string,
  category: DrillCategoryId,
  player: Card[],
  banker: Card[],
  extra?: SettleExtra | number,
): DrillSpot {
  const mode = modeOf(category);
  const pt = handTotal(player.slice(0, 2));
  const bt = handTotal(banker.slice(0, 2));
  const natural = pt >= 8 || bt >= 8;
  switch (category) {
    case 'which-bet': {
      const i = extra as number;
      const w = WHICH_BET_SPOTS[i] ?? fail(code, 'no such which-bet spot');
      return {
        code,
        category,
        mode,
        player: [],
        banker: [],
        cell: '',
        question: 'Which bet costs less?',
        options: [w.a, w.b],
        whichBet: {
          table: w.table,
          a: w.a,
          b: w.b,
          answer: w.answer,
          edgeA: w.edgeA,
          edgeB: w.edgeB,
        },
      };
    }
    case 'hand-total': {
      const side = player.length > 0 ? 'Player' : 'Banker';
      const cards = player.length > 0 ? player : banker;
      if (cards.length < 2 || cards.length > 3 || (player.length > 0 && banker.length > 0))
        fail(code, 'hand-total takes 2 or 3 cards on one side');
      return {
        code,
        category,
        mode,
        player,
        banker,
        cell: `${side === 'Player' ? 'p' : 'b'}${handTotal(cards)}`,
        question: `What's the ${side} total?`,
        options: KEYPAD,
      };
    }
    case 'natural':
    case 'player-draw': {
      if (player.length !== 2 || banker.length !== 2) fail(code, 'two cards each');
      if (category === 'player-draw' && natural) fail(code, 'player-draw has no natural');
      return {
        code,
        category,
        mode,
        player,
        banker,
        cell: natural ? 'nat' : `p${pt}`,
        question: 'Does the Player draw?',
        options: DRAW_STAND,
      };
    }
    case 'who-wins':
    case 'settle': {
      if (player.length < 2 || player.length > 3 || banker.length < 2 || banker.length > 3)
        fail(code, 'not a complete hand');
      const order = dealOrder(player, banker);
      let full: Dealt;
      try {
        full = playFrom([...order, ...order]); // padding: an incomplete hand draws past its cards
      } catch (e) {
        return fail(code, (e as Error).message);
      }
      if (codeOf(full.player) !== codeOf(player) || codeOf(full.banker) !== codeOf(banker))
        fail(code, 'not a complete hand');
      const base = {
        code,
        category,
        mode,
        player,
        banker,
        cell: handCell(player, banker),
      };
      if (category === 'who-wins') return { ...base, question: 'Who wins?', options: WHO };
      const x = extra as SettleExtra;
      const profit = settleProfit(player, banker, x);
      return {
        ...base,
        question: "What's this bet paid?",
        options: settleOptions(profit, x.amount),
        payout: {
          bet: x.bet,
          amount: x.amount,
          variant: x.variant,
          winner: full.hand.winner,
          bankerTotal: full.hand.banker.total,
          bankerCards: full.hand.banker.cards.length as 2 | 3,
        },
      };
    }
    default: {
      // Banker decisions: the Player's decision is shown (third card when it drew).
      if (banker.length !== 2) fail(code, 'the Banker shows two cards');
      if (natural) fail(code, 'no Banker decision after a natural');
      const drew = playerDraws(pt, bt).draws;
      if (player.length !== (drew ? 3 : 2)) fail(code, 'Player card count does not match its rule');
      const p3 = v(player[2]);
      const ok = (() => {
        switch (category) {
          case 'banker-player-stood':
            return !drew;
          case 'banker-0-2':
            return drew && bt <= 2;
          case 'banker-3':
          case 'banker-4':
          case 'banker-5':
          case 'banker-6':
          case 'banker-7':
            return drew && bt === Number(category.slice(7));
          case 'banker-mixed':
            return true;
          default:
            return false;
        }
      })();
      if (!ok) fail(code, `cards do not match ${category}`);
      return {
        code,
        category,
        mode,
        player,
        banker,
        cell: bankerCell(bt, p3),
        question: 'Does the Banker draw?',
        options: DRAW_STAND,
      };
    }
  }
}

// ---------- codes ----------
/** '<category>:<player cards>.<banker cards>' (+ ':<bet>:<amount>:<variant>' for settle; 'which-bet:<i>'). */
export function spotCode(spot: Omit<DrillSpot, 'code'>): string {
  if (spot.category === 'which-bet') {
    const i = WHICH_BET_SPOTS.findIndex(
      (w) =>
        w.table === spot.whichBet?.table && w.a === spot.whichBet?.a && w.b === spot.whichBet?.b,
    );
    return `which-bet:${i}`;
  }
  const base = `${spot.category}:${codeOf(spot.player)}.${codeOf(spot.banker)}`;
  if (spot.category === 'settle' && spot.payout)
    return `${base}:${spot.payout.bet}:${spot.payout.amount}:${spot.payout.variant}`;
  return base;
}

export function spotFromCode(code: string): DrillSpot {
  const [cat, ...rest] = code.split(':');
  const category = cat as DrillCategoryId;
  if (!DRILL_CATEGORY_IDS.includes(category)) fail(code, 'unknown category');
  if (category === 'which-bet') {
    if (rest.length !== 1 || !/^\d+$/.test(rest[0]!)) fail(code, 'which-bet:<index>');
    return build(code, category, [], [], Number(rest[0]));
  }
  const cards = rest[0];
  if (cards === undefined || !cards.includes('.')) fail(code, 'missing cards');
  const [p, b] = cards.split('.') as [string, string];
  let player: Card[];
  let banker: Card[];
  try {
    player = p ? parseCards(p) : [];
    banker = b ? parseCards(b) : [];
  } catch (e) {
    return fail(code, (e as Error).message);
  }
  if (category === 'settle') {
    if (rest.length !== 4) fail(code, 'settle needs :<bet>:<amount>:<variant>');
    const bet = rest[1] as BetId;
    const amount = Number(rest[2]);
    const variant = rest[3] as VariantId;
    if (!SETTLE_BETS.includes(bet)) fail(code, 'bad bet');
    if (!Number.isInteger(amount) || amount <= 0) fail(code, 'bad amount');
    if (!VARIANT_IDS.includes(variant)) fail(code, 'bad variant');
    return build(code, category, player, banker, { bet, amount, variant });
  }
  if (rest.length !== 1) fail(code, 'extra fields');
  return build(code, category, player, banker);
}

function finish(
  category: DrillCategoryId,
  player: Card[],
  banker: Card[],
  extra?: SettleExtra | number,
): DrillSpot {
  const tmp = build('', category, player, banker, extra);
  const code = spotCode(tmp);
  return { ...tmp, code };
}

// ---------- generation ----------
function pickWeighted<T extends string>(
  rng: RngState,
  items: readonly [T, number][],
): [T, RngState] {
  const total = items.reduce((s, [, w]) => s + w, 0);
  const [u, r] = randBelow(rng, total);
  let acc = 0;
  for (const [k, w] of items) {
    acc += w;
    if (u < acc) return [k, r];
  }
  return [items[items.length - 1]![0], r];
}
const coin = (rng: RngState, p: number): [boolean, RngState] => {
  const [u, r] = randBelow(rng, 1_000_000);
  return [u < p * 1_000_000, r];
};

/** One spot of `category` (rejection sampling from fresh shoes). */
function sample(
  rng: RngState,
  category: DrillCategoryId,
  variant: VariantId,
): [DrillSpot, RngState] {
  let r = rng;
  if (category === 'which-bet') {
    const [i, next] = randBelow(r, WHICH_BET_SPOTS.length);
    return [finish(category, [], [], i), next];
  }
  if (category === 'hand-total') {
    let three: boolean;
    let onPlayer: boolean;
    [three, r] = coin(r, 0.5);
    [onPlayer, r] = coin(r, 0.5);
    let cards: Card[];
    [cards, r] = drawFresh(r, three ? 3 : 2);
    return [finish(category, onPlayer ? cards : [], onPlayer ? [] : cards), r];
  }
  // Category-specific targets decided before dealing.
  let wantNatural: boolean | null = null;
  if (category === 'natural') [wantNatural, r] = coin(r, 0.5);
  let inSet: boolean | null = null;
  const weight = BANKER_WEIGHTING[category];
  if (weight) [inSet, r] = coin(r, weight.share);
  let settle: SettleExtra | null = null;
  if (category === 'settle') {
    let bi: number;
    let ai: number;
    [bi, r] = randBelow(r, SETTLE_BETS.length);
    [ai, r] = randBelow(r, SETTLE_AMOUNTS.length);
    settle = { bet: SETTLE_BETS[bi]!, amount: SETTLE_AMOUNTS[ai]!, variant };
  }
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    let cards: Card[];
    [cards, r] = drawFresh(r, 6);
    const d = playFrom(cards);
    const pt = handTotal(d.player.slice(0, 2));
    const bt = handTotal(d.banker.slice(0, 2));
    const natural = pt >= 8 || bt >= 8;
    const two = (cs: Card[]) => cs.slice(0, 2);
    switch (category) {
      case 'natural':
        if (natural === wantNatural) return [finish(category, two(d.player), two(d.banker)), r];
        continue;
      case 'player-draw':
        if (!natural) return [finish(category, two(d.player), two(d.banker)), r];
        continue;
      case 'who-wins':
        return [finish(category, d.player, d.banker), r];
      case 'settle': {
        const x = settle!;
        if (settleProfit(d.player, d.banker, x) > 0)
          return [finish(category, d.player, d.banker, x), r];
        continue;
      }
      default: {
        if (natural) continue;
        const drew = d.player.length === 3;
        const p3 = v(d.player[2]);
        const shown = drew ? d.player : two(d.player);
        const ok =
          category === 'banker-mixed' ||
          (category === 'banker-player-stood' && !drew) ||
          (category === 'banker-0-2' && drew && bt <= 2) ||
          (category.length === 8 && drew && bt === Number(category.slice(7)));
        if (!ok) continue;
        if (weight && inSet !== null && weight.set.includes(p3!) !== inSet) continue;
        return [finish(category, shown, two(d.banker)), r];
      }
    }
  }
  throw new Error(`nextSpot: no ${category} spot found`);
}

function categoriesFor(filter: DrillFilter): [DrillCategoryId, number][] {
  if (filter.category) {
    if (filter.mode !== 'mixed' && !DRILL_MODE_CATEGORIES[filter.mode].includes(filter.category))
      throw new Error(`Category "${filter.category}" is not in mode "${filter.mode}"`);
    return [[filter.category, 1]];
  }
  if (filter.mode === 'mixed') return DRILL_CATEGORY_IDS.map((c) => [c, MIXED_WEIGHTS[c]]);
  return DRILL_MODE_CATEGORIES[filter.mode].map((c) => [c, 1]);
}

/** The next spot for a filter (D29). `focus: 'misses'` is replayed by the app from saved codes. */
export function nextSpot(rng: RngState, filter: DrillFilter): { spot: DrillSpot; rng: RngState } {
  const cats = categoriesFor(filter);
  const variant = filter.variant ?? 'punto-banco';
  const cells = Array.isArray(filter.focus) && filter.focus.length > 0 ? filter.focus : null;
  let r = rng;
  for (let n = 0; n < 5_000; n++) {
    let cat: DrillCategoryId;
    [cat, r] = pickWeighted(r, cats);
    let spot: DrillSpot;
    [spot, r] = sample(r, cat, variant);
    if (!cells || cells.includes(spot.cell)) return { spot, rng: r };
  }
  throw new Error('nextSpot: no spot matches the focus cells');
}

// ---------- grading ----------
function correctAnswer(spot: DrillSpot): {
  answer: string;
  rule: TableauRuleId | null;
  detail: string;
} {
  const pt = handTotal(spot.player.slice(0, 2));
  const bt = handTotal(spot.banker.slice(0, 2));
  switch (spot.category) {
    case 'hand-total': {
      const cards = spot.player.length > 0 ? spot.player : spot.banker;
      return { answer: String(handTotal(cards)), rule: null, detail: '' };
    }
    case 'natural':
    case 'player-draw': {
      const d = playerDraws(pt, bt);
      return {
        answer: d.draws ? 'Draw' : 'Stand',
        rule: d.rule,
        detail: d.rule === 'natural' ? '' : ` (Player ${pt}.)`,
      };
    }
    case 'who-wins': {
      const full = playFrom(dealOrder(spot.player, spot.banker));
      return {
        answer: WINNER_LABEL[full.hand.winner],
        rule: full.hand.natural ? 'natural' : full.hand.bankerRule.rule,
        detail: ` (Player ${full.hand.player.total}, Banker ${full.hand.banker.total}.)`,
      };
    }
    case 'settle': {
      const p = spot.payout!;
      const profit = settleProfit(spot.player, spot.banker, p);
      return { answer: formatMoney(profit), rule: null, detail: '' };
    }
    case 'which-bet': {
      const w = spot.whichBet!;
      return { answer: w.answer === 'a' ? w.a : w.b, rule: null, detail: '' };
    }
    default: {
      const p3 = v(spot.player[2]);
      const d = bankerDraws(bt, pt, p3);
      const detail =
        p3 === null
          ? ` (Banker ${bt}, the Player stood.)`
          : ` (Banker ${bt}, the Player's third card was ${p3}.)`;
      return { answer: d.draws ? 'Draw' : 'Stand', rule: d.rule, detail };
    }
  }
}

function whichBetBody(spot: DrillSpot): string {
  const w = WHICH_BET_SPOTS.find(
    (x) => x.table === spot.whichBet?.table && x.a === spot.whichBet?.a && x.b === spot.whichBet?.b,
  )!;
  const [cheap, cheapEdge, dear, dearEdge] =
    w.answer === 'a' ? [w.a, w.edgeA, w.b, w.edgeB] : [w.b, w.edgeB, w.a, w.edgeA];
  return w.perHour
    ? `${cheap} ${cheapEdge} vs ${dear} ${dearEdge}: about ${w.savingPerHour} an hour less.`
    : `${cheap} ${cheapEdge} vs ${dear} ${dearEdge}: about ${w.savingPerHour} an hour less at $10.`;
}

/** Strict grading: one right answer (curriculum.md section 9.2). */
export function gradeSpot(spot: DrillSpot, chosen: string): DrillGrade {
  const { answer, rule, detail } = correctAnswer(spot);
  const reminder =
    spot.category === 'which-bet'
      ? whichBetBody(spot)
      : spot.category === 'banker-mixed'
        ? RULE_REMINDER[rule!]
        : CATEGORY_REMINDER[spot.category];
  return {
    category: spot.category,
    correct: chosen === answer,
    answer,
    chosen,
    rule,
    cell: spot.cell,
    explanation: `${reminder}${detail}`,
  };
}

/** Headline and body for a grade (curriculum.md section 9.2). */
export function gradeCopy(g: DrillGrade): { headline: string; body: string } {
  if (g.category === 'which-bet')
    return { headline: g.correct ? 'Correct!' : 'The other one.', body: g.explanation };
  return g.correct
    ? { headline: 'Correct!', body: g.explanation }
    : { headline: 'Not quite.', body: `${g.answer}. ${g.explanation}` };
}
