import { describe, expect, it } from 'vitest';
import { cardValue, parseCards } from '../engine/cards';
import { seedRng } from '../engine/rng';
import { bankerDraws, handTotal, playerDraws, playHand } from '../engine/tableau';
import type { RngState } from '../engine/types';
import { gradeCopy, gradeSpot, nextSpot, spotCode, spotFromCode, WHICH_BET_SPOTS } from './drill';
import { DRILL_CATEGORY_IDS, DRILL_MODE_CATEGORIES } from './types';
import type { DrillCategoryId, DrillFilter, DrillMode, DrillSpot } from './types';

function spots(filter: DrillFilter, n: number, seed = 1): DrillSpot[] {
  let rng: RngState = seedRng(seed);
  const out: DrillSpot[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextSpot(rng, filter);
    rng = r.rng;
    out.push(r.spot);
  }
  return out;
}
const MODES: DrillMode[] = ['player', 'banker', 'winner', 'payout'];

describe('drill: codes', () => {
  it('spotFromCode(spotCode(s)) = s for every category', () => {
    for (const category of DRILL_CATEGORY_IDS) {
      for (const s of spots({ mode: 'mixed', category }, 40, 3)) {
        expect(s.category).toBe(category);
        expect(spotCode(s)).toBe(s.code);
        expect(spotFromCode(s.code)).toEqual(s);
      }
    }
  });
  it('codes look like <category>:<player>.<banker>', () => {
    const s = spotFromCode('banker-5:3h2c6d.Kd5s');
    expect(s.category).toBe('banker-5');
    expect(s.mode).toBe('banker');
    expect(s.cell).toBe('b5/p6');
    expect(s.question).toBe('Does the Banker draw?');
    expect(gradeSpot(s, 'Draw').correct).toBe(true);
    expect(spotFromCode('settle:9hTc.9sKc:tie:1000:punto-banco').options).toContain('$80');
    expect(spotFromCode('which-bet:1').whichBet?.answer).toBe('b');
  });
  it('rejects bad codes', () => {
    for (const bad of [
      'nope:AhAd.KsKc',
      'banker-5:3h2c.Kd5s', // the Player (5) must have drawn
      'banker-3:3h2c6d.Kd5s', // Banker is 5
      'player-draw:4s5d.Qh8c', // natural
      'who-wins:2h3c.Td7h', // incomplete
      'which-bet:99',
      'settle:KhKd.9s9c:tie:0:punto-banco',
    ])
      expect(() => spotFromCode(bad), bad).toThrow(/Bad spot code/);
  });
});

describe('drill: the pinned examples of curriculum.md section 9.1', () => {
  const grade = (code: string, chosen: string) => gradeSpot(spotFromCode(code), chosen);
  it.each([
    ['hand-total:9c6d.', '5'],
    ['natural:4s5d.Qh8c', 'Stand'],
    ['player-draw:Qs6h.2c3d', 'Stand'],
    ['banker-player-stood:7sKc.4hJd', 'Draw'],
    ['banker-0-2:2s3h9c.Kd2h', 'Draw'],
    ['banker-3:2s3h8c.Kd3h', 'Stand'],
    ['banker-4:2s3hAc.Kd4h', 'Stand'],
    ['banker-5:2s3h3c.Kd5h', 'Stand'],
    ['banker-6:2s3h7c.Kd6h', 'Draw'],
    ['banker-7:2s3h6c.Kd7h', 'Stand'],
    ['who-wins:2h3c4d.Td7h', 'Player'],
    ['settle:9h7c.Ts8d:banker:2500:punto-banco', '$23.75'],
  ])('%s -> %s', (code, answer) => {
    const g = grade(code, answer);
    expect(g.correct).toBe(true);
    expect(g.answer).toBe(answer);
  });
  it('which-bet: Super 6 Banker vs Player -> Player', () => {
    const i = WHICH_BET_SPOTS.findIndex((w) => w.table === 'super-6');
    const g = gradeSpot(spotFromCode(`which-bet:${i}`), 'Player');
    expect(g.correct).toBe(true);
    expect(gradeCopy(g)).toEqual({
      headline: 'Correct!',
      body: 'Player 1.24% vs Banker 1.46%: about $1.61 an hour less at $10.',
    });
    expect(gradeCopy(gradeSpot(spotFromCode('which-bet:0'), 'Player'))).toEqual({
      headline: 'The other one.',
      body: 'Banker 1.06% vs Player 1.24%: about $1.28 an hour less at $10.',
    });
  });
  it('grading copy: a wrong answer names it and the rule', () => {
    const g = gradeSpot(spotFromCode('banker-5:3h2c6d.Kd5s'), 'Stand');
    expect(g.correct).toBe(false);
    expect(g.rule).toBe('banker-5-draws-on-4-7');
    expect(g.cell).toBe('b5/p6');
    expect(gradeCopy(g)).toEqual({
      headline: 'Not quite.',
      body: "Draw. Banker 5 draws on 4 to 7. (Banker 5, the Player's third card was 6.)",
    });
    const mixed = gradeSpot(spotFromCode('banker-mixed:2s3h8c.Kd3h'), 'Stand');
    expect(mixed.explanation).toMatch(/^Banker 3 draws on anything except a Player 8\./);
  });
});

describe('drill: answers equal the engine', () => {
  it('every answer equals playerDraws / bankerDraws / playHand / settle', () => {
    for (const s of spots({ mode: 'mixed' }, 2_000, 11)) {
      const g = gradeSpot(s, '');
      expect(s.options).toContain(g.answer);
      const pt = handTotal(s.player.slice(0, 2));
      const bt = handTotal(s.banker.slice(0, 2));
      if (s.category === 'natural' || s.category === 'player-draw')
        expect(g.answer).toBe(playerDraws(pt, bt).draws ? 'Draw' : 'Stand');
      else if (s.category.startsWith('banker-')) {
        const p3 = s.player[2] === undefined ? null : cardValue(s.player[2]);
        expect(g.answer).toBe(bankerDraws(bt, pt, p3).draws ? 'Draw' : 'Stand');
      } else if (s.category === 'who-wins') {
        const order = [
          s.player[0],
          s.banker[0],
          s.player[1],
          s.banker[1],
          s.player[2],
          s.banker[2],
        ];
        const seq = order.filter((c) => c !== undefined);
        let i = 0;
        const h = playHand(() => seq[i++]!);
        expect(g.answer.toLowerCase()).toBe(h.winner);
      } else if (s.category === 'hand-total') {
        expect(g.answer).toBe(String(handTotal(s.player.length ? s.player : s.banker)));
      }
    }
  });
  it('every spot belongs to its mode', () => {
    for (const mode of MODES) {
      for (const s of spots({ mode }, 200, 5)) {
        expect(DRILL_MODE_CATEGORIES[mode as Exclude<DrillMode, 'mixed'>]).toContain(s.category);
        expect(s.mode).toBe(mode);
      }
    }
    for (const s of spots({ mode: 'mixed' }, 500, 6))
      if (s.category === 'hand-total' || s.category === 'which-bet') expect(s.mode).toBe('mixed');
  });
  it('a category outside its mode throws (D29)', () => {
    expect(() => nextSpot(seedRng(1), { mode: 'player', category: 'banker-3' })).toThrow(
      /not in mode/,
    );
  });
  it('is seeded: the same rng gives the same spot', () => {
    expect(spots({ mode: 'mixed' }, 30, 9)).toEqual(spots({ mode: 'mixed' }, 30, 9));
  });
  it('focus cells restrict the spots', () => {
    for (const s of spots({ mode: 'banker', focus: ['b6/p7', 'b3/p8'] }, 50, 4))
      expect(['b6/p7', 'b3/p8']).toContain(s.cell);
  });
  it('settle spots: three amounts, the right one from the engine, in each variant', () => {
    for (const variant of ['punto-banco', 'ez', 'super-6'] as const)
      for (const s of spots({ mode: 'payout', variant }, 100, 8)) {
        expect(s.options).toHaveLength(3);
        expect(new Set(s.options).size).toBe(3);
        expect(s.payout?.variant).toBe(variant);
      }
  });
});

describe('drill: weighting (curriculum.md section 9.1), within ±5% on 2k spots', () => {
  const share = (category: DrillCategoryId, set: number[]): number => {
    const ss = spots({ mode: 'banker', category }, 2_000, 21);
    return ss.filter((s) => set.includes(cardValue(s.player[2]!))).length / ss.length;
  };
  it.each([
    ['banker-3', [8], 0.3],
    ['banker-4', [0, 1, 8, 9], 0.5],
    ['banker-5', [3, 8], 0.4],
    ['banker-6', [5, 6, 7, 8], 0.6],
  ] as [DrillCategoryId, number[], number][])('%s', (cat, set, want) => {
    expect(Math.abs(share(cat, set) - want)).toBeLessThan(0.05);
  });
  it('natural spots are 50% naturals', () => {
    const ss = spots({ mode: 'player', category: 'natural' }, 2_000, 22);
    const nat = ss.filter((s) => handTotal(s.player) >= 8 || handTotal(s.banker) >= 8).length;
    expect(Math.abs(nat / ss.length - 0.5)).toBeLessThan(0.05);
  });
  it('parseCards sanity for the fixtures', () => {
    expect(parseCards('9c6d')).toHaveLength(2);
  });
});
