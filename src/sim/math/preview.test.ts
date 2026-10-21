import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import type { Slip, TableRules } from '../engine/types';
import { fullShoeRanks } from './distribution';
import { fullShoeEvs, perHourCents } from './edges';
import { add, frac, mul, toFixed, ZERO } from './fraction';
import { cheapestMain, previewSlip } from './preview';

const PB = VARIANT_RULES['punto-banco'];
const dollars = (f: { num: bigint; den: bigint }) => toFixed(mul(f, frac(1n, 100n)), 2);
const preview = (slip: Slip, rules: TableRules = PB, unseenRanks?: number[]) =>
  previewSlip({ rules, slip, handsPerHour: 72, ...(unseenRanks ? { unseenRanks } : {}) });

describe('previewSlip', () => {
  it('Banker $25 + Tie $10: the slip footer of section 2.6', () => {
    const p = preview({ banker: 2500, tie: 1000 });
    expect(p.source).toBe('full-shoe');
    expect(p.cardsLeft).toBe(416);
    expect(p.exact).toBe(true);
    expect(p.totalWagered).toBe(3500);
    expect(dollars(p.totalEvCents)).toBe('-1.70');
    expect(dollars(p.perHourCents)).toBe('-122.43');
    expect(p.lines.map((l) => [l.bet, l.amount, l.tier])).toEqual([
      ['tie', 1000, 'sucker'],
      ['banker', 2500, 'good'],
    ]);
    expect(dollars(p.lines[1]!.evCents)).toBe('-0.26');
    expect(p.needsConfirm).toEqual(['tie']);
  });

  it('lines sum to the totals; per hour = 72 × per hand', () => {
    const p = preview({ player: 500, 'player-pair': 100, 'dragon-bonus-banker': 300 });
    expect(p.lines.reduce((a, l) => add(a, l.evCents), ZERO)).toEqual(p.totalEvCents);
    for (const l of p.lines) expect(l.perHourCents).toEqual(mul(l.evCents, frac(72n)));
    expect(p.perHourCents).toEqual(mul(p.totalEvCents, frac(72n)));
    expect(p.needsConfirm).toEqual(['player-pair', 'dragon-bonus-banker']);
  });

  it('the sheet is every offered bet in BET_IDS order, from the memoised full shoe', () => {
    expect(preview({}).sheet).toBe(fullShoeEvs(PB));
    expect(preview({}, VARIANT_RULES.ez).sheet.map((e) => e.bet)).toContain('dragon-7');
    expect(preview({}).alternative).toBeNull();
    expect(preview({}).lines).toEqual([]);
  });

  it('Tie → Banker: "$95.77 less per hour" for $10', () => {
    const a = preview({ tie: 1000 }).alternative!;
    expect(a.from).toBe('tie');
    expect(a.to).toBe('banker');
    expect(a.amount).toBe(1000);
    expect(dollars(a.fromEvCents)).toBe('-1.44');
    expect(dollars(a.toEvCents)).toBe('-0.11');
    expect(dollars(a.savingPerHourCents)).toBe('95.77');
  });

  it('Player → Banker tip in punto-banco and EZ ($1.28/h at $10); Banker → Player in Super 6', () => {
    const pb = preview({ player: 1000 }).alternative!;
    expect([pb.from, pb.to, dollars(pb.savingPerHourCents)]).toEqual(['player', 'banker', '1.28']);
    expect(preview({ player: 1000 }, VARIANT_RULES.ez).alternative!.to).toBe('banker');
    const s6 = preview({ banker: 1000 }, VARIANT_RULES['super-6']).alternative!;
    expect([s6.from, s6.to, dollars(s6.savingPerHourCents)]).toEqual(['banker', 'player', '1.61']);
    expect(preview({ banker: 1000 }).alternative).toBeNull();
    expect(preview({ player: 1000 }, VARIANT_RULES['super-6']).alternative).toBeNull();
  });

  it('a costly side bet moves to the cheapest main bet (D31), largest saving wins', () => {
    expect(cheapestMain(fullShoeEvs(VARIANT_RULES['super-6'])).bet).toBe('player');
    const a = preview(
      { 'dragon-7': 500, 'player-pair': 100, player: 1000 },
      VARIANT_RULES.ez,
    ).alternative!;
    expect([a.from, a.to]).toEqual(['dragon-7', 'banker']);
    const b = preview({ 'dragon-bonus-player': 2500 }, VARIANT_RULES['super-6']).alternative!;
    expect([b.from, b.to]).toEqual(['dragon-bonus-player', 'player']);
  });

  it('current shoe source and stale bets', () => {
    const ranks = fullShoeRanks(8);
    ranks[4] = 0; // no fives: Banker gains
    const p = preview({ banker: 1000, 'dragon-7': 500 }, PB, ranks);
    expect(p.source).toBe('current-shoe');
    expect(p.cardsLeft).toBe(384);
    expect(p.lines.map((l) => l.bet)).toEqual(['banker']); // Dragon 7 is not offered here
    expect(p.sheet.find((e) => e.bet === 'banker')!.ev).not.toEqual(
      fullShoeEvs(PB).find((e) => e.bet === 'banker')!.ev,
    );
  });

  it('perHourCents rejects fractional hands', () => {
    expect(perHourCents(frac(1n), 72)).toEqual(frac(72n));
    expect(() => perHourCents(frac(1n), 1.5)).toThrow();
  });
});
