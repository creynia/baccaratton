import { BET_IDS_BY_VARIANT } from '../../engine/ids';
import type { BetId, VariantId } from '../../engine/types';
import type { FeltLayout, Rect } from './types';

/** simulator.md section 4.2: viewBox 390 × 432 (366 without the EZ row); 1 unit = 1 CSS px. */
const SPOTS: Readonly<Record<BetId, Rect>> = {
  player: { x: 16, y: 186, w: 116, h: 100 },
  tie: { x: 137, y: 186, w: 116, h: 100 },
  banker: { x: 258, y: 186, w: 116, h: 100 },
  'player-pair': { x: 16, y: 296, w: 84, h: 60 },
  'dragon-bonus-player': { x: 106, y: 296, w: 84, h: 60 },
  'dragon-bonus-banker': { x: 200, y: 296, w: 84, h: 60 },
  'banker-pair': { x: 290, y: 296, w: 84, h: 60 },
  'panda-8': { x: 16, y: 366, w: 175, h: 56 },
  'dragon-7': { x: 199, y: 366, w: 175, h: 56 },
};

export function portraitLayout(variant: VariantId): FeltLayout {
  const offered = BET_IDS_BY_VARIANT[variant];
  const ez = offered.includes('dragon-7');
  return {
    orientation: 'portrait',
    variant,
    viewBox: { w: 390, h: ez ? 432 : 366 },
    card: { w: 56, h: 78 },
    hands: {
      player: {
        cards: [
          { x: 37, y: 34 },
          { x: 99, y: 34 },
        ],
        third: { x: 58, y: 118 },
        label: { x: 97, y: 18 },
        total: { x: 150, y: 18 },
      },
      banker: {
        cards: [
          { x: 233, y: 34 },
          { x: 295, y: 34 },
        ],
        third: { x: 254, y: 118 },
        label: { x: 293, y: 18 },
        total: { x: 346, y: 18 },
      },
    },
    spots: Object.fromEntries(offered.map((b) => [b, SPOTS[b]])),
    shoe: { x: 370, y: 60 },
    discard: { x: -20, y: 60 },
    rack: { x: 195, y: ez ? 432 : 366 },
    banner: { x: 195, y: 146 },
    minTapUnits: 44,
  };
}
