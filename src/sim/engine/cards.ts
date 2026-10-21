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

function parseOne(code: string): Card {
  const r = RANK_CHARS.indexOf(code.charAt(0));
  const s = SUIT_CHARS.indexOf(code.charAt(1));
  if (code.length !== 2 || r < 0 || s < 0) throw new Error(`Bad card code "${code}"`);
  return r * 4 + s;
}

/**
 * Parses 'Kh 7d', 'Kh7d' or 'Kh,7d' into cards (the one card parser: content, URLs, tests).
 * Whitespace and commas are optional separators. Throws on a malformed code. Repeats are allowed
 * (eight decks hold eight copies of each card); content checks its own groups for duplicates.
 */
export function parseCards(codes: string): Card[] {
  const compact = codes.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Bad card list "${codes}"`);
  const cards: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) cards.push(parseOne(compact.slice(i, i + 2)));
  return cards;
}
