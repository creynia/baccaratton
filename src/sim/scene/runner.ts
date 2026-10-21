// Scene runner (simulator.md sections 5.1-5.2, D26/D27): pure functions over a SceneRuntime. The
// driver (driver.ts) owns the engine state and applies each step's `deals` / `shoe` / `setup`;
// this file decides gating, counts inputs since the step started and says when a step is done.
import { cardValue } from '../engine/cards';
import type {
  Action,
  ActionType,
  BetId,
  Cents,
  HandRecord,
  HandResult,
  Slip,
  TableauRuleId,
  Validation,
} from '../engine/types';
import type {
  ActionMatcher,
  Condition,
  PredictKind,
  SceneConfig,
  SceneInput,
  SceneRuntime,
  SceneStep,
} from './types';

/** What `observe` needs from the table besides the input. */
export interface SceneContext {
  /** Bankroll conditions test equity (rack + felt), never the rack alone. */
  equity: Cents;
  bets: Slip;
  /** Hands settled in the session so far (`state.stats.hands`). */
  hands: number;
}

export const ALL_ACTIONS: readonly ActionType[] = [
  'set-bet',
  'clear-bets',
  'rebet',
  'deal',
  'new-shoe',
];
export const DEFAULT_REJECT = 'Not in this step. Follow the instruction above the table.';

export function initScene(scene: SceneConfig, hands = 0): SceneRuntime {
  const done = (scene.steps?.length ?? 0) === 0;
  return { stepIndex: 0, stepStartHand: hands, counters: {}, done, satisfied: false };
}

export function currentStep(scene: SceneConfig, rt: SceneRuntime): SceneStep | undefined {
  return rt.done ? undefined : scene.steps?.[rt.stepIndex];
}

export interface Gate {
  actions: readonly ActionType[];
  /** undefined = every bet the variant offers. */
  bets?: readonly BetId[];
}

/** A step's own gating replaces the scene's; a step that says nothing inherits the scene's. */
export function effectiveGate(scene: SceneConfig, step?: SceneStep): Gate {
  return {
    actions: step?.allowedActions ?? scene.allowedActions ?? ALL_ACTIONS,
    bets: step?.allowedBets ?? scene.allowedBets,
  };
}

/** The gate in force: the current step's (over the scene's), or the scene's alone once done. */
export function activeGate(scene: SceneConfig, rt: SceneRuntime): Gate {
  return effectiveGate(scene, currentStep(scene, rt));
}

export function matchAction(m: ActionMatcher, a: Action): boolean {
  if (m.type !== a.type) return false;
  if (a.type === 'set-bet') {
    if (m.bet !== undefined) {
      const want = Array.isArray(m.bet) ? m.bet : [m.bet];
      if (!want.includes(a.bet)) return false;
    }
    if (m.amount !== undefined && a.amount !== m.amount) return false;
    if (m.minAmount !== undefined && a.amount < m.minAmount) return false;
    if (m.maxAmount !== undefined && a.amount > m.maxAmount) return false;
  }
  return true;
}

/**
 * Is the learner's action accepted now? Rejects with `not-allowed-by-scene` and the step's hint.
 * Removing chips (`set-bet` to a lower amount) passes the bet filter so a learner can undo, but
 * not the action filter. `expect` only constrains actions of the types it names.
 */
export function gateAction(
  scene: SceneConfig,
  rt: SceneRuntime,
  action: Action,
  current?: Slip,
): Validation {
  const step = currentStep(scene, rt);
  const reject = (): Validation => ({
    ok: false,
    code: 'not-allowed-by-scene',
    message: step?.hint ?? DEFAULT_REJECT,
  });
  const gate = effectiveGate(scene, step);
  if (!gate.actions.includes(action.type)) return reject();
  if (action.type === 'set-bet' && gate.bets && !gate.bets.includes(action.bet)) {
    const lowering = current !== undefined && action.amount < (current[action.bet] ?? 0);
    if (!lowering) return reject();
  }
  const expect = step?.expect;
  if (expect?.length && expect.some((m) => m.type === action.type)) {
    const lowering =
      action.type === 'set-bet' &&
      current !== undefined &&
      action.amount < (current[action.bet] ?? 0);
    if (!lowering && !expect.some((m) => matchAction(m, action))) return reject();
  }
  return { ok: true };
}

/** Leaves of a condition tree. */
export function leaves(c: Condition): Condition[] {
  if ('all' in c) return c.all.flatMap(leaves);
  if ('any' in c) return c.any.flatMap(leaves);
  return [c];
}

export function hasAcknowledged(c: Condition): boolean {
  return leaves(c).some((l) => 'acknowledged' in l);
}

/** Does the condition need a dealt hand (D27 deal lock)? */
export function needsHand(c: Condition): boolean {
  if ('all' in c) return c.all.some(needsHand);
  if ('any' in c) return c.any.every(needsHand);
  if ('hands' in c || 'handResult' in c || 'predicted' in c || 'trackerPositive' in c) return true;
  if ('action' in c) return c.action.type === 'deal';
  if ('event' in c) return HAND_EVENTS.has(c.event);
  return false;
}
const HAND_EVENTS = new Set([
  'shoe-shuffled',
  'burn',
  'hand-started',
  'cut-card',
  'card-dealt',
  'pause-point',
  'natural',
  'draw-decision',
  'hand-result',
  'road-updated',
  'bet-settled',
  'hand-settled',
  'shoe-finished',
]);

const key = (path: string): string => `c${path}`;

function settledResult(input: SceneInput): HandResult | null {
  if (input.kind !== 'action') return null;
  for (const e of input.events) if (e.type === 'hand-settled') return e.result;
  return null;
}

/** Fold one input into the counters of the step's leaves (keyed by their path in the tree). */
function countInto(c: Record<string, number>, cond: Condition, input: SceneInput, path: string) {
  const bump = (by = 1) => {
    c[key(path)] = (c[key(path)] ?? 0) + by;
  };
  const latch = () => {
    c[key(path)] = 1;
  };
  if ('all' in cond) return cond.all.forEach((x, i) => countInto(c, x, input, `${path}.${i}`));
  if ('any' in cond) return cond.any.forEach((x, i) => countInto(c, x, input, `${path}.${i}`));
  if ('action' in cond) {
    if (input.kind === 'action' && matchAction(cond.action, input.action)) bump();
  } else if ('event' in cond) {
    if (input.kind === 'action') {
      const n = input.events.filter((e) => e.type === cond.event).length;
      if (n) bump(n);
    }
  } else if ('hands' in cond) {
    if (input.kind === 'action' && settledResult(input)) bump();
  } else if ('handResult' in cond) {
    const r = settledResult(input);
    const w = cond.handResult;
    if (
      r &&
      (w.winner === undefined || w.winner === r.hand.winner) &&
      (w.natural === undefined || w.natural === r.hand.natural) &&
      (w.minNet === undefined || r.net >= w.minNet)
    )
      latch();
  } else if ('previewed' in cond) {
    const p = cond.previewed;
    if (
      input.kind === 'previewed' &&
      (p.bet === undefined || p.bet === input.bet) &&
      (!p.whyOpened || input.whyOpened)
    )
      latch();
  } else if ('tapped' in cond) {
    if (input.kind === 'tapped' && input.target === cond.tapped) latch();
  } else if ('predicted' in cond) {
    const p = cond.predicted;
    if (
      input.kind === 'predicted' &&
      (p.kind === undefined || p.kind === input.predict) &&
      (p.correct === undefined || p.correct === input.correct)
    )
      bump();
  } else if ('autoPlayCompleted' in cond) {
    const w = cond.autoPlayCompleted;
    if (
      input.kind === 'auto-play-completed' &&
      (w.minHands === undefined || input.hands >= w.minHands) &&
      (w.strategy === undefined || w.strategy === input.strategy)
    )
      latch();
  } else if ('trackerPositive' in cond) {
    const b = cond.trackerPositive.bet;
    if (
      input.kind === 'tracker' &&
      (b === undefined ? input.positive.length > 0 : input.positive.includes(b))
    )
      latch();
  } else if ('acknowledged' in cond) {
    if (input.kind === 'acknowledged') latch();
  }
}

/** Is the condition met, given the counters since step start and the table as it is now? */
export function isSatisfied(
  cond: Condition,
  counters: Readonly<Record<string, number>>,
  ctx: SceneContext,
  path = '',
): boolean {
  const n = counters[key(path)] ?? 0;
  if ('all' in cond) return cond.all.every((x, i) => isSatisfied(x, counters, ctx, `${path}.${i}`));
  if ('any' in cond) return cond.any.some((x, i) => isSatisfied(x, counters, ctx, `${path}.${i}`));
  if ('action' in cond) return n >= (cond.count ?? 1);
  if ('event' in cond) return n >= (cond.count ?? 1);
  if ('hands' in cond) return n >= cond.hands;
  if ('predicted' in cond) return n >= (cond.predicted.count ?? 1);
  if ('betOnFelt' in cond)
    return (ctx.bets[cond.betOnFelt.bet] ?? 0) >= Math.max(1, cond.betOnFelt.minAmount ?? 1);
  if ('bankrollAtLeast' in cond) return ctx.equity >= cond.bankrollAtLeast;
  if ('bankrollAtMost' in cond) return ctx.equity <= cond.bankrollAtMost;
  return n > 0;
}

function advanceTo(scene: SceneConfig, rt: SceneRuntime, ctx: SceneContext): SceneRuntime {
  const next = rt.stepIndex + 1;
  return {
    stepIndex: next,
    stepStartHand: ctx.hands,
    counters: {},
    done: next >= (scene.steps?.length ?? 0),
    satisfied: false,
  };
}

/**
 * Folds an input in. A satisfied `advance: 'auto'` step moves on by one step (the driver then
 * applies the new step's setup and calls `observe(scene, rt, null, ctx)`, so level conditions
 * such as `betOnFelt` are re-read). A `button` step waits for an `acknowledged` input. `hands`
 * counts only the hands settled since the step started (D27).
 */
export function observe(
  scene: SceneConfig,
  rt: SceneRuntime,
  input: SceneInput | null,
  ctx: SceneContext,
): SceneRuntime {
  const step = currentStep(scene, rt);
  if (!step) return rt;
  const counters = { ...rt.counters };
  if (input) countInto(counters, step.completeWhen, input, '');
  const satisfied = isSatisfied(step.completeWhen, counters, ctx);
  const ack = input?.kind === 'acknowledged';
  if (satisfied && (step.advance !== 'button' || ack)) return advanceTo(scene, rt, ctx);
  if (ack && rt.satisfied) return advanceTo(scene, rt, ctx);
  return { ...rt, counters, satisfied };
}

// ---------- predictions (simulator.md section 5.2) ----------

export const PREDICT_OPTIONS: Readonly<Record<PredictKind, readonly string[]>> = {
  'player-draws': ['Draw', 'Stand'],
  'banker-draws': ['Draw', 'Stand'],
  'hand-total': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  winner: ['Player', 'Banker', 'Tie'],
};
export const PREDICT_QUESTION: Readonly<Record<PredictKind, string>> = {
  'player-draws': 'Does the Player draw?',
  'banker-draws': 'Does the Banker draw?',
  'hand-total': 'What is the total?',
  winner: 'Who wins?',
};

const RULE_ROW: Readonly<Record<TableauRuleId, string>> = {
  natural: 'A natural (8 or 9 in two cards): both hands stand.',
  'player-0-5-draws': 'Player draws on 0–5.',
  'player-6-7-stands': 'Player stands on 6 or 7.',
  'banker-player-stood-0-5-draws': 'Player stood, so the Banker draws on 0–5.',
  'banker-player-stood-6-7-stands': 'Player stood, so the Banker stands on 6 or 7.',
  'banker-0-2-draws': 'Banker always draws on 0–2.',
  'banker-3-draws-unless-8': "Banker 3 draws unless the Player's third card is an 8.",
  'banker-4-draws-on-2-7': "Banker 4 draws when the Player's third card is 2–7.",
  'banker-5-draws-on-4-7': "Banker 5 draws when the Player's third card is 4–7.",
  'banker-6-draws-on-6-7': "Banker 6 draws when the Player's third card is 6 or 7.",
  'banker-7-stands': 'Banker stands on 7.',
};

const twoCard = (cards: readonly number[]) => (cardValue(cards[0]!) + cardValue(cards[1]!)) % 10;

export interface AnswerKey {
  answer: string;
  /** The deciding rule in words ("Banker 5 draws when … (it was a 6)."). */
  ruleRow: string;
  rule: TableauRuleId | null;
  /** Tableau cell to highlight (D34 syntax: p5, b4/p7, b6/s), null for winner / totals. */
  cell: string | null;
}

/** The answer to the step's question for this hand (already resolved by the engine). */
export function answerKey(step: SceneStep, hand: HandRecord): AnswerKey {
  const kind = step.predict?.kind ?? 'winner';
  const p2 = twoCard(hand.player.cards);
  const b2 = twoCard(hand.banker.cards);
  const p3 = hand.player.cards.length === 3 ? cardValue(hand.player.cards[2]!) : null;
  switch (kind) {
    case 'player-draws': {
      const r = hand.playerRule;
      return {
        answer: r.draws ? 'Draw' : 'Stand',
        ruleRow: `${RULE_ROW[r.rule]} (Player ${p2}, Banker ${b2}.)`,
        rule: r.rule,
        cell: r.rule === 'natural' ? null : `p${p2}`,
      };
    }
    case 'banker-draws': {
      const r = hand.bankerRule;
      const why =
        r.rule === 'natural'
          ? `(Player ${p2}, Banker ${b2}.)`
          : p3 === null
            ? `(Banker ${b2}, the Player stood.)`
            : `(Banker ${b2}, the Player's third card was a ${p3}.)`;
      return {
        answer: r.draws ? 'Draw' : 'Stand',
        ruleRow: `${RULE_ROW[r.rule]} ${why}`,
        rule: r.rule,
        cell: r.rule === 'natural' ? null : p3 === null ? `b${b2}/s` : `b${b2}/p${p3}`,
      };
    }
    case 'hand-total': {
      const side = step.predict?.side ?? 'player';
      const h = hand[side];
      const n =
        step.pauseAt === 'two-cards'
          ? 2
          : step.pauseAt === 'player-third'
            ? side === 'player'
              ? h.cards.length
              : 2
            : h.cards.length;
      const cards = h.cards.slice(0, n);
      const vals = cards.map(cardValue);
      const total = vals.reduce<number>((a, b) => a + b, 0) % 10;
      return {
        answer: String(total),
        ruleRow: `${vals.join(' + ')} = ${vals.reduce<number>((a, b) => a + b, 0)}: keep the last digit, ${total}.`,
        rule: null,
        cell: null,
      };
    }
    case 'winner': {
      const w = hand.winner;
      const t = `Player ${hand.player.total}, Banker ${hand.banker.total}`;
      return {
        answer: w === 'player' ? 'Player' : w === 'banker' ? 'Banker' : 'Tie',
        ruleRow: w === 'tie' ? `${t}: equal totals tie.` : `${t}: closest to 9 wins.`,
        rule: null,
        cell: null,
      };
    }
  }
}
