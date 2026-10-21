import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_DIR, buildContent, readSources } from '../../src/content/load';
import { BET_IDS } from '../../src/sim/engine';
import { STRATEGY_IDS } from '../../src/sim/strategy';

const bundle = buildContent(process.cwd());
const src = readSources(process.cwd());

describe('the content pipeline (placeholders while no real content exists)', () => {
  it('uses the _sample-* placeholders only while chapters.json is missing', () => {
    expect(src.samplesActive).toBe(true);
    expect(src.lessonFiles.every((f) => f.file.startsWith('_sample-'))).toBe(true);
  });

  it('lists every lesson in exactly one chapter, and every chapter lesson exists', () => {
    const ids = bundle.lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const listed = bundle.chapters.flatMap((c) => c.lessons);
    expect([...listed].sort()).toEqual([...ids].sort());
    for (const l of bundle.lessons)
      expect(bundle.chapters.find((c) => c.id === l.chapterId)?.lessons).toContain(l.id);
  });

  it('compiles every block kind the lesson format has, with no markdown or yaml left in', () => {
    const kinds = new Set(bundle.lessons.flatMap((l) => l.blocks.map((b) => b.kind)));
    expect([...kinds].sort()).toEqual(['html', 'math', 'quiz', 'roads', 'scene', 'tableau', 'tip']);
    expect(JSON.stringify(bundle)).not.toMatch(/:::|```/);
  });

  it('keys bets by real bet ids and systems by real strategy ids', () => {
    for (const id of Object.keys(bundle.bets)) expect(BET_IDS as readonly string[]).toContain(id);
    for (const id of Object.keys(bundle.systems))
      expect(STRATEGY_IDS as readonly string[]).toContain(id);
  });

  it('resolves glossary see / lessonId references', () => {
    const slugs = new Set(bundle.glossary.map((g) => g.slug));
    expect(slugs.size).toBe(bundle.glossary.length);
    const lessons = new Set(bundle.lessons.map((l) => l.id));
    for (const g of bundle.glossary) {
      for (const s of g.see ?? []) expect(slugs.has(s)).toBe(true);
      if (g.lessonId) expect(lessons.has(g.lessonId)).toBe(true);
    }
  });

  it('renders markdown fields to HTML in the bundle', () => {
    for (const b of Object.values(bundle.bets)) expect(b?.howItWorks).toMatch(/^<p>/);
    for (const s of Object.values(bundle.systems)) expect(s?.rules.every((r) => r.startsWith('<p>'))).toBe(true);
    for (const g of bundle.glossary) expect(g.definition).toMatch(/^<p>/);
  });
});

describe('real content replaces the placeholders', () => {
  let tmp = '';
  const lesson = (id: string) =>
    `---\nid: ${id}\ntitle: T\nchapter: real\nsummary: s\nminutes: 1\n---\nHi.\n`;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'baccaratton-content-'));
    mkdirSync(join(tmp, 'content/lessons'), { recursive: true });
    cpSync(join(process.cwd(), SAMPLE_DIR), join(tmp, SAMPLE_DIR), { recursive: true });
    writeFileSync(
      join(tmp, 'content/chapters.json'),
      JSON.stringify([{ id: 'real', title: 'Real', summary: 's', lessons: ['one'] }]),
    );
    writeFileSync(join(tmp, 'content/lessons/01-one.md'), lesson('one'));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('drops the sample lessons once chapters.json exists', () => {
    expect(buildContent(tmp).lessons.map((l) => l.id)).toEqual(['one']);
  });
  it('fails on a lesson that no chapter lists', () => {
    writeFileSync(join(tmp, 'content/lessons/02-two.md'), lesson('two'));
    expect(() => buildContent(tmp)).toThrow(/not listed in chapters.json/);
  });
  it('fails when the front matter id differs from the file slug', () => {
    writeFileSync(join(tmp, 'content/lessons/02-two.md'), lesson('wrong'));
    expect(() => buildContent(tmp)).toThrow(/must equal "two"/);
  });
});
