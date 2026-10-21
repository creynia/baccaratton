import { describe, expect, it } from 'vitest';
import { cardCode, rankOf } from './cards';
import { applyAction, createGame, queueForced, startShoe, visibleView } from './game';
import { seedRng } from './rng';
import { DEFAULT_RULES, resolveRules } from './rules';
import { burnValue, newShoe, placeForced, removedCards, unseenRanks } from './shoe';
import { playHand } from './tableau';
import type { GameEvent, GameState, ShoeSetup } from './types';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

function dealOk(s: GameState): { state: GameState; events: GameEvent[] } {
  const r = applyAction(s, { type: 'deal' });
  if (!r.ok) throw new Error(r.error.message);
  return r;
}

describe('burn (D8)', () => {
  it('burn value: A = 1 … 9 = 9, T/J/Q/K = 10', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((r) => burnValue(r * 4))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10,
    ]);
  });
  it('for each first-card rank: one face-up card exposed, value cards burned face down (unseen)', () => {
    const seen = new Set<number>();
    for (let seed = 0; seen.size < 13 && seed < 2000; seed++) {
      const [shoe] = newShoe(seedRng(seed), DEFAULT_RULES, 1);
      const r = rankOf(shoe.burn!.faceUp);
      seen.add(r);
      expect(shoe.burn!.faceUp).toBe(shoe.order[0]);
      expect(shoe.burn!.count).toBe(r >= 9 ? 10 : r + 1);
      expect(shoe.pos).toBe(1 + shoe.burn!.count);
      expect(sum(shoe.exposed)).toBe(1); // face-down burns stay unseen
      expect(shoe.exposed[shoe.burn!.faceUp]).toBe(1);
      expect(sum(unseenRanks(shoe, 8))).toBe(415);
      expect(shoe.order).toHaveLength(416);
      expect(shoe.cutIndex).toBe(400);
    }
    expect(seen.size).toBe(13);
  });
  it('the shuffle is a permutation of 8 decks', () => {
    const [shoe] = newShoe(seedRng(7), DEFAULT_RULES, 1);
    const want: number[] = [];
    for (let d = 0; d < 8; d++) for (let c = 0; c < 52; c++) want.push(c);
    expect(sorted(shoe.order)).toEqual(sorted(want));
  });
});

describe('ShoeSetup (D36)', () => {
  const l17: ShoeSetup = {
    removed: {
      '0': 128,
      '1': 32,
      '2': 32,
      '3': 32,
      '4': 32,
      '5': 32,
      '6': 24,
      '7': 20,
      '8': 16,
      '9': 16,
    },
  };
  it('removedCards: ranks round-robin within a class, suits round-robin per rank', () => {
    expect(removedCards({ '0': 5, '5': 2 }, 8).map(cardCode)).toEqual([
      'Ts',
      'Js',
      'Qs',
      'Ks',
      'Th',
      '5s',
      '5h',
    ]);
    expect(() => removedCards({ '5': 33 }, 8)).toThrow(/cannot remove/);
    expect(() => removedCards({ x: 1 } as never, 8)).toThrow(/bad value class/);
  });
  it("l17-s2's 52-card shoe: unseen = 416 - removed exactly, burn drawn from the removed set", () => {
    for (let seed = 0; seed < 20; seed++) {
      const [shoe] = newShoe(seedRng(seed), DEFAULT_RULES, 1, l17);
      const unseen = unseenRanks(shoe, 8);
      expect(sum(unseen)).toBe(52);
      expect(unseen[3]).toBe(0); // no 4s
      expect(unseen[5]).toBe(8); // eight 6s
      expect(shoe.pos).toBe(364);
      expect(sum(shoe.exposed)).toBe(364);
      const removed = sorted(removedCards(l17.removed, 8));
      expect(sorted(shoe.order.slice(0, 364))).toEqual(removed);
      expect(shoe.burn!.faceUp).toBe(shoe.order[0]);
      expect(shoe.burn!.count).toBe(burnValue(shoe.order[0]!));
    }
  });
  it('the burn fits the removed set; too few removed cards to hold it throws', () => {
    const [a] = newShoe(seedRng(1), DEFAULT_RULES, 1, { removed: { '1': 2 } });
    expect(cardCode(a.burn!.faceUp)[0]).toBe('A');
    expect(a.pos).toBe(2);
    expect(sum(unseenRanks(a, 8))).toBe(414);
    // A small removal where only some cards fit: the face-up card is one that fits.
    const [b] = newShoe(seedRng(3), DEFAULT_RULES, 1, { removed: { '0': 4, '2': 1 } });
    expect(burnValue(b.burn!.faceUp)).toBe(2);
    expect(() => newShoe(seedRng(1), DEFAULT_RULES, 1, { removed: { '0': 3 } })).toThrow(
      /cannot hold the burn/,
    );
  });
  it('a setup leaving 6 unseen cards works and deals; 5 throws', () => {
    const all = {
      '0': 128,
      '1': 32,
      '2': 32,
      '3': 32,
      '4': 32,
      '5': 32,
      '6': 32,
      '7': 32,
      '8': 32,
    };
    const six: ShoeSetup = { removed: { ...all, '9': 26 } };
    const g = createGame({ shoe: six, seed: 5 });
    expect(sum(visibleView(g).unseenRanks)).toBe(6);
    expect(visibleView(g).unseenRanks[8]).toBe(6);
    const r = dealOk(g);
    // Past the cut card already: this is the last hand of the shoe.
    expect(r.events.some((e) => e.type === 'shoe-finished')).toBe(true);
    expect(r.events[0]!.type).toBe('hand-started');
    expect(() => createGame({ shoe: { removed: { ...all, '9': 27 } } })).toThrow(/5 unseen/);
    expect(() => startShoe(g, { removed: { ...all, '9': 27 } })).toThrow(/5 unseen/);
  });
  it('startAtCard deals forward (seen); setup.seed fixes the shuffle', () => {
    const [s] = newShoe(seedRng(1), DEFAULT_RULES, 1, { startAtCard: 200 });
    expect(s.pos).toBe(200);
    expect(sum(s.exposed)).toBe(1 + (200 - 1 - s.burn!.count));
    const g1 = createGame({ seed: 1, shoe: { seed: 99 } });
    const g2 = createGame({ seed: 2, shoe: { seed: 99 } });
    expect(g1.shoe.order).toEqual(g2.shoe.order);
    expect(g1.rng).toEqual(seedRng(1)); // the game stream is untouched
    expect(() => newShoe(seedRng(1), DEFAULT_RULES, 1, { startAtCard: 417 })).toThrow();
  });
});

describe('physical cards left (review)', () => {
  it('startAtCard 411 throws; a setup leaving 6 physical cards deals one last hand', () => {
    expect(() => newShoe(seedRng(1), DEFAULT_RULES, 1, { startAtCard: 411 })).toThrow(
      /5 cards in the shoe/,
    );
    const g = createGame({ seed: 4, shoe: { startAtCard: 410 } });
    expect(g.shoe.order.length - g.shoe.pos).toBe(6);
    expect(g.shoe.cutCardOut).toBe(true);
    const r = dealOk(g);
    expect(r.events[0]!.type).toBe('hand-started');
    expect(r.events.at(-1)!.type).toBe('shoe-finished');
  });
});

describe('cut card, one more hand, reshuffle (D17)', () => {
  it('the cut card fires once, exactly one extra hand follows, then shoe-finished and a reshuffle', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = createGame({ seed });
      let cutHand = -1;
      let finishedHand = -1;
      let shoe1Hands = 0;
      for (let h = 1; finishedHand < 0; h++) {
        const r = dealOk(g);
        g = r.state;
        shoe1Hands++;
        const cuts = r.events.filter((e) => e.type === 'cut-card').length;
        if (cuts) {
          expect(cutHand).toBe(-1);
          expect(cuts).toBe(1);
          cutHand = h;
          expect(g.shoe.cutCardOut).toBe(true);
          expect(g.shoe.finished).toBe(false);
        }
        if (r.events.some((e) => e.type === 'shoe-finished')) {
          finishedHand = h;
          expect(r.events.at(-1)!.type).toBe('shoe-finished');
        }
      }
      expect(finishedHand).toBe(cutHand + 1);
      expect(g.shoe.finished && g.shoe.extraHandDealt).toBe(true);
      expect(g.shoe.handsThisShoe).toBe(shoe1Hands);
      expect(visibleView(g).nextHandNewShoe).toBe(true);
      expect(sum(visibleView(g).unseenRanks)).toBe(416);
      const next = dealOk(g);
      expect(next.events.slice(0, 3).map((e) => e.type)).toEqual([
        'shoe-shuffled',
        'burn',
        'hand-started',
      ]);
      expect(next.state.shoe.shoeNo).toBe(2);
      expect(next.state.history).toHaveLength(1);
    }
  });
  it('the cut-card event comes just before the card that reaches cutIndex', () => {
    let g = createGame({ seed: 3 });
    for (;;) {
      const before = g.shoe.pos;
      const r = dealOk(g);
      g = r.state;
      const i = r.events.findIndex((e) => e.type === 'cut-card');
      if (i < 0) continue;
      const dealtBefore = r.events.slice(0, i).filter((e) => e.type === 'card-dealt').length;
      expect(before + dealtBefore).toBe(g.shoe.cutIndex);
      expect(r.events[i + 1]!.type).toBe('card-dealt');
      break;
    }
  });
  it('16 cards always suffice: 10,000 shoes, the last hand never runs past the shoe', () => {
    let maxAfterCut = 0;
    let hands = 0;
    for (let seed = 0; seed < 10_000; seed++) {
      const [shoe] = newShoe(seedRng(seed), DEFAULT_RULES, 1);
      let pos = shoe.pos;
      let cutOut = false;
      for (;;) {
        const extra = cutOut;
        playHand(() => {
          if (pos === shoe.cutIndex) cutOut = true;
          return shoe.order[pos++]!;
        });
        hands++;
        if (extra) break;
      }
      expect(pos).toBeLessThanOrEqual(416);
      maxAfterCut = Math.max(maxAfterCut, pos - shoe.cutIndex);
    }
    expect(maxAfterCut).toBeLessThanOrEqual(12);
    // About 81 hands per shoe (simulator.md section 1.6).
    expect(hands / 10_000).toBeGreaterThan(79);
    expect(hands / 10_000).toBeLessThan(83);
  }, 60_000);
  it('the game deals 300 whole shoes without running out; exposed and unseen stay consistent', () => {
    let g = createGame({ seed: 11 });
    while (g.shoe.shoeNo <= 300) {
      g = dealOk(g).state;
      const v = visibleView(g);
      if (!v.nextHandNewShoe) {
        expect(sum(v.unseenRanks)).toBe(416 - sum(g.shoe.exposed));
        // dealt cards + the face-up burn are exposed; face-down burns are not
        expect(sum(g.shoe.exposed)).toBe(g.shoe.pos - g.shoe.burn!.count);
      }
    }
  }, 60_000);
  it('new-shoe ends the shoe now; the next deal reshuffles and clears the roads', () => {
    let g = dealOk(createGame({ seed: 2 })).state;
    g = dealOk(g).state;
    const r = applyAction(g, { type: 'new-shoe' });
    expect(r.ok && r.events).toEqual([{ type: 'shoe-ended-early' }]);
    const n = dealOk(r.ok ? r.state : g);
    expect(n.events[0]).toEqual({ type: 'shoe-shuffled', shoeNo: 2, decks: 8 });
    expect(n.state.history).toHaveLength(1);
  });
});

describe('forced hands (D17)', () => {
  it('swap into the next positions, keeping the composition and the seeded rest', () => {
    const [shoe] = newShoe(seedRng(4), DEFAULT_RULES, 1);
    const cards = [0, 1, 2, 3];
    const placed = placeForced(shoe, cards)!;
    expect(placed.order.slice(shoe.pos, shoe.pos + 4)).toEqual(cards);
    expect(sorted(placed.order)).toEqual(sorted(shoe.order));
    let diff = 0;
    for (let i = 0; i < 416; i++) if (placed.order[i] !== shoe.order[i]) diff++;
    expect(diff).toBeLessThanOrEqual(8);
    expect(placed.order.slice(0, shoe.pos)).toEqual(shoe.order.slice(0, shoe.pos));
  });
  it('a forced hand deals exactly its cards, flags the hand, and counts as seen', () => {
    const g = createGame({
      seed: 9,
      forced: [{ player: ['Kh', 'Kd', '2c'], banker: ['3s', '4s'] }],
    });
    const r = dealOk(g);
    const hand = r.state.lastResult!.hand;
    expect(hand.player.cards.map(cardCode)).toEqual(['Kh', 'Kd', '2c']);
    expect(hand.banker.cards.map(cardCode)).toEqual(['3s', '4s']);
    expect(hand.forced).toBe(true);
    expect(r.state.forced).toEqual([]);
    expect(sum(r.state.shoe.exposed)).toBe(6);
    expect(dealOk(r.state).state.lastResult!.hand.forced).toBe(false);
  });
  it('a forced card with no copy left triggers a reshuffle first', () => {
    const rules = resolveRules({ decks: 1 });
    let g = createGame({ seed: 1, rules });
    // Deal until the Ace of spades has been exposed (dealt or the face-up burn).
    let guard = 0;
    while (g.shoe.shoeNo === 0 || g.shoe.exposed[0] === 0 || g.shoe.finished) {
      g = dealOk(g).state;
      if (++guard > 500) throw new Error('no As');
    }
    const shoeNo = g.shoe.shoeNo;
    g = queueForced(g, [{ player: ['As', '3h'], banker: ['9d', 'Kc'] }]);
    const r = dealOk(g);
    expect(r.events[0]).toMatchObject({ type: 'shoe-shuffled', shoeNo: shoeNo + 1 });
    expect(r.state.lastResult!.hand.player.cards.map(cardCode)).toEqual(['As', '3h']);
  });
  it('a forced-card reshuffle before any hand of the shoe keeps the prefilled roads', () => {
    const rules = resolveRules({ decks: 1 });
    const history = [
      {
        winner: 'banker' as const,
        playerPair: false,
        bankerPair: false,
        natural: false,
        total: 7 as const,
      },
    ];
    // Find a seed whose first-shoe burn exposes the Ace of spades, so the forced As needs a reshuffle.
    for (let seed = 1; seed < 5000; seed++) {
      const [shoe] = newShoe(seedRng(seed), rules, 1);
      if (shoe.order.slice(0, shoe.pos).indexOf(0) < 0) continue;
      const g = createGame({
        seed,
        rules,
        history,
        forced: [{ player: ['As', '3h'], banker: ['9d', 'Kc'] }],
      });
      const r = dealOk(g);
      expect(r.events.filter((e) => e.type === 'shoe-shuffled')).toHaveLength(r.state.shoe.shoeNo);
      expect(r.state.shoe.shoeNo).toBeGreaterThanOrEqual(2);
      expect(r.state.history).toHaveLength(2);
      expect(r.state.history[0]!.prefilled).toBe(true);
      return;
    }
    throw new Error('no seed burns the As');
  });
});
