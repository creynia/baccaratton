// The staged-reveal question (simulator.md section 5.2): Draw · Stand, a 0–9 keypad for totals, or
// Player · Banker · Tie. After the call it shows a tick, or the hint and the deciding rule row with
// a link to that tableau cell. There is no replay (D27).
import type { PredictFeedback, Reveal } from '../scene/driver';
import './simulator.css';

export interface PredictBarProps {
  awaiting: Reveal | null;
  onAnswer: (answer: string) => void;
}

export function PredictBar({ awaiting, onAnswer }: PredictBarProps) {
  if (!awaiting) return null;
  const keypad = awaiting.kind === 'hand-total';
  return (
    <div
      class={`sim-predict${keypad ? ' is-keypad' : ''}`}
      role="group"
      aria-label={awaiting.question}
      data-testid="predict-bar"
      data-kind={awaiting.kind}
    >
      <p class="sim-predict-q">{awaiting.question}</p>
      <div class="sim-predict-opts">
        {awaiting.options.map((o) => (
          <button
            key={o}
            type="button"
            class="sim-btn sim-predict-btn"
            onClick={() => onAnswer(o)}
            data-answer={o}
            data-hit={`predict-${o}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PredictFeedbackCard({ feedback }: { feedback: PredictFeedback | null }) {
  if (!feedback) return null;
  const f = feedback;
  return (
    <div
      class={`sim-feedback sim-toast ${f.correct ? 'sim-toast-good' : 'sim-toast-bad'}`}
      role="status"
      aria-live="polite"
      data-testid="predict-feedback"
      data-correct={String(f.correct)}
    >
      <p class="sim-feedback-head">
        <strong>{f.correct ? '✓ Right' : '✗ Not quite'}</strong>
        {f.correct
          ? `: ${f.answer}.`
          : f.kind === 'hand-total'
            ? `: you said ${f.chosen}.` // the rule row below works out the total once
            : `: the answer is ${f.answer} (you said ${f.chosen}).`}
      </p>
      {!f.correct ? (
        <>
          <p class="sim-feedback-rule" data-testid="rule-row">
            {f.ruleRow}
          </p>
          {f.cell ? (
            <a class="sim-link sim-feedback-chart" href={`#/rules?highlight=${f.cell}`}>
              See the chart
            </a>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
