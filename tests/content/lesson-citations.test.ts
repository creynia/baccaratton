import { describe, expect, it } from 'vitest';
import { outcomeDistribution, fullShoeRanks } from '../../src/sim/math/distribution';
import { buildContent } from '../../src/content/load';

const bundle = buildContent(process.cwd());
const lesson = (id: string) => bundle.lessons.find((l) => l.id === id)!;

describe('lessons that cite sources', () => {
  it('cites in lessons 9, 10, 12, 17, 19, 20 and 21, each marker backed by a source', () => {
    for (const id of [
      'banker-vs-player',
      'the-tie-bet',
      'table-variants',
      'card-counting',
      'betting-systems',
      'pairs-and-dragon-bonus',
      'ez-side-bets',
    ]) {
      const l = lesson(id);
      expect(l.sources?.length, id).toBeGreaterThan(0);
      const html = l.blocks.map((b) => ('html' in b ? b.html : '')).join('');
      const used = new Set([...html.matchAll(/data-cite="(\d+)"/g)].map((m) => Number(m[1])));
      expect(used.size, id).toBeGreaterThan(0);
      for (const n of used) expect(n).toBeLessThanOrEqual(l.sources!.length);
    }
  });

  it('links Jacobson in lesson 17', () => {
    const urls = lesson('card-counting').sources!.map((s) => s.url);
    expect(urls).toContain('https://wizardofodds.com/games/baccarat/dragon-bet/');
  });
});

describe('lesson 21 Big/Small edges', () => {
  // Big pays 0.54:1 on 5 or 6 cards, Small 1.5:1 on exactly 4 cards; no pushes.
  const edges = (decks: number) => {
    const d = outcomeDistribution(fullShoeRanks(decks));
    let small = 0n;
    for (const c of d.cells) if (c.playerCards + c.bankerCards === 4) small += c.weight;
    const ps = Number(small) / Number(d.total);
    return { small: -(1.5 * ps - (1 - ps)) * 100, big: -(0.54 * (1 - ps) - ps) * 100 };
  };

  it('are the 8-deck figures the lesson table labels "Edge (8 decks)"', () => {
    const e = edges(8);
    expect(e.big.toFixed(2)).toBe('4.35');
    expect(e.small.toFixed(2)).toBe('5.28');
    const l = lesson('ez-side-bets').blocks.map((b) => ('html' in b ? b.html : '')).join('');
    expect(l).toContain('Edge (8 decks)');
    expect(l).toContain('4.35%');
    expect(l).toContain('5.28%');
  });

  it('differ at 6 decks, where they are the Wizard of Odds figures', () => {
    const e = edges(6);
    expect(e.big.toFixed(4)).toBe('4.3545');
    expect(e.small.toFixed(4)).toBe('5.2687');
  });
});
