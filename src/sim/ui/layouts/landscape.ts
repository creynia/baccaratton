import { BET_IDS_BY_VARIANT } from '../../engine/ids';
import type { BetId, VariantId } from '../../engine/types';
import type { FeltLayout, Rect } from './types';

/**
 * simulator.md section 4.3: felt viewBox 520 × 390 next to a 324 px rail (304 high without the EZ
 * row). At 844 × 390 the felt is drawn at 1 unit = 1 CSS px.
 */
const SPOTS: Readonly<Record<BetId, Rect>> = {
  player: { x: 16, y: 132, w: 156, h: 96 },
  tie: { x: 182, y: 132, w: 156, h: 96 },
  banker: { x: 348, y: 132, w: 156, h: 96 },
  'player-pair': { x: 16, y: 238, w: 116, h: 56 },
  'dragon-bonus-player': { x: 138, y: 238, w: 116, h: 56 },
  'dragon-bonus-banker': { x: 260, y: 238, w: 116, h: 56 },
  'banker-pair': { x: 382, y: 238, w: 116, h: 56 },
  'panda-8': { x: 16, y: 304, w: 238, h: 56 },
  'dragon-7': { x: 266, y: 304, w: 238, h: 56 },
};

export function landscapeLayout(variant: VariantId): FeltLayout {
  const offered = BET_IDS_BY_VARIANT[variant];
  const ez = offered.includes('dragon-7');
  return {
    orientation: 'landscape',
    variant,
    viewBox: { w: 520, h: ez ? 390 : 304 },
    card: { w: 54, h: 76 },
    hands: {
      player: {
        cards: [
          { x: 40, y: 26 },
          { x: 100, y: 26 },
        ],
        third: { x: 160, y: 36 },
        label: { x: 97, y: 14 },
        total: { x: 152, y: 14 },
      },
      banker: {
        cards: [
          { x: 288, y: 26 },
          { x: 348, y: 26 },
        ],
        third: { x: 408, y: 36 },
        label: { x: 345, y: 14 },
        total: { x: 400, y: 14 },
      },
    },
    spots: Object.fromEntries(offered.map((b) => [b, SPOTS[b]])),
    shoe: { x: 540, y: 40 },
    discard: { x: -30, y: 40 },
    rack: { x: 520, y: 200 },
    banner: { x: 260, y: 116 },
    minTapUnits: 44,
  };
}
