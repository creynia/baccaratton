// Auto-play presets (simulator.md section 6.1, curriculum.md section 7.1, decisions D9, D28).
// Every preset bets one main bet per hand in units of `spec.unit`, plus any fixed `sideBets`.
// Ties (and any push of the main bet) leave a progression where it is. Over a D28 limit a system
// resets to step 1 (D'Alembert stays at its cap); each forced reset counts in memory `caps`.
import type { BetId, HandResult, Slip, TableRules, VisibleView } from '../engine/types';
import type { Strategy, StrategyId, StrategyLens, StrategyMemory, StrategySpec } from './types';

/** The main-bet result that drives a progression. */
export type MainOutcome = 'win' | 'lose' | 'push';

/** D28 defaults (simulator.md section 6.1). */
export const DEFAULT_LIMITS = {
  martingaleSteps: 7,
  fibonacciSteps: 11,
  dalembertUnits: 20,
  labouchereBetUnits: 100,
} as const;
export const DEFAULT_SEQUENCE: readonly number[] = [1, 2, 3, 4];
/** side-bet-sprinkler default: $5 Player Pair + $5 Banker Pair. */
export const DEFAULT_SPRINKLE: Readonly<Partial<Record<BetId, number>>> = {
  'player-pair': 500,
  'banker-pair': 500,
};
export const FIBONACCI: readonly number[] = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];
const PAROLI: readonly number[] = [1, 2, 4];
const ONE_THREE_TWO_SIX: readonly number[] = [1, 3, 2, 6];

export const STRATEGY_NAMES: Readonly<Record<StrategyId, string>> = {
  'flat-banker': 'Flat Banker',
  'flat-player': 'Flat Player',
  'flat-tie': 'Flat Tie',
  martingale: 'Martingale',
  paroli: 'Paroli',
  'one-three-two-six': '1-3-2-6',
  fibonacci: 'Fibonacci',
  dalembert: "D'Alembert",
  labouchere: 'Labouchère',
  'follow-the-shoe': 'Follow the shoe',
  'side-bet-sprinkler': 'Side-bet sprinkler',
};
export const STRATEGY_LENS: Readonly<Record<StrategyId, StrategyLens>> = {
  'flat-banker': 'lowest-edge',
  'flat-player': 'practical',
  'flat-tie': 'fun',
  martingale: 'fun',
  paroli: 'fun',
  'one-three-two-six': 'fun',
  fibonacci: 'fun',
  dalembert: 'fun',
  labouchere: 'fun',
  'follow-the-shoe': 'practical',
  'side-bet-sprinkler': 'fun',
};
/** Picker groups for the auto-play panel, in lens order. */
export const PICKER_GROUPS: readonly { lens: StrategyLens; ids: readonly StrategyId[] }[] = [
  { lens: 'lowest-edge', ids: ['flat-banker'] },
  { lens: 'practical', ids: ['flat-player', 'follow-the-shoe'] },
  {
    lens: 'fun',
    ids: [
      'paroli',
      'one-three-two-six',
      'fibonacci',
      'martingale',
      'dalembert',
      'labouchere',
      'flat-tie',
      'side-bet-sprinkler',
    ],
  },
];

const isProgression = (id: StrategyId): boolean =>
  id === 'martingale' ||
  id === 'paroli' ||
  id === 'one-three-two-six' ||
  id === 'fibonacci' ||
  id === 'dalembert' ||
  id === 'labouchere';

function labLine(spec: StrategySpec): number[] {
  const seq = spec.sequence && spec.sequence.length > 0 ? spec.sequence : DEFAULT_SEQUENCE;
  return [...seq];
}
function labBet(line: readonly number[]): number {
  if (line.length === 0) return 0;
  return line.length === 1 ? line[0]! : line[0]! + line[line.length - 1]!;
}

/** Fresh memory: step 1 of the system. */
export function initMemory(spec: StrategySpec): StrategyMemory {
  switch (spec.id) {
    case 'dalembert':
      return { units: 1, caps: 0 };
    case 'labouchere':
      return { line: labLine(spec), caps: 0 };
    default:
      return { step: 0, caps: 0 };
  }
}

/** Units the system wants on its main bet next (pure; no table limits applied). */
export function betUnits(mem: StrategyMemory, spec: StrategySpec): number {
  const step = (mem.step as number | undefined) ?? 0;
  switch (spec.id) {
    case 'martingale':
      return 2 ** step;
    case 'paroli':
      return PAROLI[step]!;
    case 'one-three-two-six':
      return ONE_THREE_TWO_SIX[step]!;
    case 'fibonacci':
      return FIBONACCI[step]!;
    case 'dalembert':
      return mem.units as number;
    case 'labouchere':
      return labBet(mem.line as number[]);
    default:
      return 1;
  }
}

/** One progression step from the main bet's outcome. Pushes leave the state unchanged. */
export function stepMemory(
  mem: StrategyMemory,
  spec: StrategySpec,
  outcome: MainOutcome,
): StrategyMemory {
  if (outcome === 'push' || !isProgression(spec.id)) return mem;
  const caps = (mem.caps as number | undefined) ?? 0;
  const step = (mem.step as number | undefined) ?? 0;
  const win = outcome === 'win';
  switch (spec.id) {
    case 'martingale': {
      if (win) return { step: 0, caps };
      const max = spec.maxSteps ?? DEFAULT_LIMITS.martingaleSteps;
      return step + 1 >= max ? { step: 0, caps: caps + 1 } : { step: step + 1, caps };
    }
    case 'paroli':
      return { step: win && step + 1 < PAROLI.length ? step + 1 : 0, caps };
    case 'one-three-two-six':
      return { step: win && step + 1 < ONE_THREE_TWO_SIX.length ? step + 1 : 0, caps };
    case 'fibonacci': {
      if (win) return { step: Math.max(0, step - 2), caps };
      const max = Math.min(spec.maxSteps ?? DEFAULT_LIMITS.fibonacciSteps, FIBONACCI.length);
      return step + 1 >= max ? { step: 0, caps: caps + 1 } : { step: step + 1, caps };
    }
    case 'dalembert': {
      const units = mem.units as number;
      if (win) return { units: Math.max(1, units - 1), caps };
      const max = spec.maxUnits ?? DEFAULT_LIMITS.dalembertUnits;
      return units + 1 > max ? { units: max, caps: caps + 1 } : { units: units + 1, caps };
    }
    case 'labouchere': {
      const line = mem.line as number[];
      const bet = labBet(line);
      if (win) {
        const next = line.length <= 2 ? [] : line.slice(1, -1);
        return { line: next.length === 0 ? labLine(spec) : next, caps };
      }
      const next = [...line, bet];
      const max = spec.maxBetUnits ?? DEFAULT_LIMITS.labouchereBetUnits;
      return labBet(next) > max ? { line: labLine(spec), caps: caps + 1 } : { line: next, caps };
    }
    default:
      return mem;
  }
}

/** Largest main bet the table allows, in units: floor(max / unit) (Tie uses the side limits). */
export function tableMaxUnits(spec: StrategySpec, rules: TableRules): number {
  const max = mainBet(null, spec) === 'tie' ? rules.sideMax : rules.mainMax;
  return Math.floor(max / spec.unit);
}

/**
 * The table-maximum rule (simulator.md section 6.1), shared by the simulation and the exact
 * costs: a next bet above `maxUnits` resets the system to step 1, except D'Alembert, which stays
 * at the table cap (D28). Each reset or clamp counts in `caps`.
 */
export function tableCap(
  mem: StrategyMemory,
  spec: StrategySpec,
  maxUnits: number,
): StrategyMemory {
  if (betUnits(mem, spec) <= maxUnits) return mem;
  const caps = ((mem.caps as number | undefined) ?? 0) + 1;
  if (spec.id === 'dalembert') return { units: Math.max(1, maxUnits), caps };
  return { ...initMemory(spec), caps };
}

/** The main bet a spec plays on this view. */
export function mainBet(view: VisibleView | null, spec: StrategySpec): BetId {
  switch (spec.id) {
    case 'flat-player':
      return 'player';
    case 'flat-tie':
      return 'tie';
    case 'flat-banker':
    case 'side-bet-sprinkler':
      return 'banker';
    case 'follow-the-shoe': {
      if (!view || view.nextHandNewShoe) return 'banker';
      for (let i = view.history.length - 1; i >= 0; i--) {
        const w = view.history[i]!.winner;
        if (w !== 'tie') return w;
      }
      return 'banker';
    }
    default:
      return spec.target ?? 'banker';
  }
}

/** The side bets placed every hand: `spec.sideBets`, or the sprinkler's default. */
export function sideBetsOf(spec: StrategySpec): Partial<Record<BetId, number>> {
  if (spec.sideBets) return spec.sideBets;
  return spec.id === 'side-bet-sprinkler' ? DEFAULT_SPRINKLE : {};
}

/** Main-bet outcome of a settled hand (null when the main bet was not on the slip). */
export function mainOutcome(result: HandResult, bet: BetId): MainOutcome | null {
  const s = result.settlements.find((x) => x.bet === bet);
  return s ? s.result : null;
}

function make(id: StrategyId): Strategy {
  return {
    id,
    name: STRATEGY_NAMES[id],
    lens: STRATEGY_LENS[id],
    init: initMemory,
    decide(view: VisibleView, mem: StrategyMemory, spec: StrategySpec): Slip {
      const slip: Partial<Record<BetId, number>> = { ...sideBetsOf(spec) };
      const bet = mainBet(view, spec);
      slip[bet] = (slip[bet] ?? 0) + betUnits(mem, spec) * spec.unit;
      return slip;
    },
    update(mem: StrategyMemory, spec: StrategySpec, result: HandResult): StrategyMemory {
      // The main bet of a progression is always spec.target (default banker).
      const o = mainOutcome(result, mainBet(null, spec));
      return o ? stepMemory(mem, spec, o) : mem;
    },
  };
}

export const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = Object.fromEntries(
  (Object.keys(STRATEGY_NAMES) as StrategyId[]).map((id) => [id, make(id)]),
) as Record<StrategyId, Strategy>;

export function getStrategy(id: StrategyId): Strategy {
  const s = STRATEGIES[id];
  if (!s) throw new Error(`Unknown strategy "${String(id)}"`);
  return s;
}
