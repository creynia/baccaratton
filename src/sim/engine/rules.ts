import type { TableRules, VariantId } from './types';

// D2, D8, D16: 8 decks, Banker 5% commission, Tie 8:1, cut card 16 from the end, $5-$5,000
// main bets, $1-$500 tie and side bets, whole-dollar bets.

export const DEFAULT_RULES: TableRules = {
  variant: 'punto-banco',
  decks: 8,
  tiePays: 8,
  commission: [1, 20],
  cutCardFromEnd: 16,
  afterCutCard: 'one-more-hand',
  burn: 'first-card-value',
  betUnit: 100,
  mainMin: 500,
  mainMax: 500_000,
  sideMin: 100,
  sideMax: 50_000,
};

export const VARIANT_RULES: Readonly<Record<VariantId, TableRules>> = {
  'punto-banco': { ...DEFAULT_RULES, variant: 'punto-banco' },
  ez: { ...DEFAULT_RULES, variant: 'ez' },
  'super-6': { ...DEFAULT_RULES, variant: 'super-6' },
};

const fail = (msg: string): never => {
  throw new Error(`resolveRules: ${msg}`);
};
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * Variant defaults with overrides applied; throws if the result is invalid: decks outside 1..8
 * (the exact EV fast path needs at most 416 cards), a cut card under 14 from the end (two 6-card
 * hands after the cut card plus margin, section 1.6), a tie payout other than 8 or 9, bad
 * commission odds, or limits that are not positive multiples of `betUnit` with min <= max.
 */
export function resolveRules(overrides: Partial<TableRules> = {}): TableRules {
  const variant = overrides.variant ?? DEFAULT_RULES.variant;
  const base = VARIANT_RULES[variant];
  if (!base) return fail(`unknown variant "${String(variant)}"`);
  const r: TableRules = { ...base, ...overrides, variant };
  if (!isInt(r.decks) || r.decks < 1 || r.decks > 8) fail(`decks must be 1..8, got ${r.decks}`);
  if (r.tiePays !== 8 && r.tiePays !== 9) fail(`tiePays must be 8 or 9, got ${String(r.tiePays)}`);
  const [c0, c1] = r.commission;
  if (!isInt(c0) || !isInt(c1) || c0 < 0 || c1 < 1 || c0 >= c1)
    fail(`bad commission [${c0}, ${c1}]`);
  if (!isInt(r.cutCardFromEnd) || r.cutCardFromEnd < 14 || r.cutCardFromEnd > r.decks * 52 - 20)
    fail(`cutCardFromEnd must be 14..${r.decks * 52 - 20}, got ${r.cutCardFromEnd}`);
  if (r.afterCutCard !== 'one-more-hand') fail(`unknown afterCutCard "${String(r.afterCutCard)}"`);
  if (r.burn !== 'first-card-value') fail(`unknown burn "${String(r.burn)}"`);
  if (!isInt(r.betUnit) || r.betUnit < 1) fail(`bad betUnit ${r.betUnit}`);
  for (const k of ['mainMin', 'mainMax', 'sideMin', 'sideMax'] as const) {
    const v = r[k];
    if (!isInt(v) || v < r.betUnit || v % r.betUnit !== 0)
      fail(`${k} must be a positive multiple of betUnit, got ${v}`);
  }
  if (r.mainMin > r.mainMax) fail('mainMin > mainMax');
  if (r.sideMin > r.sideMax) fail('sideMin > sideMax');
  return r;
}
