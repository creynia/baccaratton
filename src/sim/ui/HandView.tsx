// One side's cards on the felt: two upright cards, the third sideways, the label and a total badge
// ("Player 7"). Presentational; timing comes from the animation timeline.
import { handTotal } from '../engine/tableau';
import type { Card as CardId, Side } from '../engine/types';
import { Card, CardSlot } from './Card';
import type { Timeline } from './animation';
import type { FeltLayout, Pt } from './layouts';

export interface HandViewProps {
  side: Side;
  layout: FeltLayout;
  cards: readonly CardId[];
  fourColor?: boolean;
  timeline?: Timeline | null;
  /** This side won the hand (gold label). */
  won?: boolean;
  /** Dashed slots where the cards will land (empty felt). */
  slots?: boolean;
  /** Card indexes a scene highlights. */
  highlight?: readonly number[];
}

const LABEL: Readonly<Record<Side, string>> = { player: 'PLAYER', banker: 'BANKER' };

function TotalBadge({ at, value, style }: { at: Pt; value: number; style?: string }) {
  return (
    <g class={style ? 'sim-total is-anim' : 'sim-total'} style={style} aria-hidden="true">
      <circle cx={at.x} cy={at.y} r={12} class="sim-total-bg" />
      <text x={at.x} y={at.y + 5} text-anchor="middle" class="sim-total-text">
        {value}
      </text>
    </g>
  );
}

export function HandView({
  side,
  layout,
  cards,
  fourColor,
  timeline,
  won,
  slots,
  highlight = [],
}: HandViewProps) {
  const g = layout.hands[side];
  const { w, h } = layout.card;
  const tl = timeline && timeline.totalMs > 0 ? timeline : null;
  const positions: Pt[] = [g.cards[0], g.cards[1], g.third];
  const two = cards.length >= 2 ? handTotal(cards.slice(0, 2)) : null;
  const final = cards.length >= 2 ? handTotal(cards) : null;
  const tt = tl?.totals[side];
  return (
    <g class={`sim-hand sim-hand-${side}${won ? ' is-won' : ''}`} data-hand={side}>
      <text x={g.label.x} y={g.label.y + 5} text-anchor="middle" class="sim-hand-label">
        {LABEL[side]}
      </text>
      {slots && cards.length === 0
        ? g.cards.map((p, i) => <CardSlot key={i} x={p.x} y={p.y} w={w} h={h} />)
        : null}
      {cards.map((c, i) => {
        const p = positions[i]!;
        const slot = tl?.slots[side][i];
        const sideways = i === 2;
        return (
          <Card
            key={`${i}-${c}`}
            card={c}
            x={p.x}
            y={p.y}
            w={w}
            h={h}
            sideways={sideways}
            fourColor={fourColor}
            highlight={highlight.includes(i)}
            note={sideways ? 'third card' : undefined}
            motion={
              slot
                ? {
                    from: { dx: layout.shoe.x - p.x, dy: layout.shoe.y - p.y },
                    slideAt: slot.slideAt,
                    slideMs: sideways ? tl.pacing!.third / 2 : tl.pacing!.slide,
                    flipAt: slot.flipAt,
                    flipMs: sideways ? tl.pacing!.third / 2 : tl.pacing!.flip,
                  }
                : null
            }
          />
        );
      })}
      {final !== null ? (
        tt && tt.three !== null && two !== null ? (
          <>
            <TotalBadge
              at={g.total}
              value={two}
              style={`animation-name:sim-appear,sim-vanish;animation-delay:${tt.two}ms,${tt.three}ms;animation-duration:1ms,1ms;animation-fill-mode:both,forwards`}
            />
            <TotalBadge
              at={g.total}
              value={final}
              style={`animation-name:sim-appear;animation-delay:${tt.three}ms;animation-duration:1ms;animation-fill-mode:both`}
            />
          </>
        ) : (
          <TotalBadge
            at={g.total}
            value={final}
            style={
              tt
                ? `animation-name:sim-appear;animation-delay:${tt.two}ms;animation-duration:1ms;animation-fill-mode:both`
                : undefined
            }
          />
        )
      ) : null}
    </g>
  );
}
