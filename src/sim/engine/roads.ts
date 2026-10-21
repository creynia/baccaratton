// Scoreboards (simulator.md section 3). `parseRoadResults` is real in WP0 (the `roads` content
// block needs it); the road builders are TODO(engine).
import type { BeadCell, BigRoad, HandRecord, RoadEntry, Winner } from './types';

const todo = (name: string): never => {
  throw new Error(`TODO(engine): ${name}`);
};

export function roadEntry(_hand: HandRecord): RoadEntry {
  return todo('roadEntry');
}
export function beadPlate(_entries: readonly RoadEntry[], _rows = 6): BeadCell[] {
  return todo('beadPlate');
}
export function bigRoad(_entries: readonly RoadEntry[], _rows = 6): BigRoad {
  return todo('bigRoad');
}
export function roadCounts(_entries: readonly RoadEntry[]): Record<Winner, number> {
  return todo('roadCounts');
}

const WINNER_OF: Record<string, Winner> = { B: 'banker', P: 'player', T: 'tie' };

/**
 * Parses a `roads` block result string: one letter per hand, `B` Banker, `P` Player, `T` Tie,
 * each optionally followed by lowercase pair marks `p` (Player Pair) and/or `b` (Banker Pair),
 * e.g. `BBPpBTPPb`. Spaces and commas are ignored. A letter alone is a Banker/Player/Tie result
 * with no pairs, no natural and total 7 (the `HistoryCode` convention of scene/types.ts).
 */
export function parseRoadResults(text: string): RoadEntry[] {
  const out: RoadEntry[] = [];
  for (const ch of text.replace(/[\s,]+/g, '')) {
    const winner = WINNER_OF[ch];
    if (winner) {
      out.push({
        winner,
        playerPair: false,
        bankerPair: false,
        natural: false,
        total: 7,
      });
      continue;
    }
    const last = out[out.length - 1];
    if ((ch === 'p' || ch === 'b') && last) {
      if (ch === 'p') last.playerPair = true;
      else last.bankerPair = true;
      continue;
    }
    throw new Error(`Bad road result "${ch}" in "${text}" (use B, P, T with optional p / b marks)`);
  }
  return out;
}
