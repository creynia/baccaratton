import { describe, expect, it } from 'vitest';
import { parseRoadResults } from './roads';

describe('parseRoadResults', () => {
  it('reads B, P and T and ignores spaces and commas', () => {
    expect(parseRoadResults('BP, T B').map((e) => e.winner)).toEqual([
      'banker',
      'player',
      'tie',
      'banker',
    ]);
  });
  it('attaches lowercase pair marks to the preceding result', () => {
    const [a, b, c] = parseRoadResults('BpPbBpb');
    expect(a).toMatchObject({ playerPair: true, bankerPair: false });
    expect(b).toMatchObject({ playerPair: false, bankerPair: true });
    expect(c).toMatchObject({ playerPair: true, bankerPair: true });
  });
  it('gives plain entries no pairs and no natural', () => {
    expect(parseRoadResults('B')[0]).toMatchObject({ natural: false, playerPair: false });
  });
  it('rejects unknown letters and a mark with no result before it', () => {
    expect(() => parseRoadResults('BXP')).toThrow(/Bad road result/);
    expect(() => parseRoadResults('pB')).toThrow(/Bad road result/);
  });
  it('is empty for an empty string', () => {
    expect(parseRoadResults('')).toEqual([]);
  });
});
