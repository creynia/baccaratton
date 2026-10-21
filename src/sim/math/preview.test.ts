import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import type { Slip, TableRules } from '../engine/types';
import { fullShoeRanks } from './distribution';
import { fullShoeEvs, perHourCents } from './edges';
import { add, frac, mul, sub, toFixed, ZERO } from './fraction';
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

  it('D42: the moved amount is at least the main minimum, and the saving uses it', () => {
    const a = preview({ tie: 100 }).alternative!;
    expect([a.from, a.to, a.amount]).toEqual(['tie', 'banker', 500]);
    expect(a.toEvCents).toEqual(
      mul(fullShoeEvs(PB).find((e) => e.bet === 'banker')!.ev, frac(500n)),
    );
    expect(a.savingPerHourCents).toEqual(mul(sub(a.toEvCents, a.fromEvCents), frac(72n)));
    expect(dollars(a.savingPerHourCents)).toBe('6.53');
    // $1 Dragon Bonus Player costs less than a $5 Banker: no alternative.
    expect(preview({ 'dragon-bonus-player': 100 }).alternative).toBeNull();
    // At or above the minimum the amount is unchanged.
    expect(preview({ tie: 1000 }).alternative!.amount).toBe(1000);
  });

  it('a ties-only shoe: formula "0 = 0.00000", no per-resolved edge, free, no alternative', () => {
    const ranks = new Array<number>(13).fill(0);
    ranks[8] = 6; // six nines: every hand is a natural 8-8 tie
    const p = preview({ banker: 1000, player: 500 }, PB, ranks);
    for (const bet of ['player', 'banker'] as const) {
      const e = p.sheet.find((x) => x.bet === bet)!;
      expect(e.why.formula).toBe('0 = 0.00000');
      expect(e.edgePerResolved).toBeUndefined();
      expect(e.tier).toBe('free');
    }
    expect(p.alternative).toBeNull();
    expect(p.needsConfirm).toEqual([]);
  });

  it('rejects more unseen cards than the shoe holds', () => {
    const ranks = fullShoeRanks(8);
    expect(() => preview({}, { ...PB, decks: 6 }, ranks)).toThrow(/6 decks hold 312/);
  });
});
