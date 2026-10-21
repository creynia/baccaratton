// Felt geometry (simulator.md section 4.1). Data only: the felt reads positions from here.
import type { BetId, Side, VariantId } from '../../engine/types';

export type Orientation = 'portrait' | 'landscape';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HandGeometry {
  /** Top-left corners of the two upright cards. */
  cards: [Pt, Pt];
  /** Top-left corner of the sideways third card (a box of card.h × card.w). */
  third: Pt;
  /** Centre of the "PLAYER" / "BANKER" label. */
  label: Pt;
  /** Centre of the total badge. */
  total: Pt;
}
export interface FeltLayout {
  orientation: Orientation;
  variant: VariantId;
  viewBox: { w: number; h: number };
  /** Upright card; a sideways third card is h × w. */
  card: { w: number; h: number };
  hands: Record<Side, HandGeometry>;
  /** Only the variant's offered bets. */
  spots: Partial<Record<BetId, Rect>>;
  /** Cards fly from / to (may lie outside the viewBox). */
  shoe: Pt;
  discard: Pt;
  rack: Pt;
  /** Where the "New shoe" / burn banner goes. */
  banner: Pt;
  /** 44 CSS px in viewBox units at the reference viewport. */
  minTapUnits: number;
}
