import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileLesson, renderMarkdown } from './compile';
import type { CompiledLesson } from './compile';
import type {
  BetCopy,
  Chapter,
  ContentBundle,
  GlossaryEntry,
  Lesson,
  SourceGroup,
  SourceItem,
  SystemCopy,
} from './types';
import type { BetId } from '../sim/engine';
import type { StrategyId } from '../sim/strategy';

interface RawGlossary {
  term: string;
  slug?: string;
  definition: string;
  see?: string[];
  seeAlso?: string;
  lessonId?: string;
}

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Source entries may omit `slug` (derived from the term) and use `seeAlso: lessonId`. */
export function normalizeGlossary(g: RawGlossary): GlossaryEntry {
  const { seeAlso, slug, lessonId, ...rest } = g;
  const lid = lessonId ?? seeAlso;
  return { ...rest, slug: slug ?? slugify(g.term), ...(lid ? { lessonId: lid } : {}) };
}

/** bets.json may be a record keyed by bet id, or an array of `{ id, ...copy }` entries. */
export function normalizeBets(raw: unknown): Record<string, BetCopy> {
  if (!Array.isArray(raw)) return raw as Record<string, BetCopy>;
  const out: Record<string, BetCopy> = {};
  for (const e of raw as ({ id: string } & BetCopy)[]) {
    const { id, ...copy } = e;
    out[id] = copy;
  }
  return out;
}

/** Raw (uncompiled) source files, exposed so content tests can check them directly. */
export interface ContentSources {
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  bets: Record<string, BetCopy>;
  systems: Record<string, SystemCopy>;
  sources: SourceGroup[];
  samplesActive: boolean;
  lessonFiles: { file: string; slug: string; source: string }[];
}

/** Where the `_sample-*` placeholders live (architecture.md section 3.1). */
export const SAMPLE_DIR = 'tests/fixtures/content';

/**
 * Reads content/. Real files (chapters.json, glossary.json, bets.json, systems.json,
 * lessons/NN-id.md) are owned by the lesson authors. A missing JSON file falls back to its
 * `_sample-*` placeholder in tests/fixtures/content, and the sample lessons are part of the
 * bundle only while chapters.json is missing (`samplesActive`). Tests can read them with
 * `includeSamples`.
 */
export function readSources(root: string, includeSamples = false): ContentSources {
  const dir = join(root, 'content');
  const samples = join(root, SAMPLE_DIR);
  const json = <T>(name: string, fallback: T): T => {
    const real = join(dir, name);
    const sample = join(samples, `_sample-${name}`);
    const f = existsSync(real) ? real : existsSync(sample) ? sample : null;
    return f ? (JSON.parse(readFileSync(f, 'utf8')) as T) : fallback;
  };
  const samplesActive = !existsSync(join(dir, 'chapters.json'));
  const lessonFiles: ContentSources['lessonFiles'] = [];
  const addLessons = (lessonDir: string, accept: (f: string) => boolean) => {
    if (!existsSync(lessonDir)) return;
    for (const f of readdirSync(lessonDir)
      .filter((n) => n.endsWith('.md') && accept(n))
      .sort())
      lessonFiles.push({
        file: f,
        slug: f.replace(/^(\d+-|_sample-)/, '').replace(/\.md$/, ''),
        source: readFileSync(join(lessonDir, f), 'utf8'),
      });
  };
  addLessons(join(dir, 'lessons'), (f) => !f.startsWith('_'));
  if (samplesActive || includeSamples) addLessons(join(samples, 'lessons'), () => true);
  return {
    chapters: json<Chapter[]>('chapters.json', []),
    glossary: json<RawGlossary[]>('glossary.json', []).map(normalizeGlossary),
    bets: normalizeBets(json<unknown>('bets.json', {})),
    systems: json<Record<string, SystemCopy>>('systems.json', {}),
    sources: json<SourceGroup[]>('sources.json', []),
    samplesActive,
    lessonFiles,
  };
}

const isHttps = (u: string) => {
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
};

/** sources.json: non-empty titles, unique ids, https urls. Returns id → item for lesson `sources:`. */
export function indexSources(groups: SourceGroup[]): Map<string, SourceItem> {
  const byId = new Map<string, SourceItem>();
  for (const g of groups) {
    if (!g.group) throw new Error('sources.json: every group needs a name');
    for (const it of g.items) {
      if (!it.id || !it.title) throw new Error(`sources.json: ${g.group}: items need an id and a title`);
      if (byId.has(it.id)) throw new Error(`sources.json: duplicate id "${it.id}"`);
      if (it.url !== undefined && !isHttps(it.url))
        throw new Error(`sources.json: "${it.id}" url must be a valid https url`);
      byId.set(it.id, it);
    }
  }
  return byId;
}

export function buildContent(root: string): ContentBundle {
  const src = readSources(root);
  const glossarySlugs = new Set(src.glossary.map((g) => g.slug));
  const glossaryTerms = new Map(src.glossary.map((g) => [g.term.toLowerCase(), g.slug] as const));
  const opts = { glossarySlugs, glossaryTerms, sources: indexSources(src.sources) };
  const compiled = new Map<string, CompiledLesson>();
  for (const f of src.lessonFiles) {
    const file = f.file.startsWith('_sample-')
      ? `${SAMPLE_DIR}/lessons/${f.file}`
      : `content/lessons/${f.file}`;
    const l = compileLesson(f.source, file, opts);
    const want = f.file.startsWith('_sample-') ? `sample-${f.slug}` : f.slug;
    if (l.id !== want) throw new Error(`${file}: front matter id "${l.id}" must equal "${want}"`);
    if (compiled.has(l.id)) throw new Error(`${file}: duplicate lesson id "${l.id}"`);
    compiled.set(l.id, l);
  }
  const lessons: Lesson[] = [];
  const placed = new Set<string>();
  for (const ch of src.chapters)
    for (const id of ch.lessons) {
      const l = compiled.get(id);
      if (!l) throw new Error(`chapters.json: chapter ${ch.id} references missing lesson ${id}`);
      if (placed.has(id)) throw new Error(`chapters.json: lesson ${id} is listed in two chapters`);
      if (l.chapter !== undefined && l.chapter !== ch.id)
        throw new Error(
          `lesson ${id}: front matter chapter "${l.chapter}" but chapters.json lists it in "${ch.id}"`,
        );
      placed.add(id);
      const { chapter: _chapter, ...rest } = l;
      lessons.push({ ...rest, chapterId: ch.id });
    }
  const unlisted = [...compiled.keys()].filter((id) => !placed.has(id));
  if (unlisted.length && !src.samplesActive)
    throw new Error(`lessons not listed in chapters.json: ${unlisted.join(', ')}`);
  const glossary = src.glossary.map((g) => ({
    ...g,
    definition: renderMarkdown(g.definition, opts),
  }));
  const bets = Object.fromEntries(
    Object.entries(src.bets).map(([k, v]) => [
      k,
      { ...v, howItWorks: renderMarkdown(v.howItWorks, opts) },
    ]),
  ) as Partial<Record<BetId, BetCopy>>;
  const systems = Object.fromEntries(
    Object.entries(src.systems).map(([k, v]) => [
      k,
      { ...v, rules: v.rules.map((r) => renderMarkdown(r, opts)) },
    ]),
  ) as Partial<Record<StrategyId, SystemCopy>>;
  return {
    chapters: src.chapters,
    lessons,
    glossary,
    bets,
    systems,
    sources: src.sources,
  };
}
