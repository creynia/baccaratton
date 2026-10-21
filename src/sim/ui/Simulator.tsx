// The Simulator container (simulator.md sections 4-5, architecture.md section 2.3): wires the
// engine, the EV module, the job client, the table UI, the auto-play panel and the scene runner.
// All game logic lives in scene/driver.ts (SimDriver); this file paces the reveal, holds the
// result back until the cards land, and maps taps to driver inputs.
import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { equity, visibleView } from '../engine/game';
import { slipTotal } from '../engine/validate';
import type { Action, BetId, Cents, GameEvent, GameState, HandResult, Slip } from '../engine/types';
import { previewSlip } from '../math/preview';
import { shoeTracker } from '../math/tracker';
import type { Alternative, SlipPreview } from '../math/types';
import type { EvClient } from '../jobs/protocol';
import { SimDriver, sessionSummary } from '../scene/driver';
import { gateAction, leaves } from '../scene/runner';
import type { DriverEvent } from '../scene/driver';
import type { SceneConfig, TapTarget } from '../scene/types';
import { getStrategy } from '../strategy/presets';
import type { StrategyId, StrategyMemory, StrategySpec } from '../strategy/types';
import { ActionBar } from './ActionBar';
import type { ActionId } from './ActionBar';
import { AltCard } from './AltCard';
import { AutoPlayPanel } from './AutoPlayPanel';
import { ChipRack } from './ChipRack';
import { CHIP_DENOMS } from './ChipStack';
import { EvList } from './EvList';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { PredictBar, PredictFeedbackCard } from './PredictBar';
import { Scoreboard } from './Scoreboard';
import type { RoadView } from './Scoreboard';
import { SessionPanel } from './SessionPanel';
import { SettleToast } from './SettleToast';
import { ShoeTracker } from './ShoeTracker';
import { StatusBar } from './StatusBar';
import { StepPanel } from './StepPanel';
import { Table, useOrientation } from './Table';
import { Toasts } from './Toasts';
import type { Toast } from './Toasts';
import { buildTimeline, cardsUpTo, useSkippableMotion } from './animation';
import { fromSnapshot, toSnapshot } from './persist';
import { defaultChip, parseSandboxQuery, pickSpeed, randomSeed, tableOf } from './settings';
import { alternativeText, BET_LABEL, suckerPrompt } from './text';
import type { SimSettings } from './types';
import './simulator.css';

// The container's props and events (architecture.md section 2.3).
export type SimulatorEvent =
  | { type: 'ready' }
  | { type: 'action-confirmed'; action: Action; events: GameEvent[]; state: GameState }
  | { type: 'action-rejected'; action: Action; reason: string }
  | { type: 'hand-settled'; result: HandResult; state: GameState }
  | { type: 'step-started'; stepId: string }
  | { type: 'step-completed'; stepId: string }
  | { type: 'scene-completed'; sceneId: string }
  | { type: 'auto-play-completed'; hands: number; strategy: string };

export interface SimulatorProps {
  scene?: SceneConfig;
  mode?: 'sandbox' | 'scene';
  settings: SimSettings;
  /** Injected; the app creates one EvClient per page. */
  evClient: EvClient;
  onEvent?: (e: SimulatorEvent) => void;
  /** Sandbox query (`?seed=`, `?shoe=`, `?variant=`, `?tie=`, `?system=`, `?speed=`; D33). */
  query?: URLSearchParams;
  /** The saved sandbox snapshot (opaque, PersistedV1.sandbox): resumes the same shoe mid-way. */
  snapshot?: unknown;
  onSnapshot?: (snap: unknown) => void;
  /** Sandbox starting bankroll (Settings.defaultBankrollCents). */
  bankroll?: Cents;
}

const ROAD_VIEW: Record<'bead-plate' | 'big-road', RoadView> = {
  'bead-plate': 'bead',
  'big-road': 'big',
};
const ACTION_OF: Record<'deal' | 'rebet' | 'clear-bets', ActionId> = {
  deal: 'deal',
  rebet: 'rebet',
  'clear-bets': 'clear',
};
const BET_SET = new Set<string>([
  'player',
  'banker',
  'tie',
  'player-pair',
  'banker-pair',
  'dragon-bonus-player',
  'dragon-bonus-banker',
  'dragon-7',
  'panda-8',
]);

function slipOf(r: HandResult): Slip {
  return Object.fromEntries(r.settlements.map((s) => [s.bet, s.amount]));
}
const CUT_CARD = 'The cut card is out: one more hand, then a new shoe.';
const SHOE_FINISHED = 'Shoe finished. The next Deal shuffles a new shoe.';

/** Cards still in the shoe (face-down burns and dealt cards are out of it). */
function physicalCardsLeft(s: GameState): number {
  return s.shoe.shoeNo === 0 || s.shoe.finished
    ? s.rules.decks * 52
    : s.shoe.order.length - s.shoe.pos;
}

interface Watch {
  spec: StrategySpec;
  mem: StrategyMemory;
  left: number;
  lastHand: number | null;
}

export function Simulator(props: SimulatorProps) {
  const { scene, settings, evClient } = props;
  const mode = props.mode ?? (scene ? 'scene' : 'sandbox');
  const sandbox = mode === 'sandbox';
  const q = useMemo(
    () => parseSandboxQuery(sandbox ? props.query : undefined),
    [props.query, sandbox],
  );
  const table = tableOf(settings, sandbox ? undefined : scene, q);
  const tableKey = `${table.variant}:${table.tiePays}`;
  const onEventRef = useRef(props.onEvent);
  onEventRef.current = props.onEvent;
  const chips = scene?.ui?.chips ?? CHIP_DENOMS;
  const restored = useMemo(
    () => (sandbox ? fromSnapshot(props.snapshot, table) : null),
    // Only the first render restores; later snapshots are our own.
    [],
  );
  const [chip, setChip] = useState<Cents>(() =>
    restored?.chip && chips.includes(restored.chip) ? restored.chip : defaultChip(scene, chips),
  );
  const makeDriver = (restore: boolean) =>
    new SimDriver({
      ...(scene && !sandbox ? { scene } : {}),
      mode,
      seed: q.seed ?? randomSeed(),
      variant: table.variant,
      tiePays: table.tiePays,
      bankroll: props.bankroll ?? 50_000,
      ...(q.forced ? { forced: q.forced } : {}),
      shoeTracker: settings.shoeTracker,
      showRoads: settings.showRoads,
      restore: restore ? restored : null,
      onEvent: (e: DriverEvent) => onEventRef.current?.(e),
    });
  const [driver, setDriver] = useState(() => makeDriver(true));
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => driver.subscribe(() => force(0)), [driver]);
  useEffect(() => {
    const r = driver.state.rules;
    if (r.variant !== table.variant || r.tiePays !== table.tiePays) setDriver(makeDriver(false));
  }, [tableKey]);
  useEffect(() => {
    if (sandbox) driver.setShoeTracker(settings.shoeTracker);
  }, [driver, sandbox, settings.shoeTracker]);

  const v = driver.view;
  const orientation = useOrientation(scene?.ui?.orientation ?? 'auto');
  const landscape = orientation === 'landscape';
  const [watch, setWatch] = useState<Watch | null>(null);
  const speed = watch
    ? pickSpeed(settings, 'fast')
    : pickSpeed(settings, scene?.ui?.speed ?? q.speed);

  // ---------- the staged reveal ----------
  const events = v.lastEvents;
  let settled: HandResult | null = null;
  for (const e of events) if (e.type === 'hand-settled') settled = e.result;
  const handN = settled?.hand.n ?? null;
  const awaiting = v.awaiting && v.awaiting.hand === handN ? v.awaiting : null;
  const fb = v.feedback && v.feedback.hand === handN ? v.feedback : null;
  const pause = awaiting?.pause ?? fb?.pause ?? null;
  const pauseIdx = pause ? events.findIndex((e) => e.type === 'pause-point' && e.at === pause) : -1;
  const phase: 'one' | 'two' | 'all' = awaiting ? 'one' : fb && pauseIdx >= 0 ? 'two' : 'all';
  const tl = useMemo(() => {
    const evs =
      phase === 'one'
        ? events.slice(0, pauseIdx + 1)
        : phase === 'two'
          ? events.slice(pauseIdx + 1)
          : events;
    return buildTimeline(evs, speed);
  }, [events, phase, pauseIdx, speed]);
  const motion = useSkippableMotion(`${v.eventSeq}:${phase}`, tl.totalMs);
  const revealing = !!settled && (motion.playing || !!awaiting);
  // Hold the bankroll, session and roads until the cards land (table-ui review rule a).
  const shown = revealing ? v.before : v.state;
  const state = v.state;
  const rules = state.rules;
  const last = state.lastResult;
  const slipEmpty = slipTotal(state.bets) === 0;

  let player: readonly number[] = [];
  let banker: readonly number[] = [];
  if (phase === 'one' && settled) {
    const c = cardsUpTo(events, pause);
    player = c.player;
    banker = c.banker;
  } else if (last) {
    player = last.hand.player.cards;
    banker = last.hand.banker.cards;
  }

  // ---------- step display (frozen while the hand is dealt) ----------
  const frozen = useRef({ step: v.step, index: v.rt.stepIndex, done: v.rt.done });
  if (!revealing) frozen.current = { step: v.step, index: v.rt.stepIndex, done: v.rt.done };
  const display = frozen.current;
  const [idleHint, setIdleHint] = useState(false);
  useEffect(() => {
    setIdleHint(false);
    if (!v.step?.hint) return;
    const t = setTimeout(() => setIdleHint(true), 20_000);
    return () => clearTimeout(t);
  }, [v.step?.id, v.step?.hint]);

  // ---------- EV ----------
  const practice = !!(scene?.practice || (sandbox && settings.practice));
  const showEV = v.showEV;
  const hph = settings.handsPerHour;
  const preview: SlipPreview = useMemo(
    () => previewSlip({ rules, slip: state.bets, handsPerHour: hph }),
    [rules, state.bets, hph],
  );
  // Practice: EV hidden until the hand is confirmed and settled; then the dealt slip's EV.
  const practiceHidden = practice && (!slipEmpty || !last);
  const settledPreview = useMemo(
    () =>
      practice && last && slipEmpty
        ? previewSlip({ rules, slip: slipOf(last), handsPerHour: hph })
        : null,
    [practice, last, slipEmpty, rules, hph],
  );
  const sheetPreview = !showEV || practiceHidden ? null : (settledPreview ?? preview);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const trackerOn = v.tracker;
  const trackerView = useMemo(
    () => (trackerOn ? shoeTracker(visibleView(shown)) : null),
    [trackerOn, shown],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [why, setWhy] = useState<BetId | null>(scene?.whyOpen ?? null);
  const trackerPreview = useMemo(
    () =>
      // Ready before the sheet opens (the tracker recomputes after each hand anyway, D6).
      trackerOn && sheetPreview
        ? previewSlip({
            rules,
            slip: state.bets,
            handsPerHour: hph,
            unseenRanks: visibleView(shown).unseenRanks,
          })
        : null,
    [trackerOn, sheetPreview, rules, state.bets, hph, shown],
  );

  // ---------- notices ----------
  const [confirming, setConfirming] = useState<BetId | null>(null);
  const [altFor, setAltFor] = useState<BetId | null>(null);
  const [dismissedHand, setDismissedHand] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>(() =>
    q.errors.map((text, i) => ({ id: i + 1, text, tone: 'bad' as const })),
  );
  const toastId = useRef(100);
  /** Adds a toast unless the same text is showing; `replaces` drops toasts it supersedes. */
  const pushToast = (text: string, tone: Toast['tone'] = 'info', replaces: string[] = []) =>
    setToasts((t) =>
      t.some((x) => x.text === text)
        ? t
        : [
            ...t.filter((x) => !replaces.includes(x.text)).slice(-2),
            { id: toastId.current++, text, tone },
          ],
    );
  const shoeNoteSeq = useRef(-1);
  useEffect(() => {
    if (revealing || shoeNoteSeq.current === v.eventSeq) return;
    shoeNoteSeq.current = v.eventSeq;
    if (events.some((e) => e.type === 'shoe-finished'))
      pushToast(SHOE_FINISHED, 'info', [CUT_CARD]);
    else if (events.some((e) => e.type === 'cut-card')) pushToast(CUT_CARD);
  }, [revealing, v.eventSeq]);

  // ---------- persistence ----------
  const { onSnapshot } = props;
  useEffect(() => {
    if (sandbox && onSnapshot) onSnapshot(toSnapshot(driver.snapshot(), chip));
  }, [driver, v.version, chip, sandbox, onSnapshot]);

  // ---------- auto-play "Watch" (sandbox) ----------
  useEffect(() => {
    if (!watch || revealing) return;
    if (watch.left <= 0) {
      setWatch(null);
      return;
    }
    const t = setTimeout(() => {
      const strat = getStrategy(watch.spec.id);
      const st = driver.state;
      let mem = watch.mem;
      if (watch.lastHand !== null && st.lastResult?.hand.n === watch.lastHand)
        mem = strat.update(mem, watch.spec, st.lastResult);
      const slip = strat.decide(visibleView(st), mem, watch.spec);
      if (!slipTotal(st.bets) || slipTotal(st.bets) !== slipTotal(slip))
        driver.act({ type: 'clear-bets' });
      for (const [bet, amount] of Object.entries(slip)) {
        if (!amount) continue;
        const r = driver.act({ type: 'set-bet', bet: bet as BetId, amount });
        if (!r.ok) {
          driver.dismissRejection(); // one toast: the Watch one says why
          pushToast(`Watch stopped: ${r.message}`, 'bad');
          setWatch(null);
          return;
        }
      }
      const r = driver.act({ type: 'deal' });
      if (!r.ok) return setWatch(null);
      setWatch({ ...watch, mem, left: watch.left - 1, lastHand: driver.state.lastResult!.hand.n });
    }, 120);
    return () => clearTimeout(t);
  }, [watch, revealing, driver]);

  // ---------- inputs ----------
  const act = (a: Action) => {
    if (revealing) {
      motion.skip();
      return { ok: false as const, message: 'dealing' };
    }
    const r = driver.act(a);
    if (r.ok) {
      setConfirming(null);
      if (a.type === 'deal') {
        setAltFor(null);
        setDismissedHand(null);
      }
    }
    return r;
  };
  const tap = (t: TapTarget) => {
    if (!sandbox) driver.tap(t);
  };
  const tierOf = (bet: BetId) => preview.sheet.find((b) => b.bet === bet)?.tier;
  const place = (bet: BetId) => {
    const cur = state.bets[bet] ?? 0;
    const r = act({ type: 'set-bet', bet, amount: cur + chip });
    if (r.ok && cur === 0 && !practice && showEV && tierOf(bet) === 'costly') setAltFor(bet);
  };
  const onSpot = (bet: BetId) => {
    if (revealing) return motion.skip();
    tap(bet);
    if (v.betsLocked) return;
    const cur = state.bets[bet] ?? 0;
    if (
      settings.confirmCostlyBets &&
      !practice &&
      showEV &&
      cur === 0 &&
      tierOf(bet) === 'sucker' &&
      confirming !== bet
    ) {
      setConfirming(bet);
      return;
    }
    place(bet);
  };
  const openSheet = (focus?: BetId) => {
    setSheetOpen(true);
    tap('ev-sheet');
    if (focus) driver.previewed(focus);
    // The sheet lists every offered bet with its EV: opening it previews each row (one update).
    else driver.previewedAll(preview.sheet.filter((b) => b.offered).map((b) => b.bet));
  };
  /** "Use this" (D31, D42): the alternative's amount (at least the main-bet minimum). */
  const useAlternative = (alt: Pick<Alternative, 'from' | 'to' | 'amount'>) => {
    const from = state.bets[alt.from] ?? 0;
    if (from) {
      const r = act({ type: 'set-bet', bet: alt.from, amount: 0 });
      if (!r.ok) return;
    }
    act({
      type: 'set-bet',
      bet: alt.to,
      amount: (driver.state.bets[alt.to] ?? 0) + Math.max(alt.amount, rules.mainMin),
    });
    setAltFor(null);
  };
  /** "Use this" only when the current step lets that bet be placed. */
  const canPlace = (bet: BetId): boolean =>
    sandbox ||
    gateAction(v.scene, v.rt, { type: 'set-bet', bet, amount: rules.mainMin }, state.bets).ok;
  const cheapest: BetId = rules.variant === 'super-6' ? 'player' : 'banker';
  const altAmount = (bet: BetId) => Math.max(state.bets[bet] ?? chip, rules.mainMin);

  // ---------- pieces ----------
  const gateActions = v.gate.actions;
  const allowed = (a: Action['type']) => sandbox || gateActions.includes(a);
  const highlight = (v.step?.highlight ?? scene?.highlight ?? []) as string[];
  const resultShown = !revealing && !!last && slipEmpty;
  const winnerText = last
    ? last.hand.winner === 'tie'
      ? 'Tie'
      : `${BET_LABEL[last.hand.winner]} wins`
    : null;
  const banner = revealing
    ? null
    : resultShown && handN !== null
      ? winnerText
      : state.shoe.finished
        ? 'New shoe next'
        : state.shoe.cutCardOut
          ? 'Last hand'
          : null;
  const felt = (
    <Felt
      orientation={orientation}
      rules={rules}
      player={player}
      banker={banker}
      bets={(revealing || resultShown) && last ? slipOf(last) : state.bets}
      ghost={resultShown}
      sheet={showEV && !practiceHidden ? preview.sheet : null}
      fourColor={settings.fourColorDeck}
      timeline={motion.playing ? tl : null}
      playing={motion.playing}
      skipped={motion.skipped}
      onSkip={motion.skip}
      winner={revealing ? null : (last?.hand.winner ?? null)}
      results={
        resultShown && last
          ? Object.fromEntries(last.settlements.map((s) => [s.bet, s.result]))
          : null
      }
      onSpot={onSpot}
      onSpotLongPress={showEV ? (b) => openSheet(b) : undefined}
      highlight={highlight.filter((h) => BET_SET.has(h)) as BetId[]}
      confirming={confirming}
      banner={banner}
      burn={state.shoe.burn}
    />
  );
  const confirmEv = confirming ? preview.sheet.find((b) => b.bet === confirming) : null;
  const altEv = altFor ? preview.sheet.find((b) => b.bet === altFor) : null;
  const rejection = v.rejection && !sandbox ? null : v.rejection;
  const feedbackCard = awaiting ? null : <PredictFeedbackCard feedback={revealing ? null : fb} />;
  const betNotices = (
    <>
      {confirming && confirmEv ? (
        <AltCard
          mode="confirm"
          bet={confirming}
          tier={confirmEv.tier}
          text={suckerPrompt(confirming, confirmEv.ev, Math.max(chip, settings.unitCents))}
          to={cheapest}
          autoFocus
          onConfirm={() => place(confirming)}
          {...(canPlace(cheapest)
            ? {
                onUse: () =>
                  useAlternative({ from: confirming, to: cheapest, amount: altAmount(confirming) }),
              }
            : {})}
          onDismiss={() => setConfirming(null)}
        />
      ) : null}
      {altFor && altEv && preview.alternative?.from === altFor ? (
        <AltCard
          mode="alternative"
          bet={altFor}
          tier={altEv.tier}
          text={alternativeText(preview.alternative, preview.sheet, rules, hph)}
          to={preview.alternative.to}
          {...(canPlace(preview.alternative.to)
            ? { onUse: () => useAlternative(preview.alternative!) }
            : {})}
          onDismiss={() => setAltFor(null)}
        />
      ) : null}
    </>
  );
  // The result sits right under the felt in portrait, clear of the sticky chips and actions.
  const resultNotices = (
    <>
      {resultShown && last && last.settlements.length > 0 && dismissedHand !== last.hand.n ? (
        <SettleToast
          result={last}
          rules={rules}
          details
          onCommission={() => tap('commission')}
          onDismiss={() => setDismissedHand(last.hand.n)}
        />
      ) : null}
      {resultShown && last && last.settlements.length === 0 && handN !== null ? (
        <p class="sim-toast sim-nobet" role="status">
          {winnerText},{' '}
          {last.hand.winner === 'player'
            ? `${last.hand.player.total} to ${last.hand.banker.total}`
            : `${last.hand.banker.total} to ${last.hand.player.total}`}
          . No money on this hand.
        </p>
      ) : null}
      {rejection ? (
        <Toasts
          toasts={[{ id: rejection.seq, text: rejection.text, tone: 'bad' }]}
          onDismiss={() => driver.dismissRejection()}
        />
      ) : null}
      {toasts.length ? (
        <Toasts
          toasts={toasts}
          onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
        />
      ) : null}
    </>
  );
  const hidden: ActionId[] = [];
  if (!sandbox)
    for (const a of ['rebet', 'clear-bets'] as const) if (!allowed(a)) hidden.push(ACTION_OF[a]);
  if (!showEV) hidden.push('ev');
  const lastTotal = slipTotal(state.lastBets);
  const actions = awaiting ? (
    <PredictBar awaiting={awaiting} onAnswer={(a) => driver.predict(a)} />
  ) : (
    <ActionBar
      slipTotal={slipTotal(state.bets)}
      evCents={showEV && !practiceHidden ? preview.totalEvCents : null}
      lastTotal={lastTotal}
      canRebet={allowed('rebet') && lastTotal > 0}
      canDeal={!v.dealLocked && !watch}
      onDeal={({ rebet }) => act({ type: 'deal', ...(rebet ? { rebet } : {}) })}
      onRebet={() => act({ type: 'rebet' })}
      onClear={() => act({ type: 'clear-bets' })}
      onEv={() => (sheetOpen ? setSheetOpen(false) : openSheet())}
      evOpen={sheetOpen}
      highlight={
        highlight.filter((h) => ['deal', 'rebet', 'clear', 'ev'].includes(h)) as ActionId[]
      }
      hidden={hidden}
      busy={revealing}
      layout={landscape ? 'rail' : 'bar'}
    />
  );
  const scoreboard = v.roads.length ? (
    <Scoreboard
      entries={shown.history}
      view={v.roads.map((r) => ROAD_VIEW[r])}
      minColumns={14}
      onTap={(r) => tap(r === 'bead' ? 'bead-plate' : 'big-road')}
    />
  ) : null;
  const status =
    scene?.ui?.showBankroll === false ? null : (
      <StatusBar
        bankroll={shown.bankroll}
        onFelt={slipTotal(shown.bets)}
        sessionNet={shown.stats.hands ? equity(shown) - v.startEquity : null}
        shoe={{
          cardsLeft: physicalCardsLeft(shown),
          cutCardOut: shown.shoe.cutCardOut,
          finished: shown.shoe.finished,
        }}
      />
    );
  const chipRack =
    scene?.ui?.showChipRack === false ? null : (
      <ChipRack
        chips={chips}
        selected={chip}
        onSelect={setChip}
        maxAffordable={state.bankroll}
        disabled={v.betsLocked}
        compact={landscape}
      />
    );
  const sheet =
    sheetOpen && showEV ? (
      <EvSheet
        preview={sheetPreview}
        rules={rules}
        slip={Object.keys(state.bets) as BetId[]}
        whyOpen={why}
        onToggleWhy={
          scene?.evDetail === 'basic'
            ? undefined
            : (b) => {
                setWhy((w) => (w === b ? null : b));
                driver.previewed(b, true);
              }
        }
        onSelectBet={(b) => driver.previewed(b)}
        handsPerHour={hph}
        tracker={trackerPreview}
        unitCents={settings.unitCents}
        onUseAlternative={
          scene?.evDetail === 'basic' ||
          !sheetPreview?.alternative ||
          !canPlace(sheetPreview.alternative.to)
            ? undefined
            : useAlternative
        }
        mode={landscape ? 'panel' : 'dialog'}
        onClose={() => setSheetOpen(false)}
      />
    ) : null;
  const step =
    scene && !sandbox ? (
      <>
        <StepPanel
          step={display.step}
          index={display.index}
          count={v.stepCount}
          done={display.done}
          showNext={v.showNext && !revealing}
          onNext={() => driver.acknowledge()}
          hint={(v.rejection?.text ?? null) || (idleHint ? (v.step?.hint ?? null) : null)}
          tip={
            display.step && leaves(display.step.completeWhen).some((l) => 'previewed' in l)
              ? landscape
                ? 'Tap **EV** (or a bet in the list) to open the sheet: it prices every bet.'
                : 'Tap **EV** to open the sheet: it prices every bet. Long-press a spot to open it on that bet.'
              : null
          }
          busy={revealing}
          compact={landscape}
        />
        {feedbackCard}
      </>
    ) : null;

  // ---------- tools and panels ----------
  const [autoOpen, setAutoOpen] = useState(!!q.system);
  const showAuto = !!scene?.autoPlay?.enabled || (sandbox && autoOpen);
  const showSession = sandbox || !!scene?.ui?.showSession;
  const tools = (
    <div class="sim-tools" role="group" aria-label="Table tools">
      {trackerOn || sandbox ? (
        <button
          type="button"
          class={`sim-btn sim-tool${highlight.includes('shoe-tracker') ? ' is-hl' : ''}`}
          aria-pressed={trackerOn && trackerOpen}
          data-hit="shoe-tracker"
          data-action="shoe-tracker"
          onClick={() => {
            if (sandbox && !trackerOn) {
              driver.setShoeTracker(true);
              setTrackerOpen(true);
              return;
            }
            setTrackerOpen((o) => !o);
            tap('shoe-tracker');
          }}
        >
          Shoe tracker{trackerOn ? (trackerOpen ? ': hide' : ': show') : ': off'}
        </button>
      ) : null}
      {sandbox ? (
        <>
          <button
            type="button"
            class="sim-btn sim-tool"
            aria-pressed={autoOpen}
            data-action="auto-play"
            onClick={() => setAutoOpen((o) => !o)}
          >
            Auto-play
          </button>
          <button
            type="button"
            class="sim-btn sim-tool"
            data-action="new-shoe"
            disabled={revealing || state.shoe.shoeNo === 0 || state.shoe.finished}
            onClick={() => act({ type: 'new-shoe' })}
          >
            New shoe
          </button>
          <button
            type="button"
            class="sim-btn sim-tool"
            data-action="new-session"
            disabled={revealing}
            onClick={() => {
              setWatch(null);
              driver.newSession(props.bankroll ?? 50_000);
            }}
          >
            New session
          </button>
        </>
      ) : null}
      {watch ? (
        <button
          type="button"
          class="sim-btn sim-btn-danger sim-tool"
          onClick={() => setWatch(null)}
        >
          Stop watching ({watch.left} left)
        </button>
      ) : null}
    </div>
  );
  const trackerPanel =
    trackerOn && trackerOpen && trackerView ? (
      <ShoeTracker
        view={trackerView}
        onClose={() => {
          setTrackerOpen(false);
          if (sandbox) driver.setShoeTracker(false);
        }}
      />
    ) : null;
  const session = showSession ? (
    <SessionPanel
      summary={sessionSummary(shown)}
      variant={rules.variant}
      onTap={() => tap('session')}
      defaultOpen={!sandbox}
    />
  ) : null;
  const ap = scene?.autoPlay;
  const auto = showAuto ? (
    <AutoPlayPanel
      evClient={evClient}
      settings={{ ...settings, variant: table.variant, tiePays: table.tiePays }}
      {...(ap?.strategies ? { strategies: ap.strategies } : {})}
      {...(ap?.defaultStrategy
        ? { defaultStrategy: ap.defaultStrategy }
        : q.system
          ? { defaultStrategy: { id: q.system, unit: settings.unitCents } }
          : {})}
      {...(ap?.handOptions ? { handOptions: ap.handOptions } : {})}
      {...(ap?.sessions ? { sessionOptions: ap.sessions } : {})}
      {...(ap?.compare ? { compare: ap.compare } : {})}
      {...(scene?.bankroll !== undefined && !sandbox ? { bankroll: scene.bankroll } : {})}
      {...(scene?.seed !== undefined && !sandbox ? { seed: scene.seed } : {})}
      onEvent={(e) => driver.autoPlayCompleted(e.hands, e.strategy as StrategyId)}
      {...(sandbox
        ? {
            onWatch: (spec: StrategySpec) => {
              setAutoOpen(true);
              setWatch({
                spec,
                mem: getStrategy(spec.id).init(spec),
                left: 72,
                lastHand: null,
              });
            },
          }
        : {})}
    />
  ) : null;

  return (
    <div
      class={`sim sim-${mode} sim-${orientation}`}
      data-testid="simulator"
      data-mode={mode}
      data-scene={scene?.id}
      data-revealing={revealing ? 'true' : 'false'}
      data-hands={state.stats.hands}
    >
      {!landscape ? step : null}
      <Table
        orientation={orientation}
        status={status}
        felt={felt}
        roads={
          landscape ? (
            scoreboard
          ) : (
            <>
              {betNotices}
              {resultNotices}
              {scoreboard}
            </>
          )
        }
        notices={landscape ? betNotices : null}
        chips={chipRack}
        actions={actions}
        rail={
          landscape ? (
            <>
              {step}
              {resultNotices}
              {!sheetOpen && showEV && !practiceHidden ? (
                <EvList
                  sheet={preview.sheet}
                  slip={Object.keys(state.bets) as BetId[]}
                  onOpen={(b) => openSheet(b)}
                />
              ) : null}
            </>
          ) : null
        }
        sheet={sheet}
      />
      {tools}
      {trackerPanel}
      {session}
      {auto}
    </div>
  );
}
