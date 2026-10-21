// Strict `validateScene` (simulator.md section 5.4, D26/D27/D36/D38): no dead ends. The content
// compiler calls it for every ```scene block, so an invalid scene fails the build.
import { parseCards } from '../engine/cards';
import { betLimits, validateForcedHand } from '../engine/validate';
import { isOffered } from '../engine/bets';
import { createGame, applyAction, visibleView, startShoe } from '../engine/game';
import { parseRoadString } from '../engine/roads';
import { VARIANT_RULES } from '../engine/rules';
import { handTotal, playHand } from '../engine/tableau';
import { BET_IDS, VARIANT_IDS } from '../engine/types';
import type {
  ActionType,
  BetId,
  ForcedHand,
  HandRecord,
  ShoeSetup,
  TableRules,
  VariantId,
} from '../engine/types';
import { shoeTracker } from '../math/tracker';
import { STRATEGY_IDS } from '../strategy/ids';
import { ALL_ACTIONS, needsHand } from './runner';
import type { Condition, SceneConfig, SceneStep } from './types';

export type SceneValidation =
  | { ok: true; scene: SceneConfig; errors: []; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Condition keys of the `Condition` union in types.ts. */
export const CONDITION_KINDS: readonly string[] = [
  'all',
  'any',
  'action',
  'event',
  'hands',
  'handResult',
  'betOnFelt',
  'bankrollAtLeast',
  'bankrollAtMost',
  'previewed',
  'tapped',
  'predicted',
  'autoPlayCompleted',
  'trackerPositive',
  'acknowledged',
];
const SCENE_KEYS = [
  'id',
  'version',
  'title',
  'variant',
  'tiePays',
  'bankroll',
  'bets',
  'seed',
  'shoe',
  'deals',
  'onDealsExhausted',
  'history',
  'allowedActions',
  'allowedBets',
  'highlight',
  'showEV',
  'evDetail',
  'whyOpen',
  'practice',
  'ui',
  'autoPlay',
  'steps',
];
const STEP_KEYS = [
  'id',
  'text',
  'hint',
  'math',
  'setup',
  'deals',
  'shoe',
  'allowedActions',
  'allowedBets',
  'highlight',
  'expect',
  'pauseAt',
  'predict',
  'skipNaturals',
  'completeWhen',
  'advance',
  'showEV',
  'ui',
];
const UI_KEYS = [
  'orientation',
  'chips',
  'defaultChip',
  'showChipRack',
  'showBankroll',
  'showSession',
  'roads',
  'shoeTracker',
  'showSettings',
  'speed',
  'compact',
];
const ROADS = ['bead-plate', 'big-road'];
const TAP_EXTRA = ['commission', 'bead-plate', 'big-road', 'shoe-tracker', 'ev-sheet', 'session'];
const HIGHLIGHT_EXTRA = [...TAP_EXTRA, 'deal', 'rebet', 'clear', 'ev'];
const PAUSES = ['two-cards', 'player-third', 'all-cards'];
const PREDICT_KINDS = ['player-draws', 'banker-draws', 'hand-total', 'winner'];
const VALID_PAUSE: Record<string, readonly string[]> = {
  'player-draws': ['two-cards'],
  'banker-draws': ['player-third', 'two-cards'],
  'hand-total': ['two-cards', 'player-third', 'all-cards'],
  winner: ['all-cards'],
};
const EVENT_TYPES = [
  'bet-set',
  'bets-cleared',
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
  'shoe-ended-early',
];
const MIN_BEFORE_CUT = 40; // D36: no deal on a study shoe with fewer cards before the cut card
const DEFAULT_HAND_OPTIONS = [72, 720, 7200];

/** Plays a forced hand through the real tableau (its cards in deal order). */
export function forcedHandRecord(
  f: ForcedHand,
): Omit<HandRecord, 'n' | 'shoeNo' | 'handInShoe' | 'forced'> {
  const p = f.player.map((c) => parseCards(c)[0]!);
  const b = f.banker.map((c) => parseCards(c)[0]!);
  const seq = [p[0]!, b[0]!, p[1]!, b[1]!, ...p.slice(2), ...b.slice(2)];
  let i = 0;
  return playHand(() => seq[i++]!);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Cards left before the cut card on a fresh shoe with this setup (unseen − cut). */
function cardsBeforeCut(setup: ShoeSetup, rules: TableRules): number {
  const g = startShoe(createGame({ rules }), setup);
  return g.shoe.cutIndex - g.shoe.pos;
}

export function validateScene(json: unknown): SceneValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => void errors.push(m);
  if (!isObj(json)) return { ok: false, errors: ['scene must be a mapping'], warnings };
  const sid = typeof json.id === 'string' && json.id !== '' ? json.id : null;
  if (!sid) err('scene id must be a non-empty string');
  if (json.version !== 1) err('scene version must be 1');
  for (const k of Object.keys(json))
    if (!SCENE_KEYS.includes(k))
      err(`unknown scene field "${k}" (known: ${SCENE_KEYS.join(', ')})`);

  // ---------- 1. shape ----------
  const variant = (json.variant ?? 'punto-banco') as VariantId;
  if (!(VARIANT_IDS as readonly unknown[]).includes(variant)) {
    err(`unknown variant ${JSON.stringify(json.variant)} (known: ${VARIANT_IDS.join(', ')})`);
    return { ok: false, errors, warnings };
  }
  if (json.tiePays !== undefined && json.tiePays !== 8 && json.tiePays !== 9)
    err('tiePays must be 8 or 9');
  const rules: TableRules = {
    ...VARIANT_RULES[variant],
    tiePays: json.tiePays === 9 ? 9 : 8,
  };
  const isBet = (b: unknown): b is BetId => (BET_IDS as readonly unknown[]).includes(b);
  const offered = (b: BetId) => isOffered(b, rules);
  const checkBetId = (b: unknown, where: string): b is BetId => {
    if (!isBet(b)) {
      err(`${where}: unknown bet id ${JSON.stringify(b)}`);
      return false;
    }
    if (!offered(b)) {
      err(
        `${where}: ${b} is not offered at a ${variant} table (dragon-7 / panda-8 need variant: ez)`,
      );
      return false;
    }
    return true;
  };
  const bankroll = json.bankroll ?? 50_000;
  if (typeof bankroll !== 'number' || !Number.isInteger(bankroll) || bankroll < 0)
    err('bankroll must be a whole number of cents ≥ 0');
  const checkSlip = (slip: unknown, where: string): number => {
    if (slip === undefined) return 0;
    if (!isObj(slip)) return (void err(`${where}: bets must be a mapping`), 0);
    let total = 0;
    for (const [b, a] of Object.entries(slip)) {
      if (!checkBetId(b, `${where}.bets`)) continue;
      if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a % rules.betUnit !== 0) {
        err(
          `${where}: ${b} amount ${String(a)} must be whole dollars in cents (a multiple of 100)`,
        );
        continue;
      }
      const [min, max] = betLimits(b, rules);
      if (a !== 0 && (a < min || a > max))
        err(`${where}: ${b} $${a / 100} is outside the table limits $${min / 100}–$${max / 100}`);
      total += a;
    }
    return total;
  };
  const presets = checkSlip(json.bets, 'scene');
  if (typeof bankroll === 'number' && presets > bankroll)
    err(`scene: the preset bets ($${presets / 100}) exceed the bankroll`);
  const checkActions = (list: unknown, where: string): ActionType[] | undefined => {
    if (list === undefined) return undefined;
    if (!Array.isArray(list))
      return (void err(`${where}: allowedActions must be a list`), undefined);
    for (const a of list)
      if (!(ALL_ACTIONS as readonly unknown[]).includes(a))
        err(`${where}: unknown action ${JSON.stringify(a)} (known: ${ALL_ACTIONS.join(', ')})`);
    return list as ActionType[];
  };
  const checkBets = (list: unknown, where: string): BetId[] | undefined => {
    if (list === undefined) return undefined;
    if (!Array.isArray(list)) return (void err(`${where}: allowedBets must be a list`), undefined);
    list.forEach((b) => checkBetId(b, `${where}.allowedBets`));
    return list as BetId[];
  };
  const checkHighlight = (list: unknown, where: string) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) return err(`${where}: highlight must be a list`);
    for (const h of list)
      if (!HIGHLIGHT_EXTRA.includes(h as string)) checkBetId(h, `${where}.highlight`);
  };
  const checkDeals = (list: unknown, where: string): ForcedHand[] => {
    if (list === undefined) return [];
    if (!Array.isArray(list)) return (void err(`${where}: deals must be a list`), []);
    const good: ForcedHand[] = [];
    list.forEach((h, i) => {
      const v = validateForcedHand(h as ForcedHand, rules);
      if (!v.ok) err(`${where}.deals[${i}]: ${v.message}`);
      else good.push(h as ForcedHand);
    });
    return good;
  };
  const checkShoe = (s: unknown, where: string): ShoeSetup | 'fresh' | undefined => {
    if (s === undefined || s === 'fresh') return s;
    if (!isObj(s)) return (void err(`${where}: shoe must be 'fresh' or a ShoeSetup`), undefined);
    for (const k of Object.keys(s))
      if (!['seed', 'removed', 'startAtCard'].includes(k))
        err(`${where}: unknown shoe field "${k}"`);
    const removed = s.removed;
    if (removed !== undefined) {
      if (!isObj(removed)) return (void err(`${where}: shoe.removed must be a mapping`), undefined);
      let sum = 0;
      for (const [v, n] of Object.entries(removed)) {
        if (!/^[0-9]$/.test(v)) err(`${where}: shoe.removed key "${v}" must be a value 0–9`);
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
          err(`${where}: shoe.removed.${v} must be a whole number`);
        else sum += n;
      }
      if (sum < 11)
        err(`${where}: a ShoeSetup must remove at least 11 cards (room for the burn, D36)`);
    }
    try {
      startShoe(createGame({ rules }), s);
    } catch (e) {
      err(`${where}: ${(e as Error).message}`);
      return undefined;
    }
    return s;
  };
  const sceneDeals = checkDeals(json.deals, 'scene');
  if (sceneDeals.length)
    warnings.push('scene-level deals: prefer putting forced hands on the step that deals them');
  const sceneShoe = checkShoe(json.shoe, 'scene');
  const sceneActions = checkActions(json.allowedActions, 'scene');
  const sceneBets = checkBets(json.allowedBets, 'scene');
  checkHighlight(json.highlight, 'scene');
  if (json.whyOpen !== undefined) checkBetId(json.whyOpen, 'scene.whyOpen');
  if (
    json.onDealsExhausted !== undefined &&
    !['random', 'block'].includes(json.onDealsExhausted as string)
  )
    err("onDealsExhausted must be 'random' or 'block'");
  if (json.evDetail !== undefined && !['basic', 'full'].includes(json.evDetail as string))
    err("evDetail must be 'basic' or 'full'");
  const ui = isObj(json.ui) ? json.ui : {};
  if (json.ui !== undefined && !isObj(json.ui)) err('ui must be a mapping');
  for (const k of Object.keys(ui)) if (!UI_KEYS.includes(k)) err(`unknown ui field "${k}"`);
  const checkRoads = (r: unknown, where: string) => {
    if (r === undefined) return;
    if (!Array.isArray(r)) return err(`${where}: ui.roads must be a list`);
    for (const x of r)
      if (!ROADS.includes(x as string)) err(`${where}: unknown road ${JSON.stringify(x)}`);
  };
  checkRoads(ui.roads, 'scene');
  let chipGcd = 100;
  if (ui.chips !== undefined) {
    if (
      !Array.isArray(ui.chips) ||
      ui.chips.some((c) => typeof c !== 'number' || c <= 0 || c % 100)
    )
      err('ui.chips must be a list of whole-dollar amounts in cents');
    else chipGcd = (ui.chips as number[]).reduce(gcd);
  }
  if (json.history !== undefined) {
    if (!Array.isArray(json.history)) err('history must be a list');
    else
      json.history.forEach((h: unknown, i) => {
        if (isObj(h)) return; // a full RoadEntry
        try {
          if (typeof h !== 'string' || parseRoadString(h).length !== 1)
            throw new Error('expected one road token');
        } catch (e) {
          err(
            `history[${i}]: ${JSON.stringify(h)} is not a road token like B, Pp5 or Tn8 (${e instanceof Error ? e.message : String(e)})`,
          );
        }
      });
  }
  // autoPlay
  const ap = json.autoPlay;
  let apEnabled = false;
  let apStrategies: string[] | undefined;
  let apMaxHands = Math.max(...DEFAULT_HAND_OPTIONS);
  if (ap !== undefined) {
    if (!isObj(ap)) err('autoPlay must be a mapping');
    else {
      apEnabled = ap.enabled === true;
      const checkSpec = (s: unknown, where: string) => {
        if (!isObj(s) || !(STRATEGY_IDS as readonly unknown[]).includes(s.id))
          return err(`${where}: unknown strategy ${JSON.stringify(isObj(s) ? s.id : s)}`);
        if (typeof s.unit !== 'number' || s.unit <= 0 || s.unit % 100)
          err(`${where}: unit must be whole dollars in cents`);
        if (s.sideBets !== undefined) checkSlip(s.sideBets, where);
      };
      if (ap.strategies !== undefined) {
        if (!Array.isArray(ap.strategies)) err('autoPlay.strategies must be a list');
        else {
          apStrategies = ap.strategies as string[];
          for (const s of apStrategies)
            if (!(STRATEGY_IDS as readonly string[]).includes(s))
              err(`autoPlay: unknown strategy "${s}"`);
        }
      }
      if (ap.defaultStrategy !== undefined)
        checkSpec(ap.defaultStrategy, 'autoPlay.defaultStrategy');
      if (ap.compare !== undefined) {
        if (!Array.isArray(ap.compare)) err('autoPlay.compare must be a list');
        else ap.compare.forEach((s, i) => checkSpec(s, `autoPlay.compare[${i}]`));
      }
      if (ap.handOptions !== undefined) {
        if (
          !Array.isArray(ap.handOptions) ||
          ap.handOptions.some((n) => !Number.isInteger(n) || n < 1 || n > 20_000)
        )
          err('autoPlay.handOptions must be whole numbers 1–20,000');
        else apMaxHands = Math.max(...(ap.handOptions as number[]));
      }
    }
  }

  // ---------- steps ----------
  if (json.steps !== undefined && !Array.isArray(json.steps)) err('steps must be a list');
  const steps = (Array.isArray(json.steps) ? json.steps : []) as unknown[];
  const seen = new Set<string>();
  let shoe: ShoeSetup | 'fresh' | undefined = sceneShoe;
  let bankerWinSettled = false;
  steps.forEach((raw, i) => {
    const where = `step ${i + 1}${isObj(raw) && typeof raw.id === 'string' ? ` (${raw.id})` : ''}`;
    if (!isObj(raw)) return err(`${where}: must be a mapping`);
    const step = raw as unknown as SceneStep;
    for (const k of Object.keys(raw))
      if (!STEP_KEYS.includes(k)) err(`${where}: unknown field "${k}"`);
    if (typeof raw.id !== 'string' || raw.id === '') err(`${where}: id is required`);
    else if (seen.has(raw.id)) err(`${where}: duplicate step id "${raw.id}"`);
    else seen.add(raw.id);
    if (typeof raw.text !== 'string' || raw.text === '') err(`${where}: text is required`);
    for (const k of ['text', 'hint', 'math'] as const)
      if (typeof raw[k] === 'string') checkInlineCards(raw[k], `step ${String(raw.id)} ${k}`, err);
    if (raw.advance !== undefined && raw.advance !== 'auto' && raw.advance !== 'button')
      err(`${where}: advance must be 'auto' or 'button'`);
    const shapeOk = checkCondition(raw.completeWhen, where, errors, checkBetId);
    const actions = checkActions(raw.allowedActions, where) ?? sceneActions ?? ALL_ACTIONS;
    const betsAllowed = checkBets(raw.allowedBets, where) ?? sceneBets;
    checkHighlight(raw.highlight, where);
    if (raw.setup !== undefined) {
      if (!isObj(raw.setup)) err(`${where}: setup must be a mapping`);
      else {
        const t = checkSlip(raw.setup.bets, `${where}.setup`);
        const br = raw.setup.bankroll ?? bankroll;
        if (typeof br !== 'number' || !Number.isInteger(br) || br < 0)
          err(`${where}: setup.bankroll must be whole cents`);
        else if (t > br) err(`${where}: setup bets exceed the bankroll`);
      }
    }
    if (raw.expect !== undefined) {
      if (!Array.isArray(raw.expect)) err(`${where}: expect must be a list`);
      else
        raw.expect.forEach((m: unknown, k) => {
          if (!isObj(m) || !(ALL_ACTIONS as readonly unknown[]).includes(m.type))
            return err(`${where}.expect[${k}]: needs a known action type`);
          if (!actions.includes(m.type as ActionType))
            err(`${where}.expect[${k}]: ${String(m.type)} is not in the step's allowedActions`);
          if (m.bet !== undefined)
            (Array.isArray(m.bet) ? m.bet : [m.bet]).forEach((b) =>
              checkBetId(b, `${where}.expect`),
            );
        });
    }
    const deals = checkDeals(raw.deals, where);
    const hands = deals.map(forcedHandRecord);
    if (raw.shoe !== undefined) shoe = checkShoe(raw.shoe, where);
    const ui2 = isObj(raw.ui) ? raw.ui : {};
    if (raw.ui !== undefined) {
      if (!isObj(raw.ui)) err(`${where}: ui must be a mapping`);
      else
        for (const k of Object.keys(raw.ui))
          if (!['shoeTracker', 'roads'].includes(k)) err(`${where}: ui.${k} is scene-level only`);
      checkRoads(ui2.roads, where);
    }
    if (!shapeOk) return;
    const cond = step.completeWhen;
    const leafs = leavesOf(cond);
    const allows = (a: ActionType) => actions.includes(a);
    const dealing = needsHand(cond);
    const auto = leafs.some((l) => 'autoPlayCompleted' in l);

    // 4. deal lock
    if (!dealing && allows('deal'))
      err(
        `${where}: completeWhen needs no dealt hand, so the step must not allow deal (set allowedActions without deal)`,
      );
    if (dealing && !allows('deal'))
      err(`${where}: completeWhen needs a dealt hand, so the step must allow deal`);
    if (leafs.every((l) => 'acknowledged' in l) && actions.length > 0)
      err(`${where}: a step that completes only on acknowledged must set allowedActions: [] (D27)`);
    if (auto && actions.length > 0)
      err(`${where}: an auto-play run step must set allowedActions: [] (D38)`);
    if (deals.length && !allows('deal'))
      err(`${where}: the step has forced deals but does not allow deal`);
    // 7a. study shoes
    if (shoe && shoe !== 'fresh' && allows('deal')) {
      try {
        const left = cardsBeforeCut(shoe, rules);
        if (left < MIN_BEFORE_CUT)
          err(
            `${where}: the study shoe leaves ${left} cards before the cut card (< ${MIN_BEFORE_CUT}), so the step must not allow deal (D36)`,
          );
      } catch {
        /* reported by checkShoe */
      }
    }
    // 5. guaranteed results
    walk(cond, false, (leaf, anyWithHands) => {
      if (!('handResult' in leaf)) return;
      const w = leaf.handResult;
      if (w.minNet !== undefined && (!deals.length || !step.expect?.length))
        err(`${where}: handResult.minNet needs forced deals and a fixed expect slip`);
      const ok =
        hands.length > 0 &&
        hands.every(
          (h) =>
            (w.winner === undefined || h.winner === w.winner) &&
            (w.natural === undefined || h.natural === w.natural),
        );
      if (!ok && !anyWithHands)
        err(
          `${where}: handResult ${JSON.stringify(w)} is not guaranteed by the step's forced deals (wrap it in any with a hands fallback)`,
        );
    });
    // 6. predictions
    const predicted = leafs.filter(
      (l): l is Extract<Condition, { predicted: unknown }> => 'predicted' in l,
    );
    if (raw.predict !== undefined) {
      const p = raw.predict as Obj;
      if (!isObj(p) || !PREDICT_KINDS.includes(p.kind as string))
        err(`${where}: predict.kind must be one of ${PREDICT_KINDS.join(', ')}`);
      else {
        if (raw.pauseAt === undefined) err(`${where}: predict needs pauseAt`);
        else if (!PAUSES.includes(raw.pauseAt as string))
          err(`${where}: unknown pauseAt ${JSON.stringify(raw.pauseAt)}`);
        else if (!VALID_PAUSE[p.kind as string]!.includes(raw.pauseAt as string))
          err(
            `${where}: ${String(p.kind)} cannot pause at ${raw.pauseAt as string} (valid: ${VALID_PAUSE[p.kind as string]!.join(', ')})`,
          );
        if (p.kind === 'banker-draws' && raw.pauseAt === 'two-cards') {
          const playerDone = hands.length > 0 && hands.every((h) => !h.playerRule.draws);
          const random = predicted.some((l) => l.predicted.correct === true);
          if (!playerDone || random)
            err(
              `${where}: banker-draws at two-cards needs every forced hand to have the Player standing (or a natural), and no random hands`,
            );
        }
        if (p.kind === 'hand-total' && p.side !== 'player' && p.side !== 'banker')
          err(`${where}: hand-total needs side: player or banker`);
        if (!allows('deal')) err(`${where}: predict needs deal in the step's allowedActions`);
      }
    } else if (raw.pauseAt !== undefined && !PAUSES.includes(raw.pauseAt as string))
      err(`${where}: unknown pauseAt ${JSON.stringify(raw.pauseAt)}`);
    const countable = hands.filter((h) => !(raw.skipNaturals && h.natural)).length;
    if (raw.skipNaturals && hands.length > 0 && countable === 0)
      err(`${where}: skipNaturals, but every forced hand is a natural (nothing would count)`);
    for (const l of predicted) {
      const pr = l.predicted;
      if (raw.predict === undefined)
        err(`${where}: predicted needs predict (and pauseAt) on the step`);
      else if (pr.kind !== undefined && pr.kind !== (raw.predict as Obj).kind)
        err(`${where}: predicted.kind ${pr.kind} differs from predict.kind`);
      if (pr.correct === undefined) {
        if ((pr.count ?? 1) > countable)
          err(
            `${where}: predicted.count ${pr.count ?? 1} exceeds the step's ${countable} countable forced hand(s) (put the hands on this step, D27)`,
          );
      } else if (pr.correct === true && json.onDealsExhausted === 'block')
        err(
          `${where}: predicted.correct needs onDealsExhausted: random (wrong answers use up forced hands)`,
        );
    }
    // 7. UI targets
    if (hands.some((h) => h.winner === 'banker')) bankerWinSettled = true;
    const roads = (ui2.roads ?? ui.roads ?? ROADS) as string[];
    const tracker = ui2.shoeTracker === true || ui.shoeTracker === true;
    for (const l of leafs) {
      if ('tapped' in l) {
        const t = l.tapped;
        if ((t === 'bead-plate' || t === 'big-road') && !roads.includes(t))
          err(`${where}: tapped ${t} needs that road in ui.roads`);
        if (t === 'session' && ui.showSession !== true)
          err(`${where}: tapped session needs ui.showSession: true`);
        if (t === 'commission') {
          if (variant !== 'punto-banco')
            err(`${where}: tapped commission needs variant punto-banco`);
          if (!bankerWinSettled)
            err(`${where}: tapped commission needs a forced Banker win on this or an earlier step`);
        }
        if (t === 'shoe-tracker' && !tracker)
          err(`${where}: tapped shoe-tracker needs ui.shoeTracker: true`);
      }
      if ('trackerPositive' in l) {
        if (!tracker) err(`${where}: trackerPositive needs ui.shoeTracker: true`);
        if (!shoe || shoe === 'fresh') err(`${where}: trackerPositive needs a shoe setup`);
        else if (
          !trackerTurnsPositive(rules, shoe, l.trackerPositive.bet, json.seed as number | undefined)
        )
          err(
            `${where}: trackerPositive: ${l.trackerPositive.bet ?? 'no bet'} turns positive within 2 shoes on this seed`,
          );
      }
      // 8. bets placeable
      if ('betOnFelt' in l) {
        const { bet, minAmount } = l.betOnFelt;
        const [min] = isBet(bet) ? betLimits(bet, rules) : [0];
        const want = Math.max(minAmount ?? min, min);
        if (minAmount !== undefined && minAmount < min)
          err(`${where}: betOnFelt ${bet} minAmount is below the table minimum $${min / 100}`);
        if (typeof bankroll === 'number' && want > bankroll + presets)
          err(`${where}: betOnFelt ${bet} $${want / 100} is more than the bankroll`);
        const preset = (isObj(json.bets) ? json.bets[bet] : 0) as number | undefined;
        if (!allows('set-bet') && (preset ?? 0) < want)
          err(`${where}: betOnFelt needs set-bet in allowedActions`);
        if (betsAllowed && !betsAllowed.includes(bet) && (preset ?? 0) < want)
          err(`${where}: betOnFelt ${bet} is not in allowedBets`);
        if (want % chipGcd) err(`${where}: the chips in ui.chips cannot make $${want / 100}`);
      }
      // 9. previews
      if ('previewed' in l && (step.showEV ?? json.showEV) === false)
        err(`${where}: previewed needs the EV sheet (showEV is false)`);
      // 10. auto-play
      if ('autoPlayCompleted' in l) {
        const w = l.autoPlayCompleted;
        if (!apEnabled) err(`${where}: autoPlayCompleted needs autoPlay.enabled`);
        if (w.strategy && apStrategies && !apStrategies.includes(w.strategy))
          err(`${where}: autoPlayCompleted strategy ${w.strategy} is not in autoPlay.strategies`);
        if ((w.minHands ?? 0) > apMaxHands)
          err(`${where}: autoPlayCompleted.minHands ${w.minHands} > the longest run ${apMaxHands}`);
      }
      // 11. acknowledged
      if ('acknowledged' in l && raw.advance !== 'button')
        err(`${where}: acknowledged needs advance: button`);
    }
  });
  if (json.showEV === false && json.whyOpen !== undefined) err('whyOpen needs showEV');
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, scene: json as unknown as SceneConfig, errors: [], warnings };
}

/** Every `{{cards}}` / `{{cards =N}}` group in step text must parse, and N must be the total. */
function checkInlineCards(text: string, where: string, err: (m: string) => void): void {
  for (const g of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const body = g[1] ?? '';
    const m = /^([^=]*?)\s*(=\s*(\d?))?\s*$/.exec(body);
    try {
      const cards = parseCards(m?.[1] ?? body);
      if (cards.length === 0) throw new Error('empty group');
      const n = m?.[3];
      if (n && Number(n) !== handTotal(cards))
        throw new Error(`total is ${handTotal(cards)}, not ${n}`);
    } catch (e) {
      err(`${where}: bad card group {{${body}}}: ${(e as Error).message}`);
    }
  }
}

function leavesOf(c: Condition): Condition[] {
  if ('all' in c) return c.all.flatMap(leavesOf);
  if ('any' in c) return c.any.flatMap(leavesOf);
  return [c];
}

/** Visits leaves, telling each whether it sits in an `any` that has a `hands` fallback. */
function walk(
  c: Condition,
  anyWithHands: boolean,
  f: (leaf: Condition, anyWithHands: boolean) => void,
) {
  if ('all' in c) return c.all.forEach((x) => walk(x, anyWithHands, f));
  if ('any' in c) {
    const fallback = anyWithHands || c.any.some((x) => 'hands' in x);
    return c.any.forEach((x) => walk(x, fallback, f));
  }
  f(c, anyWithHands);
}

function checkCondition(
  c: unknown,
  where: string,
  errors: string[],
  checkBetId: (b: unknown, where: string) => boolean,
): boolean {
  const before = errors.length;
  const err = (m: string) => void errors.push(`${where}: ${m}`);
  if (!isObj(c)) {
    err('completeWhen must be a mapping');
    return false;
  }
  const keys = Object.keys(c).filter((k) => k !== 'count');
  const kind = keys.find((k) => CONDITION_KINDS.includes(k));
  if (!kind || keys.length !== 1) {
    err(`unknown condition ${JSON.stringify(keys)} (known: ${CONDITION_KINDS.join(', ')})`);
    return false;
  }
  const v = c[kind];
  const num = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  const count = c.count;
  if (count !== undefined && (!num(count) || (kind !== 'action' && kind !== 'event')))
    err(`count belongs to action / event conditions and must be a whole number`);
  switch (kind) {
    case 'all':
    case 'any':
      if (!Array.isArray(v) || v.length === 0) err(`${kind} needs a non-empty list`);
      else v.forEach((x, i) => checkCondition(x, `${where}.${kind}[${i}]`, errors, checkBetId));
      break;
    case 'action':
      if (!isObj(v) || !(ALL_ACTIONS as readonly unknown[]).includes(v.type))
        err('action needs a known type');
      else if (v.bet !== undefined)
        (Array.isArray(v.bet) ? v.bet : [v.bet]).forEach((b) => checkBetId(b, where));
      break;
    case 'event':
      if (!EVENT_TYPES.includes(v as string)) err(`unknown event ${JSON.stringify(v)}`);
      break;
    case 'hands':
      if (!num(v) || (v as number) < 1) err('hands must be a whole number ≥ 1');
      break;
    case 'bankrollAtLeast':
    case 'bankrollAtMost':
      if (!num(v)) err(`${kind} must be cents`);
      break;
    case 'handResult':
      if (!isObj(v)) err('handResult must be a mapping');
      else if (v.winner !== undefined && !['player', 'banker', 'tie'].includes(v.winner as string))
        err('handResult.winner must be player, banker or tie');
      break;
    case 'betOnFelt':
      if (!isObj(v)) err('betOnFelt must be a mapping');
      else {
        checkBetId(v.bet, where);
        if (v.minAmount !== undefined && (!num(v.minAmount) || (v.minAmount as number) % 100))
          err('betOnFelt.minAmount must be whole dollars in cents');
      }
      break;
    case 'previewed':
      if (!isObj(v)) err('previewed must be a mapping');
      else if (v.bet !== undefined) checkBetId(v.bet, where);
      break;
    case 'tapped':
      if (!TAP_EXTRA.includes(v as string)) checkBetId(v, `${where}.tapped`);
      break;
    case 'predicted':
      if (!isObj(v)) err('predicted must be a mapping');
      else {
        if (v.count !== undefined && (!num(v.count) || (v.count as number) < 1))
          err('predicted.count must be ≥ 1');
        if (v.kind !== undefined && !PREDICT_KINDS.includes(v.kind as string))
          err('unknown predicted.kind');
      }
      break;
    case 'autoPlayCompleted':
      if (!isObj(v)) err('autoPlayCompleted must be a mapping');
      else if (
        v.strategy !== undefined &&
        !(STRATEGY_IDS as readonly unknown[]).includes(v.strategy)
      )
        err(`unknown strategy ${JSON.stringify(v.strategy)}`);
      break;
    case 'trackerPositive':
      if (!isObj(v)) err('trackerPositive must be a mapping');
      else if (v.bet !== undefined) checkBetId(v.bet, where);
      break;
    case 'acknowledged':
      if (v !== true) err('acknowledged must be true');
      break;
  }
  return errors.length === before;
}

/** Lint for trackerPositive: deal the scene's seed for up to two shoes and watch the tracker. */
function trackerTurnsPositive(
  rules: TableRules,
  setup: ShoeSetup,
  bet: BetId | undefined,
  seed = 1,
): boolean {
  let g = startShoe(createGame({ rules, seed, bankroll: 0 }), setup);
  const positive = () =>
    shoeTracker(visibleView(g)).rows.some(
      (r) => r.positive && (bet === undefined || r.bet === bet),
    );
  if (positive()) return true;
  for (let shoes = 0, i = 0; shoes < 2 && i < 400; i++) {
    const r = applyAction(g, { type: 'deal' });
    if (!r.ok) return false;
    g = r.state;
    if (r.events.some((e) => e.type === 'shoe-finished')) shoes++;
    if (positive()) return true;
  }
  return false;
}
