import { describe, expect, it } from 'vitest';
import {
  FULL_DECK,
  cardCode,
  cardName,
  cardValue,
  makeCard,
  parseCard,
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
      expect(parseCard(cardCode(c))).toBe(c);
      expect(makeCard(rankOf(c), suitOf(c))).toBe(c);
    }
    expect(parseCard('As')).toBe(0);
    expect(parseCard('Kc')).toBe(51);
  });
  it('encodes rank and suit in the order of RANK_CHARS and SUIT_CHARS', () => {
    const c = parseCard('Td');
    expect(rankOf(c)).toBe(9);
    expect(suitOf(c)).toBe(2);
    expect(cardName(parseCard('As'))).toBe('Ace of spades');
    expect(cardName(parseCard('Kh'))).toBe('King of hearts');
    expect(cardName(parseCard('Td'))).toBe('Ten of diamonds');
  });
  it('rejects bad codes, odd lengths and duplicates; accepts an empty list', () => {
    expect(() => parseCards('Xs')).toThrow(/Bad card code/);
    expect(() => parseCards('1s')).toThrow(/Bad card code/);
    expect(() => parseCards('Ah1')).toThrow(/Bad card list/);
    expect(() => parseCards('AH')).toThrow(/Bad card code/);
    expect(() => parseCards('Ah Ah')).toThrow(/Duplicate/);
    expect(parseCards('')).toEqual([]);
  });
  it('allows repeated codes for forced shoes (eight decks) when asked', () => {
    expect(parseCards('Kh Kh', { allowDuplicates: true })).toHaveLength(2);
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
