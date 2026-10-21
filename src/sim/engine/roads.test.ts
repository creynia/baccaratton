import { describe, expect, it } from 'vitest';
import { parseRoadString } from './roads';

describe('parseRoadString (simulator.md section 3.1, D34)', () => {
  it('reads winner, pair marks, natural and total, with the documented defaults', () => {
    expect(parseRoadString('B Bbp P5 T Pn9')).toEqual([
      { winner: 'banker', playerPair: false, bankerPair: false, natural: false, total: 7 },
      { winner: 'banker', playerPair: true, bankerPair: true, natural: false, total: 7 },
      { winner: 'player', playerPair: false, bankerPair: false, natural: false, total: 5 },
      { winner: 'tie', playerPair: false, bankerPair: false, natural: false, total: 0 },
      { winner: 'player', playerPair: false, bankerPair: false, natural: true, total: 9 },
    ]);
    expect(parseRoadString('Tn8')[0]).toMatchObject({ winner: 'tie', natural: true, total: 8 });
    expect(parseRoadString('Pp5')[0]).toMatchObject({ playerPair: true, bankerPair: false });
  });
  it('accepts run-together tokens, commas and extra whitespace', () => {
    const winners = (s: string) =>
      parseRoadString(s)
        .map((e) => e.winner[0])
        .join('');
    expect(winners('BBPBTPPPB')).toBe('bbpbtpppb');
    expect(winners(' B, P\n T ')).toBe('bpt');
    const [, , , , , , c, d] = parseRoadString('BBPBTPPpPb');
    expect(c).toMatchObject({ winner: 'player', playerPair: true });
    expect(d).toMatchObject({ winner: 'player', bankerPair: true });
    expect(parseRoadString('')).toEqual([]);
    expect(parseRoadString('  ')).toEqual([]);
  });
  it.each(['BXP', 'pB', 'b', 'Bpb', 'Bnn', 'B10', 'Pn9x', 'bP', 'B7 7'])('rejects %j', (s) => {
    expect(() => parseRoadString(s)).toThrow(/Bad road token/);
  });
});
