import { describe, expect, it } from 'vitest';
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

