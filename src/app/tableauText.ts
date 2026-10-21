// Plain-language drawing rules generated from the engine's TABLEAU, playerDraws and bankerDraws
// (never typed by hand), for the Rules screen, Drill feedback and the lesson tableau blocks.
import { TABLEAU, bankerDraws, playerDraws } from '../sim';
import type { CardValue, TableauCellId } from '../sim';

const BANKER_CELL = /^b([0-9])\/(s|p([0-9]))$/;
const PLAYER_CELL = /^p([0-9])$/;

/** "2–7", "4, 5" or "0, 1, 8, 9": a value list with runs of 3+ collapsed. */
export function valueList(values: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j]! + 1) j++;
    if (j - i >= 2) out.push(`${values[i]}–${values[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(values[k]));
    i = j + 1;
  }
  return out.join(', ');
}

/** When the Banker (two-card total `b`, 0–7) draws after the Player drew a third card. */
export function bankerRowText(b: number): string {
  const row = TABLEAU[b];
  if (!row) return '';
  const draws = [...Array(10).keys()].filter((p) => row[1 + p]);
  if (draws.length === 10) return `Banker ${b} always draws.`;
  if (draws.length === 0) return `Banker ${b} always stands.`;
  const stands = [...Array(10).keys()].filter((p) => !row[1 + p]);
  if (stands.length <= 2)
    return `Banker ${b} draws on anything except a Player third card of ${valueList(stands)}.`;
  return `Banker ${b} draws when the Player's third card is ${valueList(draws)}.`;
}

export function isCell(cell: string): boolean {
  if (cell === 'nat') return true;
  const b = BANKER_CELL.exec(cell);
  if (b) return TABLEAU[Number(b[1])] !== undefined;
  return PLAYER_CELL.test(cell);
}

/** One cell in words, with the answer: "Banker 5, Player's third card 4: the Banker draws." */
export function describeCell(cell: TableauCellId): string | null {
  if (cell === 'nat') return 'A natural (8 or 9 on two cards, either side): both hands stand.';
  const p = PLAYER_CELL.exec(cell);
  if (p) {
    const t = Number(p[1]) as CardValue;
    if (t >= 8) return `Player ${t} is a natural: both hands stand.`;
    const d = playerDraws(t, 0);
    return `Player ${t}: the Player ${d.draws ? 'draws' : 'stands'}.`;
  }
  const b = BANKER_CELL.exec(cell);
  if (!b || TABLEAU[Number(b[1])] === undefined) return null;
  const bt = Number(b[1]) as CardValue;
  if (b[2] === 's') {
    const d = bankerDraws(bt, 6, null);
    return `Banker ${bt}, the Player stood: the Banker ${d.draws ? 'draws' : 'stands'}.`;
  }
  const third = Number(b[3]) as CardValue;
  const d = bankerDraws(bt, 0, third);
  return `Banker ${bt}, Player's third card ${third}: the Banker ${d.draws ? 'draws' : 'stands'}.`;
}

/** The Drill mode that trains a cell: Player cells → player, Banker cells → banker. */
export function drillModeForCell(cell: TableauCellId): 'player' | 'banker' {
  return cell.startsWith('b') ? 'banker' : 'player';
}
