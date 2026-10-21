import { describe, expect, it } from 'vitest';
import { betDef } from '../engine/bets';
import { VARIANT_RULES } from '../engine/rules';
import type { BetId, TableRules, TiePays, VariantId } from '../engine/types';
import { fullShoeRanks, outcomeDistribution } from './distribution';
import { fullShoeEvs, PINNED, PINNED_PER_RESOLVED } from './edges';
import { betEvs, betEvsWith, payoutNet } from './evs';
import { frac, mul, toFixed } from './fraction';
import type { BetEv } from './types';

const rulesOf = (variant: VariantId, tiePays: TiePays = 8): TableRules => ({
  ...VARIANT_RULES[variant],
  tiePays,
});
const evOf = (rules: TableRules, bet: BetId): BetEv => {
  const e = fullShoeEvs(rules).find((x) => x.bet === bet);
  if (!e) throw new Error(`${bet} not offered`);
  return e;
};

describe('pinned full-shoe values (simulator.md 2.5)', () => {
  it.each(PINNED.map((p) => [`${p.bet} (${p.variant}, tie ${p.tiePays}:1)`, p] as const))(
    '%s',
    (_name, p) => {
      const e = evOf(rulesOf(p.variant, p.tiePays), p.bet);
      expect(e.ev).toEqual(p.ev);
      expect(e.edge).toEqual({ num: -p.ev.num, den: p.ev.den });
      expect(toFixed(e.pWin, 6)).toBe(p.pWin);
      expect(toFixed(e.pPush, 6)).toBe(p.pPush);
      expect(e.sd.toFixed(4)).toBe(p.sd);
      expect(toFixed(mul(e.edge, frac(10n * 72n)), 2)).toBe(p.perHour);
      expect(e.offered).toBe(true);
    },
  );

  it('per resolved bet (ties excluded) for Player and Banker only', () => {
    const pb = rulesOf('punto-banco');
    expect(evOf(pb, 'banker').edgePerResolved).toEqual(PINNED_PER_RESOLVED.banker);
    expect(evOf(pb, 'player').edgePerResolved).toEqual(PINNED_PER_RESOLVED.player);
    expect(evOf(pb, 'tie').edgePerResolved).toBeUndefined();
    expect(evOf(pb, 'dragon-bonus-player').edgePerResolved).toBeUndefined();
  });

  it('full-shoe tiers (section 2.4)', () => {
    const tiers = (r: TableRules) => Object.fromEntries(fullShoeEvs(r).map((e) => [e.bet, e.tier]));
    expect(tiers(rulesOf('punto-banco'))).toEqual({
      player: 'good',
      tie: 'sucker',
      banker: 'good',
      'player-pair': 'sucker',
      'banker-pair': 'sucker',
      'dragon-bonus-player': 'fair',
      'dragon-bonus-banker': 'sucker',
    });
    expect(tiers(rulesOf('ez'))).toMatchObject({
      banker: 'good',
      'dragon-7': 'costly',
      'panda-8': 'sucker',
    });
    expect(tiers(rulesOf('super-6')).banker).toBe('good');
    expect(evOf(rulesOf('punto-banco', 9), 'tie').tier).toBe('fair');
  });

  it('sheet lists exactly the offered bets in BET_IDS order', () => {
    expect(fullShoeEvs(rulesOf('ez')).map((e) => e.bet)).toEqual([
      'player',
      'tie',
      'banker',
      'player-pair',
      'banker-pair',
      'dragon-bonus-player',
      'dragon-bonus-banker',
      'panda-8',
      'dragon-7',
    ]);
    expect(fullShoeEvs(rulesOf('super-6')).map((e) => e.bet)).not.toContain('dragon-7');
  });

  it('the memo is deep-frozen', () => {
    const e = fullShoeEvs(rulesOf('punto-banco'))[0]!;
    expect(Object.isFrozen(fullShoeEvs(rulesOf('punto-banco')))).toBe(true);
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.ev)).toBe(true);
    expect(Object.isFrozen(e.why.rows)).toBe(true);
    expect(Object.isFrozen(e.why.rows[0])).toBe(true);
  });

  it('memoises per rules and recomputes for other decks', () => {
    const r = rulesOf('punto-banco');
    expect(fullShoeEvs(r)).toBe(fullShoeEvs({ ...r }));
    const six = fullShoeEvs({ ...r, decks: 6 });
    expect(six).not.toBe(fullShoeEvs(r));
    expect(six.find((e) => e.bet === 'player-pair')!.ev).toEqual(frac(11n * 23n - 288n, 311n));
  });
});

describe('one source of truth', () => {
  it('payoutNet converts registry payouts', () => {
    expect(
      payoutNet({ result: 'win', gross: [1, 1], commission: [1, 20], reason: 'banker-commission' }),
    ).toEqual(frac(19n, 20n));
    expect(
      payoutNet({ result: 'win', gross: [1, 2], commission: null, reason: 'super-6-half' }),
    ).toEqual(frac(1n, 2n));
    expect(
      payoutNet({ result: 'push', gross: [0, 1], commission: null, reason: 'tie-push' }),
    ).toEqual(frac(0n));
    expect(
      payoutNet({ result: 'lose', gross: [0, 1], commission: null, reason: 'side-loses' }),
    ).toEqual(frac(-1n));
  });

  it('a changed registry payout changes the EV (nothing is restated)', () => {
    const rules = rulesOf('punto-banco');
    const dist = outcomeDistribution(fullShoeRanks(8));
    const tie9 = betEvsWith(dist, rules, (id) =>
      id === 'tie'
        ? { ...betDef('tie'), settle: (o) => betDef('tie').settle(o, { ...rules, tiePays: 9 }) }
        : betDef(id),
    );
    expect(tie9.find((e) => e.bet === 'tie')!.ev).toEqual(frac(-63053127805n, 1301666217579n));
    expect(betEvs(dist, rules).find((e) => e.bet === 'tie')!.ev).toEqual(
      frac(-103841353768n, 723147898655n),
    );
  });

  it('probabilities sum to 1 and sd is consistent for every bet and variant', () => {
    for (const v of ['punto-banco', 'ez', 'super-6'] as const) {
      for (const e of fullShoeEvs(rulesOf(v))) {
        const s = frac(
          e.pWin.num * e.pPush.den * e.pLose.den +
            e.pPush.num * e.pWin.den * e.pLose.den +
            e.pLose.num * e.pWin.den * e.pPush.den,
          e.pWin.den * e.pPush.den * e.pLose.den,
        );
        expect(s).toEqual(frac(1n));
        expect(e.sd).toBeGreaterThan(0);
      }
    }
  });
});
