import { describe, expect, it } from 'vitest';
import { betDef } from '../engine/bets';
import { VARIANT_RULES } from '../engine/rules';
import { BET_IDS } from '../engine/types';
import { fixturePreview, fixtureSheet, forcedHand, settled } from './fixtures';
import {
  BET_LABEL,
  MINUS,
  alternativeText,
  bestMainBet,
  commissionLine,
  frac,
  fracToNumber,
  money,
  moneyC,
  pct,
  resultAnnouncement,
  suckerPrompt,
  tierOfEdge,
} from './text';

const PB = VARIANT_RULES['punto-banco'];

describe('money and percentages', () => {
  it('formats cents with a real minus and no wrap-prone hyphen', () => {
    expect(money(2375)).toBe('$23.75');
    expect(money(3500)).toBe('$35');
    expect(money(3500, { sign: true, cents: 'always' })).toBe('+$35.00');
    expect(money(-170)).toBe(`${MINUS}$1.70`);
    expect(money(123_456_700)).toBe('$1,234,567');
    expect(moneyC(frac(-10579n, 1000n))).toBe(`${MINUS}$0.11`);
    expect(money(0, { sign: true })).toBe('$0');
  });
  it('rounds fractions of a cent half away from zero', () => {
    expect(moneyC(frac(-25n, 10n))).toBe(`${MINUS}$0.03`);
    expect(moneyC(frac(25n, 10n))).toBe('$0.03');
  });
  it('percentages', () => {
    expect(pct(frac(114753351728n, 10847218479825n))).toBe('1.06%');
    expect(pct(frac(-103841353768n, 723147898655n))).toBe(`${MINUS}14.36%`);
    expect(fracToNumber(frac(1n, 3n))).toBeCloseTo(1 / 3, 14);
  });
});

describe('tiers (D19)', () => {
  it('uses the exact boundaries', () => {
    expect(tierOfEdge(frac(0n))).toBe('free');
    expect(tierOfEdge(frac(-1n, 100n))).toBe('free');
    expect(tierOfEdge(frac(2n, 100n))).toBe('good');
    expect(tierOfEdge(frac(201n, 10000n))).toBe('fair');
    expect(tierOfEdge(frac(5n, 100n))).toBe('fair');
    expect(tierOfEdge(frac(899n, 10000n))).toBe('costly');
    expect(tierOfEdge(frac(9n, 100n))).toBe('sucker');
  });
  it('pinned full-shoe tiers match simulator.md §2.4', () => {
    const t = (v: keyof typeof VARIANT_RULES, tie: 8 | 9 = 8) =>
      Object.fromEntries(
        fixtureSheet({ ...VARIANT_RULES[v], tiePays: tie }).map((b) => [b.bet, b.tier]),
      );
    expect(t('punto-banco')).toMatchObject({
      banker: 'good',
      player: 'good',
      tie: 'sucker',
      'player-pair': 'sucker',
      'dragon-bonus-player': 'fair',
      'dragon-bonus-banker': 'sucker',
    });
    expect(t('punto-banco', 9).tie).toBe('fair');
    expect(t('ez')).toMatchObject({ 'dragon-7': 'costly', 'panda-8': 'sucker', banker: 'good' });
  });
});

describe('labels and copy', () => {
  it('bet labels equal the engine registry', () => {
    for (const b of BET_IDS) expect(BET_LABEL[b]).toBe(betDef(b).label);
  });
  it('the cheapest main bet is Banker, or Player in Super 6 (D31)', () => {
    expect(bestMainBet(fixtureSheet(PB))).toBe('banker');
    expect(bestMainBet(fixtureSheet(VARIANT_RULES.ez))).toBe('banker');
    expect(bestMainBet(fixtureSheet(VARIANT_RULES['super-6']))).toBe('player');
  });
  it('Tie alternative copy (simulator.md §2.6)', () => {
    const p = fixturePreview(PB, { tie: 1000 });
    expect(p.alternative?.to).toBe('banker');
    const s = alternativeText(p.alternative!, p.sheet, PB, 72);
    expect(s).toContain('$0.11 per $10 hand instead of $1.44');
    expect(s).toContain('$95.77 less per hour');
    expect(s).toContain('9 to 1 table (4.84%)');
  });
  it('the Player tip saves $1.28 an hour at $10 (D30)', () => {
    const p = fixturePreview(PB, { player: 1000 });
    expect(alternativeText(p.alternative!, p.sheet, PB, 72)).toContain('$1.28 an hour');
  });
  it('Sucker prompt', () => {
    const tie = fixtureSheet(PB).find((b) => b.bet === 'tie')!;
    expect(suckerPrompt('tie', tie.ev, 1000)).toBe(
      'Tie loses $1.44 per $10 on average. Bet it anyway?',
    );
  });
  it('settlement text with the commission line (D35)', () => {
    const r = settled(forcedHand('Kh 2d 3c', '4s 3h'), { banker: 2500 }, PB);
    expect(commissionLine(r, PB)).toBe('$1.25 commission (5% of $25)');
    expect(resultAnnouncement(r, PB)).toBe(
      'Banker wins 7 to 5. You win $23.75. $1.25 commission (5% of $25).',
    );
  });
});
