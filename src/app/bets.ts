// Bet facts for the app screens. Every number comes from the engine and math (never typed here);
// while a module is still a stub (it throws TODO) the helpers return null and the screens say so.
import { BET_IDS_BY_VARIANT, VARIANT_IDS, VARIANT_RULES, betDef, fullShoeEvs } from '../sim';
import type { BetEv, BetId, BetTier, TableRules, TiePays, VariantId } from '../sim';
import { TIER_LABEL } from '../content/types';
import { pct } from './format';

/** Calls `fn`, or returns null if it throws (a stub module, or bad input). */
export function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export const VARIANT_NAME: Record<VariantId, string> = {
  'punto-banco': 'Punto Banco (5% commission)',
  ez: 'EZ Baccarat (no commission)',
  'super-6': 'Super 6 (Banker 6 pays half)',
};
export const VARIANT_SHORT: Record<VariantId, string> = {
  'punto-banco': 'Punto Banco',
  ez: 'EZ',
  'super-6': 'Super 6',
};

/** Fallback bet names (the registry's `label` wins when the engine is in). */
export const BET_NAME: Record<BetId, string> = {
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

/** Tier badge text (D19, D30), one definition shared with the content types. */
export const TIER_TEXT: Record<BetTier, string> = TIER_LABEL;

export function tableRules(variant: VariantId, tiePays: TiePays): TableRules {
  return { ...VARIANT_RULES[variant], tiePays };
}

export function betName(bet: BetId): string {
  return safe(() => betDef(bet).label) ?? BET_NAME[bet];
}

export function payoutText(bet: BetId, rules: TableRules): string | null {
  return safe(() => betDef(bet).payoutText(rules));
}

export function offeredBets(variant: VariantId): readonly BetId[] {
  return BET_IDS_BY_VARIANT[variant];
}

/** The variants that offer a bet (Dragon 7 and Panda 8: EZ only). */
export function variantsOffering(bet: BetId): VariantId[] {
  return VARIANT_IDS.filter((v) => BET_IDS_BY_VARIANT[v].includes(bet));
}

/** Full-shoe EVs of every offered bet, or null while math is a stub. */
export function fullShoe(variant: VariantId, tiePays: TiePays): BetEv[] | null {
  return safe(() => fullShoeEvs(tableRules(variant, tiePays)).filter((e) => e.offered));
}

const lt = (a: BetEv, b: BetEv) => a.edge.num * b.edge.den < b.edge.num * a.edge.den;

/** The lowest-edge main bet (Player or Banker; ties of the edge go to Banker). D31. */
export function cheapestMain(evs: readonly BetEv[]): BetEv | null {
  const b = evs.find((e) => e.bet === 'banker');
  const p = evs.find((e) => e.bet === 'player');
  if (!b || !p) return b ?? p ?? null;
  return lt(p, b) ? p : b;
}

/**
 * "Perfect strategy: Banker, house edge 1.06% (EZ 1.02%; Super 6: Player 1.24%)." computed
 * from math for the three variants (curriculum.md section 8.1). Null while math is a stub.
 */
export function perfectStrategyLine(tiePays: TiePays = 8): string | null {
  const best = VARIANT_IDS.map((v) => {
    const evs = fullShoe(v, tiePays);
    const c = evs && cheapestMain(evs);
    return c ? { v, bet: c.bet, edge: pct(c.edge, 2) } : null;
  });
  if (best.some((b) => b === null)) return null;
  const [pb, ...rest] = best as { v: VariantId; bet: BetId; edge: string }[];
  const extras = rest.map((b) =>
    b.bet === pb!.bet
      ? `${VARIANT_SHORT[b.v]} ${b.edge}`
      : `${VARIANT_SHORT[b.v]}: ${BET_NAME[b.bet]} ${b.edge}`,
  );
  return `Perfect strategy: ${BET_NAME[pb!.bet]}, house edge ${pb!.edge} (${extras.join('; ')}).`;
}
