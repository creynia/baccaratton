// Animation pacing (simulator.md section 4.4). The engine resolves a hand in one action; this turns
// its events into timed steps. Only transform and opacity animate. `instant` (or OS reduced
// motion) gives an empty timeline. No squeeze (D7): cards flip quickly.
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Card, GameEvent, PausePoint, Side } from '../engine/types';

export type Speed = 'normal' | 'fast' | 'instant';

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** OS reduced motion forces `instant`; otherwise the setting (default `normal`). */
export function effectiveSpeed(
  setting: Speed | undefined,
  reducedMotion: boolean = prefersReducedMotion(),
): Speed {
  return reducedMotion ? 'instant' : (setting ?? 'normal');
}

export interface Pacing {
  slide: number; // each of P1 B1 P2 B2 from the shoe
  flip: number; // both two-card hands + totals
  third: number; // each third card (slide + flip, sideways)
  result: number; // banner + winning spot glow
  chips: number; // pay / sweep
  shuffle: number; // "New shoe" banner
  burn: number; // the burn card face up
}
export const PACING: Readonly<Record<Exclude<Speed, 'instant'>, Pacing>> = {
  normal: { slide: 110, flip: 220, third: 220, result: 200, chips: 300, shuffle: 400, burn: 600 },
  fast: { slide: 50, flip: 80, third: 80, result: 80, chips: 120, shuffle: 160, burn: 240 },
};

export type StepKind = 'shuffle' | 'burn' | 'slide' | 'flip' | 'third' | 'result' | 'chips';
export interface TimelineStep {
  kind: StepKind;
  at: number;
  dur: number;
  side?: Side;
  index?: 0 | 1 | 2;
  card?: Card;
}
/** When one card slot moves and turns face up (ms from the start of the timeline). */
export interface SlotTiming {
  slideAt: number;
  flipAt: number;
}
export interface Segment {
  from: number;
  to: number;
  /** The pause point that ends this segment (null for the last one). */
  pause: PausePoint | null;
}
export interface Timeline {
  speed: Speed;
  steps: TimelineStep[];
  totalMs: number;
  /** Per side, per card index (0, 1, 2). Missing slots were not dealt. */
  slots: Record<Side, SlotTiming[]>;
  /** When each side's total badge shows its two-card and (if any) three-card total. */
  totals: Record<Side, { two: number; three: number | null }>;
  resultAt: number;
  chipsAt: number;
  /** Split at the `pause-point` events: a scene or Drill stops at the end of a segment. */
  segments: Segment[];
  /** The pacing used (null when instant). */
  pacing: Pacing | null;
}

const EMPTY_SLOTS = (): Record<Side, SlotTiming[]> => ({ player: [], banker: [] });

/** The empty (instant) timeline: everything is shown at once. */
export function instantTimeline(): Timeline {
  return {
    speed: 'instant',
    steps: [],
    totalMs: 0,
    slots: EMPTY_SLOTS(),
    totals: { player: { two: 0, three: null }, banker: { two: 0, three: null } },
    resultAt: 0,
    chipsAt: 0,
    segments: [],
    pacing: null,
  };
}

/**
 * Builds the timeline of one action's events. Two-card hands slide in one by one (P1 B1 P2 B2),
 * then flip together with their totals; each third card slides in sideways and flips; then the
 * result and the chips. A hand with no third cards takes ≈ 1.16 s at `normal`.
 */
export function buildTimeline(events: readonly GameEvent[], speed: Speed): Timeline {
  if (speed === 'instant') return instantTimeline();
  const P = PACING[speed];
  const steps: TimelineStep[] = [];
  const slots = EMPTY_SLOTS();
  const totals: Timeline['totals'] = {
    player: { two: 0, three: null },
    banker: { two: 0, three: null },
  };
  const pauses: { at: number; pause: PausePoint }[] = [];
  let t = 0;
  let flipped = false;
  let resultAt = 0;
  let chipsAt = 0;
  const flipTwo = () => {
    if (flipped) return;
    flipped = true;
    steps.push({ kind: 'flip', at: t, dur: P.flip });
    for (const s of ['player', 'banker'] as const) {
      for (const slot of slots[s]) slot.flipAt = t;
      totals[s].two = t;
    }
    t += P.flip;
  };
  for (const e of events) {
    switch (e.type) {
      case 'shoe-shuffled':
        steps.push({ kind: 'shuffle', at: t, dur: P.shuffle });
        t += P.shuffle;
        break;
      case 'burn':
        steps.push({ kind: 'burn', at: t, dur: P.burn, card: e.faceUp });
        t += P.burn;
        break;
      case 'card-dealt':
        if (e.index < 2) {
          steps.push({ kind: 'slide', at: t, dur: P.slide, side: e.to, index: e.index });
          slots[e.to][e.index] = { slideAt: t, flipAt: t };
          t += P.slide;
        } else {
          flipTwo();
          steps.push({ kind: 'third', at: t, dur: P.third, side: e.to, index: 2, card: e.card });
          slots[e.to][2] = { slideAt: t, flipAt: t + P.third / 2 };
          t += P.third;
          totals[e.to].three = t;
        }
        break;
      case 'pause-point':
        flipTwo();
        pauses.push({ at: t, pause: e.at });
        break;
      case 'hand-result':
        flipTwo();
        resultAt = t;
        steps.push({ kind: 'result', at: t, dur: P.result });
        t += P.result;
        break;
      case 'bet-settled':
        if (!chipsAt) {
          chipsAt = t;
          steps.push({ kind: 'chips', at: t, dur: P.chips });
          t += P.chips;
        }
        break;
      default:
        break;
    }
  }
  const segments: Segment[] = [];
  let from = 0;
  for (const p of pauses) {
    segments.push({ from, to: p.at, pause: p.pause });
    from = p.at;
  }
  if (steps.length) segments.push({ from, to: t, pause: null });
  return {
    speed,
    steps,
    totalMs: t,
    slots,
    totals,
    resultAt,
    chipsAt,
    segments,
    pacing: P,
  };
}

/**
 * Tracks whether a timeline is still playing. Any tap may call `skip()`, which shows the end
 * state at once (the engine state is already final). A new `key` restarts it.
 */
export function useSkippableMotion(key: unknown, totalMs: number) {
  const [skippedKey, setSkippedKey] = useState<unknown>(null);
  const [doneKey, setDoneKey] = useState<unknown>(null);
  useEffect(() => {
    if (totalMs <= 0) return;
    const h = setTimeout(() => setDoneKey(key), totalMs + 50);
    return () => clearTimeout(h);
  }, [key, totalMs]);
  const skip = useCallback(() => setSkippedKey(key), [key]);
  const skipped = skippedKey === key;
  const playing = totalMs > 0 && !skipped && doneKey !== key;
  return { playing, skipped, skip };
}

/**
 * The cards dealt up to a pause point (the whole hand for null): what a staged reveal shows while
 * a scene or Drill waits at `pause`.
 */
export function cardsUpTo(
  events: readonly GameEvent[],
  pause: PausePoint | null,
): Record<Side, Card[]> {
  const out: Record<Side, Card[]> = { player: [], banker: [] };
  for (const e of events) {
    if (e.type === 'pause-point' && e.at === pause) break;
    if (e.type === 'hand-started') {
      out.player = [];
      out.banker = [];
    }
    if (e.type === 'card-dealt') out[e.to][e.index] = e.card;
  }
  return out;
}
