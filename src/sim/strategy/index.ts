// Betting systems, simulation and the Drill trainer (simulator.md section 6). Signatures beyond
// the frozen types.ts are provisional: the strategy WP owns them. Bodies are TODO(strategy).
import type { Job } from '../engine/job';
import type { RngState } from '../engine/types';
import type {
  DrillFilter,
  DrillGrade,
  DrillSpot,
  SimulateRequest,
  SimulateResult,
  Strategy,
  StrategyId,
} from './types';

export type * from './types';
export { STRATEGY_IDS, STRATEGY_LENSES, DRILL_MODES } from './ids';

const todo = (name: string): never => {
  throw new Error(`TODO(strategy): ${name}`);
};

export function getStrategy(_id: StrategyId): Strategy {
  return todo('getStrategy');
}
/** The `simulate` job: auto-play, many sessions and compare, one seed. */
export const simulateJob: Job<SimulateRequest, SimulateResult> = () => todo('simulateJob');

export function nextSpot(_rng: RngState, _filter: DrillFilter): { spot: DrillSpot; rng: RngState } {
  return todo('nextSpot');
}
export function gradeSpot(_spot: DrillSpot, _chosen: string): DrillGrade {
  return todo('gradeSpot');
}
/** 'b:3h2c6d.Kd5s' (mode letter, player cards, banker cards). Round-trips with spotFromCode. */
export function spotCode(_spot: DrillSpot): string {
  return todo('spotCode');
}
export function spotFromCode(_code: string): DrillSpot {
  return todo('spotFromCode');
}
