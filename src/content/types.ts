import type { BetId, Card, VariantId } from '../sim/engine/types';
import type { BetTier } from '../sim/math/types';
import type { SceneConfig } from '../sim/scene/types';
import type { StrategyId, TableauCellId } from '../sim/strategy/types';

export type LessonId = string;
export type ChapterId = string;

/** Bet edge tiers and badge text (decisions.md D19, D30): free <= 0 < good <= 2% < fair <= 5% < costly < 9% <= sucker. */
export type Tier = BetTier;
export const TIERS: readonly Tier[] = ['free', 'good', 'fair', 'costly', 'sucker'];
export const TIER_LABEL: Record<Tier, string> = {
  free: 'No house edge',
  good: 'Good bet',
  fair: 'Fair',
  costly: 'Costly',
  sucker: 'Sucker bet',
};

/** A quiz drawing (YAML `{ player: [4h, 2c, 9d], banker: [Kd, 5s] }`, D34); a third card only where the rule draws. */
export interface QuizHand {
  player: Card[];
  banker: Card[];
}
export interface Quiz {
  /** `<lessonId>-q<n>` (1-based) unless the author gave one */
  id: string;
  prompt: string;
  choices: string[];
  /** index into `choices` (0-based) */
  answer: number;
  explanation: string;
  hand?: QuizHand;
}

export type TableauView = 'player' | 'banker' | 'full';
export interface TableauBlockData {
  view: TableauView;
  /** Simulator `TableauCellId`s (D34): `b4/p7`, `b6/s` (Player stood), `p5` (Player total) */
  highlight?: TableauCellId[];
}

export type RoadView = 'bead' | 'big';
export interface RoadsBlockData {
  /** Road tokens like `BBPBTPPpPb` or `B Bbp P5 T Pn9` (engine parseRoadString, D34) */
  results: string;
  view: RoadView[];
  caption?: string;
}

export type Block =
  | { kind: 'html'; html: string } // marked output, trusted repo content
  | { kind: 'math'; title: string; html: string } // collapsible "Show the math"
  | { kind: 'tip'; html: string }
  | { kind: 'scene'; scene: SceneConfig }
  | { kind: 'quiz'; quiz: Quiz }
  | { kind: 'tableau'; tableau: TableauBlockData }
  | { kind: 'roads'; roads: RoadsBlockData };

export interface Lesson {
  id: LessonId;
  title: string;
  summary: string;
  minutes: number;
  chapterId: ChapterId;
  blocks: Block[];
  /** Cited sources, in `[^n]` order (n is 1-based); omitted when the lesson cites none. */
  sources?: LessonSource[];
}

/** One cited source, resolved from a content/sources.json id or written inline in front matter. */
export interface LessonSource {
  title: string;
  author?: string;
  url?: string;
  note?: string;
}

/** An entry of content/sources.json; `id` is the stable key lessons use in `sources:`. */
export interface SourceItem extends LessonSource {
  id: string;
}
export interface SourceGroup {
  group: string;
  items: SourceItem[];
}

export interface Chapter {
  id: ChapterId;
  title: string;
  summary: string;
  lessons: LessonId[];
}

/** Source form (content/glossary.json) has markdown; the compiled bundle holds HTML. */
export interface GlossaryEntry {
  term: string;
  slug: string;
  definition: string; // markdown in source, HTML in the bundle
  see?: string[];
  /** lesson that teaches the term (source field `seeAlso`) */
  lessonId?: LessonId;
}

/** Copy for a bet (content/bets.json). Numbers come from the engine and math, never from here. */
export interface BetCopy {
  name?: string;
  tip?: string;
  summary: string;
  howItWorks: string; // markdown in source, HTML in the bundle
  lessonId?: LessonId;
}

/** Copy for a betting system (content/systems.json). */
export interface SystemCopy {
  title: string;
  summary: string;
  rules: string[]; // markdown in source, HTML in the bundle
  lessonId?: LessonId;
}

export interface ContentBundle {
  chapters: Chapter[];
  lessons: Lesson[];
  glossary: GlossaryEntry[];
  bets: Partial<Record<BetId, BetCopy>>;
  systems: Partial<Record<StrategyId, SystemCopy>>;
  /** content/sources.json: the Sources screen */
  sources: SourceGroup[];
}

/** Variant ids a lesson may name in front matter or scenes. */
export type { VariantId };
