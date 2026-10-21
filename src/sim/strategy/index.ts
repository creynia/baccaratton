// Betting systems, simulation and the Drill trainer (simulator.md section 6).
export type * from './types';
export { STRATEGY_IDS, STRATEGY_LENSES, DRILL_MODES } from './ids';
export { DRILL_CATEGORY_IDS, DRILL_MODE_CATEGORIES } from './types';
export {
  getStrategy,
  STRATEGIES,
  STRATEGY_NAMES,
  STRATEGY_LENS,
  PICKER_GROUPS,
  DEFAULT_LIMITS,
  DEFAULT_SEQUENCE,
  DEFAULT_SPRINKLE,
  initMemory,
  betUnits,
  stepMemory,
  mainBet,
  sideBetsOf,
} from './presets';
export type { MainOutcome } from './presets';
export { expectedUnitsBet } from './costs';
export {
  HANDS_PER_HOUR,
  HAND_OPTIONS,
  MAX_HANDS,
  betFigures,
  slipEvCents,
  systemCost,
  fracToNumber,
} from './metrics';
export type { BetFigures, SystemCost } from './metrics';
/** The `simulate` job: auto-play, many sessions and compare, one seed. */
export { simulateJob, runSession } from './simulate';
export {
  nextSpot,
  gradeSpot,
  gradeCopy,
  spotCode,
  spotFromCode,
  modeOf,
  WHICH_BET_SPOTS,
  CATEGORY_REMINDER,
  RULE_REMINDER,
  MIXED_WEIGHTS,
  BANKER_WEIGHTING,
} from './drill';
export type { WhichBetSpot } from './drill';
