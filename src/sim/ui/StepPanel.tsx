// The guided step above the table (simulator.md section 5, architecture.md section 2.3): the step's
// text with **bold**, _italic_ and {{Kh 7d}} inline cards, its hint, "Show the math", and the Next
// button for `acknowledged` / `advance: button` steps.
import type { ComponentChildren } from 'preact';
import { parseCards, rankOf, suitOf } from '../engine/cards';
import { RANK_CHARS } from '../engine/types';
import type { SceneStep } from '../scene/types';
import { SUIT_GLYPH } from './Card';
import './simulator.css';

const SUIT_CLASS = ['s', 'h', 'd', 'c'];

function inlineCards(group: string, key: string): ComponentChildren {
  let cards: number[];
  try {
    cards = parseCards(group);
  } catch {
    return `{{${group}}}`;
  }
  return (
    <span class="sim-inline-cards" key={key}>
      {cards.map((c, i) => {
        const r = RANK_CHARS[rankOf(c)]!;
        const s = suitOf(c);
        return (
          <span key={i} class={`sim-inline-card suit-${SUIT_CLASS[s]}`}>
            {r === 'T' ? '10' : r}
            {SUIT_GLYPH[s]}
          </span>
        );
      })}
    </span>
  );
}

/** **bold**, _italic_ and {{cards}} (the scene text markup, curriculum section 1.1). */
export function richText(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])|\{\{([^}]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{richText(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k++}>{m[2]}</em>);
    else out.push(inlineCards(m[3]!, `c${k++}`));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface StepPanelProps {
  step: SceneStep | undefined;
  index: number;
  count: number;
  done: boolean;
  showNext: boolean;
  onNext?: () => void;
  /** A rejected action's hint, or the idle hint. */
  hint?: string | null;
  /** The table is still dealing: Next waits. */
  busy?: boolean;
  compact?: boolean;
}

export function StepPanel({
  step,
  index,
  count,
  done,
  showNext,
  onNext,
  hint,
  busy,
  compact,
}: StepPanelProps) {
  if (done || !step) {
    return (
      <section class="sim-step is-done" aria-label="Lesson step" data-testid="step-panel" data-done="true">
        <p class="sim-step-count">
          <span aria-hidden="true">✓ </span>Done. The table is yours: keep playing if you like.
        </p>
      </section>
    );
  }
  return (
    <section
      class={`sim-step${compact ? ' is-compact' : ''}`}
      aria-label="Lesson step"
      data-testid="step-panel"
      data-step={step.id}
    >
      <p class="sim-step-count">
        Step {index + 1} of {count}
      </p>
      <p class="sim-step-text" aria-live="polite">
        {richText(step.text)}
      </p>
      {hint ? (
        <p class="sim-step-hint" role="status" data-testid="step-hint">
          {richText(hint)}
        </p>
      ) : null}
      {step.math ? (
        <details class="sim-step-math">
          <summary>Show the math</summary>
          <p>{richText(step.math)}</p>
        </details>
      ) : null}
      {showNext ? (
        <button
          type="button"
          class="sim-btn sim-btn-primary sim-step-next"
          onClick={onNext}
          disabled={busy}
          data-action="next"
          data-hit="next"
        >
          {index + 1 === count ? 'Finish' : 'Next'}
        </button>
      ) : null}
    </section>
  );
}
