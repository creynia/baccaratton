// @vitest-environment node
// Wave-2 topic pages: every quoted number is the engine's. If the math changes, these pins fail
// together with the page, so the page can never drift from the engine.
import { describe, expect, it } from 'vitest';
import { buildStaticSite } from '../../build/static-site';
import { VARIANT_RULES } from '../../src/sim/engine';
import { fraction, fullShoeEvs } from '../../src/sim/math';
import type { BetEv, Fraction } from '../../src/sim/math';
import { systemCost } from '../../src/sim/strategy';

const site = buildStaticSite(process.cwd());
const html = (path: string) => site.pages.find((p) => p.path === path)!.html;
const page = (path: string) => site.pages.find((p) => p.path === path)!;
const lead = (path: string) => /<p class="lead">(.*?)<\/p>/s.exec(html(path))?.[1] ?? '';
const pct = (f: Fraction, d: number) =>
  fraction.toFixed(fraction.mul(f, fraction.frac(100n)), d) + '%';
const pb = VARIANT_RULES['punto-banco'];
const get = (l: readonly BetEv[], id: string) => l.find((e) => e.bet === id)!;

describe('odds/: Banker vs Player vs Tie', () => {
  const e8 = fullShoeEvs({ ...pb, tiePays: 8 });
  const B = get(e8, 'banker');
  const P = get(e8, 'player');
  const T = get(e8, 'tie');
  it('answers in the first paragraph with the engine figures', () => {
    const a = lead('odds/');
    for (const x of [B.pWin, P.pWin, T.pWin, B.edge, P.edge, T.edge])
      expect(a).toContain(pct(x, 2));
    // Pinned: the lesson 9 / lesson 10 figures.
    expect(a).toContain('Banker wins 45.86%');
    expect(a).toContain('Player 44.62%');
    expect(a).toContain('9.52% are ties');
    expect(a).toContain('house edge of 1.06%');
    expect(a).toContain('Player bet 1.24%');
    expect(a).toContain('(8 to 1) 14.36%');
  });
  it('explains the commission and the break-even rate', () => {
    const h = html('odds/');
    expect(h).toContain('break even at a commission of 2.69%');
    expect(h).toContain('a $10 Banker win pays $9.50');
    expect(h).toContain(pct(get(fullShoeEvs({ ...pb, commission: [1, 25] }), 'banker').edge, 3));
    expect(h).toContain('0.599%');
  });
  it('has the by-deck table from the engine (1 to 8 decks)', () => {
    const h = html('odds/');
    for (const d of [1, 2, 4, 6, 8]) {
      const l = fullShoeEvs({ ...pb, decks: d });
      expect(h).toContain(
        `<tr><th scope="row">${d}</th><td>${pct(get(l, 'banker').pWin, 3)}</td><td>${pct(get(l, 'player').pWin, 3)}</td><td>${pct(get(l, 'tie').pWin, 3)}</td><td>${pct(get(l, 'banker').edge, 3)}</td>`,
      );
    }
    expect(h).toContain('1.012% (1 deck) to 1.058% (8 decks)');
  });
  it('is titled for the query', () => {
    expect(page('odds/').title).toMatch(/^Baccarat Odds: Banker vs Player vs Tie/);
    expect(html('odds/')).toContain('<h1>Baccarat odds: Banker vs Player vs Tie</h1>');
  });
});

describe('third-card-rule/: drawing rules chart', () => {
  it('answers with the engine rule and has both charts', () => {
    const a = lead('third-card-rule/');
    expect(a).toContain('the Player draws a third card on 0–5 and stands on 6, 7');
    expect(a).toContain('the Banker draws on 0–5 and stands on 6, 7');
    const h = html('third-card-rule/');
    expect(h).toContain('<table class="tableau"><caption>');
    expect(h).toContain('Banker 3 draws on anything except a Player third card of 8.');
    expect(h).toContain(
      'Banker 6 draws when the Player&#39;s third card is 6, 7.'.replace('&#39;', "'"),
    );
  });
  it('quotes how often each case happens (exact, 8 decks)', () => {
    const h = html('third-card-rule/');
    expect(h).toContain('<td>34.30%</td>');
    expect(h).toContain('<td>50.34%</td>');
    expect(h).toContain('<td>43.54%</td>');
  });
  it('is titled for the query', () => {
    expect(page('third-card-rule/').title).toMatch(
      /^Baccarat Third Card Rule: Drawing Rules Chart/,
    );
  });
});

describe('systems/: does Martingale work?', () => {
  it('answers no, with the exact costs from the strategy module', () => {
    const a = lead('systems/');
    expect(a.startsWith('No.')).toBe(true);
    const flat = systemCost({ id: 'flat-banker', unit: 1000 }, 'punto-banco', 8);
    const mart = systemCost({ id: 'martingale', unit: 1000 }, 'punto-banco', 8);
    expect(a).toContain(`$${(flat.costPerHourCents! / 100).toFixed(2)} an hour`);
    expect(a).toContain(`$${(mart.avgBetCents! / 100).toFixed(2)}`);
    // Pinned to lesson 19's table.
    expect(a).toContain('$7.62 an hour');
    expect(a).toContain('average bet is $33.24');
    expect(a).toContain('costs $25.32 an hour');
    expect(a).toContain('once every 141 series 7 losses in a row lose $1,270');
    const h = html('systems/');
    for (const [name, cost] of [
      ['Paroli', '$13.05'],
      ['1-3-2-6', '$15.22'],
      ['Fibonacci', '$18.71'],
      ["D'Alembert", '$34.84'],
    ] as const)
      expect(h).toMatch(
        new RegExp(
          `${name.replace("'", "(?:'|&#39;)")}</a></th><td>[^<]+</td><td><strong>\\${cost}</strong>`,
        ),
      );
    expect(page('systems/').title).toMatch(/^Does Martingale Work in Baccarat\?/);
  });
});

describe('improved pages', () => {
  it('bets/tie/: "is the Tie bet worth it?" answered from the engine', () => {
    const a = lead('bets/tie/');
    expect(a.startsWith('No.')).toBe(true);
    expect(a).toContain('house edge is 14.36%');
    expect(a).toContain('9 to 1 the edge is 4.84%');
    expect(a).toContain('about 9.51 to 1');
    expect(page('bets/tie/').title).toMatch(/^Is the Baccarat Tie Bet Worth It\?/);
  });
  it('bets/: side bets compared, lowest edge first', () => {
    const a = lead('bets/');
    expect(a).toContain('Banker is the cheapest bet in baccarat at a 1.06% house edge');
    expect(a).toContain('the cheapest side bet is Dragon Bonus (Player) at 2.65%');
    expect(page('bets/').title).toMatch(/Side Bets/);
  });
  it('learn/welcome/: "how to play baccarat"', () => {
    expect(page('learn/welcome/').title).toMatch(/^How to Play Baccarat/);
    expect(html('learn/welcome/')).toMatch(/<h1>[^<]*how to play<\/h1>/);
    expect(page('learn/welcome/').description).toMatch(/^How to play Baccarat/);
  });
  it('titles stay short enough for search results', () => {
    for (const p of site.pages) expect(p.title.length, p.path).toBeLessThanOrEqual(70);
  });
  it('new pages are in the sitemap, llms.txt and the course index', () => {
    for (const path of ['odds/', 'third-card-rule/']) {
      expect(site.files.get('sitemap.xml')).toContain(`/baccaratton/${path}</loc>`);
      expect(site.files.get('llms.txt')).toContain(`(https://creynia.com/baccaratton/${path}):`);
      expect(html('learn/')).toContain(`href="../${path}"`);
    }
  });
});
