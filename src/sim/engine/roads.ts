// Scoreboards (simulator.md section 3). `parseRoadString` is real in WP0 (D34, D37: the `roads`
// content block and SceneConfig.history need it); the road builders are TODO(engine).
import type { BeadCell, BigRoad, CardValue, HandRecord, RoadEntry, Winner } from './types';

const todo = (name: string): never => {
  throw new Error(`TODO(engine): ${name}`);
};

/** Scoreboard header counts (section 3.4). */
export interface RoadCounts {
  banker: number;
  player: number;
  tie: number;
  bankerPair: number;
  playerPair: number;
  naturals: number;
}

export function roadEntry(_hand: HandRecord): RoadEntry {
  return todo('roadEntry');
}
export function beadPlate(_entries: readonly RoadEntry[], _rows = 6): BeadCell[] {
  return todo('beadPlate');
}
export function bigRoad(_entries: readonly RoadEntry[], _rows = 6): BigRoad {
  return todo('bigRoad');
}
export function roadCounts(_entries: readonly RoadEntry[]): RoadCounts {
  return todo('roadCounts');
}

const WINNER_OF: Readonly<Record<string, Winner>> = { B: 'banker', P: 'player', T: 'tie' };
const TOKEN = /([BPT])(b?)(p?)(n?)([0-9]?)/y;
const SEPARATORS = /[\s,]*/y;

/**
 * Parses road tokens `[BPT][b]?[p]?[n]?[0-9]?` (section 3.1): the winner letter, then optional
 * `b` (Banker pair), `p` (Player pair), `n` (natural) in that order, then an optional winning or
 * tied total (default 7 for B/P, 0 for T). Tokens may be separated by whitespace or commas, or
 * run together: `B Bbp P5 T Pn9` and `BBPBTPPpPb` both parse. Throws on anything else, so
 * content validation catches typos. An empty string is an empty list.
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
    out.push({
      winner,
      playerPair: p === 'p',
      bankerPair: b === 'b',
      natural: n === 'n',
      total: (digit ? Number(digit) : winner === 'tie' ? 0 : 7) as CardValue,
    });
    i = TOKEN.lastIndex;
    skip();
  }
  return out;
}
