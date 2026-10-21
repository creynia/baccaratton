// Small real data (decisions.md D13, simulator.md sections 6.1 and 6.5).
import type { DrillMode, StrategyId, StrategyLens } from './types';

export const STRATEGY_IDS: readonly StrategyId[] = [
  'flat-banker',
  'flat-player',
  'flat-tie',
  'martingale',
  'paroli',
  'one-three-two-six',
  'fibonacci',
  'dalembert',
  'labouchere',
  'follow-the-shoe',
  'side-bet-sprinkler',
];

export const STRATEGY_LENSES: readonly StrategyLens[] = ['lowest-edge', 'practical', 'fun'];

export const DRILL_MODES: readonly DrillMode[] = ['player', 'banker', 'winner', 'payout', 'mixed'];
