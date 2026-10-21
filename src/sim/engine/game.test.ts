import { describe, expect, it } from 'vitest';
import { cardCode } from './cards';
import {
  applyAction,
  createGame,
  equity,
  legalActions,
  queueForced,
  replay,
  startShoe,
  visibleView,
} from './game';
import { applyLogged, replayLog } from './log';
import { randBelow, seedRng } from './rng';
import { validateAction, validateForcedHand } from './validate';
import { BET_IDS } from './types';
import type {
  Action,
  ApplyResult,
  BetId,
  ForcedHand,
  GameEvent,
  GameState,
  LogEntry,
  ValidationCode,
} from './types';
import { DEFAULT_RULES } from './rules';

function ok(r: ApplyResult): { state: GameState; events: GameEvent[] } {
  if (!r.ok) throw new Error(r.error.message);
  return r;
}
const act = (s: GameState, a: Action) => ok(applyAction(s, a));
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
const types = (ev: readonly GameEvent[]) => ev.map((e) => e.type);
const forced = (player: string, banker: string): ForcedHand => ({
  player: player.split(' '),
  banker: banker.split(' '),
});

describe('createGame', () => {
  it('defaults: rules, $500 bankroll, empty felt, unshuffled shoe', () => {
    const g = createGame();
    expect(g.rules).toEqual(DEFAULT_RULES);
    expect(g.bankroll).toBe(50_000);
    expect(g.bets).toEqual({});
    expect(g.shoe.shoeNo).toBe(0);
    expect(g.version).toBe(1);
    expect(visibleView(g).nextHandNewShoe).toBe(true);
  });
  it('takes preset bets from the bankroll and validates options', () => {
    const g = createGame({ bets: { banker: 2500, tie: 500 } });
    expect(g.bankroll).toBe(47_000);
    expect(equity(g)).toBe(50_000);
    expect(() => createGame({ bets: { banker: 300 } })).toThrow(/minimum/);
    expect(() => createGame({ rules: { decks: 9 } })).toThrow(/decks/);
    expect(() => createGame({ forced: [forced('Kh 2d', '3s 4s')] })).toThrow(/Player draws/);
    expect(() => createGame({ bankroll: -1 })).toThrow(/bankroll/);
  });
  it('history prefill is marked and survives the first shuffle, not later ones', () => {
    const g = createGame({
      history: [
        { winner: 'banker', playerPair: false, bankerPair: false, natural: false, total: 7 },
      ],
    });
    expect(g.history[0]!.prefilled).toBe(true);
    const a = act(g, { type: 'deal' }).state;
    expect(a.history).toHaveLength(2);
    expect(a.history[1]!.prefilled).toBeUndefined();
    expect(startShoe(a, 'fresh').history).toEqual([]);
  });
});

describe('event order of one deal (section 1.8)', () => {
  it('a natural hand (new shoe)', () => {
    const g = createGame({ forced: [forced('3h Ad', '9s Kd')], bets: { banker: 2500 } });
    const { events, state } = act(g, { type: 'deal' });
    expect(types(events)).toEqual([
      'shoe-shuffled',
      'burn',
      'hand-started',
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'pause-point',
      'natural',
      'draw-decision',
      'pause-point',
      'draw-decision',
      'pause-point',
      'hand-result',
      'road-updated',
      'bet-settled',
      'hand-settled',
    ]);
    expect(events.filter((e) => e.type === 'card-dealt').map((e) => [e.to, e.index])).toEqual([
      ['player', 0],
      ['banker', 0],
      ['player', 1],
      ['banker', 1],
    ]);
    expect(events.find((e) => e.type === 'natural')).toEqual({
      type: 'natural',
      side: 'banker',
      player: 4,
      banker: 9,
    });
    for (const e of events)
      if (e.type === 'draw-decision') expect(e.decision).toEqual({ draws: false, rule: 'natural' });
    expect(state.bankroll).toBe(50_000 + 2375); // the $23.75 golden amount
  });
  it('the Player stands, the Banker draws', () => {
    const g = act(createGame(), { type: 'deal' }).state; // shoe shuffled
    const { events } = act(queueForced(g, [forced('3h 4d', 'Ks 2c 5h')]), { type: 'deal' });
    expect(types(events)).toEqual([
      'hand-started',
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'pause-point',
      'draw-decision',
      'pause-point',
      'draw-decision',
      'card-dealt',
      'pause-point',
      'hand-result',
      'road-updated',
      'hand-settled',
    ]);
    const third = events.find((e) => e.type === 'card-dealt' && e.index === 2);
    expect(third).toMatchObject({ to: 'banker', sideways: true });
    expect(events.filter((e) => e.type === 'draw-decision').map((e) => e.decision.rule)).toEqual([
      'player-6-7-stands',
      'banker-player-stood-0-5-draws',
    ]);
  });
  it('both draw, with pause markers in place', () => {
    const g = act(createGame({ seed: 4 }), { type: 'deal' }).state;
    const r = act(queueForced(g, [forced('Ah 2d 2c', 'As 2s 2h')]), { type: 'deal' });
    expect(
      types(r.events).filter(
        (t) => t === 'card-dealt' || t === 'pause-point' || t === 'draw-decision',
      ),
    ).toEqual([
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'card-dealt',
      'pause-point',
      'draw-decision',
      'card-dealt',
      'pause-point',
      'draw-decision',
      'card-dealt',
      'pause-point',
    ]);
    expect(r.events.filter((e) => e.type === 'pause-point').map((e) => e.at)).toEqual([
      'two-cards',
      'player-third',
      'all-cards',
    ]);
    expect(r.state.lastResult!.hand.winner).toBe('tie');
  });
});

describe('money', () => {
  it('conservation: equity before + net = equity after, every hand, random slips', () => {
    let g = createGame({ seed: 77, bankroll: 10_000_000, rules: { variant: 'ez' } });
    let rng = seedRng(5);
    const pick = (n: number) => {
      const [x, next] = randBelow(rng, n);
      rng = next;
      return x;
    };
    for (let h = 0; h < 3000; h++) {
      for (const id of BET_IDS) {
        if (pick(3) !== 0) continue;
        const main = id === 'player' || id === 'banker';
        const amount = (main ? 5 : 1) * 100 * (1 + pick(20));
        g = act(g, { type: 'set-bet', bet: id, amount }).state;
      }
      const before = equity(g);
      const r = act(g, { type: 'deal' });
      const res = r.state.lastResult!;
      expect(equity(r.state)).toBe(before + res.net);
      expect(r.state.bets).toEqual({});
      g = r.state;
    }
    const st = g.stats;
    expect(st.hands).toBe(3000);
    expect(st.winners.player + st.winners.banker + st.winners.tie).toBe(3000);
    expect(g.bankroll).toBe(10_000_000 + BET_IDS.reduce((a, b) => a + st.net[b], 0));
  });
  it('commission is recorded in the stats', () => {
    const g = createGame({ forced: [forced('3h Ad', '9s Kd')], bets: { banker: 2500 } });
    expect(act(g, { type: 'deal' }).state.stats.commissionPaid).toBe(125);
  });
  it('set-bet moves chips rack <-> felt; clear-bets returns them', () => {
    let g = createGame();
    const r = act(g, { type: 'set-bet', bet: 'player', amount: 1000 });
    expect(r.events).toEqual([{ type: 'bet-set', bet: 'player', from: 0, to: 1000 }]);
    g = act(r.state, { type: 'set-bet', bet: 'player', amount: 600 }).state;
    expect(g.bankroll).toBe(49_400);
    g = act(g, { type: 'set-bet', bet: 'player', amount: 0 }).state;
    expect(g.bets).toEqual({});
    g = act(g, { type: 'set-bet', bet: 'tie', amount: 300 }).state;
    const c = act(g, { type: 'clear-bets' });
    expect(c.events).toEqual([{ type: 'bets-cleared' }]);
    expect(c.state.bankroll).toBe(50_000);
    expect(c.state.bets).toEqual({});
  });
  it('rebet, deal {rebet} and the empty-felt (no-money) deal', () => {
    let g = createGame({ seed: 3, bets: { banker: 1000, 'player-pair': 100 } });
    g = act(g, { type: 'deal' }).state;
    expect(g.lastBets).toEqual({ banker: 1000, 'player-pair': 100 });
    // Sit out: an empty felt deals a hand with no money and keeps lastBets.
    const sit = act(g, { type: 'deal' });
    expect(sit.state.lastResult!.settlements).toEqual([]);
    expect(sit.state.bankroll).toBe(g.bankroll);
    expect(sit.state.lastBets).toEqual(g.lastBets);
    // Rebet & Deal.
    const rd = act(sit.state, { type: 'deal', rebet: true });
    expect(rd.events.slice(0, 2)).toEqual([
      { type: 'bet-set', bet: 'banker', from: 0, to: 1000 },
      { type: 'bet-set', bet: 'player-pair', from: 0, to: 100 },
    ]);
    expect(rd.state.lastResult!.wagered).toBe(1100);
    // Rebet replaces what is on the felt.
    let h = act(rd.state, { type: 'set-bet', bet: 'tie', amount: 500 }).state;
    h = act(h, { type: 'rebet' }).state;
    expect(h.bets).toEqual({ banker: 1000, 'player-pair': 100 });
    expect(equity(h)).toBe(rd.state.bankroll);
    // deal {rebet} with chips already on the felt deals them as they are.
    const t = act(act(rd.state, { type: 'set-bet', bet: 'tie', amount: 500 }).state, {
      type: 'deal',
      rebet: true,
    });
    expect(t.state.lastBets).toEqual({ tie: 500 });
  });
});

describe('validation codes (section 1.7)', () => {
  const g = createGame({ bankroll: 1000 });
  const code = (s: GameState, a: Action): ValidationCode | null => {
    const v = validateAction(s, a);
    return v.ok ? null : v.code;
  };
  it.each<[string, Action, ValidationCode]>([
    [
      'not offered (dragon-7 in punto-banco)',
      { type: 'set-bet', bet: 'dragon-7', amount: 100 },
      'not-offered',
    ],
    ['unknown bet', { type: 'set-bet', bet: 'nope' as BetId, amount: 100 }, 'not-offered'],
    ['not whole dollars', { type: 'set-bet', bet: 'player', amount: 550 }, 'bad-amount'],
    ['negative', { type: 'set-bet', bet: 'player', amount: -500 }, 'bad-amount'],
    ['below the $5 main minimum', { type: 'set-bet', bet: 'banker', amount: 400 }, 'below-min'],
    ['above the $500 side maximum', { type: 'set-bet', bet: 'tie', amount: 50_100 }, 'above-max'],
    [
      'above the $5,000 main maximum',
      { type: 'set-bet', bet: 'player', amount: 500_100 },
      'above-max',
    ],
    ['more than the rack', { type: 'set-bet', bet: 'player', amount: 1100 }, 'insufficient-funds'],
    ['rebet with nothing to repeat', { type: 'rebet' }, 'no-last-bets'],
    ['deal {rebet} with nothing to repeat', { type: 'deal', rebet: true }, 'no-last-bets'],
  ])('%s', (_n, a, c) => {
    expect(code(g, a)).toBe(c);
    const r = applyAction(g, a);
    expect(r.ok).toBe(false);
    expect(r.state).toBe(g);
  });
  it('limits: $1 side minimum, tie uses side limits, 0 removes', () => {
    expect(code(g, { type: 'set-bet', bet: 'tie', amount: 100 })).toBeNull();
    expect(code(g, { type: 'set-bet', bet: 'player', amount: 0 })).toBeNull();
    expect(code(g, { type: 'set-bet', bet: 'banker', amount: 500 })).toBeNull();
  });
  it('rebet affordability and bad forced heads', () => {
    let s = act(createGame({ bankroll: 1000, bets: { player: 1000 }, seed: 1 }), {
      type: 'deal',
    }).state;
    if (s.bankroll >= 1000) s = { ...s, bankroll: 500 };
    expect(code(s, { type: 'rebet' })).toBe('insufficient-funds');
    const q = { ...createGame(), forced: [forced('Kh 2d', '3s 4s')] };
    expect(code(q, { type: 'deal' })).toBe('bad-forced-hand');
    expect(code(q, { type: 'clear-bets' })).toBeNull();
    expect(code(q, { type: 'new-shoe' })).toBeNull();
    expect(() => validateAction(q, { type: 'fold' } as never)).toThrow(/Unknown action "fold"/);
  });
  it('validateForcedHand: codes, counts, copies and the tableau', () => {
    const v = (p: string, b: string, decks = 8) =>
      validateForcedHand(forced(p, b), { ...DEFAULT_RULES, decks });
    expect(v('3h 4d', 'Ks 6c').ok).toBe(true);
    expect(v('Xx 4d', 'Ks 6c').ok).toBe(false);
    expect(v('3h', 'Ks 6c').ok).toBe(false);
    expect(v('3h 4d 5d 6d', 'Ks 6c').ok).toBe(false);
    expect(v('3h 4d 5d', 'Ks 6c').ok).toBe(false); // Player 7 stands
    expect(v('3h 2d', 'Ks 6c').ok).toBe(false); // Player 5 must draw
    expect(v('3h 2d 9c', 'Ks 6c 2c').ok).toBe(false); // Banker 6 stands on a 9
    expect(v('3h 2d 7c', 'Ks 6c 2c').ok).toBe(true); // Banker 6 draws on a 7
    expect(v('3h 2d 7c', 'Ks 6c').ok).toBe(false);
    expect(v('Ah Ah', '9s 9s', 1).ok).toBe(false); // two copies in one deck
    expect(v('Ah Ah', '9s 9s', 2).ok).toBe(true);
    expect(
      validateForcedHand({ player: ['Ah', 'Kd2c'], banker: ['9s', '9d'] }, DEFAULT_RULES).ok,
    ).toBe(false);
    expect(validateForcedHand({} as ForcedHand, DEFAULT_RULES).ok).toBe(false);
  });
});

describe('replay, log, purity', () => {
  const script: Action[] = [
    { type: 'set-bet', bet: 'banker', amount: 2500 },
    { type: 'deal' },
    { type: 'deal', rebet: true },
    { type: 'set-bet', bet: 'tie', amount: 500 },
    { type: 'deal' },
    { type: 'new-shoe' },
    { type: 'deal', rebet: true },
    { type: 'rebet' },
    { type: 'clear-bets' },
    { type: 'deal' },
  ];
  it('replay reproduces the state exactly; the log replays too', () => {
    const g0 = createGame({ seed: 123 });
    let s = g0;
    let log: readonly LogEntry[] = [];
    for (const a of script) {
      const r = applyLogged(s, log, a);
      s = ok(r.result).state;
      log = r.log;
    }
    expect(replay(g0, script)).toEqual(s);
    expect(replayLog(g0, log)).toEqual(s);
    expect(log.map((e) => e.seq)).toEqual(script.map((_, i) => i + 1));
    // JSON round trip (persistence mid-shoe) keeps replaying identically.
    const revived = JSON.parse(JSON.stringify(s)) as GameState;
    expect(act(revived, { type: 'deal' }).state).toEqual(act(s, { type: 'deal' }).state);
    expect(() => replay(g0, [{ type: 'rebet' }])).toThrow(/replay: action 0/);
    const bad = applyLogged(g0, [], { type: 'rebet' });
    expect(bad.log).toEqual([]);
  });
  it('deep-frozen inputs are never mutated', () => {
    let s = deepFreeze(createGame({ seed: 8, forced: [forced('Kh Kd 2c', '3s 4s')] }));
    for (const a of script) s = deepFreeze(act(s, a).state);
    s = deepFreeze(queueForced(s, [forced('3h Ad', '9s Kd')]));
    s = deepFreeze(act(s, { type: 'deal' }).state);
    s = deepFreeze(startShoe(s, { removed: { '5': 10 } }));
    expect(applyAction(s, { type: 'deal' }).ok).toBe(true);
  });
  it('the same seed deals the same cards', () => {
    const a = act(createGame({ seed: 5 }), { type: 'deal' }).state.lastResult!.hand;
    const b = act(createGame({ seed: 5 }), { type: 'deal' }).state.lastResult!.hand;
    const c = act(createGame({ seed: 6 }), { type: 'deal' }).state.lastResult!.hand;
    expect(a).toEqual(b);
    expect(a.player.cards.map(cardCode)).not.toEqual(c.player.cards.map(cardCode));
  });
});

describe('views and helpers', () => {
  it('visibleView hides the order and reports the unseen composition', () => {
    const g = act(createGame({ seed: 2 }), { type: 'deal' }).state;
    const v = visibleView(g);
    expect(v).not.toHaveProperty('shoe');
    expect(v.unseenRanks.reduce((a, b) => a + b, 0)).toBe(
      416 - g.shoe.exposed.reduce((a, b) => a + b, 0),
    );
    expect(v.shoeNo).toBe(1);
    expect(v.handInShoe).toBe(1);
    expect(v.nextHandNewShoe).toBe(false);
  });
  it('legalActions', () => {
    const g = createGame();
    expect(legalActions(g)).toEqual(['set-bet', 'deal']);
    const b = act(g, { type: 'set-bet', bet: 'player', amount: 500 }).state;
    expect(legalActions(b)).toEqual(['set-bet', 'clear-bets', 'deal']);
    const d = act(b, { type: 'deal' }).state;
    expect(legalActions(d)).toEqual(['set-bet', 'rebet', 'deal', 'new-shoe']);
    expect(legalActions({ ...d, bankroll: 0 })).toEqual(['deal', 'new-shoe']);
  });
  it('queueForced replaces the queue and validates', () => {
    const g = createGame({ forced: [forced('3h Ad', '9s Kd')] });
    expect(queueForced(g, []).forced).toEqual([]);
    expect(() => queueForced(g, [forced('Kh 2d', '3s 4s')])).toThrow(/queueForced/);
  });
  it('EZ: a forced 3-card 7 pushes the Banker and pays Dragon 7', () => {
    const g = createGame({
      rules: { variant: 'ez' },
      forced: [forced('3h 3d', '2s 3s 2h')],
      bets: { banker: 2000, 'dragon-7': 500 },
    });
    const r = act(g, { type: 'deal' });
    expect(r.state.lastResult!.net).toBe(20_000);
    expect(r.state.bankroll).toBe(50_000 + 20_000);
  });
});
