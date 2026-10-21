// Scoreboards (simulator.md section 3, D4, D22): bead plate, Big Road and the `roads` parser.
// Pure functions of the RoadEntry list, so a replay rebuilds them exactly.
import type {
  BeadCell,
  BigRoad,
  BigRoadCell,
  CardValue,
  HandRecord,
  RoadEntry,
  Winner,
} from './types';

/** Scoreboard header counts (section 3.4). */
export interface RoadCounts {
  banker: number;
  player: number;
  tie: number;
  bankerPair: number;
  playerPair: number;
  naturals: number;
}

/** The road entry of a dealt hand: winner, pair flags, natural, winning (or tied) total. */
export function roadEntry(hand: HandRecord): RoadEntry {
  const o = hand.outcome;
  return {
    winner: hand.winner,
    playerPair: o.playerPair,
    bankerPair: o.bankerPair,
    natural: hand.natural,
    total: hand.winner === 'banker' ? o.bankerTotal : o.playerTotal,
  };
}

/** Bead plate (section 3.2): one bead per hand, column by column, top to bottom. */
export function beadPlate(entries: readonly RoadEntry[], rows = 6): BeadCell[] {
  return entries.map((entry, index) => ({
    col: Math.floor(index / rows),
    row: index % rows,
    index,
    entry,
  }));
}

/** Big Road (section 3.3): streak columns with the dragon tail, ties as slashes on the last cell. */
export function bigRoad(entries: readonly RoadEntry[], rows = 6): BigRoad {
  const cells: BigRoadCell[] = [];
  const streaks: { winner: 'player' | 'banker'; length: number }[] = [];
  const taken = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;
  let leadingTies = 0;
  let startCol = -1;
  let turned = false;
  entries.forEach((e, index) => {
    if (e.winner === 'tie') {
      const lastCell = cells[cells.length - 1];
      if (lastCell) lastCell.ties++;
      else leadingTies++;
      return;
    }
    const prev = cells[cells.length - 1];
    let col: number;
    let row: number;
    if (!prev || prev.winner !== e.winner) {
      col = startCol + 1;
      while (taken.has(key(col, 0))) col++;
      row = 0;
      startCol = col;
      turned = false;
      streaks.push({ winner: e.winner, length: 1 });
    } else {
      if (!turned && prev.row + 1 < rows && !taken.has(key(prev.col, prev.row + 1))) {
        col = prev.col;
        row = prev.row + 1;
      } else {
        turned = true;
        row = prev.row;
        col = prev.col + 1;
        while (taken.has(key(col, row))) col++;
      }
      streaks[streaks.length - 1]!.length++;
    }
    taken.add(key(col, row));
    cells.push({
      col,
      row,
      streak: streaks.length - 1,
      winner: e.winner,
      ties: 0,
      playerPair: e.playerPair,
      bankerPair: e.bankerPair,
      natural: e.natural,
      index,
    });
  });
  return { cells, leadingTies, streaks };
}

export function roadCounts(entries: readonly RoadEntry[]): RoadCounts {
  const c: RoadCounts = { banker: 0, player: 0, tie: 0, bankerPair: 0, playerPair: 0, naturals: 0 };
  for (const e of entries) {
    c[e.winner]++;
    if (e.bankerPair) c.bankerPair++;
    if (e.playerPair) c.playerPair++;
    if (e.natural) c.naturals++;
  }
  return c;
}

const WINNER_OF: Readonly<Record<string, Winner>> = { B: 'banker', P: 'player', T: 'tie' };
const TOKEN = /([BPT])(b?)(p?)(n?)([0-9]?)/y;
const SEPARATORS = /[\s,]*/y;

/**
 * Parses road tokens `[BPT][b]?[p]?[n]?[0-9]?` (section 3.1): the winner letter, then optional
 * `b` (Banker pair), `p` (Player pair), `n` (natural) in that order, then an optional winning or
 * tied total (default 7 for B/P, 0 for T, and 9 for any natural). Tokens may be separated by
 * whitespace or commas, or run together with no separator at all: `B Bbp P5 T Pn9`, `B,P,T` and
 * `BBPBTPPpPb` all parse. Throws on anything else, including results that cannot happen (a natural
 * below 8, a Player or Banker win on 0), so content validation catches typos. An empty string is
 * an empty list.
 */
export function parseRoadString(s: string): RoadEntry[] {
  const out: RoadEntry[] = [];
  let i = 0;
  const skip = () => {
    SEPARATORS.lastIndex = i;
    SEPARATORS.exec(s);
    i = SEPARATORS.lastIndex;
  };
  skip();
  while (i < s.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    const next = s.charAt(TOKEN.lastIndex);
    if (!m || (next !== '' && !/[\s,BPT]/.test(next))) {
      const at = m ? TOKEN.lastIndex : i;
      throw new Error(
        `Bad road token at "${s.slice(at, at + 8)}" in "${s}" (use [BPT] then optional b, p, n and a total 0-9)`,
      );
    }
    const [, letter, b, p, n, digit] = m;
    const winner = WINNER_OF[letter!]!;
    const natural = n === 'n';
    const total = digit ? Number(digit) : natural ? 9 : winner === 'tie' ? 0 : 7;
    if (natural && total < 8)
      throw new Error(`Bad road token "${m[0]}" in "${s}": a natural is 8 or 9`);
    if (winner !== 'tie' && total === 0)
      throw new Error(`Bad road token "${m[0]}" in "${s}": a winning total is at least 1`);
    out.push({
      winner,
      playerPair: p === 'p',
      bankerPair: b === 'b',
      natural,
      total: total as CardValue,
    });
    i = TOKEN.lastIndex;
    skip();
  }
  return out;
}
