// Per-hand and per-hour figures (simulator.md section 6.1, decisions D5, D14, D21). Every edge
// comes from math's full-shoe EVs (one source of truth); nothing here is typed in.
import { VARIANT_RULES } from '../engine/rules';
import { BET_IDS } from '../engine/types';
import type { BetId, Slip, TableRules, TiePays, VariantId } from '../engine/types';
import { fullShoeEvs } from '../math';
import type { BetEv, Fraction } from '../math/types';
import { expectedUnitsBet } from './costs';
import { mainBet, sideBetsOf } from './presets';
import type { StrategySpec } from './types';

export const HANDS_PER_HOUR = 72; // D5
/** D21: 1, 10 and 100 hours. */
export const HAND_OPTIONS: readonly number[] = [72, 720, 7_200];
export const MAX_HANDS = 20_000;

/** Fraction → number without losing precision on big numerators/denominators. */
export function fracToNumber(f: Fraction): number {
  const SCALE = 10n ** 15n;
  return Number((f.num * SCALE) / f.den) / 1e15;
}

export function rulesFor(variant: VariantId, tiePays: TiePays): TableRules {
  const base = VARIANT_RULES[variant];
  if (!base) throw new Error(`Unknown variant "${String(variant)}"`);
  return { ...base, tiePays };
}

export interface BetFigures {
  /** EV per $1 bet (negative = house edge). */
  ev: number;
  pWin: number;
  pPush: number;
  pLose: number;
}
const cache = new Map<string, Readonly<Record<BetId, BetFigures>>>();

/** Full-shoe EV and probabilities of every bet, as numbers (memoised per variant and tie pay). */
export function betFigures(variant: VariantId, tiePays: TiePays): Readonly<Record<BetId, BetFigures>> {
  const key = `${variant}/${tiePays}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const evs: BetEv[] = fullShoeEvs(rulesFor(variant, tiePays));
  const out = {} as Record<BetId, BetFigures>;
  for (const id of BET_IDS) out[id] = { ev: 0, pWin: 0, pPush: 0, pLose: 0 };
  for (const e of evs) {
    out[e.bet] = {
      ev: fracToNumber(e.ev),
      pWin: fracToNumber(e.pWin),
      pPush: fracToNumber(e.pPush),
      pLose: fracToNumber(e.pLose),
    };
  }
  cache.set(key, out);
  return out;
}

/** Σ amount × full-shoe EV of a slip, in cents (negative = expected loss). */
export function slipEvCents(slip: Slip, figures: Readonly<Record<BetId, BetFigures>>): number {
  let ev = 0;
  for (const [bet, amount] of Object.entries(slip) as [BetId, number][])
    if (amount) ev += amount * figures[bet].ev;
  return ev;
}

export interface SystemCost {
  /** E[main bet] per hand in units, fresh session of `hands` hands (null: no exact figure). */
  avgBetUnits: number | null;
  /** E[total bet] per hand in cents, side bets included (null when not exact). */
  avgBetCents: number | null;
  /** Expected loss per hour in cents (positive = cost); null when not exact. */
  costPerHourCents: number | null;
  /** The main bet's edge (positive = house edge). */
  edge: number;
  /** 'exact' (DP over the system's states) or 'simulated' (follow-the-shoe, Labouchère). */
  kind: 'exact' | 'simulated';
}

/**
 * Exact expected cost of a preset for a fresh session (curriculum.md section 7.2), with the D28
 * caps and a bankroll that never runs out. Labouchère and follow-the-shoe have no small exact
 * model: their cost comes from the simulation (kind 'simulated').
 */
export function systemCost(
  spec: StrategySpec,
  variant: VariantId,
  tiePays: TiePays,
  hands: number = HANDS_PER_HOUR,
  handsPerHour: number = HANDS_PER_HOUR,
): SystemCost {
  const fig = betFigures(variant, tiePays);
  const main = mainBet(null, spec);
  const edge = -fig[main].ev;
  if (spec.id === 'labouchere' || spec.id === 'follow-the-shoe')
    return { avgBetUnits: null, avgBetCents: null, costPerHourCents: null, edge, kind: 'simulated' };
  const f = fig[main];
  const units =
    expectedUnitsBet(spec, hands, { win: f.pWin, lose: f.pLose, push: f.pPush }) / hands;
  const side = sideBetsOf(spec);
  let sideCents = 0;
  let sideEv = 0;
  for (const [bet, amount] of Object.entries(side) as [BetId, number][]) {
    sideCents += amount;
    sideEv += amount * fig[bet].ev;
  }
  const perHand = units * spec.unit * f.ev + sideEv;
  return {
    avgBetUnits: units,
    avgBetCents: units * spec.unit + sideCents,
    costPerHourCents: -perHand * handsPerHour,
    edge,
    kind: 'exact',
  };
}

/** Whole cents → "$1,234.56" (sign optional). */
export function formatCents(cents: number, opts: { sign?: boolean; whole?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: opts.whole ? 0 : 2,
    maximumFractionDigits: opts.whole ? 0 : 2,
  });
  const sign = neg ? '−' : opts.sign && cents > 0 ? '+' : '';
  return `${sign}$${body}`;
}
