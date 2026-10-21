// Dev-only gallery of the table UI, driven by the REAL engine (createGame / applyAction / roads)
// and the REAL EV module (previewSlip / shoeTracker). Run `npm run dev` and open /src/sim/ui/gallery.html
//   ?scene=betting|sucker|result|thirds|natural|ez|super6|why|roads|tableau|tracker|session|play
//   &view=portrait|landscape   &theme=dark|light   &four=1   &speed=normal|fast|instant
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { applyAction, createGame, visibleView } from '../engine/game';
import { parseRoadString } from '../engine/roads';
import { VARIANT_RULES } from '../engine/rules';
import type {
  BetId,
  Cents,
  ForcedHand,
  GameEvent,
  GameState,
  Slip,
  TableRules,
  VariantId,
} from '../engine/types';
import * as math from '../math';
import type { SlipPreview, TrackerView } from '../math/types';
import { ActionBar } from './ActionBar';
import { AltCard } from './AltCard';
import { ChipRack } from './ChipRack';
import { EvList } from './EvList';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { Scoreboard } from './Scoreboard';
import { SessionPanel } from './SessionPanel';
import { SettleToast } from './SettleToast';
import { ShoeTracker } from './ShoeTracker';
import { StatusBar } from './StatusBar';
import { Table, useOrientation } from './Table';
import { Tableau } from './Tableau';
import { TierBadge } from './TierBadge';
import { buildTimeline, effectiveSpeed, useSkippableMotion } from './animation';
import type { Speed } from './animation';
import { ROAD_FIXTURES, SESSION_FIXTURE } from './fixtures';
import { BET_LABEL, resultHeadline, suckerPrompt } from './text';

const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme')!;
const scene = q.get('scene') ?? 'betting';
const four = q.get('four') === '1';
const speed = effectiveSpeed((q.get('speed') as Speed | null) ?? 'instant');
const viewPref = (q.get('view') as 'portrait' | 'landscape' | null) ?? 'auto';

function preview(rules: TableRules, slip: Slip, unseen?: readonly number[]): SlipPreview {
  return math.previewSlip({ rules, slip, handsPerHour: 72, unseenRanks: unseen });
}
function tracker(state: GameState): TrackerView {
  return math.shoeTracker(visibleView(state));
}

const FORCED: Record<string, ForcedHand> = {
  result: { player: ['Kh', '2d', '3c'], banker: ['4s', '3h'] }, // Banker wins 7 to 5
  thirds: { player: ['2h', '3d', '4c'], banker: ['5s', 'Kd', '6h'] }, // both draw, sideways
  natural: { player: ['8d', 'Kc'], banker: ['3h', '4s'] },
  ez: { player: ['Ks', '6d'], banker: ['2c', '2h', '3s'] }, // Banker 3-card 7: pushes in EZ
};

interface Dealt {
  state: GameState;
  events: GameEvent[];
}
function dealHand(variant: VariantId, bets: Slip, forced: ForcedHand | null, seed = 7): Dealt {
  const s0 = createGame({
    rules: { variant },
    seed,
    bankroll: 100_000,
    bets,
    forced: forced ? [forced] : [],
  });
  const r = applyAction(s0, { type: 'deal' });
  if (!r.ok) throw new Error(r.error.message);
  return { state: r.state, events: r.events };
}
function playShoe(hands: number, seed = 11): GameState {
  let s = createGame({ seed });
  for (let i = 0; i < hands; i++) {
    const r = applyAction(s, { type: 'deal' });
    if (!r.ok) throw new Error(r.error.message);
    s = r.state;
  }
  return s;
}

function rulesFor(variant: VariantId): TableRules {
  return VARIANT_RULES[variant];
}

/** An interactive table: chips, spots, Sucker second tap, alternative, deal, timeline, toast. */
function PlayTable({
  variant,
  initial,
  forced,
  openSheet,
  whyFor,
  confirmFor,
  withTracker,
}: {
  variant: VariantId;
  initial: Slip;
  forced?: ForcedHand | null;
  openSheet?: boolean;
  whyFor?: BetId | null;
  confirmFor?: BetId | null;
  withTracker?: boolean;
}) {
  const orientation = useOrientation(viewPref);
  const rules = rulesFor(variant);
  const [state, setState] = useState<GameState>(() =>
    createGame({
      rules: { variant },
      seed: 7,
      bankroll: 100_000,
      bets: initial,
      forced: forced ? [forced] : [],
    }),
  );
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chip, setChip] = useState<Cents>(2500);
  const [sheetOpen, setSheetOpen] = useState(!!openSheet);
  const [why, setWhy] = useState<BetId | null>(whyFor ?? null);
  const [confirming, setConfirming] = useState<BetId | null>(confirmFor ?? null);
  const [handKey, setHandKey] = useState(0);
  const p = useMemo(() => preview(rules, state.bets), [rules, state.bets]);
  const tl = useMemo(() => buildTimeline(events, speed), [events]);
  const motion = useSkippableMotion(handKey, tl.totalMs);
  const act = (a: Parameters<typeof applyAction>[1]) => {
    const r = applyAction(state, a);
    if (r.ok) {
      setState(r.state);
      if (a.type === 'deal') {
        setEvents(r.events);
        setHandKey((k) => k + 1);
      }
    }
  };
  const place = (bet: BetId) => {
    const ev = p.sheet.find((b) => b.bet === bet);
    if (ev?.tier === 'sucker' && confirming !== bet && !state.bets[bet]) {
      setConfirming(bet);
      return;
    }
    setConfirming(null);
    act({ type: 'set-bet', bet, amount: (state.bets[bet] ?? 0) + chip });
  };
  const last = state.lastResult;
  const showHand = events.length > 0 && last;
  const results = showHand
    ? Object.fromEntries(last.settlements.map((s) => [s.bet, s.result]))
    : null;
  const slipTotal = Object.values(state.bets).reduce((a: number, b) => a + (b ?? 0), 0);
  const confirmEv = confirming ? p.sheet.find((b) => b.bet === confirming) : null;
  const felt = (
    <Felt
      orientation={orientation}
      rules={rules}
      player={showHand ? last.hand.player.cards : []}
      banker={showHand ? last.hand.banker.cards : []}
      bets={showHand && slipTotal === 0 ? state.lastBets : state.bets}
      ghost={!!showHand && slipTotal === 0}
      sheet={p.sheet}
      fourColor={four}
      timeline={tl}
      skipped={motion.skipped}
      onSkip={motion.skip}
      winner={showHand ? last.hand.winner : null}
      results={motion.playing ? null : results}
      onSpot={motion.playing ? undefined : place}
      confirming={confirming}
      banner={
        showHand
          ? last.hand.winner === 'tie'
            ? 'Tie'
            : `${BET_LABEL[last.hand.winner]} wins`
          : null
      }
      burn={state.shoe.burn}
    />
  );
  const notices = (
    <>
      {confirming && confirmEv ? (
        <AltCard
          mode="confirm"
          bet={confirming}
          tier={confirmEv.tier}
          text={suckerPrompt(confirming, confirmEv.ev, 1000)}
          to={p.alternative?.to ?? (variant === 'super-6' ? 'player' : 'banker')}
          onConfirm={() => {
            setConfirming(null);
            act({ type: 'set-bet', bet: confirming, amount: (state.bets[confirming] ?? 0) + chip });
          }}
          onUse={() => {
            const to = variant === 'super-6' ? 'player' : 'banker';
            setConfirming(null);
            act({ type: 'set-bet', bet: to, amount: (state.bets[to] ?? 0) + Math.max(chip, 500) });
          }}
          onDismiss={() => setConfirming(null)}
        />
      ) : null}
      {showHand && !motion.playing ? <SettleToast result={last} rules={rules} details /> : null}
    </>
  );
  const sheet = sheetOpen ? (
    <EvSheet
      preview={p}
      rules={rules}
      slip={Object.keys(state.bets) as BetId[]}
      whyOpen={why}
      onToggleWhy={(b) => setWhy((w) => (w === b ? null : b))}
      tracker={withTracker ? preview(rules, state.bets, visibleView(state).unseenRanks) : null}
      onUseAlternative={(alt) => {
        const s1 = applyAction(state, { type: 'set-bet', bet: alt.from, amount: 0 });
        if (!s1.ok) return;
        const s2 = applyAction(s1.state, {
          type: 'set-bet',
          bet: alt.to,
          amount: (s1.state.bets[alt.to] ?? 0) + Math.max(alt.amount, 500),
        });
        if (s2.ok) setState(s2.state);
      }}
      mode={orientation === 'landscape' ? 'panel' : 'inline'}
      onClose={() => setSheetOpen(false)}
    />
  ) : null;
  const left = visibleView(state).unseenRanks.reduce((a, b) => a + b, 0);
  return (
    <Table
      orientation={orientation}
      status={
        <StatusBar
          bankroll={state.bankroll}
          onFelt={slipTotal}
          sessionNet={state.stats.hands ? (last?.net ?? 0) : null}
          shoe={{
            cardsLeft: left,
            cutCardOut: state.shoe.cutCardOut,
            finished: state.shoe.finished,
          }}
        />
      }
      felt={felt}
      roads={<Scoreboard entries={state.history} view={['bead']} minColumns={14} />}
      notices={notices}
      chips={<ChipRack selected={chip} onSelect={setChip} compact={orientation === 'landscape'} />}
      actions={
        <ActionBar
          slipTotal={slipTotal}
          evCents={p.totalEvCents}
          lastTotal={Object.values(state.lastBets).reduce((a: number, b) => a + (b ?? 0), 0)}
          canRebet
          busy={motion.playing}
          onDeal={({ rebet }) => act({ type: 'deal', rebet })}
          onRebet={() => act({ type: 'rebet' })}
          onClear={() => act({ type: 'clear-bets' })}
          onEv={() => setSheetOpen((o) => !o)}
          evOpen={sheetOpen}
          layout={orientation === 'landscape' ? 'rail' : 'bar'}
        />
      }
      rail={
        !sheetOpen ? <EvList sheet={p.sheet} slip={Object.keys(state.bets) as BetId[]} /> : null
      }
      sheet={sheet}
    />
  );
}

/** A dealt hand, frozen at its end state (or animating with ?speed=normal). */
function DealtTable({
  variant,
  bets,
  forced,
}: {
  variant: VariantId;
  bets: Slip;
  forced: ForcedHand;
}) {
  const orientation = useOrientation(viewPref);
  const d = useMemo(() => dealHand(variant, bets, forced), [variant, bets, forced]);
  const rules = d.state.rules;
  const r = d.state.lastResult!;
  const tl = useMemo(() => buildTimeline(d.events, speed), [d]);
  const motion = useSkippableMotion(d, tl.totalMs);
  const p = preview(rules, d.state.lastBets);
  return (
    <Table
      orientation={orientation}
      status={
        <StatusBar
          bankroll={d.state.bankroll}
          onFelt={0}
          sessionNet={r.net}
          shoe={{ cardsLeft: visibleView(d.state).unseenRanks.reduce((a, b) => a + b, 0) }}
        />
      }
      felt={
        <Felt
          orientation={orientation}
          rules={rules}
          player={r.hand.player.cards}
          banker={r.hand.banker.cards}
          bets={d.state.lastBets}
          sheet={p.sheet}
          fourColor={four}
          timeline={tl}
          skipped={motion.skipped}
          onSkip={motion.skip}
          winner={r.hand.winner}
          results={Object.fromEntries(r.settlements.map((s) => [s.bet, s.result]))}
          banner={r.hand.winner === 'tie' ? 'Tie' : `${BET_LABEL[r.hand.winner]} wins`}
        />
      }
      roads={<Scoreboard entries={d.state.history} view={['bead']} minColumns={14} />}
      notices={<SettleToast result={r} rules={rules} details />}
      chips={<ChipRack selected={2500} onSelect={() => {}} compact={orientation === 'landscape'} />}
      actions={
        <ActionBar
          slipTotal={0}
          lastTotal={Object.values(d.state.lastBets).reduce((a: number, b) => a + (b ?? 0), 0)}
          canRebet
          onDeal={() => {}}
          onRebet={() => {}}
          onClear={() => {}}
          onEv={() => {}}
          layout={orientation === 'landscape' ? 'rail' : 'bar'}
        />
      }
      rail={<EvList sheet={p.sheet} />}
    />
  );
}

function Page({ children, title }: { children: ComponentChildren; title: string }) {
  return (
    <main class="gallery-page">
      <h1 class="gallery-title">{title}</h1>
      {children}
    </main>
  );
}

function App() {
  let body: ComponentChildren;
  switch (scene) {
    case 'betting':
      body = <PlayTable variant="punto-banco" initial={{ banker: 2500, tie: 1000 }} openSheet />;
      break;
    case 'play':
      body = <PlayTable variant="punto-banco" initial={{}} forced={FORCED.result} />;
      break;
    case 'sucker':
      body = <PlayTable variant="punto-banco" initial={{ banker: 2500 }} confirmFor="tie" />;
      break;
    case 'why':
      body = (
        <PlayTable variant="punto-banco" initial={{ banker: 1000 }} openSheet whyFor="banker" />
      );
      break;
    case 'ez':
      body = <PlayTable variant="ez" initial={{ banker: 2500, 'dragon-7': 500, 'panda-8': 500 }} />;
      break;
    case 'super6':
      body = <PlayTable variant="super-6" initial={{ banker: 2500 }} openSheet />;
      break;
    case 'result':
      body = (
        <DealtTable
          variant="punto-banco"
          bets={{ banker: 2500, 'player-pair': 500 }}
          forced={FORCED.result!}
        />
      );
      break;
    case 'thirds':
      body = (
        <DealtTable
          variant="punto-banco"
          bets={{ player: 2500, tie: 500 }}
          forced={FORCED.thirds!}
        />
      );
      break;
    case 'natural':
      body = <DealtTable variant="punto-banco" bets={{ player: 1000 }} forced={FORCED.natural!} />;
      break;
    case 'ez-push':
      body = (
        <DealtTable variant="ez" bets={{ banker: 2500, 'dragon-7': 500 }} forced={FORCED.ez!} />
      );
      break;
    case 'roads': {
      const s = playShoe(44);
      body = (
        <Page title="Scoreboard (44 real hands, seed 11)">
          <Scoreboard entries={s.history} caption="This shoe" />
          <h2>Dragon tail and leading tie</h2>
          <Scoreboard entries={parseRoadString(ROAD_FIXTURES.dragonTail)} view={['big']} />
          <h2>Blocked tail</h2>
          <Scoreboard entries={parseRoadString(ROAD_FIXTURES.blockedTail)} view={['big']} />
          <h2>Pairs, naturals, ties (totals shown)</h2>
          <Scoreboard entries={parseRoadString(ROAD_FIXTURES.mixed)} showTotals />
        </Page>
      );
      break;
    }
    case 'tableau':
      body = (
        <Page title="Drawing rules">
          <Tableau view="full" highlight={['b4/p7', 'b6/s', 'p5']} />
          <h2>Tappable (Rules screen)</h2>
          <Tableau view="banker" highlight={['b3/p8']} onCell={() => {}} />
        </Page>
      );
      break;
    case 'tracker': {
      const s = playShoe(70, 5);
      body = (
        <Page title="Shoe tracker">
          <ShoeTracker view={tracker(s)} />
        </Page>
      );
      break;
    }
    case 'session':
      body = (
        <Page title="Session and badges">
          <SessionPanel summary={SESSION_FIXTURE} />
          <p>
            {(['free', 'good', 'fair', 'costly', 'sucker'] as const).map((t) => (
              <>
                <TierBadge key={t} tier={t} />{' '}
              </>
            ))}
            <TierBadge tier="free" tracker />
          </p>
          <SettleToast
            result={dealHand('punto-banco', { banker: 2500 }, FORCED.result!).state.lastResult!}
          />
          <p class="gallery-note">
            {resultHeadline(
              dealHand('punto-banco', { banker: 2500 }, FORCED.result!).state.lastResult!,
            )}
          </p>
        </Page>
      );
      break;
    default:
      body = <p>Unknown scene {scene}</p>;
  }
  return <>{body}</>;
}

render(<App />, document.getElementById('app')!);
