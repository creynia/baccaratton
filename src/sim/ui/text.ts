// Display text for the table UI: money, percentages, bet and tier labels, payout lines, results
// and the better-alternative copy (curriculum.md section 8). Pure; no DOM.
import type {
  BetId,
  Cents,
  HandResult,
  TableRules,
  TableauRuleId,
  VariantId,
  Winner,
} from '../engine/types';
import { betDef } from '../engine/bets';
import type { Alternative, BetEv, BetTier, Fraction } from '../math/types';

/** U+2212, so a negative amount never wraps at a hyphen (and reads as a real minus). */
export const MINUS = '−';

// ---------- fractions (display only; exact maths lives in src/sim/math) ----------

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
/** A normalized fraction (den > 0, lowest terms). */
export function frac(num: bigint | number, den: bigint | number = 1n): Fraction {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new RangeError('Zero denominator');
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1n;
  return { num: n / g, den: d / g };
}
export function fracMul(f: Fraction, k: bigint | number): Fraction {
  return frac(f.num * BigInt(k), f.den);
}
export function fracNeg(f: Fraction): Fraction {
  return { num: -f.num, den: f.den };
}
/** Accurate to ~1e-15 relative, even when num and den exceed 2^53. */
export function fracToNumber(f: Fraction): number {
  const SCALE = 10n ** 18n;
  const q = (f.num * SCALE) / f.den;
  return Number(q) / 1e18;
}
export type Num = Fraction | number;
export const toNum = (v: Num): number => (typeof v === 'number' ? v : fracToNumber(v));

// ---------- money ----------

function dollars(abs: number, cents: 'auto' | 'always'): string {
  const whole = Math.floor(abs / 100);
  const rest = abs - whole * 100;
  const w = whole.toLocaleString('en-US');
  if (cents === 'auto' && rest === 0) return `$${w}`;
  return `$${w}.${String(rest).padStart(2, '0')}`;
}

export interface MoneyOpts {
  /** Prefix "+" on positive amounts. */
  sign?: boolean;
  /** 'auto' drops ".00" on whole dollars ($35); 'always' keeps cents ($35.00). */
  cents?: 'auto' | 'always';
}
/** Cents (possibly a fraction) to "$23.75" / "−$1.70" / "+$35.00", rounded half away from zero. */
export function money(v: Num, opts: MoneyOpts = {}): string {
  const x = toNum(v);
  const rounded = Math.round(Math.abs(x));
  const neg = x < 0 && rounded !== 0;
  const s = dollars(rounded, opts.cents ?? 'auto');
  if (neg) return `${MINUS}${s}`;
  return opts.sign && rounded !== 0 ? `+${s}` : s;
}
/** Always to the cent: EV lines ("−$0.11 per hand"). */
export const moneyC = (v: Num, sign = false): string => money(v, { cents: 'always', sign });

/** 0.010579 → "1.06%" (digits default 2). Negative values get a real minus. */
export function pct(v: Num, digits = 2): string {
  const x = toNum(v) * 100;
  const s = Math.abs(x).toFixed(digits);
  const zero = Number(s) === 0;
  return `${x < 0 && !zero ? MINUS : ''}${s}%`;
}
/** Plain number with a real minus ("−1", "+0.95", "30"). */
export function signedNum(v: Num, digits = 2): string {
  const x = toNum(v);
  const s = Number(Math.abs(x).toFixed(digits)).toString();
  if (x < 0 && Number(s) !== 0) return `${MINUS}${s}`;
  return x > 0 ? `+${s}` : s;
}
export const count = (n: bigint | number): string => n.toLocaleString('en-US');

// ---------- bets ----------

export const BET_LABEL: Readonly<Record<BetId, string>> = {
  player: 'Player',
  banker: 'Banker',
  tie: 'Tie',
  'player-pair': 'Player Pair',
  'banker-pair': 'Banker Pair',
  'dragon-bonus-player': 'Dragon Bonus Player',
  'dragon-bonus-banker': 'Dragon Bonus Banker',
  'dragon-7': 'Dragon 7',
  'panda-8': 'Panda 8',
};
/** Felt label lines (upper case on the felt, two lines for the long ones). */
export const SPOT_LINES: Readonly<Record<BetId, readonly string[]>> = {
  player: ['PLAYER'],
  banker: ['BANKER'],
  tie: ['TIE'],
  'player-pair': ['P PAIR'],
  'banker-pair': ['B PAIR'],
  'dragon-bonus-player': ['DRAGON', 'BONUS P'],
  'dragon-bonus-banker': ['DRAGON', 'BONUS B'],
  'dragon-7': ['DRAGON 7'],
  'panda-8': ['PANDA 8'],
};

const commissionPct = (rules: Pick<TableRules, 'commission'>): string => {
  const [n, d] = rules.commission;
  return `${Number(((n / d) * 100).toFixed(2))}%`;
};

/** Short payout on the felt ("1:1 less 5%", "8:1", "11:1"). */
export function payoutShort(bet: BetId, rules: TableRules): string {
  switch (bet) {
    case 'player':
      return '1:1';
    case 'banker':
      if (rules.variant === 'punto-banco') return `1:1 less ${commissionPct(rules)}`;
      if (rules.variant === 'ez') return '1:1 · 3-card 7 push';
      return '1:1 · 6 pays 1:2';
    case 'tie':
      return `${rules.tiePays}:1`;
    case 'player-pair':
    case 'banker-pair':
      return '11:1';
    case 'dragon-bonus-player':
    case 'dragon-bonus-banker':
      return 'up to 30:1';
    case 'dragon-7':
      return '40:1';
    case 'panda-8':
      return '25:1';
  }
}
/** Spoken payout ("Pays 1 to 1, less 5% commission"): the engine registry's own text. */
export function payoutSpoken(bet: BetId, rules: TableRules): string {
  return betDef(bet).payoutText(rules).replace(/\.$/, '');
}

// ---------- tiers (D19) ----------

export const TIER_LABEL: Readonly<Record<BetTier, string>> = {
  free: 'No house edge',
  good: 'Good bet',
  fair: 'Fair',
  costly: 'Costly',
  sucker: 'Sucker bet',
};
/** Felt badges are short; the full label is still spoken. */
export const TIER_SHORT: Readonly<Record<BetTier, string>> = {
  free: 'No edge',
  good: 'Good',
  fair: 'Fair',
  costly: 'Costly',
  sucker: 'Sucker',
};
/** The Shoe tracker calls `free` "Edge to you" (D19, curriculum §8.2). */
export const TRACKER_FREE_LABEL = 'Edge to you';
export const tierLabel = (t: BetTier, tracker = false): string =>
  tracker && t === 'free' ? TRACKER_FREE_LABEL : TIER_LABEL[t];

/**
 * The tier of an edge (D19): free ≤ 0 < good ≤ 2% < fair ≤ 5% < costly < 9% ≤ sucker. Math owns
 * the real `betTier`; this exact copy lets the felt badge a tracker value without a round trip.
 */
export function tierOfEdge(edge: Fraction): BetTier {
  const e = edge;
  const le = (n: bigint, d: bigint) => e.num * d <= n * e.den;
  const lt = (n: bigint, d: bigint) => e.num * d < n * e.den;
  if (le(0n, 1n)) return 'free';
  if (le(2n, 100n)) return 'good';
  if (le(5n, 100n)) return 'fair';
  if (lt(9n, 100n)) return 'costly';
  return 'sucker';
}

// ---------- the sheet ----------

/** The cheapest offered main bet (D31; ties of the edge → Banker). */
export function bestMainBet(sheet: readonly BetEv[]): BetId {
  const mains = sheet.filter((b) => b.offered && (b.bet === 'banker' || b.bet === 'player'));
  let best: BetEv | undefined;
  for (const b of mains) {
    if (!best) best = b;
    else {
      const c = b.edge.num * best.edge.den - best.edge.num * b.edge.den;
      if (c < 0n || (c === 0n && b.bet === 'banker')) best = b;
    }
  }
  return best?.bet ?? 'banker';
}

export const VARIANT_LABEL: Readonly<Record<VariantId, string>> = {
  'punto-banco': 'Punto Banco',
  ez: 'EZ Baccarat',
  'super-6': 'Super 6',
};

/** "Perfect strategy: Banker, house edge 1.06% (EZ 1.02%; Super 6: Player 1.24%)." */
export function perfectStrategyLine(sheet: readonly BetEv[]): string {
  const best = bestMainBet(sheet);
  const ev = sheet.find((b) => b.bet === best);
  return `Perfect strategy: ${BET_LABEL[best]}, house edge ${ev ? pct(ev.edge) : '—'}.`;
}

/** "−$0.11 per hand · −$7.62/hour" for `amount` cents on a bet with this EV per $1. */
export function costLine(
  ev: Fraction,
  amount: Cents,
  handsPerHour: number,
): { perHand: string; perHour: string } {
  const perHand = fracMul(ev, amount);
  return {
    perHand: `${moneyC(perHand)} per hand`,
    perHour: `${moneyC(fracMul(perHand, handsPerHour))}/hour`,
  };
}

/** Better-alternative copy (curriculum.md §8.3). */
export function alternativeText(
  alt: Alternative,
  sheet: readonly BetEv[],
  rules: TableRules,
  handsPerHour: number,
): string {
  const edgeOf = (b: BetId) => sheet.find((x) => x.bet === b)?.edge;
  const toLabel = BET_LABEL[alt.to];
  const toEdge = edgeOf(alt.to);
  const fromEdge = edgeOf(alt.from);
  const amount = money(alt.amount);
  const saving = moneyC(alt.savingPerHourCents);
  const e = (f: Fraction | undefined) => (f ? pct(f) : '—');
  void handsPerHour;
  switch (alt.from) {
    case 'player':
      return `${toLabel} is a little cheaper: ${e(toEdge)} instead of ${e(fromEdge)}, about ${saving} an hour less at this bet.`;
    case 'banker':
      return `${toLabel} is cheaper at a Super 6 table: ${e(toEdge)} instead of ${e(fromEdge)}.`;
    case 'tie': {
      const nine =
        rules.tiePays === 8 ? ' If you love the Tie, look for a 9 to 1 table (4.84%).' : '';
      return `${toLabel} costs ${moneyC(fracNeg(alt.toEvCents))} per ${amount} hand instead of ${moneyC(fracNeg(alt.fromEvCents))}, ${saving} less per hour.${nine}`;
    }
    case 'player-pair':
    case 'banker-pair':
      return `Pairs pay 11 to 1 but come about 1 in 13.4. ${toLabel} costs ${e(toEdge)} instead of ${e(fromEdge)} (${saving} less per hour). Dragon Bonus on Player gives big payouts for a quarter of the price (2.65%).`;
    case 'dragon-bonus-banker':
      return `Dragon Bonus on Player pays the same table for 2.65% instead of ${e(fromEdge)}. ${toLabel} is cheaper still (${e(toEdge)}).`;
    case 'dragon-7':
      return `A 40 to 1 thrill at ${e(fromEdge)}. For the same budget, Dragon Bonus on Player costs about a third as much, and ${toLabel} ${e(toEdge)}.`;
    case 'panda-8':
      return `Dragon 7 is cheaper (7.61% vs ${e(fromEdge)}), and ${toLabel} far cheaper (${e(toEdge)}).`;
    default:
      return `${toLabel} costs ${e(toEdge)} instead of ${e(fromEdge)}: ${saving} less per hour at ${amount}.`;
  }
}

/** The Sucker-bet second tap ("Tie loses $1.44 per $10. Bet it anyway?"). */
export function suckerPrompt(bet: BetId, ev: Fraction, unitCents: Cents): string {
  return `${BET_LABEL[bet]} loses ${moneyC(fracNeg(fracMul(ev, unitCents)))} per ${money(unitCents)} on average. Bet it anyway?`;
}

// ---------- results ----------

const WINNER_LABEL: Readonly<Record<Winner, string>> = {
  player: 'Player',
  banker: 'Banker',
  tie: 'Tie',
};

/** "Banker wins 7 to 5." / "Tie, 6 to 6." */
export function resultHeadline(r: HandResult): string {
  const { winner, player, banker } = r.hand;
  if (winner === 'tie') return `Tie, ${player.total} to ${banker.total}.`;
  const w = winner === 'banker' ? banker.total : player.total;
  const l = winner === 'banker' ? player.total : banker.total;
  const nat = r.hand.natural ? ' (natural)' : '';
  return `${WINNER_LABEL[winner]} wins ${w} to ${l}${nat}.`;
}
/** "You win $23.75." / "You lose $25." / "Your bets push." / "No money on this hand." */
export function resultMoney(r: HandResult): string {
  if (r.settlements.length === 0) return 'No money on this hand.';
  if (r.net > 0) return `You win ${money(r.net)}.`;
  if (r.net < 0) return `You lose ${money(-r.net)}.`;
  return r.settlements.every((s) => s.result === 'push') ? 'Your bets push.' : 'You break even.';
}
/** "$1.25 commission (5% of $25)" or null when no commission was taken. */
export function commissionLine(
  r: HandResult,
  rules?: Pick<TableRules, 'commission'>,
): string | null {
  const s = r.settlements.find((x) => x.commission > 0);
  if (!s) return null;
  const rate = rules ? commissionPct(rules) : '5%';
  return `${money(s.commission, { cents: 'always' })} commission (${rate} of ${money(s.amount)})`;
}
/** aria-live text for a settled hand. */
export function resultAnnouncement(r: HandResult, rules?: Pick<TableRules, 'commission'>): string {
  const c = commissionLine(r, rules);
  return [resultHeadline(r), resultMoney(r), c ? `${c}.` : ''].filter(Boolean).join(' ');
}

// ---------- tableau ----------

export const RULE_TEXT: Readonly<Record<TableauRuleId, string>> = {
  natural: 'A natural (8 or 9 in two cards): both hands stand.',
  'player-0-5-draws': 'Player draws on 0–5.',
  'player-6-7-stands': 'Player stands on 6 or 7.',
  'banker-player-stood-0-5-draws': 'Player stood: Banker draws on 0–5.',
  'banker-player-stood-6-7-stands': 'Player stood: Banker stands on 6 or 7.',
  'banker-0-2-draws': 'Banker always draws on 0–2.',
  'banker-3-draws-unless-8': "Banker 3 draws unless the Player's third card is an 8.",
  'banker-4-draws-on-2-7': "Banker 4 draws when the Player's third card is 2–7.",
  'banker-5-draws-on-4-7': "Banker 5 draws when the Player's third card is 4–7.",
  'banker-6-draws-on-6-7': "Banker 6 draws when the Player's third card is 6 or 7.",
  'banker-7-stands': 'Banker stands on 7.',
};

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
