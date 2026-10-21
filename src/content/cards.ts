// Inline card notation shared by the build-time compiler and the runtime components.
// `{{Kh 7d}}` -> a group of cards; `{{Kh 7d =}}` adds a visible total badge; `{{Kh 7d =7}}`
// asserts the baccarat total (the build fails if it is wrong). Validation uses the engine's
// parseCards and handTotal (one definition).
import { cardName, handTotal, parseCards, rankOf, suitOf } from '../sim/engine';
import type { Card, CardValue } from '../sim/engine';

export type SuitLetter = 's' | 'h' | 'd' | 'c';
const SUIT_LETTERS: readonly SuitLetter[] = ['s', 'h', 'd', 'c'];
const GLYPH: Record<SuitLetter, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = 'A23456789TJQK';
/** U+FE0E asks for the text (not emoji) presentation, so Android does not draw coloured hearts. */
const TEXT_PRESENTATION = '︎';

export interface CardFace {
  rank: string; // 'A', '2'..'9', '10', 'J', 'Q', 'K'
  suit: SuitLetter;
  glyph: string; // suit glyph + text-presentation selector
  name: string; // 'Ace of spades'
}

export function cardFace(card: Card): CardFace {
  const r = RANK_LABEL.charAt(rankOf(card));
  const suit = SUIT_LETTERS[suitOf(card)] ?? 's';
  return {
    rank: r === 'T' ? '10' : r,
    suit,
    glyph: GLYPH[suit] + TEXT_PRESENTATION,
    name: cardName(card),
  };
}

export interface CardGroup {
  cards: Card[];
  /** Baccarat total of the whole group. */
  total: CardValue;
  /** Show the total as a visible badge. */
  badge: boolean;
}

/** Parses one group: card codes, then optionally `=` or `=<total>`. Throws a readable error. */
export function parseGroup(text: string): CardGroup {
  const m = /^([^=]*?)\s*(=\s*(\d?))?\s*$/.exec(text);
  const codes = m?.[1] ?? text;
  if (codes.trim() === '') throw new Error('empty card group {{}}');
  let cards: Card[];
  try {
    cards = parseCards(codes);
  } catch (e) {
    throw new Error(`bad card group {{${text}}}: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }
  const total = handTotal(cards);
  const asserted = m?.[3];
  if (asserted !== undefined && asserted !== '' && Number(asserted) !== total)
    throw new Error(`card group {{${text}}}: total is ${total}, not ${asserted}`);
  return { cards, total, badge: m?.[2] !== undefined };
}

/** HTML for a validated group; the same structure the <Cards> component renders. */
export function cardsHtml(text: string): string {
  const { cards, total, badge } = parseGroup(text);
  const faces = cards.map(cardFace);
  const label = `${faces.map((f) => f.name).join(', ')} (total ${total})`;
  const inner = faces
    .map((f) => `<span class="pc suit-${f.suit}" aria-hidden="true">${f.rank}${f.glyph}</span>`)
    .join('');
  const tag = badge ? `<span class="pc-total" aria-hidden="true">${total}</span>` : '';
  return `<span class="cards" role="img" aria-label="${label}">${inner}${tag}</span>`;
}

export type InlineSeg =
  | { t: 'text'; text: string }
  | ({ t: 'cards'; codes: string } & CardGroup);

const GROUP = /\{\{([^{}]*)\}\}/g;

/** Splits plain text around `{{cards}}` groups. Throws on a malformed group. */
export function splitInline(text: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(GROUP)) {
    const codes = m[1] ?? '';
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    out.push({ t: 'cards', codes, ...parseGroup(codes) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

/** Build-time check for text that is rendered at runtime (quiz text, scene step text). */
export function checkInline(text: string, what: string): void {
  try {
    splitInline(text);
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}
