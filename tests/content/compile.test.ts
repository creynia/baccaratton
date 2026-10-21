import { describe, expect, it } from 'vitest';
import { compileLesson, renderMarkdown } from '../../src/content/compile';
import { cardsHtml, splitInline } from '../../src/content/cards';
import type { Block } from '../../src/content/types';
import { parseCards } from '../../src/sim/engine';

const fm = (body: string, extra = '') =>
  `---\nid: t\ntitle: T\nchapter: c\nsummary: S\nminutes: 2\n${extra}---\n${body}\n`;
const blocksOf = (body: string): Block[] => compileLesson(fm(body), 't.md').blocks;
const kinds = (body: string) => blocksOf(body).map((b) => b.kind);
const fails = (body: string, msg: RegExp) =>
  expect(() => compileLesson(fm(body), 't.md')).toThrow(msg);

describe('front matter', () => {
  it('reads id, title, summary, minutes and chapter', () => {
    const l = compileLesson(fm('Hi.'), 't.md');
    expect(l).toMatchObject({ id: 't', title: 'T', summary: 'S', minutes: 2, chapter: 'c' });
  });
  it.each([
    ['id', 'title: T\nsummary: S\nminutes: 2'],
    ['title', 'id: t\nsummary: S\nminutes: 2'],
    ['summary', 'id: t\ntitle: T\nminutes: 2'],
    ['minutes', 'id: t\ntitle: T\nsummary: S'],
  ])('requires %s', (_what, front) => {
    expect(() => compileLesson(`---\n${front}\n---\nHi.`, 't.md')).toThrow(/t\.md/);
  });
});

describe('containers', () => {
  it('compiles :::math (title required) and :::tip', () => {
    expect(kinds(':::math Why\nx\n:::\n\n:::tip\ny\n:::')).toEqual(['math', 'tip']);
    fails(':::math\nx\n:::', /needs a title/);
  });
  it('rejects unclosed and unknown containers and the old fences', () => {
    fails(':::tip\nx', /unclosed/);
    fails(':::note\nx\n:::', /unknown or stray container/);
    fails('```math\nx\n```', /unknown directive/);
    fails('```chart\nx: 1\n```', /use ```tableau or ```roads/);
  });
});

describe('inline cards', () => {
  it('renders an accessible group with the baccarat total', () => {
    const html = cardsHtml('Kh 7d');
    expect(html).toContain('role="img"');
    expect(html).toContain('King of hearts, Seven of diamonds (total 7)');
    expect(html).not.toContain('pc-total');
  });
  it('shows a total badge with = and checks an asserted total', () => {
    expect(cardsHtml('4h 2c 9d =')).toContain('<span class="pc-total" aria-hidden="true">5</span>');
    expect(cardsHtml('Kh 7d =7')).toContain('pc-total');
    expect(() => cardsHtml('Kh 7d =8')).toThrow(/total is 7, not 8/);
  });
  it('uses text-presentation suit glyphs', () => {
    expect(cardsHtml('Ah')).toContain('♥︎');
  });
  it('rejects bad, duplicate and empty groups', () => {
    expect(() => cardsHtml('Xx')).toThrow(/bad card group/);
    expect(() => cardsHtml('Kh Kh')).toThrow(/Duplicate/);
    expect(() => cardsHtml('')).toThrow(/empty card group/);
    expect(() => cardsHtml('= 7')).toThrow(/empty card group/);
  });
  it('works through markdown, but not inside code spans', () => {
    expect(renderMarkdown('See {{Kh 7d}} now')).toContain('class="cards"');
    expect(renderMarkdown('`{{Kh 7d}}`')).not.toContain('class="cards"');
  });
  it('splits text around groups', () => {
    const segs = splitInline('a {{Kh 7d =}} b');
    expect(segs.map((s) => s.t)).toEqual(['text', 'cards', 'text']);
    expect(segs[1]).toMatchObject({ total: 7, badge: true });
  });
  it('is checked in prose, quiz text and scene text', () => {
    fails('Bad {{Zz}}', /bad card group/);
    fails('```quiz\n- q: "{{Zz}}"\n  options: [a, b]\n  answer: 0\n  explain: x\n```', /quiz 1: q/);
    fails(
      '```scene\nid: s\nversion: 1\nsteps:\n  - id: a\n    text: "{{Zz}}"\n    completeWhen: { acknowledged: true }\n```',
      /step a text/,
    );
  });
});

describe('glossary links', () => {
  it('resolves known terms and rejects unknown ones when a glossary is given', () => {
    const opts = { glossaryTerms: new Map([['natural', 'natural']]) };
    expect(renderMarkdown('[[Natural]]', opts)).toContain('#/glossary?term=natural');
    expect(() => renderMarkdown('[[Nope]]', opts)).toThrow(/unknown glossary term/);
    expect(renderMarkdown('[[Nope]]')).toContain('Nope'); // no glossary: plain text
  });
});

describe('tableau blocks', () => {
  it('accepts views and existing cells', () => {
    const [b] = blocksOf('```tableau\nview: full\nhighlight: [b5/p9, b6/s, b0/p0, p5]\n```');
    expect(b).toMatchObject({
      kind: 'tableau',
      tableau: { view: 'full', highlight: ['b5/p9', 'b6/s', 'b0/p0', 'p5'] },
    });
    expect(blocksOf('```tableau\nview: player\n```')).toHaveLength(1);
    expect(blocksOf('```tableau\nview: banker\n```')[0]).toMatchObject({
      tableau: { view: 'banker' },
    });
  });
  it.each([
    ['unknown view', 'view: columns'],
    ['the old view name', 'view: both'],
    ['no view', 'highlight: [b5/p9]'],
    ['Banker 8 does not exist', 'view: banker\nhighlight: [b8/p1]'],
    ['bad Player card', 'view: banker\nhighlight: [b5/p10]'],
    ['bad format', 'view: banker\nhighlight: [banker5]'],
    ['the old cell syntax', 'view: banker\nhighlight: [B5-P9]'],
    ['highlight not a list', 'view: banker\nhighlight: b5/p9'],
  ])('rejects: %s', (_n, yaml) => {
    fails('```tableau\n' + yaml + '\n```', /tableau/);
  });
});

describe('roads blocks', () => {
  it('parses results, views and caption', () => {
    const [b] = blocksOf('```roads\nresults: BBPBTPPpPb\nview: [big]\ncaption: Nothing to see.\n```');
    expect(b).toMatchObject({
      kind: 'roads',
      roads: { results: 'BBPBTPPpPb', view: ['big'], caption: 'Nothing to see.' },
    });
    expect(blocksOf('```roads\nresults: B Bbp P5 T Pn9\n```')).toHaveLength(1);
    expect(blocksOf('```roads\nresults: BP\n```')[0]).toMatchObject({
      roads: { view: ['bead', 'big'] },
    });
  });
  it.each([
    ['no results', 'view: [big]'],
    ['bad letter', 'results: BXP'],
    ['pair marks out of order', 'results: Bpb'],
    ['empty results', 'results: ","'],
    ['bad view', 'results: BP\nview: [derived]'],
    ['empty view', 'results: BP\nview: []'],
  ])('rejects: %s', (_n, yaml) => {
    fails('```roads\n' + yaml + '\n```', /roads/);
  });
});

describe('quiz blocks', () => {
  const quiz = (item: string) => '```quiz\n' + item + '\n```';
  const base = '- q: Q?\n  options: [A, B]\n  answer: 1\n  explain: Because.';
  it('compiles with default ids and 0-based answers', () => {
    const [b] = blocksOf(quiz(base + '\n- q: Two?\n  options: [A, B, C]\n  answer: 2\n  explain: x'));
    expect(b).toMatchObject({ kind: 'quiz', quiz: { id: 't-q1', answer: 1, choices: ['A', 'B'] } });
    expect(blocksOf(quiz(base + '\n- q: Two?\n  options: [A, B]\n  answer: 0\n  explain: x'))).toHaveLength(2);
  });
  it.each([
    ['one option', '- q: Q?\n  options: [A]\n  answer: 0\n  explain: x', /at least 2/],
    ['duplicate options', '- q: Q?\n  options: [A, A]\n  answer: 0\n  explain: x', /distinct/],
    ['answer out of range', '- q: Q?\n  options: [A, B]\n  answer: 2\n  explain: x', /0-based/],
    ['no explanation', '- q: Q?\n  options: [A, B]\n  answer: 0', /explain/],
    ['no question', '- options: [A, B]\n  answer: 0\n  explain: x', /q must/],
  ])('rejects: %s', (_n, item, msg) => {
    fails(quiz(item), msg);
  });
  it('rejects duplicate quiz ids', () => {
    fails(quiz('- id: x\n  q: Q?\n  options: [A, B]\n  answer: 0\n  explain: x\n- id: x\n  q: Q?\n  options: [A, B]\n  answer: 0\n  explain: x'), /duplicate quiz id/);
  });

  describe('hand: { player: [..], banker: [..] } follows the drawing rules', () => {
    const list = (codes: string) => `[${codes.split(' ').join(', ')}]`;
    const hand = (player: string, banker: string) =>
      quiz(`- q: Q?\n  hand: { player: ${list(player)}, banker: ${list(banker)} }\n  options: [A, B]\n  answer: 0\n  explain: x`);
    it('accepts consistent hands', () => {
      // Player 5 draws a 9 (total 4); Banker 5 stands on a 9.
      expect(blocksOf(hand('4h Ac 9d', 'Kd 5s'))[0]).toMatchObject({
        quiz: { hand: { player: parseCards('4h Ac 9d'), banker: parseCards('Kd 5s') } },
      });
      // Both stand: Player 6, Banker 7.
      expect(blocksOf(hand('4h 2c', '3d 4s'))).toHaveLength(1);
      // Natural: nobody draws.
      expect(blocksOf(hand('4h 4c', 'Ad 7s'))).toHaveLength(1);
      // Banker 3 draws against a Player third card of 7: three cards on each side.
      expect(blocksOf(hand('4h Ac 7d', 'Kd 3s 2h'))).toHaveLength(1);
    });
    it('rejects a third card where the rule does not draw, and a missing one', () => {
      fails(hand('4h 2c 9d', 'Kd 5s'), /Player \(total 6\) stands/);
      fails(hand('4h Ac', 'Kd 5s'), /Player \(total 5\) draws/);
      fails(hand('4h Ac 9d', 'Kd 5s 2h'), /Banker \(total 5\) stands/);
      fails(hand('4h Ac 6d', 'Kd 5s'), /Banker \(total 5\) draws/);
      fails(hand('4h 4c 2d', 'Ad 7s'), /natural|stands/);
    });
    it('rejects bad card counts, bad codes and shared cards', () => {
      fails(hand('4h', 'Kd 5s'), /2 or 3 cards/);
      fails(hand('4h Ac 9d 2s', 'Kd 5s'), /2 or 3 cards/);
      fails(hand('4h Zc', 'Kd 5s'), /Bad card code/);
      fails(hand('4h Ac 9d', '4h 5s'), /Duplicate/);
      fails(hand('4hAc 9d', 'Kd 5s'), /Bad card code/);
    });
    it('needs YAML lists (D34), not strings', () => {
      fails(quiz('- q: Q?\n  hand: { player: 4h Ac 9d, banker: Kd 5s }\n  options: [A, B]\n  answer: 0\n  explain: x'), /list of card codes/);
    });
    it('rejects the old hole/board shape', () => {
      fails(quiz('- q: Q?\n  hand: { hole: Ah 5c }\n  options: [A, B]\n  answer: 0\n  explain: x'), /player/);
    });
  });
});

describe('scene blocks', () => {
  const scene = (extra = '') =>
    '```scene\nid: sc\nversion: 1\n' +
    extra +
    'steps:\n  - id: a\n    text: Hi\n    completeWhen: { acknowledged: true }\n```';
  it('validates through validateScene', () => {
    const [b] = blocksOf(scene());
    expect(b).toMatchObject({ kind: 'scene', scene: { id: 'sc' } });
    fails(scene('variant: classic\n'), /invalid scene "sc"/);
  });
  it('rejects duplicate scene ids in one lesson', () => {
    fails(scene() + '\n\n' + scene(), /duplicate scene id/);
  });
});
