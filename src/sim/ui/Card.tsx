// SVG playing cards (simulator.md section 4.1). Suits are text-presentation glyphs (U+FE0E, never
// emoji); 2- or 4-colour decks; navy back with gold trim. A third card lies sideways (rotated
// 90°), the casino convention. Quick flip only, no squeeze (D7).
import { cardName } from '../engine/cards';
import type { Card as CardId, Suit } from '../engine/types';

const RANK_TEXT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
/** Text presentation selector keeps the glyphs monochrome text on every platform. */
export const SUIT_GLYPH: Readonly<Record<Suit, string>> = {
  0: '♠︎',
  1: '♥︎',
  2: '♦︎',
  3: '♣︎',
};
const SUIT_CLASS = ['s', 'h', 'd', 'c'] as const;

export interface CardMotion {
  /** Slide in from this offset (viewBox units, relative to the final position). */
  from?: { dx: number; dy: number };
  slideAt: number;
  slideMs: number;
  /** When the face turns up (ms). */
  flipAt: number;
  flipMs: number;
}

export interface CardProps {
  /** 0..51; omit (or faceDown) for a back. */
  card?: CardId;
  /** Top-left of the card's box. A sideways card's box is h × w. */
  x: number;
  y: number;
  /** Upright size. */
  w: number;
  h: number;
  sideways?: boolean;
  faceDown?: boolean;
  fourColor?: boolean;
  motion?: CardMotion | null;
  highlight?: boolean;
  dim?: boolean;
  /** Spoken extra after the card name ("third card"). */
  note?: string;
}

function Face({
  card,
  w,
  h,
  fourColor,
}: {
  card: CardId;
  w: number;
  h: number;
  fourColor?: boolean;
}) {
  const rank = card >> 2;
  const suit = (card & 3) as Suit;
  const r = RANK_TEXT[rank]!;
  const cls = `sim-suit-${SUIT_CLASS[suit]}${fourColor ? ' is-four' : ''}`;
  const fs = w * (r.length > 1 ? 0.3 : 0.34);
  const ss = w * 0.26;
  const corner = (
    <>
      <text x={w * 0.1} y={fs * 0.95 + 2} font-size={fs} class={`sim-rank ${cls}`}>
        {r}
      </text>
      <text x={w * 0.1} y={fs * 0.95 + ss + 2} font-size={ss} class={`sim-pip ${cls}`}>
        {SUIT_GLYPH[suit]}
      </text>
    </>
  );
  return (
    <>
      <rect width={w} height={h} rx={Math.max(4, w * 0.09)} class="sim-card-body" />
      {corner}
      <g transform={`rotate(180 ${w / 2} ${h / 2})`}>{corner}</g>
      <text
        x={w / 2}
        y={h / 2 + w * 0.17}
        font-size={w * 0.48}
        text-anchor="middle"
        class={`sim-pip sim-pip-big ${cls}`}
      >
        {SUIT_GLYPH[suit]}
      </text>
    </>
  );
}

function Back({ w, h }: { w: number; h: number }) {
  const rx = Math.max(4, w * 0.09);
  return (
    <>
      <rect width={w} height={h} rx={rx} class="sim-card-back-body" />
      <rect x={4} y={4} width={w - 8} height={h - 8} rx={rx - 2} class="sim-card-back-inner" />
      <path
        class="sim-card-back-lines"
        d={`M4 ${h * 0.3}L${w - 4} ${h * 0.7}M4 ${h * 0.7}L${w - 4} ${h * 0.3}`}
      />
    </>
  );
}

const ms = (n: number) => `${Math.round(n)}ms`;

/** One card. Face-up cards are `role="img"` named "King of hearts". */
export function Card({
  card,
  x,
  y,
  w,
  h,
  sideways,
  faceDown,
  fourColor,
  motion,
  highlight,
  dim,
  note,
}: CardProps) {
  const up = !faceDown && card !== undefined;
  const pos = sideways
    ? `translate(${x + h / 2} ${y + w / 2}) rotate(90) translate(${-w / 2} ${-h / 2})`
    : `translate(${x} ${y})`;
  // A sideways card's local axes are rotated: global (dx, dy) is local (dy, −dx).
  const from = motion?.from;
  const local = from ? (sideways ? { dx: from.dy, dy: -from.dx } : from) : { dx: 0, dy: 0 };
  const slideStyle = motion
    ? `--sim-dx:${local.dx}px;--sim-dy:${local.dy}px;animation-delay:${ms(motion.slideAt)};animation-duration:${ms(motion.slideMs)}`
    : undefined;
  const flipping = !!motion && up && motion.flipMs > 0;
  const name = up ? cardName(card) : 'Face-down card';
  const label = note ? `${name}, ${note}` : name;
  return (
    <g
      class={`sim-card${sideways ? ' is-sideways' : ''}${highlight ? ' is-hl' : ''}${dim ? ' is-dim' : ''}`}
      transform={pos}
      role="img"
      aria-label={label}
      data-card={up ? card : undefined}
    >
      <g class={motion ? 'sim-card-slide is-anim' : 'sim-card-slide'} style={slideStyle}>
        {up ? (
          <>
            {flipping ? (
              <g
                class="sim-card-back is-anim"
                style={`animation-delay:${ms(motion.flipAt)};animation-duration:${ms(motion.flipMs / 2)}`}
              >
                <Back w={w} h={h} />
              </g>
            ) : null}
            <g
              class={flipping ? 'sim-card-face is-anim' : 'sim-card-face'}
              style={
                flipping
                  ? `animation-delay:${ms(motion.flipAt + motion.flipMs / 2)};animation-duration:${ms(motion.flipMs / 2)}`
                  : undefined
              }
            >
              <Face card={card} w={w} h={h} fourColor={fourColor} />
            </g>
          </>
        ) : (
          <Back w={w} h={h} />
        )}
        {highlight ? (
          <rect
            x={-3}
            y={-3}
            width={w + 6}
            height={h + 6}
            rx={Math.max(6, w * 0.12)}
            class="sim-card-hl"
          />
        ) : null}
      </g>
    </g>
  );
}

/** A dashed empty slot, so the felt shows where cards will land. */
export function CardSlot({
  x,
  y,
  w,
  h,
  sideways,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  sideways?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={sideways ? h : w}
      height={sideways ? w : h}
      rx={Math.max(4, w * 0.09)}
      class="sim-slot"
      aria-hidden="true"
    />
  );
}
