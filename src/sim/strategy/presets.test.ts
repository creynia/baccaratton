import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../engine/rules';
import { BET_IDS } from '../engine/types';
import type { HandResult, RoadEntry, VisibleView, Winner } from '../engine/types';
import { seedRng, randBelow } from '../engine/rng';
import { STRATEGY_IDS } from './ids';
import {
  betUnits,
  getStrategy,
  initMemory,
  mainBet,
  stepMemory,
  STRATEGIES,
  tableCap,
  tableMaxUnits,
} from './presets';
import type { MainOutcome } from './presets';
import type { StrategyId, StrategyMemory, StrategySpec } from './types';

const spec = (id: StrategyId, extra: Partial<StrategySpec> = {}): StrategySpec => ({
  id,
  unit: 1000,
  ...extra,
});
/** Bets (in units) a system places over a sequence of outcomes, starting fresh. */
function run(s: StrategySpec, seq: string): number[] {
  const map: Record<string, MainOutcome> = { W: 'win', L: 'lose', T: 'push' };
  let m: StrategyMemory = initMemory(s);
  const out = [betUnits(m, s)];
  for (const ch of seq) {
    m = stepMemory(m, s, map[ch]!);
    out.push(betUnits(m, s));
  }
  return out;
}
const caps = (s: StrategySpec, seq: string): number => {
  const map: Record<string, MainOutcome> = { W: 'win', L: 'lose', T: 'push' };
  let m = initMemory(s);
  for (const ch of seq) m = stepMemory(m, s, map[ch]!);
  return m.caps as number;
};

function view(history: Winner[] = [], nextHandNewShoe = false): VisibleView {
  const entries: RoadEntry[] = history.map((winner) => ({
    winner,
    playerPair: false,
    bankerPair: false,
    natural: false,
    total: 5,
  }));
  return {
    rules: DEFAULT_RULES,
    bankroll: 1_000_000,
    bets: {},
    lastBets: {},
    history: entries,
    lastResult: null,
    unseenRanks: new Array<number>(13).fill(32),
    shoeNo: 1,
    handInShoe: history.length + 1,
    nextHandNewShoe,
  };
}

describe('presets: golden progressions (simulator.md section 7.3)', () => {
  it('Martingale L L W -> 1, 2, 4, 1; ties leave the state', () => {
    expect(run(spec('martingale'), 'LLW')).toEqual([1, 2, 4, 1]);
    expect(run(spec('martingale'), 'LTLTW')).toEqual([1, 2, 2, 4, 4, 1]);
  });
  it('Paroli W W W -> 1, 2, 4, 1; a loss resets', () => {
    expect(run(spec('paroli'), 'WWW')).toEqual([1, 2, 4, 1]);
    expect(run(spec('paroli'), 'WWL')).toEqual([1, 2, 4, 1]);
    expect(run(spec('paroli'), 'WTW')).toEqual([1, 2, 2, 4]);
  });
  it('1-3-2-6 walks 1, 3, 2, 6 and resets after the fourth win or any loss', () => {
    expect(run(spec('one-three-two-six'), 'WWWW')).toEqual([1, 3, 2, 6, 1]);
    expect(run(spec('one-three-two-six'), 'WWL')).toEqual([1, 3, 2, 1]);
  });
  it('Fibonacci: a loss one step on, a win two back (not below the first)', () => {
    expect(run(spec('fibonacci'), 'LLLLW')).toEqual([1, 1, 2, 3, 5, 2]);
    expect(run(spec('fibonacci'), 'LW')).toEqual([1, 1, 1]);
    expect(run(spec('fibonacci'), 'W')).toEqual([1, 1]);
  });
  it("D'Alembert: +1 after a loss, -1 after a win, never below 1", () => {
    expect(run(spec('dalembert'), 'LLWWW')).toEqual([1, 2, 3, 2, 1, 1]);
  });
  it('Labouchère crosses off first + last on a win, appends the bet on a loss', () => {
    // 1-2-3-4: bet 5; lose -> 1-2-3-4-5 bet 6; win -> 2-3-4 bet 6; win -> 3 bet 3; win -> restart
    expect(run(spec('labouchere'), 'LWWW')).toEqual([5, 6, 6, 3, 5]);
    expect(run(spec('labouchere', { sequence: [2, 2] }), 'W')).toEqual([4, 4]);
  });
  it('flat presets never change', () => {
    for (const id of ['flat-banker', 'flat-player', 'flat-tie', 'follow-the-shoe'] as const)
      expect(run(spec(id), 'LLWLWT')).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('presets: D28 limits', () => {
  it('Martingale: 7 losses -> back to 1 unit (a cap hit)', () => {
    expect(run(spec('martingale'), 'LLLLLLL')).toEqual([1, 2, 4, 8, 16, 32, 64, 1]);
    expect(caps(spec('martingale'), 'LLLLLLL')).toBe(1);
    expect(run(spec('martingale', { maxSteps: 3 }), 'LLL')).toEqual([1, 2, 4, 1]);
  });
  it('Fibonacci: a loss on 89 resets to step 1', () => {
    const r = run(spec('fibonacci'), 'LLLLLLLLLLL');
    expect(r).toEqual([1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 1]);
    expect(caps(spec('fibonacci'), 'LLLLLLLLLLL')).toBe(1);
  });
  it("D'Alembert holds at 20 units", () => {
    const r = run(spec('dalembert'), 'L'.repeat(25));
    expect(Math.max(...r)).toBe(20);
    expect(r.at(-1)).toBe(20);
    expect(caps(spec('dalembert'), 'L'.repeat(25))).toBe(6);
  });
  it('Labouchère: a bet over 100 units restarts the line, betting 5', () => {
    let m = initMemory(spec('labouchere'));
    let n = 0;
    let max = 0;
    while ((m.caps as number) === 0) {
      max = Math.max(max, betUnits(m, spec('labouchere')));
      m = stepMemory(m, spec('labouchere'), 'lose');
      n++;
    }
    expect(max).toBeLessThanOrEqual(100);
    expect(betUnits(m, spec('labouchere'))).toBe(5);
    expect(m.line).toEqual([1, 2, 3, 4]);
    expect(n).toBeGreaterThan(5);
  });
});

describe('presets: the table maximum (one shared rule)', () => {
  it('maxUnits = floor(max / unit); Tie uses the side limits', () => {
    expect(tableMaxUnits(spec('martingale', { unit: 50_000 }), DEFAULT_RULES)).toBe(10);
    expect(tableMaxUnits(spec('flat-tie', { unit: 3_000 }), DEFAULT_RULES)).toBe(16);
  });
  it('a bet over the maximum resets to step 1 and counts a cap hit', () => {
    const s = spec('martingale', { unit: 50_000 });
    let m = initMemory(s);
    for (let i = 0; i < 4; i++) m = tableCap(stepMemory(m, s, 'lose'), s, 10);
    expect(betUnits(m, s)).toBe(1);
    expect(m.caps).toBe(1);
  });
  it("D'Alembert clamps at the table cap instead of resetting (D28)", () => {
    const s = spec('dalembert', { unit: 50_000 });
    let m = initMemory(s);
    for (let i = 0; i < 15; i++) m = tableCap(stepMemory(m, s, 'lose'), s, 10);
    expect(betUnits(m, s)).toBe(10);
    m = tableCap(stepMemory(m, s, 'win'), s, 10);
    expect(betUnits(m, s)).toBe(9);
  });
});

describe('presets: decide', () => {
  it('follow-the-shoe bets the last decided winner; Banker on a fresh shoe', () => {
    const s = spec('follow-the-shoe');
    expect(mainBet(view([]), s)).toBe('banker');
    expect(mainBet(view(['player', 'tie', 'tie']), s)).toBe('player');
    expect(mainBet(view(['tie']), s)).toBe('banker');
    expect(mainBet(view(['player'], true), s)).toBe('banker');
  });
  it('side-bet-sprinkler adds $5 Player Pair and $5 Banker Pair by default', () => {
    const st = getStrategy('side-bet-sprinkler');
    const s = spec('side-bet-sprinkler');
    expect(st.decide(view(), st.init(s), s)).toEqual({
      banker: 1000,
      'player-pair': 500,
      'banker-pair': 500,
    });
    const custom = { ...s, sideBets: { 'dragon-bonus-player': 500 } };
    expect(st.decide(view(), st.init(custom), custom)).toEqual({
      banker: 1000,
      'dragon-bonus-player': 500,
    });
  });
  it('progressions bet the target (Player when asked)', () => {
    const st = getStrategy('martingale');
    const s = spec('martingale', { target: 'player' });
    expect(st.decide(view(), st.init(s), s)).toEqual({ player: 1000 });
  });
  it('update reads the main bet settlement; a push (EZ 3-card 7) leaves the state', () => {
    const st = getStrategy('martingale');
    const s = spec('martingale');
    const res = (result: 'win' | 'lose' | 'push'): HandResult =>
      ({ settlements: [{ bet: 'banker', amount: 1000, result }] }) as unknown as HandResult;
    let m = st.update(st.init(s), s, res('lose'));
    expect(betUnits(m, s)).toBe(2);
    m = st.update(m, s, res('push'));
    expect(betUnits(m, s)).toBe(2);
    m = st.update(m, s, res('win'));
    expect(betUnits(m, s)).toBe(1);
  });
  it('every preset returns a legal slip on 50k random views', () => {
    let rng = seedRng(7);
    const rand = (n: number): number => {
      const [x, r] = randBelow(rng, n);
      rng = r;
      return x;
    };
    const W: Winner[] = ['player', 'banker', 'tie'];
    const outcomes: MainOutcome[] = ['win', 'lose', 'push'];
    let bad = 0;
    for (const id of STRATEGY_IDS) {
      const s = spec(id);
      const st = STRATEGIES[id];
      let m = st.init(s);
      for (let i = 0; i < 50_000 / STRATEGY_IDS.length; i++) {
        const hist = Array.from({ length: rand(8) }, () => W[rand(3)]!);
        const slip = st.decide(view(hist, rand(10) === 0), m, s);
        const entries = Object.entries(slip);
        if (entries.length === 0) bad++;
        for (const [bet, amount] of entries)
          if (
            !BET_IDS.includes(bet as never) ||
            !(Number.isInteger(amount) && amount > 0 && amount % 100 === 0)
          )
            bad++;
        m = stepMemory(m, s, outcomes[rand(3)]!);
      }
    }
    expect(bad).toBe(0);
  }, 30_000);
});
