import { Marked, marked } from 'marked';
import type { Token, Tokens, TokenizerAndRendererExtension } from 'marked';
import { parse as parseYaml } from 'yaml';
import {
  TABLEAU,
  bankerDraws,
  cardValue,
  handTotal,
  parseCards,
  parseRoadResults,
  playerDraws,
} from '../sim/engine';
import { validateScene } from '../sim/scene';
import { cardsHtml, checkInline } from './cards';
import type {
  Block,
  Lesson,
  Quiz,
  QuizHand,
  RoadsBlockData,
  RoadView,
  TableauBlockData,
  TableauView,
} from './types';

export interface CompileOptions {
  /** known glossary slugs, for `[[term]]` links; omit to skip link checking */
  glossarySlugs?: ReadonlySet<string>;
  /** glossary term (lowercase) → slug, for `[[term]]` */
  glossaryTerms?: ReadonlyMap<string, string>;
  /** subtract from every heading depth (min result 2), so lesson headings sit under the page h1 */
  headingShift?: number;
}

/** Inline `{{As Kd}}` cards, tokenised by marked so code spans and code blocks stay literal. */
const cardsExtension: TokenizerAndRendererExtension = {
  name: 'cards',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('{{');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\{\{([^{}]*)\}\}/.exec(src);
    return m ? { type: 'cards', raw: m[0], codes: m[1] ?? '' } : undefined;
  },
  renderer(token) {
    return cardsHtml(String((token as unknown as { codes: string }).codes));
  },
};

const instances = new Map<number, Marked>();
function markedFor(shift: number): Marked {
  let m = instances.get(shift);
  if (!m) {
    m = new Marked({
      extensions: [cardsExtension],
      ...(shift
        ? {
            renderer: {
              heading({ tokens, depth }: Tokens.Heading) {
                const d = Math.min(6, Math.max(2, depth - shift));
                return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`;
              },
            },
          }
        : {}),
    });
    instances.set(shift, m);
  }
  return m;
}

/** Shallowest markdown heading depth (ATX and setext; code blocks ignored), 7 if none. */
export function minHeadingDepth(body: string): number {
  let min = 7;
  const walk = (tokens: readonly Token[]) => {
    for (const t of tokens) {
      if (t.type === 'heading') min = Math.min(min, (t as Tokens.Heading).depth);
      else {
        if ('tokens' in t && Array.isArray(t.tokens)) walk(t.tokens);
        if (t.type === 'list') for (const it of (t as Tokens.List).items) walk(it.tokens);
      }
    }
  };
  walk(marked.lexer(body));
  return min;
}

/** A compiled lesson; `chapter` is the front-matter chapter id (checked against chapters.json). */
export type CompiledLesson = Omit<Lesson, 'chapterId'> & { chapter?: string };

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontMatter(source: string): { data: Record<string, unknown>; body: string } {
  const m = FM.exec(source);
  if (!m) return { data: {}, body: source };
  const data: unknown = parseYaml(m[1] ?? '');
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error('front matter must be a YAML mapping');
  return { data: data as Record<string, unknown>, body: source.slice(m[0].length) };
}

/** Render markdown to HTML, resolving `[[term]]` / `[[term|label]]` glossary links and `{{cards}}`. */
export function renderMarkdown(md: string, opts: CompileOptions = {}): string {
  const withLinks = md.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, term: string, label?: string) => {
      const key = term.trim().toLowerCase();
      const slug = opts.glossaryTerms?.get(key) ?? (opts.glossarySlugs?.has(key) ? key : undefined);
      if (!slug) {
        if (opts.glossarySlugs || opts.glossaryTerms)
          throw new Error(`unknown glossary term [[${term}]]`);
        return label ?? term;
      }
      return `<a class="gloss" href="#/glossary?term=${encodeURIComponent(slug)}">${label ?? term.trim()}</a>`;
    },
  );
  // Tables scroll sideways on phones; a scrolling region must be keyboard focusable (axe).
  return markedFor(opts.headingShift ?? 0)
    .parse(withLinks, { async: false })
    .trim()
    .replace(/<table>/g, '<table tabindex="0" aria-label="Table, scrolls sideways">');
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${what} must be a non-empty string`);
  return v;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Card codes of one side: 2 or 3 cards. */
function parseSide(raw: unknown, side: string, what: string) {
  const text = str(raw, `${what}: hand.${side}`);
  const cards = parseCards(text);
  if (cards.length < 2 || cards.length > 3)
    throw new Error(`${side} must have 2 or 3 cards, got ${cards.length}`);
  return { text, cards };
}

/**
 * A quiz drawing `{ player, banker }`: valid, disjoint cards, 2-3 per side, and a third card
 * exactly where the drawing rules (the engine's playerDraws / bankerDraws) say so.
 */
function parseHand(raw: unknown, what: string): QuizHand {
  if (!isObj(raw)) throw new Error(`${what}: hand must be a mapping { player, banker }`);
  try {
    const p = parseSide(raw.player, 'player', what);
    const b = parseSide(raw.banker, 'banker', what);
    parseCards(`${p.text} ${b.text}`); // also rejects a card on both sides
    const p2 = handTotal(p.cards.slice(0, 2));
    const b2 = handTotal(b.cards.slice(0, 2));
    const pd = playerDraws(p2, b2);
    if (pd.draws !== (p.cards.length === 3))
      throw new Error(
        pd.draws
          ? `the Player (total ${p2}) draws a third card`
          : `the Player (total ${p2}) stands, so there is no third card`,
      );
    const third = p.cards.length === 3 ? cardValue(p.cards[2]!) : null;
    const bd = bankerDraws(b2, p2, third);
    if (bd.draws !== (b.cards.length === 3))
      throw new Error(
        bd.draws
          ? `the Banker (total ${b2}) draws a third card`
          : `the Banker (total ${b2}) stands, so there is no third card`,
      );
    return { player: p.text, banker: b.text };
  } catch (e) {
    throw new Error(`${what}: hand ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

export function parseQuizzes(yamlText: string, lessonId: string, startIndex: number): Quiz[] {
  const raw: unknown = parseYaml(yamlText);
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => {
    const n = startIndex + i + 1;
    const what = `quiz ${n}`;
    if (!isObj(item)) throw new Error(`${what}: entry must be a mapping`);
    const options = item.options ?? item.choices;
    if (!Array.isArray(options) || !options.every((x) => typeof x === 'string' && x.trim() !== ''))
      throw new Error(`${what}: options must be a list of non-empty strings`);
    if (options.length < 2) throw new Error(`${what}: needs at least 2 options`);
    if (new Set(options.map((o: string) => o.trim())).size !== options.length)
      throw new Error(`${what}: options must be distinct`);
    const answer = item.answer;
    if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length)
      throw new Error(`${what}: answer must be a 0-based index into options (0..${options.length - 1})`);
    const prompt = str(item.q ?? item.prompt, `${what}: q`);
    const explanation = str(item.explain ?? item.explanation, `${what}: explain`);
    checkInline(prompt, `${what}: q`);
    options.forEach((o: string, k) => checkInline(o, `${what}: option ${k + 1}`));
    checkInline(explanation, `${what}: explain`);
    const quiz: Quiz = {
      id: typeof item.id === 'string' && item.id ? item.id : `${lessonId}-q${n}`,
      prompt,
      choices: options as string[],
      answer,
      explanation,
    };
    if (item.hand !== undefined) quiz.hand = parseHand(item.hand, what);
    return quiz;
  });
}

const TABLEAU_VIEWS: readonly TableauView[] = ['player', 'banker', 'both'];
const BANKER_CELL = /^B([0-7])-P(none|[0-9])$/;
const PLAYER_CELL = /^P([0-9])$/;

/** True for a cell that exists: `B5-P4`, `B6-Pnone` (Player stood) or `P5` (Player total). */
export function isTableauCell(cell: string): boolean {
  const b = BANKER_CELL.exec(cell);
  if (b) {
    const row = TABLEAU[Number(b[1])];
    return row !== undefined && row.length === 11;
  }
  return PLAYER_CELL.test(cell);
}

export function parseTableau(yamlText: string): TableauBlockData {
  const raw: unknown = parseYaml(yamlText);
  if (!isObj(raw)) throw new Error('tableau block must be a YAML mapping { view, highlight? }');
  const view = str(raw.view, 'tableau: view');
  if (!(TABLEAU_VIEWS as readonly string[]).includes(view))
    throw new Error(`tableau: unknown view "${view}" (known: ${TABLEAU_VIEWS.join(', ')})`);
  const out: TableauBlockData = { view: view as TableauView };
  if (raw.highlight !== undefined) {
    const h = raw.highlight;
    if (!Array.isArray(h) || !h.every((x) => typeof x === 'string'))
      throw new Error('tableau: highlight must be a list, e.g. [B5-P9, P5]');
    const bad = h.filter((c) => !isTableauCell(c));
    if (bad.length)
      throw new Error(
        `tableau: unknown cells in highlight: ${bad.join(', ')} (use B<0-7>-P<0-9|none> or P<0-9>)`,
      );
    out.highlight = h;
  }
  return out;
}

const ROAD_VIEWS: readonly RoadView[] = ['bead', 'big'];

export function parseRoads(yamlText: string): RoadsBlockData {
  const raw: unknown = parseYaml(yamlText);
  if (!isObj(raw)) throw new Error('roads block must be a YAML mapping { results, view?, caption? }');
  const results = str(raw.results, 'roads: results');
  try {
    if (parseRoadResults(results).length === 0) throw new Error('no results');
  } catch (e) {
    throw new Error(`roads: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  let view: RoadView[] = [...ROAD_VIEWS];
  if (raw.view !== undefined) {
    const v: unknown = Array.isArray(raw.view) ? raw.view : [raw.view];
    if (
      !Array.isArray(v) ||
      v.length === 0 ||
      !v.every((x) => typeof x === 'string' && (ROAD_VIEWS as readonly string[]).includes(x))
    )
      throw new Error(`roads: view must be a subset of ${ROAD_VIEWS.join(', ')}`);
    view = v as RoadView[];
  }
  const out: RoadsBlockData = { results, view };
  if (raw.caption !== undefined) {
    out.caption = str(raw.caption, 'roads: caption');
    checkInline(out.caption, 'roads: caption');
  }
  return out;
}

/** Text a scene shows at runtime must also have valid `{{cards}}`. */
function checkSceneText(scene: unknown): void {
  if (!isObj(scene) || !Array.isArray(scene.steps)) return;
  for (const step of scene.steps as unknown[]) {
    if (!isObj(step)) continue;
    for (const k of ['text', 'hint', 'math'] as const) {
      const v = step[k];
      if (typeof v === 'string') checkInline(v, `scene ${String(scene.id)} step ${String(step.id)} ${k}`);
    }
  }
}

type FenceLang = 'scene' | 'quiz' | 'tableau' | 'roads';
type Seg =
  | { t: 'md'; text: string }
  | { t: 'fence'; lang: FenceLang; text: string }
  | { t: 'box'; kind: 'math' | 'tip'; title: string; text: string };

/** Split a lesson body into markdown / scene / quiz / tableau / roads / math / tip segments. */
function segment(body: string): Seg[] {
  const lines = body.split(/\r?\n/);
  const segs: Seg[] = [];
  let md: string[] = [];
  const flush = () => {
    if (md.join('').trim()) segs.push({ t: 'md', text: md.join('\n') });
    md = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fence = /^(`{3,})\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const [, ticks = '```', lang = ''] = fence;
      const end = findFenceEnd(lines, i + 1, ticks);
      if (lang === 'scene' || lang === 'quiz' || lang === 'tableau' || lang === 'roads') {
        flush();
        segs.push({ t: 'fence', lang, text: lines.slice(i + 1, end).join('\n') });
      } else if (lang === 'math' || lang === 'callout' || lang === 'tip' || lang === 'chart') {
        throw new Error(
          lang === 'chart'
            ? 'unknown directive ```chart (use ```tableau or ```roads)'
            : `unknown directive \`\`\`${lang} (use :::${lang === 'math' ? 'math Title' : 'tip'})`,
        );
      } else md.push(...lines.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const box = /^:::\s*(math|tip)\b\s*(.*)$/.exec(line);
    if (box) {
      flush();
      const kind = box[1] as 'math' | 'tip';
      const inner: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const f = /^(`{3,})/.exec(l);
        if (f) {
          const end = findFenceEnd(lines, i + 1, f[1] ?? '```');
          inner.push(...lines.slice(i, end + 1));
          i = end + 1;
          continue;
        }
        if (/^:::\s*$/.test(l)) {
          closed = true;
          i++;
          break;
        }
        inner.push(l);
        i++;
      }
      if (!closed) throw new Error(`unclosed :::${kind} container`);
      segs.push({ t: 'box', kind, title: (box[2] ?? '').trim(), text: inner.join('\n') });
      continue;
    }
    if (/^:::/.test(line)) throw new Error(`unknown or stray container: ${line}`);
    md.push(line);
    i++;
  }
  flush();
  return segs;
}

function findFenceEnd(lines: string[], from: number, ticks: string): number {
  for (let j = from; j < lines.length; j++) {
    if ((lines[j] ?? '').trim() === ticks) return j;
  }
  throw new Error(`unclosed code fence (${ticks})`);
}

/** Pure: lesson source → Lesson (minus chapterId). Throws with a clear message on any error. */
export function compileLesson(
  source: string,
  file: string,
  opts: CompileOptions = {},
): CompiledLesson {
  try {
    const { data, body } = splitFrontMatter(source);
    const id = str(data.id, 'front matter id');
    const min = minHeadingDepth(body);
    opts = { ...opts, headingShift: min <= 6 ? Math.max(0, min - 2) : 0 };
    const blocks: Block[] = [];
    const quizIds = new Set<string>();
    let quizCount = 0;
    for (const seg of segment(body)) {
      if (seg.t === 'md') blocks.push({ kind: 'html', html: renderMarkdown(seg.text, opts) });
      else if (seg.t === 'box') {
        const html = renderMarkdown(seg.text, opts);
        if (seg.kind === 'tip') blocks.push({ kind: 'tip', html });
        else {
          if (!seg.title) throw new Error(':::math needs a title (":::math Title")');
          blocks.push({ kind: 'math', title: seg.title, html });
        }
      } else if (seg.lang === 'scene') {
        const json: unknown = parseYaml(seg.text);
        const res = validateScene(json);
        if (!res.ok) throw new Error(
            `invalid scene${isObj(json) && typeof json.id === 'string' ? ` "${json.id}"` : ''}: ${res.errors.join('; ')}`,
          );
        checkSceneText(json);
        blocks.push({ kind: 'scene', scene: res.scene });
      } else if (seg.lang === 'tableau') {
        blocks.push({ kind: 'tableau', tableau: parseTableau(seg.text) });
      } else if (seg.lang === 'roads') {
        blocks.push({ kind: 'roads', roads: parseRoads(seg.text) });
      } else {
        const quizzes = parseQuizzes(seg.text, id, quizCount);
        quizCount += quizzes.length;
        for (const quiz of quizzes) {
          if (quizIds.has(quiz.id)) throw new Error(`duplicate quiz id "${quiz.id}"`);
          quizIds.add(quiz.id);
          blocks.push({ kind: 'quiz', quiz });
        }
      }
    }
    const sceneIds = blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene.id] : []));
    const dupScene = sceneIds.find((s, k) => sceneIds.indexOf(s) !== k);
    if (dupScene) throw new Error(`duplicate scene id "${dupScene}"`);
    const minutes = data.minutes;
    if (typeof minutes !== 'number' || !(minutes > 0))
      throw new Error('front matter minutes must be a positive number');
    const chapter = data.chapter === undefined ? undefined : str(data.chapter, 'front matter chapter');
    return {
      id,
      title: str(data.title, 'front matter title'),
      summary: str(data.summary, 'front matter summary'),
      minutes,
      blocks,
      ...(chapter ? { chapter } : {}),
    };
  } catch (e) {
    throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}
