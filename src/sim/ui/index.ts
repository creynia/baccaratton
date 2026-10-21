// Public API of the simulator UI (table-ui owns this barrel; integration may append Simulator
// exports). The root barrel re-exports it, so src/sim/index.ts never needs editing.
export { Simulator } from './Simulator';
export type { SimulatorProps, SimulatorEvent } from './Simulator';
export { EvSheet } from './EvSheet';
export type { EvSheetProps } from './EvSheet';
export { EvList } from './EvList';
export { Tableau, parseTableauCell } from './Tableau';
export type { TableauProps, TableauView } from './Tableau';
export { Scoreboard, roadsText } from './Scoreboard';
export type { ScoreboardProps, RoadView } from './Scoreboard';
export { DEFAULT_SIM_SETTINGS } from './types';
export type { SimSettings, SessionSummary } from './types';
export { AutoPlayPanel, type AutoPlayPanelProps, type AutoPlayEvent } from './AutoPlayPanel';
export { BankrollChart, type BankrollChartProps } from './BankrollChart';
export { SurvivalChart, type SurvivalChartProps } from './SurvivalChart';
export { OutcomeHistogram, type OutcomeHistogramProps } from './OutcomeHistogram';

// table-ui components (presentational; Simulator owns the state)
export { Felt, spotEvOf } from './Felt';
export type { FeltProps } from './Felt';
export { HandView } from './HandView';
export { Card as PlayingCard, CardSlot, SUIT_GLYPH } from './Card';
export { BetSpot, spotAriaLabel } from './BetSpot';
export type { SpotEv } from './BetSpot';
export { ChipStack, ChipFace, CHIP_DENOMS, chipBreakdown, chipLabel } from './ChipStack';
export { ChipRack } from './ChipRack';
export { ActionBar } from './ActionBar';
export type { ActionBarProps, ActionId } from './ActionBar';
export { StatusBar } from './StatusBar';
export { ShoeMeter } from './ShoeMeter';
export { Toasts } from './Toasts';
export type { Toast } from './Toasts';
export { SettleToast } from './SettleToast';
export { SessionPanel } from './SessionPanel';
export { WhyTable } from './WhyTable';
export { TierBadge, TierIcon } from './TierBadge';
export { AltCard } from './AltCard';
export type { AltCardProps } from './AltCard';
export { ShoeTracker } from './ShoeTracker';
export { Table, useOrientation } from './Table';
export {
  buildTimeline,
  cardsUpTo,
  effectiveSpeed,
  instantTimeline,
  prefersReducedMotion,
  useSkippableMotion,
  PACING,
} from './animation';
export type { Speed, Timeline, TimelineStep, Segment } from './animation';
export { feltLayout } from './layouts';
export type { FeltLayout, Orientation, Rect, Pt } from './layouts';
export * as uiText from './text';
