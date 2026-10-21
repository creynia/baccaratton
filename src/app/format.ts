// Display formatting for money (integer cents) and exact fractions. Pure; shared by screens.
import type { Fraction } from '../sim';

/** U+2212, so a negative amount never reads as a hyphen (and never wraps: CSS .money nowrap). */
export const MINUS = '−';

/** Rounds num/den to an integer, half away from zero (bigint, exact). */
export function roundFrac(num: bigint, den: bigint): bigint {
  if (den < 0n) return roundFrac(-num, -den);
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (2n * a + den) / (2n * den);
  return neg ? -q : q;
}

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 1234 → "$12.34"; whole dollars drop the cents unless `cents` is true. Signed with "−" / "+". */
export function money(cents: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const c = Math.round(cents);
  const neg = c < 0;
  const a = Math.abs(c);
  const dollars = Math.floor(a / 100);
  const rest = a % 100;
  const body =
    rest === 0 && !opts.cents
      ? `$${group(String(dollars))}`
      : `$${group(String(dollars))}.${String(rest).padStart(2, '0')}`;
  if (neg) return MINUS + body;
  return opts.sign && c > 0 ? `+${body}` : body;
}

/** An exact amount of cents (a Fraction) rounded to the cent. */
export function moneyFrac(f: Fraction, opts: { sign?: boolean } = {}): string {
  return money(Number(roundFrac(f.num, f.den)), { ...opts, cents: true });
}

/** A fraction as a percentage with `digits` decimals: {1, 8} → "12.50%". Exact rounding. */
export function pct(f: Fraction, digits = 2): string {
  const scale = 10n ** BigInt(digits + 2);
  const n = roundFrac(f.num * scale, f.den);
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().padStart(digits + 1, '0');
  const int = s.slice(0, s.length - digits);
  const dec = digits ? `.${s.slice(s.length - digits)}` : '';
  return `${neg ? MINUS : ''}${int}${dec}%`;
}

export const toNumber = (f: Fraction) => Number(f.num) / Number(f.den);

/** n/d as a Fraction (not normalized; display only). */
export const frac = (num: bigint | number, den: bigint | number = 1): Fraction => ({
  num: BigInt(num),
  den: BigInt(den),
});

export const mulFrac = (a: Fraction, k: number): Fraction => ({
  num: a.num * BigInt(Math.round(k)),
  den: a.den,
});
