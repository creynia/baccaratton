import { describe, expect, it } from 'vitest';
import {
  FULL_DECK,
  cardCode,
  cardName,
  cardValue,
  makeCard,
  parseCards,
  rankOf,
  suitOf,
} from './cards';

describe('parseCards', () => {
  it('parses spaced, compact and comma forms to the same cards', () => {
    const a = parseCards('Kh 7d');
    expect(parseCards('Kh7d')).toEqual(a);
    expect(parseCards('Kh,7d')).toEqual(a);
    expect(parseCards(' Kh ,  7d ')).toEqual(a);
    expect(a).toEqual([makeCard(12, 1), makeCard(6, 2)]);
  });
  it('round-trips all 52 codes and keeps the rank * 4 + suit layout', () => {
    expect(FULL_DECK).toHaveLength(52);
    for (const c of FULL_DECK) {
      expect(parseCards(cardCode(c))).toEqual([c]);
      expect(makeCard(rankOf(c), suitOf(c))).toBe(c);
    }
    expect(parseCards('As')).toEqual([0]);
    expect(parseCards('Kc')).toEqual([51]);
  });
  it('encodes rank and suit in the order of RANK_CHARS and SUIT_CHARS', () => {
    const [c] = parseCards('Td') as [number];
    expect(rankOf(c)).toBe(9);
    expect(suitOf(c)).toBe(2);
    expect(cardName(parseCards('As')[0]!)).toBe('Ace of spades');
    expect(cardName(parseCards('Kh')[0]!)).toBe('King of hearts');
    expect(cardName(parseCards('Td')[0]!)).toBe('Ten of diamonds');
  });
  it('rejects bad codes and odd lengths; accepts an empty list', () => {
    expect(() => parseCards('Xs')).toThrow(/Bad card code/);
    expect(() => parseCards('1s')).toThrow(/Bad card code/);
    expect(() => parseCards('Ah1')).toThrow(/Bad card list/);
    expect(() => parseCards('AH')).toThrow(/Bad card code/);
    expect(parseCards('')).toEqual([]);
  });
  it('allows repeated codes (eight decks hold eight copies of each card)', () => {
    expect(parseCards('Kh Kh')).toEqual([makeCard(12, 1), makeCard(12, 1)]);
  });
});

describe('cardValue (baccarat)', () => {
  it('is A = 1, 2-9 face value, T J Q K = 0, for all 52 cards', () => {
    const expected: Record<string, number> = {
      A: 1,
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      T: 0,
      J: 0,
      Q: 0,
      K: 0,
    };
    for (const c of FULL_DECK) expect(cardValue(c)).toBe(expected[cardCode(c).charAt(0)]);
  });
  it('rejects anything that is not a card', () => {
    expect(() => cardValue(-1)).toThrow(RangeError);
    expect(() => cardValue(52)).toThrow(RangeError);
    expect(() => cardValue(1.5)).toThrow(RangeError);
  });
});
