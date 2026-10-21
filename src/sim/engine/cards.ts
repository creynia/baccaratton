import { RANK_CHARS, SUIT_CHARS } from './types';
import type { Card, CardCode, CardValue, Rank, Suit } from './types';

const RANK_NAMES = [
  'Ace',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
] as const;
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export const FULL_DECK: readonly Card[] = Array.from({ length: 52 }, (_, i) => i);

export function rankOf(card: Card): Rank {
  return (card >> 2) as Rank;
}
export function suitOf(card: Card): Suit {
  return (card & 3) as Suit;
}
export function makeCard(rank: Rank, suit: Suit): Card {
  return rank * 4 + suit;
}
export function cardCode(card: Card): CardCode {
  return `${RANK_CHARS.charAt(card >> 2)}${SUIT_CHARS.charAt(card & 3)}`;
}
/** 'Ace of spades' (for aria-labels). */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card >> 2]} of ${SUIT_NAMES[card & 3]}`;
}

/** Baccarat value of a card: A = 1, 2-9 face value, T/J/Q/K = 0. */
export function cardValue(card: Card): CardValue {
  const rank = card >> 2;
  if (!Number.isInteger(card) || card < 0 || card > 51) throw new RangeError(`Bad card ${card}`);
  return (rank >= 9 ? 0 : rank + 1) as CardValue;
}

/** 'As' -> 0; throws on anything that is not a rank char followed by a suit char. */
export function parseCard(code: CardCode): Card {
  if (code.length !== 2) throw new Error(`Bad card code "${code}"`);
  const r = RANK_CHARS.indexOf(code.charAt(0));
  const s = SUIT_CHARS.indexOf(code.charAt(1));
  if (r < 0 || s < 0) throw new Error(`Bad card code "${code}"`);
  return r * 4 + s;
}

export interface ParseCardsOptions {
  /**
   * Eight decks hold up to eight copies of a card, so forced shoes (`?shoe=`) may repeat a code.
   * Default false: lesson text and quiz hands name distinct cards.
   */
  allowDuplicates?: boolean;
}

/**
 * Parses 'Kh 7d', 'Kh7d' or 'Kh,7d' into cards. Whitespace and commas are separators and
 * optional. Throws on a malformed code or (unless allowed) a duplicate card. Shared by content,
 * URLs and tests.
 */
export function parseCards(text: string, opts: ParseCardsOptions = {}): Card[] {
  const compact = text.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Bad card list "${text}"`);
  const cards: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const card = parseCard(compact.slice(i, i + 2));
    if (!opts.allowDuplicates && cards.includes(card))
      throw new Error(`Duplicate card "${compact.slice(i, i + 2)}"`);
    cards.push(card);
  }
  return cards;
}
