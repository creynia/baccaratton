// "Why?" rows (simulator.md section 2.6): the deciding outcomes of a bet with exact counts and
// fractions. Rows sum exactly to the bet's EV.
import type { BetId, TableRules } from '../engine/types';
import { cmp, frac, mul, sum, toFixed } from './fraction';
import type { BetEv, Fraction, WhyBreakdown, WhyRow } from './types';

export const MINUS = '−';

/** A row before its probability and contribution are filled in. */
export interface RowDraft {
  id: string;
  count: bigint;
  net: Fraction;
}

const ROW_ORDER = [
  'natural-win',
  'natural-tie-push',
  'margin-9',
  'margin-8',
  'margin-7',
  'margin-6',
  'margin-5',
  'margin-4',
  'win',
  'win-6-half',
  'win-3card-7-push',
  'push',
  'lose',
];
const orderOf = (id: string): number => {
  const i = ROW_ORDER.indexOf(id);
  return i < 0 ? ROW_ORDER.length : i;
};

/** '−0.0106' style: ASCII minus replaced. */
export function signed(text: string): string {
  return text.replace(/^-/, MINUS);
}

/** A net per $1 as a short exact decimal when it has one (0.95, 0.5, 30), else 4 places. */
export function fmtNet(f: Fraction): string {
  for (let k = 0; k <= 4; k++) {
    const p = 10n ** BigInt(k);
    if ((f.num * p) % f.den === 0n) return signed(toFixed(f, k));
  }
  return signed(toFixed(f, 4));
}

/** '1.06%' from an exact fraction (2 places, unicode minus). */
export function fmtPercent(f: Fraction, digits = 2): string {
  return `${signed(toFixed(mul(f, frac(100n)), digits))}%`;
}

const SIDE_OF: Partial<Record<BetId, string>> = {
  player: 'Player',
  banker: 'Banker',
  'dragon-bonus-player': 'Player',
  'dragon-bonus-banker': 'Banker',
};

function gets(net: Fraction): string {
  return net.num === 0n ? 'push' : net.num > 0n ? `you get ${fmtNet(net)}` : 'you lose 1';
}

/** The row label (English; the UI may key its own copy off `id`). */
export function rowLabel(bet: BetId, id: string, net: Fraction): string {
  const side = SIDE_OF[bet] ?? '';
  const other = side === 'Player' ? 'Banker' : 'Player';
  if (id.startsWith('margin-')) return `${side} wins by ${id.slice(7)} (${gets(net)})`;
  switch (id) {
    case 'natural-win':
      return `${side} wins with a natural (${gets(net)})`;
    case 'natural-tie-push':
      return 'Natural tie (push)';
    case 'win-3card-7-push':
      return 'Banker wins with a 3-card 7 (push)';
    case 'win-6-half':
      return `Banker wins with 6 (${gets(net)})`;
    case 'push':
      return 'Tie (push)';
  }
  const win = id === 'win';
  switch (bet) {
    case 'player':
    case 'banker':
      return win ? `${side} wins (${gets(net)})` : `${other} wins (${gets(net)})`;
    case 'tie':
      return win ? `Tie (${gets(net)})` : `Player or Banker wins (${gets(net)})`;
    case 'player-pair':
    case 'banker-pair':
      return win ? `Pair (${gets(net)})` : `No pair (${gets(net)})`;
    case 'dragon-7':
      return win ? `Banker wins with a 3-card 7 (${gets(net)})` : `Anything else (${gets(net)})`;
    case 'panda-8':
      return win ? `Player wins with a 3-card 8 (${gets(net)})` : `Anything else (${gets(net)})`;
    default:
      return win ? `Win (${gets(net)})` : `Everything else (${gets(net)})`;
  }
}

function formulaOf(rows: readonly WhyRow[], ev: Fraction): string {
  const terms = rows.filter((r) => r.net.num !== 0n && r.count > 0n);
  const parts = terms.map((r, i) => {
    const mag = r.net.num < 0n ? { num: -r.net.num, den: r.net.den } : r.net;
    const t = `${toFixed(r.probability, 4)} × ${fmtNet(mag)}`;
    if (i === 0) return r.net.num < 0n ? `${MINUS}${t}` : t;
    return r.net.num < 0n ? `${MINUS} ${t}` : `+ ${t}`;
  });
  // A ties-only shoe (every row pushes) has no terms: '0 = 0.00000'.
  return `${parts.length ? parts.join(' ') : '0'} = ${signed(toFixed(ev, 5))}`;
}

function noteOf(bet: BetId, ev: BetEv, rules: TableRules): string | undefined {
  if (!ev.edgePerResolved) return undefined;
  const resolved = `Excluding ties the edge is ${fmtPercent(ev.edgePerResolved)}.`;
  if (bet === 'player') return `Ties push: ${resolved.charAt(0).toLowerCase()}${resolved.slice(1)}`;
  if (rules.variant === 'ez') {
    return `A Banker win with a 3-card 7 is a push instead of a win. ${resolved}`;
  }
  if (rules.variant === 'super-6') return `A Banker win with 6 pays only half. ${resolved}`;
  const pct = fmtPercent(frac(BigInt(rules.commission[0]), BigInt(rules.commission[1])), 0);
  return `Banker wins more often, so the casino charges ${pct} on Banker wins. ${resolved}`;
}

/** Rows (ordered, exact), the formula line and the note. */
export function buildWhy(
  bet: BetId,
  drafts: readonly RowDraft[],
  outOf: bigint,
  casesLabel: string,
  ev: BetEv,
  rules: TableRules,
): WhyBreakdown {
  const rows: WhyRow[] = [...drafts]
    .sort((a, b) => orderOf(a.id) - orderOf(b.id) || cmp(b.net, a.net))
    .map((d) => {
      const probability = frac(d.count, outOf);
      return {
        id: d.id,
        label: rowLabel(bet, d.id, d.net),
        count: d.count,
        outOf,
        probability,
        net: d.net,
        contribution: mul(probability, d.net),
      };
    });
  const check = sum(rows.map((r) => r.contribution));
  if (check.num !== ev.ev.num || check.den !== ev.ev.den) {
    throw new Error(`Why? rows of ${bet} do not sum to its EV`);
  }
  const out: WhyBreakdown = { rows, casesLabel, formula: formulaOf(rows, ev.ev) };
  const note = noteOf(bet, ev, rules);
  if (note) out.note = note;
  return out;
}
