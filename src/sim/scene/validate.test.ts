import { describe, expect, it } from 'vitest';
import { CONDITION_KINDS, validateScene } from './validate';

const ack = {
  id: 'a',
  text: 'Hello',
  allowedActions: [],
  completeWhen: { acknowledged: true },
  advance: 'button',
};
const ok = { id: 's1', version: 1, steps: [ack] };
const scene = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'x',
  version: 1,
  ...extra,
  steps,
});
const deal = (extra: Record<string, unknown>) => ({
  id: 'd',
  text: 'Deal',
  allowedActions: ['deal'],
  completeWhen: { hands: 1 },
  ...extra,
});
// P 3+2 = 5 draws 6 -> B K+5 = 5 draws (4-7) on a 6.
const bothDraw = { player: ['3h', '2c', '6d'], banker: ['Kd', '5s', '9c'] };
// P 7+K = 7 stands, B 4+J = 4 draws: Banker 4+J+5 = 9 wins.
const playerStands = { player: ['7c', 'Kh'], banker: ['4h', 'Jd', '5c'] };
const natural = { player: ['4s', '5d'], banker: ['Qh', '8c'] };

function errorsOf(json: unknown): string {
  const r = validateScene(json);
  return r.errors.join('\n');
}

describe('validateScene: shape (rule 1)', () => {
  it('accepts a minimal scene and returns it', () => {
    const r = validateScene(ok);
    expect(r.errors).toEqual([]);
    if (r.ok) expect(r.scene.id).toBe('s1');
  });
  it('accepts a scene with no steps (a free table)', () => {
    expect(validateScene({ id: 'free', version: 1, variant: 'ez' }).ok).toBe(true);
  });
  it('accepts history as road tokens (parseRoadString) or full entries', () => {
    const entry = { winner: 'tie', playerPair: false, bankerPair: false, natural: true, total: 8 };
    expect(errorsOf({ ...ok, history: ['B', 'Pp5', 'Tn8', entry] })).toBe('');
  });
  it.each([
    ['not a mapping', 'x'],
    ['no id', { version: 1 }],
    ['wrong version', { id: 'a', version: 2 }],
    ['unknown variant', { id: 'a', version: 1, variant: 'classic' }],
    ['unknown scene field', { id: 'a', version: 1, rules: { variant: 'ez' } }],
    ['unknown bet id', { id: 'a', version: 1, bets: { 'dragon-8': 500 } }],
    ['cents off the $1 grid', { id: 'a', version: 1, bets: { banker: 1050 } }],
    ['below the table minimum', { id: 'a', version: 1, bets: { banker: 300 } }],
    ['presets above the bankroll', { id: 'a', version: 1, bankroll: 1000, bets: { banker: 2000 } }],
    ['steps not a list', { id: 'a', version: 1, steps: {} }],
    ['history not a list', { id: 'a', version: 1, history: 'BBP' }],
    ['bad history token', { id: 'a', version: 1, history: ['B', 'X'] }],
    ['two tokens in one history code', { id: 'a', version: 1, history: ['BP'] }],
    ['step without id', scene([{ ...ack, id: undefined }])],
    ['duplicate step ids', scene([ack, ack])],
    ['step without text', scene([{ ...ack, text: '' }])],
    ['step without completeWhen', scene([{ id: 's', text: 't', allowedActions: [] }])],
    ['unknown condition', scene([{ ...ack, completeWhen: { nope: 1 } }])],
    ['empty all', scene([{ ...ack, completeWhen: { all: [] } }])],
    ['unknown action', scene([{ ...ack, allowedActions: ['place-bet'] }])],
    ['unknown step field', scene([{ ...ack, hand: 'player' }])],
    ['bad card code', scene([deal({ deals: [{ player: ['Xx', '2c'], banker: ['3d', '4d'] }] })])],
  ])('rejects: %s', (_name, json) => {
    const r = validateScene(json);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('checks nested conditions', () => {
    expect(
      validateScene(scene([deal({ completeWhen: { all: [{ hands: 1 }, { nope: true }] } })])).ok,
    ).toBe(false);
  });
  it('knows every Condition kind of the frozen types', () => {
    expect(CONDITION_KINDS).toHaveLength(15);
  });
});

describe('validateScene: no dead ends (rules 2-11)', () => {
  it('2. a forced hand must obey the tableau', () => {
    expect(
      errorsOf(scene([deal({ deals: [{ player: ['3h', '2c'], banker: ['Kd', '5s'] }] })])),
    ).toMatch(/Player draws/);
  });
  it('3. bets must be offered by the variant', () => {
    expect(errorsOf(scene([ack], { allowedBets: ['dragon-7'] }))).toMatch(/not offered/);
    expect(errorsOf(scene([ack], { variant: 'ez', allowedBets: ['dragon-7'] }))).toBe('');
    expect(
      errorsOf(
        scene([{ ...ack, completeWhen: { previewed: { bet: 'panda-8' } }, advance: undefined }]),
      ),
    ).toMatch(/not offered/);
  });
  it('4. deal lock: betting steps must not allow deal; dealing steps must', () => {
    const bet = {
      id: 'b',
      text: 'Bet',
      completeWhen: { betOnFelt: { bet: 'banker', minAmount: 1000 } },
    };
    expect(errorsOf(scene([bet]))).toMatch(/must not allow deal/);
    expect(errorsOf(scene([{ ...bet, allowedActions: ['set-bet', 'clear-bets'] }]))).toBe('');
    expect(errorsOf(scene([deal({ allowedActions: ['set-bet'] })]))).toMatch(/must allow deal/);
    expect(errorsOf(scene([{ ...ack, allowedActions: ['set-bet'] }]))).toMatch(
      /allowedActions: \[\]/,
    );
  });
  it('4. forced deals belong on a step that deals them', () => {
    expect(errorsOf(scene([{ ...ack, deals: [bothDraw] }]))).toMatch(
      /forced deals but does not allow deal/,
    );
  });
  it('5. handResult must be guaranteed by the forced deals, or have a hands fallback', () => {
    expect(errorsOf(scene([deal({ completeWhen: { handResult: { winner: 'player' } } })]))).toMatch(
      /not guaranteed/,
    );
    expect(
      errorsOf(
        scene([
          deal({ deals: [playerStands], completeWhen: { handResult: { winner: 'banker' } } }),
        ]),
      ),
    ).toBe('');
    expect(
      errorsOf(
        scene([deal({ completeWhen: { any: [{ handResult: { winner: 'tie' } }, { hands: 5 }] } })]),
      ),
    ).toBe('');
  });
  it('6. predictions need predict + pauseAt, a valid pause and enough forced hands', () => {
    const p = {
      id: 'p',
      text: 'Call it',
      allowedActions: ['deal'],
      completeWhen: { predicted: { count: 1 } },
    };
    expect(errorsOf(scene([{ ...p, deals: [bothDraw] }]))).toMatch(/needs predict/);
    expect(
      errorsOf(scene([{ ...p, deals: [bothDraw], predict: { kind: 'banker-draws' } }])),
    ).toMatch(/needs pauseAt/);
    expect(
      errorsOf(
        scene([
          { ...p, deals: [bothDraw], predict: { kind: 'player-draws' }, pauseAt: 'all-cards' },
        ]),
      ),
    ).toMatch(/cannot pause at/);
    expect(
      errorsOf(
        scene([
          { ...p, deals: [bothDraw], predict: { kind: 'banker-draws' }, pauseAt: 'two-cards' },
        ]),
      ),
    ).toMatch(/Player standing/);
    expect(
      errorsOf(
        scene([
          { ...p, deals: [playerStands], predict: { kind: 'banker-draws' }, pauseAt: 'two-cards' },
        ]),
      ),
    ).toBe('');
    expect(
      errorsOf(scene([{ ...p, predict: { kind: 'player-draws' }, pauseAt: 'two-cards' }])),
    ).toMatch(/exceeds/);
    expect(
      errorsOf(
        scene([
          {
            ...p,
            deals: [natural],
            skipNaturals: true,
            predict: { kind: 'player-draws' },
            pauseAt: 'two-cards',
          },
        ]),
      ),
    ).toMatch(/every forced hand is a natural/);
    expect(
      errorsOf(
        scene(
          [
            {
              ...p,
              completeWhen: { predicted: { correct: true, count: 3 } },
              predict: { kind: 'player-draws' },
              pauseAt: 'two-cards',
            },
          ],
          { onDealsExhausted: 'block' },
        ),
      ),
    ).toMatch(/onDealsExhausted: random/);
    expect(
      errorsOf(
        scene([{ ...p, deals: [bothDraw], predict: { kind: 'hand-total' }, pauseAt: 'two-cards' }]),
      ),
    ).toMatch(/side/);
  });
  it('7a. a study shoe with fewer than 40 cards before the cut forbids deal (D36)', () => {
    const removed = {
      '0': 111,
      '1': 28,
      '2': 27,
      '3': 27,
      '4': 27,
      '5': 27,
      '6': 27,
      '7': 27,
      '8': 32,
      '9': 31,
    };
    expect(errorsOf(scene([deal({})], { shoe: { removed } }))).toMatch(/before the cut card/);
    expect(errorsOf(scene([ack], { shoe: { removed } }))).toBe('');
    expect(errorsOf(scene([ack], { shoe: { removed: { '0': 5 } } }))).toMatch(/at least 11/);
  });
  it('7. UI targets exist', () => {
    const tap = (t: string) => ({ ...ack, completeWhen: { tapped: t }, advance: undefined });
    expect(errorsOf(scene([tap('big-road')], { ui: { roads: ['bead-plate'] } }))).toMatch(
      /ui.roads/,
    );
    expect(errorsOf(scene([tap('session')]))).toMatch(/showSession/);
    expect(errorsOf(scene([tap('shoe-tracker')]))).toMatch(/shoeTracker/);
    expect(errorsOf(scene([tap('commission')]))).toMatch(/Banker win/);
    expect(errorsOf(scene([deal({ deals: [playerStands] }), tap('commission')]))).toBe('');
    expect(
      errorsOf(scene([deal({ deals: [playerStands] }), tap('commission')], { variant: 'ez' })),
    ).toMatch(/punto-banco/);
    expect(
      errorsOf(
        scene([{ ...deal({}), completeWhen: { trackerPositive: {} } }], {
          ui: { shoeTracker: true },
        }),
      ),
    ).toMatch(/shoe setup/);
  });
  it('8. betOnFelt must be placeable', () => {
    const bet = (minAmount: number, extra = {}) => ({
      id: 'b',
      text: 'Bet',
      allowedActions: ['set-bet', 'clear-bets'],
      completeWhen: { betOnFelt: { bet: 'banker', minAmount } },
      ...extra,
    });
    expect(errorsOf(scene([bet(100_000)]))).toMatch(/more than the bankroll/);
    expect(errorsOf(scene([bet(300)]))).toMatch(/below the table minimum/);
    expect(errorsOf(scene([bet(1000, { allowedActions: ['clear-bets'] })]))).toMatch(
      /needs set-bet/,
    );
    expect(errorsOf(scene([bet(1000, { allowedBets: ['player'] })]))).toMatch(/not in allowedBets/);
    expect(errorsOf(scene([bet(1000)], { ui: { chips: [2500] } }))).toMatch(/cannot make/);
  });
  it('9. previews need the EV sheet', () => {
    const pv = { ...ack, completeWhen: { previewed: { bet: 'tie' } }, advance: undefined };
    expect(errorsOf(scene([pv], { showEV: false }))).toMatch(/showEV/);
    expect(errorsOf(scene([pv]))).toBe('');
  });
  it('10. auto-play needs autoPlay.enabled and a reachable length; run steps lock everything (D38)', () => {
    const run = {
      id: 'r',
      text: 'Run',
      allowedActions: [],
      completeWhen: { autoPlayCompleted: { minHands: 720 } },
    };
    expect(errorsOf(scene([run]))).toMatch(/autoPlay.enabled/);
    expect(errorsOf(scene([run], { autoPlay: { enabled: true, handOptions: [72] } }))).toMatch(
      /longest run/,
    );
    expect(errorsOf(scene([run], { autoPlay: { enabled: true } }))).toBe('');
    expect(
      errorsOf(scene([{ ...run, allowedActions: ['deal'] }], { autoPlay: { enabled: true } })),
    ).toMatch(/D38/);
  });
  it('11. acknowledged needs advance: button', () => {
    expect(errorsOf(scene([{ ...ack, advance: undefined }]))).toMatch(/advance: button/);
  });
});

describe('validateScene: inline cards in step text', () => {
  it('parses every {{…}} group in text, hint and math, with =N totals', () => {
    const step = (text: string, extra = {}) => scene([{ ...ack, text, ...extra }]);
    expect(errorsOf(step('Banker {{4h Jd =4}} draws'))).toBe('');
    expect(errorsOf(step('Banker {{4h Jd =}} draws'))).toBe('');
    expect(errorsOf(step('Banker {{4h Jd =5}} draws'))).toMatch(/total is 4, not 5/);
    expect(errorsOf(step('ok', { hint: 'See {{Zz}}' }))).toMatch(/hint: bad card group/);
    expect(errorsOf(step('ok', { math: '{{}}' }))).toMatch(/math: bad card group/);
  });
});
