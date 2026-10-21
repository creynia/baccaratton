import { describe, expect, it } from 'vitest';
import { money, moneyFrac, pct, roundFrac } from '../../src/app/format';
import { bankerRowText, describeCell, isCell, valueList } from '../../src/app/tableauText';
import { TABLEAU, bankerDraws } from '../../src/sim';

describe('format', () => {
  it('rounds fractions half away from zero, exactly', () => {
    expect(roundFrac(5n, 2n)).toBe(3n);
    expect(roundFrac(-5n, 2n)).toBe(-3n);
    expect(roundFrac(7n, -2n)).toBe(-4n);
  });
  it('formats money in cents with a real minus sign', () => {
    expect(money(2_375)).toBe('$23.75');
    expect(money(500_000)).toBe('$5,000');
    expect(money(-11, { cents: true })).toBe('−$0.11');
    expect(money(4_065, { sign: true })).toBe('+$40.65');
    expect(moneyFrac({ num: 76_17n * 3n, den: 3n })).toBe('$76.17');
  });
  it('formats exact percentages', () => {
    // Banker, punto-banco (curriculum.md section 6.1): 1.0579%
    const banker = { num: 114753351728n, den: 10847218479825n };
    expect(pct(banker, 2)).toBe('1.06%');
    expect(pct(banker, 3)).toBe('1.058%');
    expect(pct({ num: -1n, den: 8n }, 1)).toBe('−12.5%');
    expect(pct({ num: 0n, den: 1n }, 2)).toBe('0.00%');
  });
});

describe('tableau text (generated from the engine rules)', () => {
  it('collapses runs of values', () => {
    expect(valueList([2, 3, 4, 5, 6, 7])).toBe('2–7');
    expect(valueList([0, 1, 8, 9])).toBe('0, 1, 8, 9');
    expect(valueList([6, 7])).toBe('6, 7');
  });
  it('has one sentence per Banker row and agrees with bankerDraws', () => {
    expect(TABLEAU.map((_r, b) => bankerRowText(b))).toHaveLength(8);
    for (let b = 0; b <= 7; b++)
      for (let p = 0; p <= 9; p++) {
        const said = describeCell(`b${b}/p${p}`)!;
        const draws = bankerDraws(b as 0, 0, p as 0).draws;
        expect(said.endsWith(draws ? 'draws.' : 'stands.')).toBe(true);
      }
  });
  it('describes Player, stood and natural cells, and rejects unknown ones', () => {
    expect(describeCell('p5')).toBe('Player 5: the Player draws.');
    expect(describeCell('p6')).toBe('Player 6: the Player stands.');
    expect(describeCell('p9')).toMatch(/natural/);
    expect(describeCell('b6/s')).toBe('Banker 6, the Player stood: the Banker stands.');
    expect(describeCell('b5/s')).toBe('Banker 5, the Player stood: the Banker draws.');
    expect(describeCell('nat')).toMatch(/both hands stand/);
    expect(isCell('b8/p1')).toBe(false);
    expect(describeCell('b8/p1')).toBeNull();
  });
});
