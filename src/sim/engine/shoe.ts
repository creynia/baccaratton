// The shoe (simulator.md section 1.6, D8, D17, D36). Pure: every function returns new objects.
import { FULL_DECK, cardCode, makeCard, rankOf } from './cards';
import { shuffle } from './rng';
import type { Card, Rank, RngState, ShoeSetup, ShoeState, TableRules } from './types';

/** Burn count for the face-up first card: A = 1 … 9 = 9, T/J/Q/K = 10. */
export function burnValue(card: Card): number {
  const r = rankOf(card);
  return r >= 9 ? 10 : r + 1;
}

/** Fewest unseen cards a setup may leave (D36). */
export const MIN_UNSEEN = 6;
/** A full hand needs at most 6 physical cards; with fewer left the next deal reshuffles. */
export const MAX_HAND_CARDS = 6;

/** The not-yet-shuffled placeholder shoe (shoeNo 0: the first deal shuffles). */
export function emptyShoe(rules: TableRules): ShoeState {
  const n = rules.decks * 52;
  return {
    shoeNo: 0,
    order: [],
    pos: 0,
    cutIndex: n - rules.cutCardFromEnd,
    burn: null,
    cutCardOut: false,
    extraHandDealt: false,
    finished: false,
    exposed: new Array<number>(52).fill(0),
    handsThisShoe: 0,
  };
}

/** Ranks in a value class: '0' = T, J, Q, K; '1' = A; '2'..'9' = that rank. */
function classRanks(cls: string): Rank[] {
  const v = Number(cls);
  if (!Number.isInteger(v) || v < 0 || v > 9 || cls.length !== 1)
    throw new Error(`ShoeSetup: bad value class "${cls}"`);
  return v === 0 ? [9, 10, 11, 12] : [(v - 1) as Rank];
}

/**
 * The cards a `removed` spec names: within a class the ranks round-robin and, per rank, the suits
 * round-robin (spades, hearts, diamonds, clubs, spades …).
 */
export function removedCards(removed: ShoeSetup['removed'], decks: number): Card[] {
  const out: Card[] = [];
  for (const [cls, count] of Object.entries(removed ?? {})) {
    if (count === undefined || count === 0) continue;
    const ranks = classRanks(cls);
    if (!Number.isInteger(count) || count < 0 || count > ranks.length * 4 * decks)
      throw new Error(`ShoeSetup: cannot remove ${count} cards of class ${cls}`);
    for (let i = 0; i < count; i++) {
      const rank = ranks[i % ranks.length]!;
      const suit = Math.floor(i / ranks.length) % 4;
      out.push(makeCard(rank, suit as 0 | 1 | 2 | 3));
    }
  }
  return out;
}

function expose(exposed: number[], card: Card): void {
  exposed[card] = exposed[card]! + 1;
}

/**
 * Shuffles a new shoe (Fisher-Yates over decks x 52: exactly N - 1 randBelow calls) and burns.
 * Without `setup.removed` the first card is turned face up (exposed) and `burnValue` more cards are
 * burned face down (unseen). With `removed` (D36) those cards move to the front of the order in
 * their shuffled relative order and are all exposed; the burn is drawn from them: the first
 * removed card is the face-up card (if its value is more than the other removed cards can cover,
 * the first removed card that fits is used instead) and the next `value` removed cards are its
 * face-down burns. This "first removed card that fits" fallback keeps small removals valid on every
 * seed. `startAtCard` then deals forward (exposed). A setup that ends past the cut card makes the
 * first hand dealt the last one of the shoe (D36: scenes never deal on such study shoes).
 * Throws when fewer than 6 physical cards remain for a hand, or fewer than 6 unseen
 * cards would remain or the removed set cannot hold the burn.
 */
export function newShoe(
  rng: RngState,
  rules: TableRules,
  shoeNo: number,
  setup?: ShoeSetup,
): [ShoeState, RngState] {
  const n = rules.decks * 52;
  const deck: Card[] = [];
  for (let d = 0; d < rules.decks; d++) deck.push(...FULL_DECK);
  const [order, next] = shuffle(rng, deck);
  const exposed = new Array<number>(52).fill(0);
  let pos: number;
  let burn: { faceUp: Card; count: number };
  const removed = removedCards(setup?.removed, rules.decks);
  if (removed.length > 0) {
    // Stable partition: removed cards first (shuffled order), then everything else.
    const want = new Array<number>(52).fill(0);
    for (const c of removed) expose(want, c);
    const front: Card[] = [];
    const back: Card[] = [];
    for (const c of order) {
      if (want[c]! > 0) {
        want[c]!--;
        front.push(c);
      } else back.push(c);
    }
    const fits = front.findIndex((c) => burnValue(c) <= front.length - 1);
    if (fits < 0)
      throw new Error(
        `ShoeSetup: ${front.length} removed cards cannot hold the burn (a face-up card and that many more)`,
      );
    if (fits > 0) front.unshift(...front.splice(fits, 1));
    order.splice(0, n, ...front, ...back);
    for (const c of front) expose(exposed, c);
    burn = { faceUp: order[0]!, count: burnValue(order[0]!) };
    pos = front.length;
  } else {
    burn = { faceUp: order[0]!, count: burnValue(order[0]!) };
    expose(exposed, order[0]!);
    pos = 1 + burn.count;
  }
  const start = setup?.startAtCard;
  if (start !== undefined) {
    if (!Number.isInteger(start) || start < 0 || start > n)
      throw new Error(`ShoeSetup: bad startAtCard ${start}`);
    for (; pos < start; pos++) expose(exposed, order[pos]!);
  }
  const seen = exposed.reduce((a, b) => a + b, 0);
  if (n - seen < MIN_UNSEEN)
    throw new Error(`ShoeSetup leaves ${n - seen} unseen cards (at least ${MIN_UNSEEN})`);
  if (n - pos < MAX_HAND_CARDS)
    throw new Error(
      `ShoeSetup leaves ${n - pos} cards in the shoe (a hand needs up to ${MAX_HAND_CARDS})`,
    );
  const cutIndex = n - rules.cutCardFromEnd;
  return [
    {
      shoeNo,
      order,
      pos,
      cutIndex,
      burn,
      cutCardOut: pos > cutIndex,
      extraHandDealt: false,
      finished: false,
      exposed,
      handsThisShoe: 0,
    },
    next,
  ];
}

/**
 * Swaps `cards` (deal order) into the next draw positions: for each, the first copy at or after
 * its target index moves there. Returns null when a card has no copy left at or after `pos` (the
 * caller reshuffles first, D17) or the shoe is too short.
 */
export function placeForced(shoe: ShoeState, cards: readonly Card[]): ShoeState | null {
  if (shoe.pos + cards.length > shoe.order.length) return null;
  const order = [...shoe.order];
  for (let i = 0; i < cards.length; i++) {
    const t = shoe.pos + i;
    const j = order.indexOf(cards[i]!, t);
    if (j < 0) return null;
    order[j] = order[t]!;
    order[t] = cards[i]!;
  }
  return { ...shoe, order };
}

/** Unseen cards by rank (13): decks x 4 - exposed. Face-down burns stay unseen. */
export function unseenRanks(shoe: ShoeState, decks: number): number[] {
  const out = new Array<number>(13).fill(decks * 4);
  for (let c = 0; c < 52; c++) out[c >> 2] = out[c >> 2]! - shoe.exposed[c]!;
  return out;
}

/** Physical cards left in the shoe (including those behind the cut card). */
export function cardsLeft(shoe: ShoeState): number {
  return shoe.order.length - shoe.pos;
}

/** Does the next deal need a fresh shoe? (not shuffled yet, finished, or too few cards for a hand) */
export function needsShuffle(shoe: ShoeState): boolean {
  return shoe.shoeNo === 0 || shoe.finished || cardsLeft(shoe) < MAX_HAND_CARDS;
}

/** For error messages. */
export const codes = (cards: readonly Card[]): string => cards.map(cardCode).join(' ');
