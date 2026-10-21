import { describe, expect, it } from 'vitest';
import { systemCost } from './metrics';
import { runSession, simulateJob } from './simulate';
import type { SimulateRequest, SimulateResult, StrategySpec } from './types';

const BANKER_EDGE = 114753351728 / 10847218479825;
const PLAYER_EDGE = 241149546272 / 19524993263685;

function base(strategy: StrategySpec, extra: Partial<SimulateRequest> = {}): SimulateRequest {
  return {
    strategy,
    variant: 'punto-banco',
    tiePays: 8,
    hands: 72,
    sessions: 1,
    seed: 1,
    bankroll: 1_000_000,
    handsPerHour: 72,
    ...extra,
  };
}
function drain<R>(g: Generator<unknown, R, void>): { value: R; yields: number } {
  let yields = 0;
  for (;;) {
    const s = g.next();
    if (s.done) return { value: s.value, yields };
    yields++;
  }
}
const sim = (req: SimulateRequest): SimulateResult => drain(simulateJob(req)).value;

describe('simulate: one job kind (D33)', () => {
  it('one session: equity per hand, money conservation, seeded', () => {
    const req = base({ id: 'flat-banker', unit: 1000 });
    const a = sim(req);
    const b = sim(req);
    const s = a.series[0]!;
    expect(s.equity).toHaveLength(73);
    expect(s.equity![0]).toBe(1_000_000);
    expect(s.finals[0]).toBe(s.equity![72]);
    expect(s.handsPlayed).toBe(72);
    expect(s.meanBetPerHand).toBe(1000);
    expect(Array.from(b.series[0]!.equity!)).toEqual(Array.from(s.equity!));
    expect(s.winners.player + s.winners.banker + s.winners.tie).toBe(72);
    // the expected line: 72 × $10 × Banker edge
    expect(s.expected[72]! - 1_000_000).toBeCloseTo(-72 * 1000 * BANKER_EDGE, 6);
    expect(s.costPerHourCents).toBeCloseTo(72 * 1000 * BANKER_EDGE, 6);
    expect(s.p10).toBeUndefined();
  });
  it('yields progress every 200 hands', () => {
    const { yields } = drain(simulateJob(base({ id: 'flat-banker', unit: 1000 }, { hands: 1000 })));
    expect(yields).toBe(5);
  });
  it('many sessions: p10 ≤ p50 ≤ p90, survival non-increasing, histogram finals', () => {
    const r = sim(
      base({ id: 'martingale', unit: 1000 }, { sessions: 100, hands: 720, bankroll: 50_000 }),
    );
    const s = r.series[0]!;
    expect(s.finals).toHaveLength(100);
    expect(s.equity).toBeUndefined();
    for (let h = 0; h <= 720; h++) {
      expect(s.p10![h]!).toBeLessThanOrEqual(s.p50![h]!);
      expect(s.p50![h]!).toBeLessThanOrEqual(s.p90![h]!);
      if (h > 0) expect(s.survival![h]!).toBeLessThanOrEqual(s.survival![h - 1]!);
    }
    expect(s.survival![0]).toBe(1);
    expect(s.bustRate).toBeGreaterThan(0); // $500 cannot survive 10 hours of $10 Martingale often
    expect(s.survival![720]).toBeCloseTo(1 - s.bustRate, 10);
  });
  it('compare mode sees identical cards on the same seeds', () => {
    const req = base({ id: 'flat-banker', unit: 1000 }, { hands: 300 });
    const specs: StrategySpec[] = [
      { id: 'flat-banker', unit: 1000 },
      { id: 'martingale', unit: 1000 },
      { id: 'follow-the-shoe', unit: 1000 },
      { id: 'side-bet-sprinkler', unit: 1000 },
      { id: 'labouchere', unit: 1000, target: 'player' },
    ];
    for (let i = 0; i < 3; i++) {
      const winners = specs.map((s) => drain(runSession(req, s, i)).value.handWinners);
      for (const w of winners) expect(w).toEqual(winners[0]);
    }
    const r = sim({ ...req, compare: specs.slice(1) });
    expect(r.series.map((s) => s.winners)).toEqual(r.series.map(() => r.series[0]!.winners));
  });
});

describe('simulate: bust and caps (D28)', () => {
  it('bust exactly when the next bet exceeds the bankroll; bets never shrink', () => {
    // $63 covers 1+2+4+8+16+32 units of $1 ... with a $5 unit: 5+10+20+40 = $75 covers 4 losses.
    const req = base({ id: 'martingale', unit: 500 }, { bankroll: 7_500, hands: 2_000, seed: 3 });
    const s = drain(runSession(req, req.strategy, 0)).value;
    expect(s.bustedAt).toBeGreaterThanOrEqual(0);
    const eq = s.eq[s.bustedAt]!;
    expect(eq).toBeLessThan(7_500 * 2); // it really was short
    for (let h = s.bustedAt; h <= 2_000; h++) expect(s.eq[h]).toBe(eq);
    expect(s.played).toBe(s.bustedAt);
  });
  it('stopAtBust false keeps playing at step 1 while it can', () => {
    const req = base(
      { id: 'martingale', unit: 500 },
      { bankroll: 7_500, hands: 2_000, seed: 3, stopAtBust: false },
    );
    const s = drain(runSession(req, req.strategy, 0)).value;
    expect(s.bustedAt).toBeGreaterThanOrEqual(0);
    expect(s.played).toBeGreaterThan(s.bustedAt);
  });
  it('a bankroll below the first bet busts at hand 0', () => {
    const r = sim(base({ id: 'flat-banker', unit: 1000 }, { bankroll: 900, sessions: 10 }));
    expect(r.series[0]!.bustRate).toBe(1);
    expect(r.series[0]!.handsPlayed).toBe(0);
    expect(r.series[0]!.survival![0]).toBe(0);
  });
  it('counts cap resets (Martingale 7 losses) and table-maximum resets', () => {
    const r = sim(base({ id: 'martingale', unit: 1000 }, { hands: 7_200, bankroll: 10_000_000 }));
    expect(r.series[0]!.capHits).toBeGreaterThan(0);
    // a $100 unit Martingale hits the $5,000 table maximum at 64 units: reset instead
    const t = sim(
      base({ id: 'martingale', unit: 10_000 }, { hands: 7_200, bankroll: 100_000_000 }),
    );
    expect(t.series[0]!.capHits).toBeGreaterThan(r.series[0]!.capHits);
  });
  it('stopWin and stopLoss end the session', () => {
    const r = sim(
      base(
        { id: 'flat-banker', unit: 1000 },
        { hands: 5_000, stopWin: 3_000, stopLoss: 3_000, sessions: 20 },
      ),
    );
    for (const f of r.series[0]!.finals)
      expect(Math.abs(f - 1_000_000)).toBeLessThanOrEqual(3_000 + 1_000);
    expect(r.series[0]!.handsPlayed).toBeLessThan(20 * 5_000);
  });
  it('rejects bad requests', () => {
    expect(() => sim(base({ id: 'flat-banker', unit: 1000 }, { hands: 20_001 }))).toThrow(/hands/);
    expect(() => sim(base({ id: 'flat-banker', unit: 1000 }, { sessions: 0 }))).toThrow(/sessions/);
    expect(() => sim(base({ id: 'flat-banker', unit: 0 }))).toThrow(/unit/);
    expect(() => sim(base({ id: 'martingale', unit: 400 }))).toThrow(/table limits/);
    expect(() => sim(base({ id: 'flat-banker', unit: 600_000 }))).toThrow(/table limits/);
    expect(sim(base({ id: 'flat-tie', unit: 100 })).series[0]!.meanBetPerHand).toBe(100);
  });
});

describe('simulate: auto-play reports what the lessons say (curriculum.md section 7.2)', () => {
  // 1,500 one-hour sessions on the same seeds; mean bet within 4 standard errors of the DP figure.
  const SESSIONS = 1_500;
  const run = (spec: StrategySpec) => {
    const req = base(spec, { sessions: 1, bankroll: 100_000_000, seed: 1000 });
    const bets: number[] = [];
    for (let i = 0; i < SESSIONS; i++) {
      const s = drain(runSession(req, spec, i)).value;
      bets.push(s.wagered / 72 / spec.unit);
    }
    const mean = bets.reduce((a, b) => a + b, 0) / SESSIONS;
    const sd = Math.sqrt(bets.reduce((a, b) => a + (b - mean) ** 2, 0) / (SESSIONS - 1));
    return { mean, se: sd / Math.sqrt(SESSIONS) };
  };
  it.each([
    ['paroli', 'banker', 1.7129],
    ['one-three-two-six', 'banker', 1.998],
    ['fibonacci', 'banker', 2.4565],
    ['martingale', 'banker', 3.3236],
    ['dalembert', 'banker', 4.5735],
    ['martingale', 'player', 3.5118],
    ['labouchere', 'banker', 12.46],
  ] as const)(
    '%s on %s ≈ %f units',
    (id, target, want) => {
      const { mean, se } = run({ id, unit: 1000, target });
      expect(Math.abs(mean - want)).toBeLessThan(4 * se + 0.01);
    },
    60_000,
  );
  it.each([
    ['martingale', 50_000],
    ['dalembert', 50_000],
    ['fibonacci', 10_000],
  ] as const)(
    '%s at a $%i-cent unit: the table maximum is the same rule in exact and simulate',
    (id, unit) => {
      const spec: StrategySpec = { id, unit };
      const exact = systemCost(spec, 'punto-banco', 8);
      const { mean, se } = run(spec);
      expect(Math.abs(mean - exact.avgBetUnits!)).toBeLessThan(4 * se + 0.01);
    },
    60_000,
  );
  it('Martingale at $500: the exact cost honours the $5,000 maximum (≈ $794.59/h)', () => {
    const c = systemCost({ id: 'martingale', unit: 50_000 }, 'punto-banco', 8);
    expect((c.costPerHourCents! / 100).toFixed(2)).toBe('794.59');
  });
  it('the expected line and cost per hour use the edge of the bets placed', () => {
    const r = sim(base({ id: 'martingale', unit: 1000 }, { sessions: 200, bankroll: 100_000_000 }));
    const s = r.series[0]!;
    expect(s.costPerHourCents / 72 / s.meanBetPerHand).toBeCloseTo(BANKER_EDGE, 10);
    const p = sim(base({ id: 'martingale', unit: 1000, target: 'player' }, { sessions: 50 }));
    expect(p.series[0]!.costPerHourCents / 72 / p.series[0]!.meanBetPerHand).toBeCloseTo(
      PLAYER_EDGE,
      10,
    );
  });
  it('follow-the-shoe ≈ $8.25/h (mix ≈ 50.68% Banker)', () => {
    const r = sim(base({ id: 'follow-the-shoe', unit: 1000 }, { hands: 20_000, sessions: 5 }));
    const c = r.series[0]!.costPerHourCents / 100;
    expect(c).toBeGreaterThan(7.9);
    expect(c).toBeLessThan(8.6);
  }, 30_000);
  it('flat Banker: simulated mean per hand within 4σ of u × edge over 200k hands', () => {
    const r = sim(
      base(
        { id: 'flat-banker', unit: 1000 },
        { hands: 20_000, sessions: 10, bankroll: 100_000_000 },
      ),
    );
    const s = r.series[0]!;
    const perHand = (s.meanFinal - 100_000_000) / 20_000;
    const sd = 0.9274 * 1000; // per-hand SD of a $10 Banker bet
    expect(Math.abs(perHand + 1000 * BANKER_EDGE)).toBeLessThan((4 * sd) / Math.sqrt(200_000));
  }, 30_000);
  it('benchmark: 100k hands < 4 s', () => {
    const t = Date.now();
    sim(
      base(
        { id: 'martingale', unit: 1000 },
        { hands: 1_000, sessions: 100, bankroll: 100_000_000 },
      ),
    );
    expect(Date.now() - t).toBeLessThan(4_000);
  }, 30_000);
});
