// SimDriver: the framework-free heart of the Simulator container. It owns the engine state, the
// scene runtime, the staged reveal and the predictions, so the same code runs in the browser
// (wrapped by ui/Simulator.tsx) and in the every-scene-completes test (tests/sim/lessons.test.ts).
import { cardValue, parseCards } from '../engine/cards';
import {
  applyAction,
  createGame,
  equity,
  queueForced,
  startShoe,
  visibleView,
} from '../engine/game';
import { parseRoadString } from '../engine/roads';
import { bankerDraws, handTotal, playerDraws } from '../engine/tableau';
import { cardCode } from '../engine/cards';
import { BET_IDS } from '../engine/types';
import type {
  Action,
  BetId,
  Cents,
  ForcedHand,
  GameEvent,
  GameState,
  HandRecord,
  HandResult,
  PausePoint,
  RoadEntry,
  TiePays,
  VariantId,
} from '../engine/types';
import { fullShoeEvs } from '../math/edges';
import { toNumber } from '../math/fraction';
import { shoeTracker } from '../math/tracker';
import type { TrackerView } from '../math/types';
import type { StrategyId } from '../strategy/types';
import {
  activeGate,
  answerKey,
  currentStep,
  gateAction,
  hasAcknowledged,
  initScene,
  observe,
  PREDICT_OPTIONS,
  PREDICT_QUESTION,
} from './runner';
import type { AnswerKey, Gate, SceneContext } from './runner';
import type {
  HistoryCode,
  PredictKind,
  RoadId,
  SceneConfig,
  SceneInput,
  SceneRuntime,
  SceneStep,
  TapTarget,
} from './types';

/** Same shapes as ui SimulatorEvent (the scene layer cannot import ui). */
export type DriverEvent =
  | { type: 'ready' }
  | { type: 'action-confirmed'; action: Action; events: GameEvent[]; state: GameState }
  | { type: 'action-rejected'; action: Action; reason: string }
  | { type: 'hand-settled'; result: HandResult; state: GameState }
  | { type: 'step-started'; stepId: string }
  | { type: 'step-completed'; stepId: string }
  | { type: 'scene-completed'; sceneId: string }
  | { type: 'auto-play-completed'; hands: number; strategy: string };

/** A staged reveal waiting for the learner's call (simulator.md section 5.2). */
export interface Reveal {
  hand: number; // HandRecord.n
  pause: PausePoint;
  kind: PredictKind;
  side?: 'player' | 'banker';
  question: string;
  options: readonly string[];
}
export interface PredictFeedback extends AnswerKey {
  hand: number;
  kind: PredictKind;
  correct: boolean;
  chosen: string;
  hint?: string;
}
export interface Rejection {
  text: string;
  seq: number;
}
/** The sandbox snapshot (PersistedV1.sandbox): restored exactly mid-shoe. */
export interface Snapshot {
  v: 1;
  state: GameState;
  startEquity: Cents;
}

export interface DriverView {
  version: number;
  state: GameState;
  /** Events of the last action (the Felt animates these). */
  lastEvents: readonly GameEvent[];
  /** The state before the last action: the UI shows its bankroll and roads until the cards land. */
  before: GameState;
  eventSeq: number;
  scene: SceneConfig;
  mode: 'sandbox' | 'scene';
  rt: SceneRuntime;
  step: SceneStep | undefined;
  stepCount: number;
  /** The step needs the Next button (acknowledged, or a satisfied advance: button step). */
  showNext: boolean;
  gate: Gate;
  dealLocked: boolean;
  betsLocked: boolean;
  /** Waiting for a prediction: the reveal stops at `awaiting.pause`. */
  awaiting: Reveal | null;
  /** The last answer (tick, or hint + rule row). Cleared by the next deal. */
  feedback: PredictFeedback | null;
  rejection: Rejection | null;
  startEquity: Cents;
  /** Roads the scene shows. */
  roads: RoadId[];
  /** The Shoe tracker is available (scene ui.shoeTracker or the setting). */
  tracker: boolean;
  showEV: boolean;
}

export interface DriverOptions {
  scene?: SceneConfig;
  mode: 'sandbox' | 'scene';
  /** Used when the scene has no seed (sandbox: a random seed). */
  seed: number;
  /** Sandbox table settings (scenes use their own variant / tiePays). */
  variant?: VariantId;
  tiePays?: TiePays;
  bankroll?: Cents;
  /** Sandbox `?shoe=` forced hands. */
  forced?: ForcedHand[];
  /** Sandbox Shoe tracker setting. */
  shoeTracker?: boolean;
  showRoads?: boolean;
  onEvent?: (e: DriverEvent) => void;
  restore?: Snapshot | null;
}

function historyEntries(codes: readonly HistoryCode[] | undefined): RoadEntry[] {
  return (codes ?? []).map((c) => (typeof c === 'string' ? parseRoadString(c)[0]! : c));
}

/**
 * `?shoe=` (architecture.md section 2.1): cards in the engine's dealing order (P1 B1 P2 B2, P3?,
 * B3?), comma or space separated. Split into forced hands by the tableau; throws on a short tail.
 */
export function parseShoeParam(s: string): ForcedHand[] {
  const cards = parseCards(s);
  const out: ForcedHand[] = [];
  let i = 0;
  while (i < cards.length) {
    if (cards.length - i < 4) throw new Error('?shoe= needs at least 4 cards per hand');
    const p = [cards[i]!, cards[i + 2]!];
    const b = [cards[i + 1]!, cards[i + 3]!];
    i += 4;
    const p2 = handTotal(p);
    const b2 = handTotal(b);
    if (playerDraws(p2, b2).draws) {
      if (i >= cards.length) throw new Error('?shoe= ends before the Player third card');
      p.push(cards[i++]!);
    }
    if (bankerDraws(b2, p2, p.length === 3 ? cardValue(p[2]!) : null).draws) {
      if (i >= cards.length) throw new Error('?shoe= ends before the Banker third card');
      b.push(cards[i++]!);
    }
    out.push({ player: p.map(cardCode), banker: b.map(cardCode) });
  }
  return out;
}

/** Session panel figures (D35, curriculum section 8.4): Expected uses the full-shoe EV only. */
export function sessionSummary(state: GameState) {
  const evs = fullShoeEvs(state.rules);
  const byBet = new Map(evs.map((e) => [e.bet, e]));
  let totalBet = 0;
  let expected = 0;
  let actual = 0;
  for (const b of BET_IDS) {
    const w = state.stats.wagered[b] ?? 0;
    totalBet += w;
    actual += state.stats.net[b] ?? 0;
    const e = byBet.get(b);
    if (w && e) expected += w * toNumber(e.ev);
  }
  const main = state.rules.variant === 'super-6' ? 'player' : 'banker';
  const bankerEdge = byBet.get('banker');
  return {
    hands: state.stats.hands,
    totalBet,
    expectedCents: expected,
    actualCents: actual,
    luckCents: actual - expected,
    averageEdge: totalBet ? -expected / totalBet : 0,
    bankerOnlyEdge: bankerEdge ? toNumber(bankerEdge.edge) : 0,
    commissionPaid: state.stats.commissionPaid,
    cheapestMain: main as BetId,
  };
}

export class SimDriver {
  readonly scene: SceneConfig;
  readonly mode: 'sandbox' | 'scene';
  private opts: DriverOptions;
  private game: GameState;
  private rt: SceneRuntime;
  private startEq: Cents;
  private lastEvents: GameEvent[] = [];
  private before!: GameState;
  private eventSeq = 0;
  private awaiting: (Reveal & { record: HandRecord; step: SceneStep }) | null = null;
  private feedback: PredictFeedback | null = null;
  private rejection: Rejection | null = null;
  private stepHadDeals = false;
  private version = 0;
  private listeners = new Set<() => void>();
  private cached: DriverView | null = null;
  private trackerCache: { state: GameState; view: TrackerView } | null = null;

  constructor(opts: DriverOptions) {
    this.opts = opts;
    this.mode = opts.mode;
    const sc = opts.scene ?? { id: 'sandbox', version: 1 as const };
    this.scene = sc;
    if (opts.restore && opts.restore.v === 1 && opts.restore.state?.version === 1) {
      this.game = opts.restore.state;
      this.startEq = opts.restore.startEquity;
    } else {
      const scene = opts.mode === 'scene';
      this.game = createGame({
        rules: {
          variant: (scene ? sc.variant : opts.variant) ?? 'punto-banco',
          tiePays: (scene ? sc.tiePays : opts.tiePays) ?? 8,
        },
        bankroll: sc.bankroll ?? opts.bankroll ?? 50_000,
        seed: sc.seed ?? (scene ? 1 : opts.seed),
        bets: sc.bets,
        forced: [...(sc.deals ?? []), ...(opts.forced ?? [])],
        ...(sc.shoe && sc.shoe !== 'fresh' ? { shoe: sc.shoe } : {}),
        history: historyEntries(sc.history),
      });
      this.startEq = equity(this.game);
    }
    this.before = this.game;
    this.rt = initScene(sc, this.game.stats.hands);
    if (!this.rt.done) {
      this.enterStep();
      this.settle(observe(this.scene, this.rt, null, this.ctx()));
    }
    this.emit({ type: 'ready' });
  }

  // ---------- subscription / view ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private notify(): void {
    this.version++;
    this.cached = null;
    for (const l of [...this.listeners]) l();
  }
  private emit(e: DriverEvent): void {
    this.opts.onEvent?.(e);
  }

  get view(): DriverView {
    if (this.cached) return this.cached;
    const step = currentStep(this.scene, this.rt);
    const gate = activeGate(this.scene, this.rt);
    const sandbox = this.mode === 'sandbox';
    const ui = this.scene.ui ?? {};
    const roads: RoadId[] =
      step?.ui?.roads ??
      ui.roads ??
      (sandbox && this.opts.showRoads === false ? [] : ['bead-plate', 'big-road']);
    const a = this.awaiting;
    this.cached = {
      version: this.version,
      state: this.game,
      lastEvents: this.lastEvents,
      before: this.before,
      eventSeq: this.eventSeq,
      scene: this.scene,
      mode: this.mode,
      rt: this.rt,
      step,
      stepCount: this.scene.steps?.length ?? 0,
      showNext:
        !!step &&
        !a &&
        (hasAcknowledged(step.completeWhen) || (step.advance === 'button' && !!this.rt.satisfied)),
      gate,
      dealLocked: !sandbox && !gate.actions.includes('deal'),
      betsLocked: !sandbox && !gate.actions.includes('set-bet'),
      awaiting: a
        ? {
            hand: a.hand,
            pause: a.pause,
            kind: a.kind,
            question: a.question,
            options: a.options,
            ...(a.side ? { side: a.side } : {}),
          }
        : null,
      feedback: this.feedback,
      rejection: this.rejection,
      startEquity: this.startEq,
      roads,
      tracker: sandbox
        ? !!this.opts.shoeTracker
        : !!(step?.ui?.shoeTracker ?? ui.shoeTracker ?? false),
      showEV: (step?.showEV ?? this.scene.showEV) !== false,
    };
    return this.cached;
  }

  get state(): GameState {
    return this.game;
  }

  snapshot(): Snapshot {
    return { v: 1, state: this.game, startEquity: this.startEq };
  }

  /** The Shoe tracker for the cards left now (cached per state). */
  trackerView(): TrackerView {
    if (this.trackerCache?.state === this.game) return this.trackerCache.view;
    const view = shoeTracker(visibleView(this.game));
    this.trackerCache = { state: this.game, view };
    return view;
  }

  setShoeTracker(on: boolean): void {
    this.opts = { ...this.opts, shoeTracker: on };
    this.notify();
  }

  // ---------- context for the runner ----------

  private ctx(): SceneContext {
    return { equity: equity(this.game), bets: this.game.bets, hands: this.game.stats.hands };
  }

  // ---------- step entry ----------

  private enterStep(): void {
    const step = currentStep(this.scene, this.rt);
    if (!step) return;
    this.emit({ type: 'step-started', stepId: step.id });
    let g = this.game;
    if (step.setup) {
      if (step.setup.bankroll !== undefined) {
        const r = applyAction(g, { type: 'clear-bets' });
        if (r.ok) g = r.state;
        g = { ...g, bankroll: step.setup.bankroll };
      }
      for (const [bet, amount] of Object.entries(step.setup.bets ?? {})) {
        const r = applyAction(g, { type: 'set-bet', bet: bet as BetId, amount: amount ?? 0 });
        if (r.ok) g = r.state;
      }
    }
    if (step.shoe) g = startShoe(g, step.shoe);
    if (step.deals) g = queueForced(g, step.deals);
    else if (this.stepHadDeals) g = queueForced(g, []);
    this.stepHadDeals = !!step.deals?.length;
    this.game = g;
  }

  /** Fold a runner result in, entering every step it advanced through. */
  private settle(first: SceneRuntime): void {
    let rt = first;
    for (let guard = 0; guard < 100; guard++) {
      const prev = this.rt;
      const moved = rt.stepIndex !== prev.stepIndex || rt.done !== prev.done;
      this.rt = rt;
      if (!moved) return;
      const old = this.scene.steps?.[prev.stepIndex];
      if (old) this.emit({ type: 'step-completed', stepId: old.id });
      this.rejection = null;
      if (rt.done) {
        this.emit({ type: 'scene-completed', sceneId: this.scene.id });
        return;
      }
      this.enterStep();
      rt = observe(this.scene, this.rt, null, this.ctx());
    }
  }

  private feed(input: SceneInput): void {
    if (this.mode !== 'scene') return;
    this.settle(observe(this.scene, this.rt, input, this.ctx()));
  }

  // ---------- inputs ----------

  /** The learner (or a script) confirms an action. */
  act(action: Action): { ok: true } | { ok: false; message: string } {
    if (this.awaiting) return this.reject(action, 'Answer the question first.');
    const step = currentStep(this.scene, this.rt);
    if (this.mode === 'scene') {
      const g = gateAction(this.scene, this.rt, action, this.game.bets);
      if (!g.ok) return this.reject(action, g.message);
      if (
        action.type === 'deal' &&
        this.scene.onDealsExhausted === 'block' &&
        this.game.forced.length === 0 &&
        (this.stepHadDeals || (this.scene.deals?.length ?? 0) > 0)
      )
        return this.reject(action, step?.hint ?? 'No more lesson hands in this step.');
    }
    const r = applyAction(this.game, action);
    if (!r.ok) return this.reject(action, r.error.message);
    this.rejection = null;
    this.before = this.game;
    this.game = r.state;
    this.lastEvents = r.events;
    this.eventSeq++;
    this.emit({ type: 'action-confirmed', action, events: r.events, state: r.state });
    let settled: HandResult | null = null;
    for (const e of r.events) if (e.type === 'hand-settled') settled = e.result;
    if (settled) {
      this.feedback = null;
      this.emit({ type: 'hand-settled', result: settled, state: r.state });
      if (this.mode === 'scene' && step?.predict && step.pauseAt) {
        const hand = settled.hand;
        if (!(step.skipNaturals && hand.natural)) {
          const kind = step.predict.kind;
          this.awaiting = {
            hand: hand.n,
            pause: step.pauseAt,
            kind,
            ...(step.predict.side ? { side: step.predict.side } : {}),
            question:
              kind === 'hand-total'
                ? `What is the ${step.predict.side === 'banker' ? 'Banker' : 'Player'} total?`
                : PREDICT_QUESTION[kind],
            options: PREDICT_OPTIONS[kind],
            record: hand,
            step,
          };
        }
      }
    }
    this.feed({ kind: 'action', action, events: r.events });
    if (settled && this.view.tracker && this.mode === 'scene') {
      const positive = this.trackerView()
        .rows.filter((x) => x.positive)
        .map((x) => x.bet);
      this.feed({ kind: 'tracker', positive });
    }
    this.notify();
    return { ok: true };
  }

  private reject(action: Action, message: string): { ok: false; message: string } {
    this.rejection = { text: message, seq: (this.rejection?.seq ?? 0) + 1 };
    this.emit({ type: 'action-rejected', action, reason: message });
    this.notify();
    return { ok: false, message };
  }

  /** The correct answer to the waiting question (tests and the "show me" path). */
  expectedAnswer(): string | null {
    const a = this.awaiting;
    return a ? answerKey(a.step, a.record).answer : null;
  }

  /** The learner's call at a staged-reveal pause. Right or wrong, the reveal continues. */
  predict(answer: string): PredictFeedback | null {
    const a = this.awaiting;
    if (!a) return null;
    const key = answerKey(a.step, a.record);
    const correct = key.answer === answer;
    this.awaiting = null;
    this.feedback = {
      ...key,
      hand: a.hand,
      kind: a.kind,
      correct,
      chosen: answer,
      ...(a.step.hint ? { hint: a.step.hint } : {}),
    };
    this.feed({ kind: 'predicted', predict: a.kind, answer, correct });
    this.notify();
    return this.feedback;
  }

  /** The learner opened the EV sheet on a bet (`previewed` condition). */
  previewed(bet: BetId, whyOpened = false): void {
    this.feed({ kind: 'previewed', bet, whyOpened });
    this.notify();
  }
  acknowledge(): void {
    this.feed({ kind: 'acknowledged' });
    this.notify();
  }
  /** Spots, roads, the tracker, the session panel and the commission line count even when gated. */
  tap(target: TapTarget): void {
    this.feed({ kind: 'tapped', target });
    this.notify();
  }
  autoPlayCompleted(hands: number, strategy: StrategyId): void {
    this.feed({ kind: 'auto-play-completed', hands, strategy });
    this.emit({ type: 'auto-play-completed', hands, strategy });
    this.notify();
  }
  dismissRejection(): void {
    if (!this.rejection) return;
    this.rejection = null;
    this.notify();
  }

  /** Sandbox: a fresh rack and a new shoe (New session). */
  newSession(bankroll: Cents): void {
    this.game = createGame({
      rules: this.game.rules,
      bankroll,
      seed: (this.game.seed + this.game.handCount + 1) >>> 0,
    });
    this.startEq = bankroll;
    this.before = this.game;
    this.lastEvents = [];
    this.eventSeq++;
    this.awaiting = null;
    this.feedback = null;
    this.rejection = null;
    this.notify();
  }
}
