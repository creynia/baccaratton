import { handTotal, parseCards } from '../../sim';
import type { Card } from '../../sim';
import { cardFace, splitInline } from '../../content/cards';

/**
 * A group of cards, the same markup as the compiled `{{Kh 7d}}` HTML. Accepts codes or Card ids.
 * The aria label includes the baccarat total; `total` also shows it as a badge.
 */
export function Cards(props: { cards: string | readonly Card[]; total?: boolean; class?: string }) {
  const list = typeof props.cards === 'string' ? parseCards(props.cards) : props.cards;
  const faces = list.map(cardFace);
  const total = handTotal(list);
  return (
    <span
      class={`cards ${props.class ?? ''}`.trim()}
      role="img"
      aria-label={`${faces.map((f) => f.name).join(', ')} (total ${total})`}
    >
      {faces.map((f, i) => (
        <span key={i} class={`pc suit-${f.suit}`} aria-hidden="true">
          {f.rank}
          {f.glyph}
        </span>
      ))}
      {props.total && (
        <span class="pc-total" aria-hidden="true">
          {total}
        </span>
      )}
    </span>
  );
}

/** Player and Banker cards side by side, each labelled with its total. */
export function HandPair(props: { player: readonly Card[]; banker: readonly Card[] }) {
  return (
    <div class="hand-pair">
      <div class="hand-side side-player">
        <span class="side-label">Player</span>
        {props.player.length > 0 ? <Cards cards={props.player} total /> : <span>—</span>}
      </div>
      <div class="hand-side side-banker">
        <span class="side-label">Banker</span>
        {props.banker.length > 0 ? <Cards cards={props.banker} total /> : <span>—</span>}
      </div>
    </div>
  );
}

/** Plain text with `{{cards}}` groups drawn inline (quiz text, options, explanations). */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((s, i) =>
        s.t === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <Cards key={i} cards={s.cards} total={s.badge} />
        ),
      )}
    </>
  );
}
