// The `simulate` job (simulator.md section 6.3, D18, D28, D33): seeded sessions on the real engine,
// one job kind for a single session, many sessions and compare on the same seeds. Pure generator;
// the in-thread client time-slices it and cancels it by abandoning it.
import type { Progress } from '../engine/job';
import { applyAction, createGame, equity, visibleView } from '../engine/game';
import type { BetId, GameState, HandResult, Slip, Winner } from '../engine/types';
import { betFigures, rulesFor, slipEvCents } from './metrics';
import { formatMoney } from '../engine/money';
import { getStrategy, initMemory, tableCap, tableMaxUnits, unitLimits } from './presets';
import type {
  SessionSeries,
  SimulateRequest,
  SimulateResult,
  StrategyMemory,
  StrategySpec,
} from './types';

const YIELD_EVERY = 200;
const MAIN: ReadonlySet<BetId> = new Set(['player', 'banker']);

export interface SessionOut {
  eq: Int32Array; // hands + 1
  /** Cumulative Σ bet × full-shoe EV after each hand (cents, [0] = 0). */
  exp: Float64Array;
  /** Hand index at which the session stopped for a bust (-1: never). */
  bustedAt: number;
  /** Hand index at which the session stopped for any reason (hands when it played them all). */
  stoppedAt: number;
  played: number;
  wagered: number;
  evCents: number;
  capHits: number;
  winners: Record<Winner, number>;
  sideBetHits: Partial<Record<BetId, number>>;
  /** Winner of each dealt hand (compare-mode assertion and tests). */
  handWinners: Winner[];
}

function total(slip: Slip): number {
  let t = 0;
  for (const v of Object.values(slip)) t += v ?? 0;
  return t;
}

function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`simulate: ${r.error.message}`);
  return r.state;
}

/** One seeded session of one spec. */
export function* runSession(
  req: SimulateRequest,
  spec: StrategySpec,
  index: number,
  tick: () => Progress | undefined = () => undefined,
): Generator<Progress | undefined, SessionOut, void> {
  const strat = getStrategy(spec.id);
  const rules = rulesFor(req.variant, req.tiePays);
  const fig = betFigures(req.variant, req.tiePays);
  const stopAtBust = req.stopAtBust ?? true;
  const out: SessionOut = {
    eq: new Int32Array(req.hands + 1),
    exp: new Float64Array(req.hands + 1),
    bustedAt: -1,
    stoppedAt: req.hands,
    played: 0,
    wagered: 0,
    evCents: 0,
    capHits: 0,
    winners: { player: 0, banker: 0, tie: 0 },
    sideBetHits: {},
    handWinners: [],
  };
  const start = req.bankroll;
  out.eq[0] = start;
  let state = createGame({ rules, bankroll: start, seed: req.seed + index });
  let mem: StrategyMemory = strat.init(spec);
  const maxUnits = tableMaxUnits(spec, rules);
  let stopped = false;
  for (let h = 1; h <= req.hands; h++) {
    if (!stopped) {
      const eq0 = equity(state);
      if (
        (req.stopWin !== undefined && eq0 - start >= req.stopWin) ||
        (req.stopLoss !== undefined && start - eq0 >= req.stopLoss)
      )
        stopped = true;
    }
    let slip: Slip = {};
    if (!stopped) {
      const view = visibleView(state);
      // A next bet above the table maximum: the shared rule (reset, or D'Alembert's clamp).
      mem = tableCap(mem, spec, maxUnits);
      slip = strat.decide(view, mem, spec);
      if (total(slip) > state.bankroll) {
        // Bust (D28): the next bet can't be covered. Bets are never shrunk to fit.
        if (out.bustedAt < 0) out.bustedAt = h - 1;
        if (stopAtBust) stopped = true;
        else {
          mem = { ...initMemory(spec), caps: (mem.caps as number | undefined) ?? 0 };
          slip = strat.decide(view, mem, spec);
          if (total(slip) > state.bankroll) stopped = true;
        }
      }
      if (stopped) out.stoppedAt = h - 1;
    }
    if (stopped) {
      out.eq[h] = out.eq[h - 1]!;
      out.exp[h] = out.exp[h - 1]!;
    } else {
      for (const [bet, amount] of Object.entries(slip) as [BetId, number][])
        if (amount) state = act(state, { type: 'set-bet', bet, amount });
      state = act(state, { type: 'deal' });
      const res = state.lastResult as HandResult;
      mem = strat.update(mem, spec, res);
      out.played++;
      out.wagered += res.wagered;
      const ev = slipEvCents(slip, fig);
      out.evCents += ev;
      out.winners[res.hand.winner]++;
      out.handWinners.push(res.hand.winner);
      for (const s of res.settlements)
        if (!MAIN.has(s.bet) && s.result === 'win')
          out.sideBetHits[s.bet] = (out.sideBetHits[s.bet] ?? 0) + 1;
      out.eq[h] = equity(state);
      out.exp[h] = out.exp[h - 1]! + ev;
    }
    const p = tick();
    if (p) yield p;
  }
  out.capHits = (mem.caps as number | undefined) ?? 0;
  return out;
}

/** Nearest rank, rounding down: sorted[floor(p × (n − 1))]. */
function percentile(sorted: Int32Array, p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))]!;
}

export function validateRequest(req: SimulateRequest): void {
  const int = (n: number) => Number.isInteger(n);
  if (!int(req.hands) || req.hands < 1 || req.hands > 20_000)
    throw new RangeError('simulate: hands must be 1..20,000');
  if (!int(req.sessions) || req.sessions < 1 || req.sessions > 1_000)
    throw new RangeError('simulate: sessions must be 1..1,000');
  if (!int(req.bankroll) || req.bankroll < 0) throw new RangeError('simulate: bad bankroll');
  const rules = rulesFor(req.variant, req.tiePays);
  for (const s of [req.strategy, ...(req.compare ?? [])]) {
    if (!int(s.unit) || s.unit <= 0) throw new RangeError(`simulate: bad unit for ${s.id}`);
    const { min, max } = unitLimits(s, rules);
    if (s.unit < min || s.unit > max)
      throw new RangeError(
        `simulate: the ${s.id} unit must be ${formatMoney(min)} to ${formatMoney(max)} (table limits)`,
      );
  }
}

export function* simulateJob(
  req: SimulateRequest,
): Generator<Progress | undefined, SimulateResult, void> {
  validateRequest(req);
  const t0 = Date.now();
  const specs = [req.strategy, ...(req.compare ?? [])];
  const totalHands = specs.length * req.sessions * req.hands;
  let done = 0;
  let since = 0;
  const tick = (): Progress | undefined => {
    done++;
    if (++since >= YIELD_EVERY) {
      since = 0;
      return { done, total: totalHands };
    }
    return undefined;
  };
  const series: SessionSeries[] = [];
  for (const spec of specs) {
    const n = req.sessions;
    const cols = req.hands + 1;
    const matrix = new Int32Array(n * cols);
    const expected = new Float64Array(cols);
    const finals = new Int32Array(n);
    const winners: Record<Winner, number> = { player: 0, banker: 0, tie: 0 };
    const sideBetHits: Partial<Record<BetId, number>> = {};
    const stoppedAt: number[] = [];
    let busts = 0;
    let handsPlayed = 0;
    let wagered = 0;
    let evCents = 0;
    let capHits = 0;
    for (let i = 0; i < n; i++) {
      const s = yield* runSession(req, spec, i, tick);
      matrix.set(s.eq, i * cols);
      for (let h = 0; h < cols; h++) expected[h]! += s.exp[h]!;
      finals[i] = s.eq[req.hands]!;
      handsPlayed += s.played;
      wagered += s.wagered;
      evCents += s.evCents;
      capHits += s.capHits;
      if (s.bustedAt >= 0) {
        busts++;
        stoppedAt.push(s.bustedAt);
      }
      for (const w of ['player', 'banker', 'tie'] as const) winners[w] += s.winners[w];
      for (const [b, k] of Object.entries(s.sideBetHits) as [BetId, number][])
        sideBetHits[b] = (sideBetHits[b] ?? 0) + k;
    }
    for (let h = 0; h < cols; h++) expected[h] = req.bankroll + expected[h]! / n;
    let mean = 0;
    for (const f of finals) mean += f;
    mean /= n;
    let varSum = 0;
    for (const f of finals) varSum += (f - mean) ** 2;
    const sd = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0;
    const out: SessionSeries = {
      strategy: spec,
      expected,
      finals,
      meanFinal: mean,
      meanFinalCi95: n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0,
      bustRate: busts / n,
      probAhead: finals.filter((f) => f > req.bankroll).length / n,
      handsPlayed,
      meanBetPerHand: handsPlayed ? wagered / handsPlayed : 0,
      costPerHourCents: handsPlayed ? (-evCents / handsPlayed) * req.handsPerHour : 0,
      capHits,
      winners,
      sideBetHits,
    };
    if (n === 1) {
      out.equity = matrix;
    } else {
      out.p10 = new Float64Array(cols);
      out.p50 = new Float64Array(cols);
      out.p90 = new Float64Array(cols);
      out.survival = new Float64Array(cols);
      const col = new Int32Array(n);
      const bustCount = new Int32Array(cols + 1);
      for (const b of stoppedAt) bustCount[b]!++;
      let busted = 0;
      for (let h = 0; h < cols; h++) {
        for (let i = 0; i < n; i++) col[i] = matrix[i * cols + h]!;
        col.sort();
        out.p10[h] = percentile(col, 0.1);
        out.p50[h] = percentile(col, 0.5);
        out.p90[h] = percentile(col, 0.9);
        busted += bustCount[h]!;
        out.survival[h] = 1 - busted / n;
        if (h % 256 === 255) yield { done, total: totalHands };
      }
    }
    series.push(out);
  }
  return { series, ms: Date.now() - t0 };
}
