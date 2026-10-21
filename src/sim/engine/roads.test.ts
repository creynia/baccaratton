import { describe, expect, it } from 'vitest';
import { createGame, replay } from './game';
import { beadPlate, bigRoad, parseRoadString, roadCounts, roadEntry } from './roads';

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

describe('parseRoadString review nits (brief update 3)', () => {
  it('a natural with no total defaults to 9', () => {
    expect(parseRoadString('Bn')[0]).toMatchObject({ winner: 'banker', natural: true, total: 9 });
    expect(parseRoadString('Tn')[0]).toMatchObject({ winner: 'tie', natural: true, total: 9 });
    expect(parseRoadString('Pbpn8')[0]).toMatchObject({ natural: true, total: 8 });
  });
  it.each(['Bn7', 'Pn0', 'Tn5', 'B0', 'P0'])('rejects the impossible %j', (s) => {
    expect(() => parseRoadString(s)).toThrow(/Bad road token/);
  });
  it('T0 and B1 are fine', () => {
    expect(parseRoadString('T0 B1').map((e) => e.total)).toEqual([0, 1]);
  });
});

const R = (s: string) =>
  parseRoadString(
    s.replace(/([BP])x(\d+)/g, (_, w: string, n: string) => `${w} `.repeat(Number(n))),
  );
const at = (big: ReturnType<typeof bigRoad>) =>
  big.cells.map(
    (c) => `${c.winner[0]!.toUpperCase()}(${c.col},${c.row})${c.ties ? `+${c.ties}T` : ''}`,
  );

describe('bead plate (section 3.2)', () => {
  it('fills column by column, top to bottom, ties included', () => {
    const cells = beadPlate(R('B P T Bbp Pn9 B P'));
    expect(cells.map((c) => [c.col, c.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 0],
    ]);
    expect(cells[3]!.entry).toMatchObject({ bankerPair: true, playerPair: true });
    expect(cells[2]!.entry.winner).toBe('tie');
    expect(beadPlate(R('B P T B'), 3).map((c) => [c.col, c.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
    expect(beadPlate([])).toEqual([]);
  });
});

describe('Big Road (section 3.3) pinned fixtures', () => {
  it('T B B B B B B B P T P B: leading tie, dragon tail, a tie slash', () => {
    const big = bigRoad(R('T B B B B B B B P T P B'));
    expect(big.leadingTies).toBe(1);
    expect(at(big)).toEqual([
      'B(0,0)',
      'B(0,1)',
      'B(0,2)',
      'B(0,3)',
      'B(0,4)',
      'B(0,5)',
      'B(1,5)',
      'P(1,0)+1T',
      'P(1,1)',
      'B(2,0)',
    ]);
    expect(big.streaks).toEqual([
      { winner: 'banker', length: 7 },
      { winner: 'player', length: 2 },
      { winner: 'banker', length: 1 },
    ]);
  });
  it('B x8 P x7: the Player streak is blocked by the tail and turns at row 4', () => {
    expect(at(bigRoad(R('Bx8 Px7')))).toEqual([
      'B(0,0)',
      'B(0,1)',
      'B(0,2)',
      'B(0,3)',
      'B(0,4)',
      'B(0,5)',
      'B(1,5)',
      'B(2,5)',
      'P(1,0)',
      'P(1,1)',
      'P(1,2)',
      'P(1,3)',
      'P(1,4)',
      'P(2,4)',
      'P(3,4)',
    ]);
  });
  it('P B x8 P B x7', () => {
    expect(at(bigRoad(R('P Bx8 P Bx7')))).toEqual([
      'P(0,0)',
      'B(1,0)',
      'B(1,1)',
      'B(1,2)',
      'B(1,3)',
      'B(1,4)',
      'B(1,5)',
      'B(2,5)',
      'B(3,5)',
      'P(2,0)',
      'B(3,0)',
      'B(3,1)',
      'B(3,2)',
      'B(3,3)',
      'B(3,4)',
      'B(4,4)',
      'B(5,4)',
    ]);
  });
  it('multiple ties, pair dots, naturals, indices and streak numbers', () => {
    const big = bigRoad(R('T T Pp T T T Bbn9'));
    expect(big.leadingTies).toBe(2);
    expect(big.cells[0]).toMatchObject({
      winner: 'player',
      ties: 3,
      playerPair: true,
      index: 2,
      streak: 0,
    });
    expect(big.cells[1]).toMatchObject({ bankerPair: true, natural: true, index: 6, streak: 1 });
    expect(bigRoad(R('T T'))).toEqual({ cells: [], leadingTies: 2, streaks: [] });
  });
  it('roadCounts', () => {
    expect(roadCounts(R('B Bb P Pp T Tn8 Pn9'))).toEqual({
      banker: 2,
      player: 3,
      tie: 2,
      bankerPair: 1,
      playerPair: 1,
      naturals: 2,
    });
  });
});

describe('roads from dealt hands', () => {
  it('roadEntry and a rebuild from history after replay', () => {
    const g0 = createGame({ seed: 31 });
    const actions = Array.from({ length: 40 }, () => ({ type: 'deal' }) as const);
    const s = replay(g0, actions);
    expect(s.history).toHaveLength(40);
    const again = replay(g0, actions);
    expect(bigRoad(again.history)).toEqual(bigRoad(s.history));
    expect(beadPlate(again.history)).toEqual(beadPlate(s.history));
    const h = s.lastResult!.hand;
    expect(roadEntry(h)).toEqual(s.history.at(-1));
    const e = roadEntry(h);
    expect(e.total).toBe(h.winner === 'banker' ? h.banker.total : h.player.total);
    expect(
      roadCounts(s.history).banker + roadCounts(s.history).player + roadCounts(s.history).tie,
    ).toBe(40);
  });
});
