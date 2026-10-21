import { describe, expect, it } from 'vitest';
import { BETS, betDef, betsOffered, isOffered, DRAGON_BONUS_TABLE } from './bets';
import { DEFAULT_RULES, VARIANT_RULES } from './rules';
import { profitCents, settleHand } from './settle';
import { allOutcomes, allRules, handOf } from './test-helpers';
import { oracleSettle } from './__tests__/oracle';
import { BET_IDS } from './types';
import type { BetId, Payout, Slip, TableRules, TableauOutcome, VariantId } from './types';

const ez = VARIANT_RULES.ez;
const s6 = VARIANT_RULES['super-6'];
const pb = VARIANT_RULES['punto-banco'];

describe('bet registry', () => {
  it('has one BetDef per BetId, in BET_IDS order, with matching ids', () => {
    expect(Object.keys(BETS)).toEqual([...BET_IDS]);
    for (const id of BET_IDS) expect(betDef(id).id).toBe(id);
    expect(() => betDef('nope' as BetId)).toThrow(/Unknown bet/);
  });
  it('offers Dragon 7 and Panda 8 in EZ only (D3, D13)', () => {
    expect(betsOffered(pb)).toEqual([
      'player',
      'tie',
      'banker',
      'player-pair',
      'banker-pair',
      'dragon-bonus-player',
      'dragon-bonus-banker',
    ]);
    expect(betsOffered(s6)).toEqual(betsOffered(pb));
    expect(betsOffered(ez)).toEqual([...BET_IDS]);
    expect(isOffered('dragon-7', ez)).toBe(true);
    expect(isOffered('panda-8', pb)).toBe(false);
  });
  it('kinds, limits and bases follow section 1.4', () => {
    const main = BET_IDS.filter((b) => BETS[b].kind === 'main');
    expect(main).toEqual(['player', 'tie', 'banker']);
    expect(BET_IDS.filter((b) => BETS[b].limits === 'main')).toEqual(['player', 'banker']);
    expect(BETS['player-pair'].basis).toBe('player-pair');
    expect(BETS['banker-pair'].basis).toBe('banker-pair');
    for (const b of BET_IDS.filter((x) => !x.endsWith('-pair')))
      expect(BETS[b].basis).toBe('tableau');
  });
  it('payout text per variant and tie payout', () => {
    expect(BETS.banker.payoutText(pb)).toBe('Pays 1 to 1, less 5% commission');
    expect(BETS.banker.payoutText(ez)).toMatch(/3-card 7 pushes/);
    expect(BETS.banker.payoutText(s6)).toMatch(/6 pays 1 to 2/);
    expect(BETS.tie.payoutText(pb)).toBe('Pays 8 to 1');
    expect(BETS.tie.payoutText({ ...pb, tiePays: 9 })).toBe('Pays 9 to 1');
    expect(BETS.player.payoutText(pb)).toBe('Pays 1 to 1');
    for (const b of BET_IDS) expect(BETS[b].payoutText(ez).length).toBeGreaterThan(5);
    expect(DRAGON_BONUS_TABLE[9]).toBe(30);
  });
});

describe('settlement oracle (section 7.1)', () => {
  it('settle equals the independent oracle on 400 cells x pair flags x variants x tie pays x bets', () => {
    let n = 0;
    for (const rules of allRules())
      for (const o of allOutcomes())
        for (const bet of BET_IDS) {
          const p = betDef(bet).settle(o, rules);
          const want = oracleSettle(bet, o, rules, 2000);
          expect(p.result, `${bet} ${JSON.stringify(o)} ${rules.variant}`).toBe(want.result);
          expect(profitCents(2000, p)).toBe(want.net);
          n++;
        }
    expect(n).toBe(6 * 1600 * 9);
  }, 30_000);
  it('a bet reads only the outcome fields its basis names (perturbation property)', () => {
    const fields = (basis: string): (keyof TableauOutcome)[] =>
      basis === 'tableau'
        ? ['playerPair', 'bankerPair']
        : basis === 'player-pair'
          ? ['playerTotal', 'bankerTotal', 'playerCards', 'bankerCards', 'bankerPair']
          : ['playerTotal', 'bankerTotal', 'playerCards', 'bankerCards', 'playerPair'];
    const outcomes = allOutcomes();
    for (const rules of allRules())
      for (const bet of BET_IDS) {
        const def = betDef(bet);
        const outside = fields(def.basis);
        // Group outcomes by the fields inside the basis: every member must settle the same.
        const groups = new Map<string, string>();
        for (const o of outcomes) {
          const key = (Object.keys(o) as (keyof TableauOutcome)[])
            .filter((k) => !outside.includes(k))
            .map((k) => String(o[k]))
            .join();
          const got = JSON.stringify(def.settle(o, rules));
          const prev = groups.get(key);
          if (prev === undefined) groups.set(key, got);
          else expect(got, `${bet} varies outside its basis`).toBe(prev);
        }
      }
  }, 30_000);
  it('reasons are the documented ones', () => {
    const o = (pt: number, bt: number, pc: 2 | 3 = 2, bc: 2 | 3 = 2): TableauOutcome =>
      ({
        playerTotal: pt,
        bankerTotal: bt,
        playerCards: pc,
        bankerCards: bc,
        playerPair: false,
        bankerPair: false,
      }) as TableauOutcome;
    expect(BETS.banker.settle(o(4, 9), pb)).toEqual({
      result: 'win',
      gross: [1, 1],
      commission: [1, 20],
      reason: 'banker-commission',
    });
    expect(BETS.banker.settle(o(4, 7, 3, 3), ez).reason).toBe('ez-banker-three-card-7-push');
    expect(BETS.banker.settle(o(4, 7, 3, 2), ez).reason).toBe('side-wins');
    expect(BETS.banker.settle(o(4, 6, 3, 2), s6).reason).toBe('super-6-half');
    expect(BETS.banker.settle(o(5, 5), s6).reason).toBe('tie-push');
    expect(BETS.player.settle(o(5, 6), s6).reason).toBe('side-loses');
    expect(BETS['dragon-bonus-player'].settle(o(9, 8), pb).reason).toBe('natural-win');
    expect(BETS['dragon-bonus-player'].settle(o(8, 8), pb).reason).toBe('natural-tie-push');
    expect(BETS['dragon-bonus-player'].settle(o(8, 8, 3, 3), pb).reason).toBe('dragon-bonus-loses');
    expect(BETS['dragon-bonus-player'].settle(o(7, 4, 2, 3), pb).reason).toBe('margin-under-4');
    expect(BETS['dragon-bonus-banker'].settle(o(2, 7, 3, 3), pb).reason).toBe('win-by-margin');
    expect(BETS['dragon-bonus-banker'].settle(o(2, 7, 3, 3), pb).gross).toEqual([2, 1]);
    expect(BETS['dragon-7'].settle(o(6, 7, 2, 3), pb).reason).toBe('dragon-7');
    expect(BETS['panda-8'].settle(o(8, 7, 3, 2), ez).reason).toBe('panda-8');
    expect(BETS['panda-8'].settle(o(8, 7, 2, 2), ez).reason).toBe('no-panda-8');
  });
});

describe('profitCents rounding rule (section 1.5, D15)', () => {
  const w = (gross: [number, number], commission: [number, number] | null = null): Payout => ({
    result: 'win',
    gross,
    commission,
    reason: 'side-wins',
  });
  it('gross rounds down, commission rounds up (toward the house)', () => {
    expect(profitCents(2500, w([1, 1], [1, 20]))).toBe(2375);
    expect(profitCents(1, w([1, 2]))).toBe(0); // 0.5 cent gross -> 0
    expect(profitCents(1, w([1, 1], [1, 20]))).toBe(0); // 1 - ceil(0.05) = 0
    expect(profitCents(101, w([1, 1], [1, 20]))).toBe(95); // 101 - ceil(5.05) = 95
    expect(profitCents(333, w([1, 3]))).toBe(111);
    expect(profitCents(334, w([1, 3]))).toBe(111);
    expect(profitCents(500, { ...w([1, 1]), result: 'push' })).toBe(0);
    expect(profitCents(500, { ...w([1, 1]), result: 'lose' })).toBe(-500);
    expect(() => profitCents(1.5, w([1, 1]))).toThrow(RangeError);
    expect(() => profitCents(-1, w([1, 1]))).toThrow(RangeError);
  });
  it('never fires on the betUnit grid: every bet, variant, tie payout and amount is exact', () => {
    let checked = 0;
    for (const rules of allRules())
      for (const bet of BET_IDS) {
        const def = betDef(bet);
        const odds = new Set<string>();
        for (const o of allOutcomes()) {
          const p = def.settle(o, rules);
          if (p.result === 'win') odds.add(JSON.stringify([p.gross, p.commission]));
        }
        const [min, max] =
          def.limits === 'main' ? [rules.mainMin, rules.mainMax] : [rules.sideMin, rules.sideMax];
        for (const s of odds) {
          const [[g0, g1], c] = JSON.parse(s) as [[number, number], [number, number] | null];
          for (let a = min; a <= max; a += rules.betUnit) {
            expect((a * g0) % g1).toBe(0);
            if (c) expect((a * c[0]) % c[1]).toBe(0);
            checked++;
          }
        }
      }
    expect(checked).toBeGreaterThan(100_000);
  }, 30_000);
});

describe('golden settlements (section 1.5)', () => {
  const golden: [
    string,
    VariantId,
    string,
    string,
    Slip,
    number,
    Partial<Record<BetId, number>>,
  ][] = [
    ['P 7 vs B 6', 'punto-banco', '3h 4d', 'Ks 6c', { banker: 2500 }, -2500, { banker: -2500 }],
    ['B 9 natural vs P 4', 'punto-banco', '3h Ad', '9s Kd', { banker: 2500 }, 2375, {}],
    [
      'P 5 vs B 5, both 3 cards',
      'punto-banco',
      'Ah 2d 2c',
      'As 2s 2h',
      { player: 1000, tie: 500 },
      4000,
      { player: 0, tie: 4000 },
    ],
    [
      'P KsKh (0) vs B 6',
      'punto-banco',
      'Ks Kh Kd',
      '4c 2c',
      { 'player-pair': 500, player: 1000 },
      4500,
      { 'player-pair': 5500, player: -1000 },
    ],
    [
      'EZ: B 3-card 7 vs P 6',
      'ez',
      '3h 3d',
      '2s 3s 2h',
      { banker: 2000, 'dragon-7': 500 },
      20000,
      { banker: 0, 'dragon-7': 20000 },
    ],
    [
      'EZ: P 3-card 8 vs B 7',
      'ez',
      'Ah 2h 5d',
      '7s Kd',
      { 'panda-8': 500, player: 1000 },
      13500,
      { 'panda-8': 12500, player: 1000 },
    ],
    [
      'Super 6: B 6 (3 cards) vs P 5',
      'super-6',
      'Ah 2h 2d',
      'Ks 2s 4c',
      { banker: 2000 },
      1000,
      {},
    ],
    [
      'P 9 (3 cards) vs B 0 (3 cards)',
      'punto-banco',
      'Ah Kh 8d',
      'Ks Qs Jc',
      { 'dragon-bonus-player': 1000 },
      30000,
      {},
    ],
    [
      'P natural 8 vs B natural 8',
      'punto-banco',
      '3h 5h',
      '4s 4c',
      { 'dragon-bonus-player': 1000, banker: 1000 },
      0,
      { 'dragon-bonus-player': 0, banker: 0 },
    ],
    [
      'P 6 vs B 6, non-natural tie',
      'punto-banco',
      '2h 4d',
      'Ks 2s 4c',
      { 'dragon-bonus-banker': 1000, tie: 1000 },
      7000,
      { 'dragon-bonus-banker': -1000, tie: 8000 },
    ],
  ];
  it.each(golden)('%s', (_name, variant, p, b, slip, net, perBet) => {
    const rules: TableRules = VARIANT_RULES[variant];
    const r = settleHand(handOf(p, b), slip, rules);
    expect(r.net).toBe(net);
    expect(r.wagered).toBe(Object.values(slip).reduce((a, x) => a + x, 0));
    for (const [bet, profit] of Object.entries(perBet))
      expect(r.settlements.find((s) => s.bet === bet)?.profit).toBe(profit);
    // Settlements are in BET_IDS order and only for placed bets.
    expect(r.settlements.map((s) => s.bet)).toEqual(BET_IDS.filter((x) => (slip[x] ?? 0) > 0));
  });
  it('a $25 Banker natural win records the $1.25 commission', () => {
    const r = settleHand(handOf('3h Ad', '9s Kd'), { banker: 2500 }, DEFAULT_RULES);
    expect(r.settlements[0]).toEqual({
      bet: 'banker',
      amount: 2500,
      result: 'win',
      profit: 2375,
      commission: 125,
      reason: 'banker-commission',
    });
  });
  it('zero-amount entries are not placed bets', () => {
    const r = settleHand(handOf('3h Ad', '9s Kd'), { banker: 0, player: 500 }, DEFAULT_RULES);
    expect(r.settlements.map((s) => s.bet)).toEqual(['player']);
    expect(settleHand(handOf('3h Ad', '9s Kd'), {}, DEFAULT_RULES)).toMatchObject({
      settlements: [],
      wagered: 0,
      net: 0,
    });
  });
});
