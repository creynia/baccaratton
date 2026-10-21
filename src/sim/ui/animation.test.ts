import { describe, expect, it } from 'vitest';
import { VARIANT_RULES } from '../engine/rules';
import { buildTimeline, cardsUpTo, effectiveSpeed } from './animation';
import { dealEvents, forcedHand, settled } from './fixtures';

const PB = VARIANT_RULES['punto-banco'];
const noThird = dealEvents(settled(forcedHand('9h 9d', 'Ks 7c'), { banker: 1000 }, PB));
const bothThird = dealEvents(settled(forcedHand('2h 3d 4c', '5s Kd 6h'), { player: 1000 }, PB));

describe('buildTimeline (simulator.md §4.4)', () => {
  it('instant gives an empty timeline', () => {
    const t = buildTimeline(bothThird, 'instant');
    expect(t.steps).toEqual([]);
    expect(t.totalMs).toBe(0);
    expect(t.segments).toEqual([]);
  });
  it('OS reduced motion forces instant', () => {
    expect(effectiveSpeed('normal', true)).toBe('instant');
    expect(effectiveSpeed('fast', false)).toBe('fast');
    expect(effectiveSpeed(undefined, false)).toBe('normal');
  });
  it('a hand with no third card takes about 1.16 s at normal, both thirds 1.6 s', () => {
    expect(buildTimeline(noThird, 'normal').totalMs).toBe(1160);
    expect(buildTimeline(bothThird, 'normal').totalMs).toBe(1600);
    expect(buildTimeline(noThird, 'fast').totalMs).toBeLessThan(500);
  });
  it('deals P1 B1 P2 B2, flips together, then the sideways thirds', () => {
    const t = buildTimeline(bothThird, 'normal');
    expect(t.steps.map((s) => s.kind)).toEqual([
      'slide',
      'slide',
      'slide',
      'slide',
      'flip',
      'third',
      'third',
      'result',
      'chips',
    ]);
    expect(t.slots.player[0]!.slideAt).toBe(0);
    expect(t.slots.banker[0]!.slideAt).toBe(110);
    expect(t.slots.player[0]!.flipAt).toBe(440);
    expect(t.totals.player.three).toBe(880);
    expect(t.totals.banker.three).toBe(1100);
  });
  it('pause points split the timeline', () => {
    const t = buildTimeline(bothThird, 'normal');
    expect(t.segments.map((s) => s.pause)).toEqual([
      'two-cards',
      'player-third',
      'all-cards',
      null,
    ]);
    expect(t.segments[0]).toEqual({ from: 0, to: 660, pause: 'two-cards' });
    expect(t.segments.at(-1)!.to).toBe(t.totalMs);
  });
  it('a new shoe adds the shuffle banner and the burn', () => {
    const ev = dealEvents(settled(forcedHand('9h 9d', 'Ks 7c'), {}, PB), {
      newShoe: { faceUp: 20, count: 6 },
    });
    const t = buildTimeline(ev, 'normal');
    expect(t.steps.slice(0, 2).map((s) => s.kind)).toEqual(['shuffle', 'burn']);
    expect(t.totalMs).toBe(400 + 600 + 860);
  });
  it('cardsUpTo stops at a pause point', () => {
    expect(cardsUpTo(bothThird, 'two-cards').player).toHaveLength(2);
    expect(cardsUpTo(bothThird, 'player-third').player).toHaveLength(3);
    expect(cardsUpTo(bothThird, 'player-third').banker).toHaveLength(2);
    expect(cardsUpTo(bothThird, null).banker).toHaveLength(3);
  });
});
