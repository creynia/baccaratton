import type { TableRules, VariantId } from './types';

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
  mainMax: 100_000,
  sideMin: 100,
  sideMax: 10_000,
};

export const VARIANT_RULES: Readonly<Record<VariantId, TableRules>> = {
  'punto-banco': { ...DEFAULT_RULES, variant: 'punto-banco' },
  ez: { ...DEFAULT_RULES, variant: 'ez' },
  'super-6': { ...DEFAULT_RULES, variant: 'super-6' },
};

/** Variant defaults with overrides applied; throws if the result is invalid. TODO(engine). */
export function resolveRules(_overrides?: Partial<TableRules>): TableRules {
  throw new Error('TODO(engine): resolveRules');
}
