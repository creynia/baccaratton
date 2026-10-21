import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import type { BetId, TableRules, VariantId } from '../engine/types';
import { outcomeDistribution } from './distribution';
import { fullShoeEvs } from './edges';
import { betEvs } from './evs';
import { fmtNet, fmtPercent } from './explain';
import { frac, sum, toFixed } from './fraction';
import { mulberry32, randomRanks } from './__tests__/reference';

const evOf = (variant: VariantId, bet: BetId) =>
  fullShoeEvs(VARIANT_RULES[variant]).find((e) => e.bet === bet)!;

describe('"Why?" rows (section 2.6)', () => {
  it('Banker (punto-banco): counts, nets, formula and note', () => {
    const w = evOf('punto-banco', 'banker').why;
    expect(w.casesLabel).toBe('orderings of the next six cards');
    expect(w.rows.map((r) => [r.id, r.count, toFixed(r.net, 2)])).toEqual([
      ['win', 2_292_252_566_437_888n, '0.95'],
      ['push', 475_627_426_473_216n, '0.00'],
      ['lose', 2_230_518_282_592_256n, '-1.00'],
    ]);
    expect(w.rows.every((r) => r.outOf === 4_998_398_275_503_360n)).toBe(true);
    expect(w.rows[0]!.label).toBe('Banker wins (you get 0.95)');
    expect(w.formula).toBe('0.4586 × 0.95 − 0.4462 × 1 = −0.01058');
    expect(w.note).toBe(
      'Banker wins more often, so the casino charges 5% on Banker wins. Excluding ties the edge is 1.17%.',
    );
  });

  it('Player note and EZ / Super 6 Banker rows', () => {
    expect(evOf('punto-banco', 'player').why.note).toBe(
      'Ties push: excluding ties the edge is 1.36%.',
    );
    expect(evOf('ez', 'banker').why.rows.map((r) => r.id)).toEqual([
      'win',
      'win-3card-7-push',
      'push',
      'lose',
    ]);
    const s6 = evOf('super-6', 'banker').why.rows;
    expect(s6.map((r) => [r.id, fmtNet(r.net)])).toEqual([
      ['win', '1'],
      ['win-6-half', '0.5'],
      ['push', '0'],
      ['lose', '−1'],
    ]);
    expect(toFixed(s6[1]!.probability, 6)).toBe('0.053864');
  });

  it('Player Pair over two-card starts', () => {
    const w = evOf('punto-banco', 'player-pair').why;
    expect(w.casesLabel).toBe('two-card starts');
    expect(w.rows.map((r) => [r.id, r.count, r.outOf])).toEqual([
      ['win', 12_896n, 172_640n],
      ['lose', 159_744n, 172_640n],
    ]);
    expect(w.rows[0]!.probability).toEqual(frac(31n, 415n));
    expect(w.formula).toBe('0.0747 × 11 − 0.9253 × 1 = −0.10361');
  });

  it('Dragon Bonus Player and Banker rows', () => {
    const pct = (b: BetId) =>
      evOf('punto-banco', b).why.rows.map((r) => [r.id, fmtPercent(r.probability, 4)]);
    expect(pct('dragon-bonus-player')).toEqual([
      ['natural-win', '16.2589%'],
      ['natural-tie-push', '1.7871%'],
      ['margin-9', '0.3683%'],
      ['margin-8', '0.6822%'],
      ['margin-7', '1.7924%'],
      ['margin-6', '2.8257%'],
      ['margin-5', '3.3244%'],
      ['margin-4', '3.7368%'],
      ['lose', '69.2242%'],
    ]);
    expect(pct('dragon-bonus-banker')).toEqual([
      ['natural-win', '16.2589%'],
      ['natural-tie-push', '1.7871%'],
      ['margin-9', '0.3079%'],
      ['margin-8', '0.5663%'],
      ['margin-7', '1.5909%'],
      ['margin-6', '2.3848%'],
      ['margin-5', '3.1465%'],
      ['margin-4', '4.0242%'],
      ['lose', '69.9334%'],
    ]);
    expect(evOf('punto-banco', 'dragon-bonus-player').why.rows[2]!.label).toBe(
      'Player wins by 9 (you get 30)',
    );
  });

  it(
    'rows sum exactly to the EV, for every bet, variant and 20 depleted shoes',
    { timeout: 60_000 },
    () => {
      const rnd = mulberry32(99);
      const all: TableRules[] = [
        VARIANT_RULES['punto-banco'],
        VARIANT_RULES.ez,
        VARIANT_RULES['super-6'],
      ];
      for (let i = 0; i < 20; i++) {
        const dist = outcomeDistribution(randomRanks(rnd, 6 + Math.floor(rnd() * 400)));
        for (const rules of all) {
          for (const e of betEvs(dist, rules)) {
            expect(sum(e.why.rows.map((r) => r.contribution))).toEqual(e.ev);
            for (const r of e.why.rows) expect(r.probability).toEqual(frac(r.count, r.outOf));
          }
        }
      }
    },
  );
});
