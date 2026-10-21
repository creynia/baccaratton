import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../engine/game';
import type { Action, GameEvent } from '../engine/types';
import { SimDriver, parseShoeParam, sessionSummary } from './driver';
import type { Snapshot } from './driver';
import { answerKey, gateAction, initScene, observe } from './runner';
import type { SceneContext } from './runner';
import type { Condition, SceneConfig, SceneInput, SceneStep } from './types';

const ctx: SceneContext = { equity: 50_000, bets: {}, hands: 0 };
const one = (completeWhen: Condition, extra: Partial<SceneStep> = {}): SceneConfig => ({
  id: 't',
  version: 1,
  steps: [
    { id: 'a', text: 'a', completeWhen, ...extra },
    { id: 'b', text: 'b', completeWhen: { acknowledged: true }, advance: 'button' },
  ],
});
const dealEvents = (): GameEvent[] => {
  const r = applyAction(createGame({ seed: 3 }), { type: 'deal' });
  if (!r.ok) throw new Error('deal');
  return r.events;
};
const dealt: SceneInput = { kind: 'action', action: { type: 'deal' }, events: dealEvents() };
const betAction = (amount: number): SceneInput => ({
  kind: 'action',
  action: { type: 'set-bet', bet: 'banker', amount },
  events: [],
});

describe('runner: every Condition', () => {
  const cases: [string, Condition, SceneInput[], Partial<SceneContext>?][] = [
    ['action', { action: { type: 'set-bet', bet: 'banker', minAmount: 1000 } }, [betAction(1000)]],
    ['action count', { action: { type: 'deal' }, count: 2 }, [dealt, dealt]],
    ['event', { event: 'hand-settled' }, [dealt]],
    ['hands', { hands: 2 }, [dealt, dealt]],
    ['handResult', { handResult: {} }, [dealt]],
    [
      'betOnFelt',
      { betOnFelt: { bet: 'banker', minAmount: 1000 } },
      [betAction(1000)],
      { bets: { banker: 1000 } },
    ],
    ['bankrollAtLeast', { bankrollAtLeast: 40_000 }, [betAction(0)]],
    ['bankrollAtMost', { bankrollAtMost: 60_000 }, [betAction(0)]],
    [
      'previewed',
      { previewed: { bet: 'tie' } },
      [{ kind: 'previewed', bet: 'tie', whyOpened: false }],
    ],
    ['tapped', { tapped: 'commission' }, [{ kind: 'tapped', target: 'commission' }]],
    [
      'predicted',
      { predicted: { count: 1 } },
      [{ kind: 'predicted', predict: 'player-draws', answer: 'Draw', correct: false }],
    ],
    [
      'autoPlayCompleted',
      { autoPlayCompleted: { minHands: 720 } },
      [{ kind: 'auto-play-completed', hands: 720, strategy: 'flat-banker' }],
    ],
    [
      'trackerPositive',
      { trackerPositive: { bet: 'dragon-7' } },
      [{ kind: 'tracker', positive: ['dragon-7'] }],
    ],
    ['acknowledged', { acknowledged: true }, [{ kind: 'acknowledged' }]],
    [
      'all',
      { all: [{ tapped: 'player' }, { tapped: 'tie' }] },
      [
        { kind: 'tapped', target: 'player' },
        { kind: 'tapped', target: 'tie' },
      ],
    ],
    ['any', { any: [{ tapped: 'player' }, { hands: 9 }] }, [{ kind: 'tapped', target: 'player' }]],
  ];
  it.each(cases)('%s completes on its inputs and not before', (_n, cond, inputs, extra) => {
    const sc = one(cond);
    let rt = initScene(sc);
    const c = { ...ctx, ...extra };
    inputs.forEach((input, i) => {
      if (i === inputs.length - 1) expect(rt.stepIndex).toBe(0);
      rt = observe(sc, rt, input, c);
    });
    expect(rt.stepIndex).toBe(1);
  });
  it('does not complete on unrelated inputs', () => {
    const sc = one({ tapped: 'tie' });
    const rt = observe(sc, initScene(sc), { kind: 'tapped', target: 'player' }, ctx);
    expect(rt.stepIndex).toBe(0);
  });
  it('predicted: correct only counts right answers; count 1 completes on a wrong one (D27)', () => {
    const wrong: SceneInput = {
      kind: 'predicted',
      predict: 'banker-draws',
      answer: 'Stand',
      correct: false,
    };
    const right: SceneInput = { ...wrong, correct: true };
    const strict = one({ predicted: { correct: true, count: 2 } });
    let rt = initScene(strict);
    for (const i of [wrong, right, wrong]) rt = observe(strict, rt, i, ctx);
    expect(rt.stepIndex).toBe(0);
    rt = observe(strict, rt, right, ctx);
    expect(rt.stepIndex).toBe(1);
    const once = one({ predicted: { count: 1 } });
    expect(observe(once, initScene(once), wrong, ctx).stepIndex).toBe(1);
  });
  it('hands counts only hands dealt since the step started', () => {
    const sc: SceneConfig = {
      id: 't',
      version: 1,
      steps: [
        { id: 'a', text: 'a', completeWhen: { hands: 1 } },
        { id: 'b', text: 'b', completeWhen: { hands: 2 } },
        { id: 'c', text: 'c', completeWhen: { acknowledged: true }, advance: 'button' },
      ],
    };
    let rt = initScene(sc);
    rt = observe(sc, rt, dealt, { ...ctx, hands: 5 });
    expect(rt.stepIndex).toBe(1);
    rt = observe(sc, rt, dealt, { ...ctx, hands: 6 });
    expect(rt.stepIndex).toBe(1);
    rt = observe(sc, rt, dealt, { ...ctx, hands: 7 });
    expect(rt.stepIndex).toBe(2);
  });
  it('advance: button waits for the Next button', () => {
    const sc = one({ tapped: 'tie' }, { advance: 'button' });
    let rt = observe(sc, initScene(sc), { kind: 'tapped', target: 'tie' }, ctx);
    expect(rt).toMatchObject({ stepIndex: 0, satisfied: true });
    rt = observe(sc, rt, { kind: 'acknowledged' }, ctx);
    expect(rt.stepIndex).toBe(1);
    rt = observe(sc, rt, { kind: 'acknowledged' }, ctx);
    expect(rt.done).toBe(true);
  });
});

describe('gateAction', () => {
  const sc = one(
    { betOnFelt: { bet: 'banker' } },
    {
      allowedActions: ['set-bet', 'clear-bets'],
      allowedBets: ['banker', 'player'],
      expect: [{ type: 'set-bet', bet: 'banker' }],
      hint: 'Banker, please.',
    },
  );
  const rt = initScene(sc);
  const g = (a: Action, bets = {}) => gateAction(sc, rt, a, bets);
  it('rejects actions the step does not allow, with the hint', () => {
    expect(g({ type: 'deal' })).toEqual({
      ok: false,
      code: 'not-allowed-by-scene',
      message: 'Banker, please.',
    });
  });
  it('applies allowedBets and expect to set-bet, but lets chips come off', () => {
    expect(g({ type: 'set-bet', bet: 'banker', amount: 500 }).ok).toBe(true);
    expect(g({ type: 'set-bet', bet: 'player', amount: 500 }).ok).toBe(false);
    expect(g({ type: 'set-bet', bet: 'tie', amount: 100 }).ok).toBe(false);
    expect(g({ type: 'set-bet', bet: 'tie', amount: 0 }, { tie: 100 }).ok).toBe(true);
    expect(g({ type: 'clear-bets' }).ok).toBe(true);
  });
});

describe('answerKey', () => {
  const hand = (cards: string) => {
    const g = createGame({ forced: parseShoeParam(cards) });
    const r = applyAction(g, { type: 'deal' });
    if (!r.ok) throw new Error('deal');
    return r.state.lastResult!.hand;
  };
  const step = (kind: SceneStep['predict'], pauseAt: SceneStep['pauseAt']): SceneStep => ({
    id: 's',
    text: 't',
    predict: kind,
    pauseAt,
    completeWhen: { predicted: { count: 1 } },
  });
  it('reads draws, totals and the winner from the resolved hand', () => {
    const h = hand('3h Kd 2c 5s 6d 9c'); // P 5 draws 6 → 1; B 5 draws on a 6: 5+9 = 4
    expect(answerKey(step({ kind: 'player-draws' }, 'two-cards'), h)).toMatchObject({
      answer: 'Draw',
      cell: 'p5',
    });
    const b = answerKey(step({ kind: 'banker-draws' }, 'player-third'), h);
    expect(b).toMatchObject({ answer: 'Draw', rule: 'banker-5-draws-on-4-7', cell: 'b5/p6' });
    expect(b.ruleRow).toMatch(/third card was a 6/);
    expect(answerKey(step({ kind: 'hand-total', side: 'player' }, 'two-cards'), h).answer).toBe(
      '5',
    );
    expect(answerKey(step({ kind: 'hand-total', side: 'player' }, 'player-third'), h).answer).toBe(
      '1',
    );
    expect(answerKey(step({ kind: 'winner' }, 'all-cards'), h).answer).toBe('Banker');
  });
  it('a natural is answered Stand with the natural rule (D26)', () => {
    const h = hand('4s Qh 5d 8c');
    expect(answerKey(step({ kind: 'player-draws' }, 'two-cards'), h)).toMatchObject({
      answer: 'Stand',
      rule: 'natural',
    });
  });
});

describe('SimDriver', () => {
  it('stops at the pause, takes the call, and skips naturals with skipNaturals', () => {
    const sc: SceneConfig = {
      id: 'p',
      version: 1,
      steps: [
        {
          id: 'a',
          text: 'a',
          allowedActions: ['deal'],
          predict: { kind: 'player-draws' },
          pauseAt: 'two-cards',
          skipNaturals: true,
          deals: [
            { player: ['4s', '5d'], banker: ['Qh', '8c'] },
            { player: ['2h', '3c', '4d'], banker: ['Td', '7h'] },
          ],
          completeWhen: { predicted: { count: 1 } },
        },
        {
          id: 'b',
          text: 'b',
          allowedActions: [],
          completeWhen: { acknowledged: true },
          advance: 'button',
        },
      ],
    };
    const d = new SimDriver({ scene: sc, mode: 'scene', seed: 1 });
    expect(d.act({ type: 'deal' }).ok).toBe(true);
    expect(d.view.awaiting).toBeNull(); // the natural plays straight through and doesn't count
    expect(d.view.step?.id).toBe('a');
    d.act({ type: 'deal' });
    expect(d.view.awaiting).toMatchObject({ pause: 'two-cards', options: ['Draw', 'Stand'] });
    expect(d.act({ type: 'deal' }).ok).toBe(false); // answer first
    expect(d.predict('Stand')).toMatchObject({ correct: false, answer: 'Draw' });
    expect(d.view.step?.id).toBe('b');
    expect(d.view.showNext).toBe(true);
    d.acknowledge();
    expect(d.view.rt.done).toBe(true);
  });
  it('locks Deal on a betting step and reports the hint', () => {
    const sc: SceneConfig = {
      id: 'b',
      version: 1,
      steps: [
        {
          id: 'a',
          text: 'a',
          hint: 'Bet first.',
          allowedActions: ['set-bet'],
          completeWhen: { betOnFelt: { bet: 'banker' } },
        },
        { id: 'b', text: 'b', allowedActions: ['deal'], completeWhen: { hands: 1 } },
      ],
    };
    const d = new SimDriver({ scene: sc, mode: 'scene', seed: 1 });
    expect(d.view.dealLocked).toBe(true);
    expect(d.act({ type: 'deal' })).toEqual({ ok: false, message: 'Bet first.' });
    expect(d.view.rejection?.text).toBe('Bet first.');
    d.act({ type: 'set-bet', bet: 'banker', amount: 1000 });
    expect(d.view.step?.id).toBe('b');
    expect(d.view.dealLocked).toBe(false);
  });
  it('snapshots and restores the same shoe mid-way', () => {
    const d = new SimDriver({ mode: 'sandbox', seed: 42 });
    for (let i = 0; i < 5; i++) d.act({ type: 'deal' });
    const snap = JSON.parse(JSON.stringify(d.snapshot())) as Snapshot;
    const e = new SimDriver({ mode: 'sandbox', seed: 1, restore: snap });
    d.act({ type: 'deal' });
    e.act({ type: 'deal' });
    expect(e.state.lastResult?.hand).toEqual(d.state.lastResult?.hand);
    expect(e.state.shoe.pos).toBe(d.state.shoe.pos);
  });
  it('parses ?shoe= into forced hands by the tableau', () => {
    expect(parseShoeParam('Kh,4s,2d,3h,3c')).toEqual([
      { player: ['Kh', '2d', '3c'], banker: ['4s', '3h'] },
    ]);
    expect(() => parseShoeParam('Kh 4s 2d')).toThrow();
  });
  it('session summary: expected is Σ bet × full-shoe EV', () => {
    const d = new SimDriver({ mode: 'sandbox', seed: 9, forced: parseShoeParam('Kh 4s 2d 3h 3c') });
    d.act({ type: 'set-bet', bet: 'banker', amount: 2500 });
    d.act({ type: 'deal' });
    const s = sessionSummary(d.state);
    expect(s.hands).toBe(1);
    expect(s.totalBet).toBe(2500);
    expect(s.actualCents).toBe(2375);
    expect(s.commissionPaid).toBe(125);
    expect(s.averageEdge).toBeCloseTo(0.010579, 5);
    expect(s.expectedCents).toBeCloseTo(-26.45, 1);
  });
});
