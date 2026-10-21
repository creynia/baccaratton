import { describe, expect, it } from 'vitest';
import { BET_IDS_BY_VARIANT } from '../../engine/ids';
import { VARIANT_IDS } from '../../engine/types';
import type { Side } from '../../engine/types';
import { feltLayout } from './index';
import type { FeltLayout, Orientation, Rect } from './types';

const SIDES: Side[] = ['player', 'banker'];

function cardRects(l: FeltLayout): { name: string; r: Rect }[] {
  const out: { name: string; r: Rect }[] = [];
  for (const s of SIDES) {
    const h = l.hands[s];
    h.cards.forEach((p, i) => out.push({ name: `${s}-card${i}`, r: { ...p, ...l.card } }));
    out.push({ name: `${s}-third`, r: { ...h.third, w: l.card.h, h: l.card.w } });
  }
  return out;
}
const spotRects = (l: FeltLayout) => Object.entries(l.spots).map(([name, r]) => ({ name, r: r }));
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const cases: [Orientation, (typeof VARIANT_IDS)[number]][] = (
  ['portrait', 'landscape'] as const
).flatMap((o) => VARIANT_IDS.map((v) => [o, v] as [Orientation, typeof v]));

describe.each(cases)('%s / %s', (o, v) => {
  const l = feltLayout(o, v);
  it('has a spot for exactly the variant’s offered bets', () => {
    expect(Object.keys(l.spots).sort()).toEqual([...BET_IDS_BY_VARIANT[v]].sort());
  });
  it('keeps cards and spots inside the viewBox', () => {
    for (const { name, r } of [...cardRects(l), ...spotRects(l)]) {
      expect(r.x, name).toBeGreaterThanOrEqual(0);
      expect(r.y, name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, name).toBeLessThanOrEqual(l.viewBox.w);
      expect(r.y + r.h, name).toBeLessThanOrEqual(l.viewBox.h);
    }
  });
  it('has no overlaps between cards and spots', () => {
    const all = [...cardRects(l), ...spotRects(l)];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(overlap(all[i]!.r, all[j]!.r), `${all[i]!.name} / ${all[j]!.name}`).toBe(false);
  });
  it('makes every spot a tap target of at least minTapUnits (44 px)', () => {
    expect(l.minTapUnits).toBeGreaterThanOrEqual(44);
    for (const { name, r } of spotRects(l)) {
      expect(r.w, name).toBeGreaterThanOrEqual(l.minTapUnits);
      expect(r.h, name).toBeGreaterThanOrEqual(l.minTapUnits);
    }
  });
});

describe('spec geometry', () => {
  it('portrait matches simulator.md 4.2', () => {
    const l = feltLayout('portrait', 'ez');
    expect(l.viewBox).toEqual({ w: 390, h: 432 });
    expect(feltLayout('portrait', 'punto-banco').viewBox).toEqual({ w: 390, h: 366 });
    expect(l.spots.banker).toEqual({ x: 258, y: 186, w: 116, h: 100 });
    expect(l.hands.player.third).toEqual({ x: 58, y: 118 });
    expect(l.card).toEqual({ w: 56, h: 78 });
  });
  it('landscape matches simulator.md 4.3', () => {
    const l = feltLayout('landscape', 'ez');
    expect(l.viewBox).toEqual({ w: 520, h: 390 });
    expect(l.spots['dragon-7']).toEqual({ x: 266, y: 304, w: 238, h: 56 });
    expect(l.hands.banker.third).toEqual({ x: 408, y: 36 });
  });
  it('Dragon 7 and Panda 8 exist only in EZ', () => {
    expect(feltLayout('portrait', 'punto-banco').spots['dragon-7']).toBeUndefined();
    expect(feltLayout('landscape', 'super-6').spots['panda-8']).toBeUndefined();
  });
});
