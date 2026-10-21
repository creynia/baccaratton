import './sim.css';
// The felt as one SVG (simulator.md sections 4.1–4.3): both hands, the bet spots of the variant,
// the burn card and the result banner. Presentational: everything comes in as props.
import { cardName } from '../engine/cards';
import { handTotal } from '../engine/tableau';
import type { BetId, Card as CardId, Slip, TableRules, Winner } from '../engine/types';
import type { BetEv } from '../math/types';
import { BetSpot } from './BetSpot';
import type { SpotEv } from './BetSpot';
import { Card } from './Card';
import { HandView } from './HandView';
import type { Timeline } from './animation';
import { feltLayout } from './layouts';
import type { Orientation } from './layouts';
import { payoutShort, payoutSpoken, pct } from './text';

export interface FeltProps {
  orientation: Orientation;
  rules: TableRules;
  player?: readonly CardId[];
  banker?: readonly CardId[];
  bets: Slip;
  /** The EV sheet rows (full shoe). Omit or null to hide the badges (practice mode). */
  sheet?: readonly BetEv[] | null;
  fourColor?: boolean;
  timeline?: Timeline | null;
  /** Visuals flushed (tap to skip). */
  skipped?: boolean;
  onSkip?: () => void;
  winner?: Winner | null;
  /** Per bet, how the last hand settled (glow / dim). */
  results?: Partial<Record<BetId, 'win' | 'push' | 'lose'>> | null;
  onSpot?: (bet: BetId) => void;
  onSpotLongPress?: (bet: BetId) => void;
  highlight?: readonly BetId[];
  /** Highlighted card slots, e.g. { banker: [2] }. */
  highlightCards?: Partial<Record<'player' | 'banker', readonly number[]>>;
  /** A Sucker bet waiting for its second tap. */
  confirming?: BetId | null;
  /** The chips are the next hand's intent (after a settle, before the next Deal). */
  ghost?: boolean;
  disabled?: boolean;
  /** Short banner between the hands ("Banker wins", "Tie", "New shoe", "Last hand"); the full
   * sentence goes in the SettleToast. */
  banner?: string | null;
  /** The burn: its face-up card is shown while the burn step plays (or always with `showBurn`). */
  burn?: { faceUp: CardId; count: number } | null;
  showBurn?: boolean;
}

export function spotEvOf(b: BetEv): SpotEv {
  return { tier: b.tier, evText: pct(b.ev), edgeText: pct(b.edge) };
}

function summaryOf(player: readonly CardId[], banker: readonly CardId[]): string {
  const part = (name: string, cs: readonly CardId[]) =>
    cs.length >= 2 ? `${name}: ${cs.map(cardName).join(', ')}, total ${handTotal(cs)}.` : '';
  return [part('Player', player), part('Banker', banker)].filter(Boolean).join(' ');
}

export function Felt({
  orientation,
  rules,
  player = [],
  banker = [],
  bets,
  sheet,
  fourColor,
  timeline,
  skipped,
  onSkip,
  winner,
  results,
  onSpot,
  onSpotLongPress,
  highlight = [],
  highlightCards,
  confirming,
  ghost,
  disabled,
  banner,
  burn,
  showBurn,
}: FeltProps) {
  const L = feltLayout(orientation, rules.variant);
  const tl = !skipped && timeline && timeline.totalMs > 0 ? timeline : null;
  const evOf = new Map((sheet ?? []).map((b) => [b.bet, b]));
  const burnStep = tl?.steps.find((s) => s.kind === 'burn');
  const resultStep = tl?.steps.find((s) => s.kind === 'result');
  const empty = player.length === 0 && banker.length === 0;
  const { w: vw, h: vh } = L.viewBox;
  return (
    <div
      class={`sim-felt-wrap sim-felt-${orientation}${tl ? ' is-playing' : ''}`}
      onClick={tl ? onSkip : undefined}
      data-testid="felt"
      data-variant={rules.variant}
    >
      <svg
        class="sim-felt"
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Baccarat table"
      >
        <rect x="0" y="0" width={vw} height={vh} class="sim-felt-bg" />
        <rect x="4" y="4" width={vw - 8} height={vh - 8} rx="16" class="sim-felt-trim" />
        <HandView
          side="player"
          layout={L}
          cards={player}
          fourColor={fourColor}
          timeline={tl}
          won={winner === 'player'}
          slots={empty}
          highlight={highlightCards?.player}
        />
        <HandView
          side="banker"
          layout={L}
          cards={banker}
          fourColor={fourColor}
          timeline={tl}
          won={winner === 'banker'}
          slots={empty}
          highlight={highlightCards?.banker}
        />
        {(Object.keys(L.spots) as BetId[]).map((bet) => {
          const ev = evOf.get(bet);
          return (
            <BetSpot
              key={bet}
              bet={bet}
              rect={L.spots[bet]!}
              amount={bets[bet] ?? 0}
              payout={payoutShort(bet, rules)}
              payoutSpoken={payoutSpoken(bet, rules)}
              ev={ev ? spotEvOf(ev) : null}
              minTap={L.minTapUnits}
              onTap={onSpot}
              onLongPress={onSpotLongPress}
              highlight={highlight.includes(bet)}
              result={results?.[bet] ?? null}
              confirming={confirming === bet}
              ghost={ghost}
              disabled={disabled}
            />
          );
        })}
        {burn && (showBurn || burnStep) ? (
          <g
            class={burnStep ? 'sim-burn is-anim' : 'sim-burn'}
            style={
              burnStep
                ? `animation-delay:${burnStep.at}ms;animation-duration:${burnStep.dur}ms`
                : undefined
            }
          >
            <Card
              card={burn.faceUp}
              x={L.banner.x - L.card.w - 4}
              y={L.banner.y - L.card.h / 2 - 20}
              w={L.card.w}
              h={L.card.h}
              fourColor={fourColor}
              note={`burn card, ${burn.count} burned face down`}
            />
            <text x={L.banner.x + 4} y={L.banner.y - 20} class="sim-burn-text">
              Burn {burn.count}
            </text>
          </g>
        ) : null}
        {banner ? (
          <g
            class={resultStep ? 'sim-banner is-anim' : 'sim-banner'}
            style={resultStep ? `animation-delay:${resultStep.at}ms` : undefined}
            aria-hidden="true"
          >
            <rect
              x={L.banner.x - Math.min(vw - 24, banner.length * 7.6 + 24) / 2}
              y={L.banner.y - 13}
              width={Math.min(vw - 24, banner.length * 7.6 + 24)}
              height={26}
              rx={13}
              class="sim-banner-bg"
            />
            <text x={L.banner.x} y={L.banner.y + 5} text-anchor="middle" class="sim-banner-text">
              {banner}
            </text>
          </g>
        ) : null}
      </svg>
      <p class="sim-sr" aria-live="polite">
        {summaryOf(player, banker)}
      </p>
    </div>
  );
}
