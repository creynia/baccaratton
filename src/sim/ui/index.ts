// Public API of the simulator UI (table-ui owns this barrel; integration may append Simulator
// exports). The root barrel re-exports it, so src/sim/index.ts never needs editing.
export { Simulator } from './Simulator';
export type { SimulatorProps, SimulatorEvent } from './Simulator';
export { EvSheet } from './EvSheet';
export { Tableau } from './Tableau';
export { Scoreboard } from './Scoreboard';
export { DEFAULT_SIM_SETTINGS } from './types';
export type { SimSettings, SessionSummary } from './types';
