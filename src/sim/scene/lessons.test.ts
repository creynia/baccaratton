// Every scene of every lesson, scripted to completion through the real runner and driver
// (simulator.md section 5.4 rule 12): a scripted learner taps, previews, bets, deals and answers
// the staged-reveal questions, once with correct answers and once answering wrong first.
import { describe, expect, it } from 'vitest';
import { buildContent } from '../../content/load';
import type { Action } from '../engine/types';
import { SimDriver } from './driver';
import type { DriverEvent } from './driver';
import { leaves } from './runner';
import type { Condition, SceneConfig, SceneStep } from './types';

const bundle = buildContent(process.cwd());
const lessons = bundle.lessons.filter((l) => !l.id.startsWith('sample-'));
const scenes: { lesson: string; scene: SceneConfig }[] = lessons.flatMap((l) =>
  l.blocks.flatMap((b) => (b.kind === 'scene' ? [{ lesson: l.id, scene: b.scene }] : [])),
);

function wrongOf(options: readonly string[], right: string): string {
  return options.find((o) => o !== right)!;
}

interface RunResult {
  events: DriverEvent[];
  driver: SimDriver;
  wrongFeedback: number;
}

function playScene(scene: SceneConfig, wrongFirst: boolean): RunResult {
  const events: DriverEvent[] = [];
  const d = new SimDriver({ scene, mode: 'scene', seed: 1, onEvent: (e) => events.push(e) });
  let wrongFeedback = 0;
  const answered = new Set<string>();
  const must = (a: Action) => {
    const r = d.act(a);
    if (!r.ok) throw new Error(`${scene.id}: ${a.type} rejected: ${r.message}`);
  };
  const deal = (step: SceneStep) => {
    const v = d.view;
    const empty = Object.values(v.state.bets).every((x) => !x);
    const rebet =
      empty && v.gate.actions.includes('rebet') && Object.keys(v.state.lastBets).length > 0;
    must({ type: 'deal', ...(rebet ? { rebet: true } : {}) });
    const a = d.view.awaiting;
    if (a) {
      const right = d.expectedAnswer()!;
      const k = `${step.id}`;
      const wrong = wrongFirst && !answered.has(k);
      answered.add(k);
      const fb = d.predict(wrong ? wrongOf(a.options, right) : right)!;
      expect(fb.correct).toBe(!wrong);
      if (wrong) {
        expect(fb.ruleRow.length).toBeGreaterThan(10);
        wrongFeedback++;
      }
    } else if (step.predict && !step.skipNaturals) {
      throw new Error(`${scene.id}/${step.id}: a predict step dealt without a question`);
    }
  };
  const doLeaf = (leaf: Condition, step: SceneStep): boolean => {
    if ('tapped' in leaf) d.tap(leaf.tapped);
    else if ('previewed' in leaf)
      d.previewed(leaf.previewed.bet ?? 'banker', !!leaf.previewed.whyOpened);
    else if ('acknowledged' in leaf) d.acknowledge();
    else if ('betOnFelt' in leaf) {
      const { bet, minAmount } = leaf.betOnFelt;
      const have = d.view.state.bets[bet] ?? 0;
      const fixed = step.expect?.find(
        (m) => m.type === 'set-bet' && m.amount !== undefined,
      )?.amount;
      const want = fixed ?? Math.max(minAmount ?? 500, 100);
      if (have < want) must({ type: 'set-bet', bet: bet, amount: want });
    } else if ('autoPlayCompleted' in leaf) {
      const ap = scene.autoPlay!;
      const strategy =
        leaf.autoPlayCompleted.strategy ??
        ap.compare?.[0]?.id ??
        ap.defaultStrategy?.id ??
        'flat-banker';
      d.autoPlayCompleted(leaf.autoPlayCompleted.minHands ?? 72, strategy);
    } else return false;
    return true;
  };
  for (let guard = 0; !d.view.rt.done; guard++) {
    if (guard > 300) throw new Error(`${scene.id}: stuck on step ${d.view.step?.id}`);
    const v = d.view;
    const step = v.step!;
    const idx = v.rt.stepIndex;
    if (v.showNext && v.rt.satisfied) {
      d.acknowledge();
      continue;
    }
    const cond = step.completeWhen;
    const list = 'any' in cond ? [cond.any[0]!] : leaves(cond);
    let acted = false;
    for (const leaf of list) {
      if (d.view.rt.stepIndex !== idx || d.view.rt.done) break;
      if (doLeaf(leaf, step)) acted = true;
    }
    if (d.view.rt.stepIndex !== idx || d.view.rt.done) continue;
    if (d.view.rt.satisfied) continue;
    if (
      !acted ||
      list.some(
        (l) =>
          !(
            'tapped' in l ||
            'previewed' in l ||
            'betOnFelt' in l ||
            'acknowledged' in l ||
            'autoPlayCompleted' in l
          ),
      )
    ) {
      expect(d.view.dealLocked, `${scene.id}/${step.id} needs a deal`).toBe(false);
      deal(step);
    }
  }
  return { events, driver: d, wrongFeedback };
}

describe('every lesson scene completes through the real runner', () => {
  it('finds the scenes of all 24 lessons', () => {
    expect(lessons).toHaveLength(24);
    expect(scenes.length).toBeGreaterThanOrEqual(24);
  });
  it.each(scenes.map((s) => [`${s.lesson} ${s.scene.id}`, s.scene] as const))(
    '%s (correct answers)',
    (_name, scene) => {
      const { events } = playScene(scene, false);
      const done = events
        .filter((e) => e.type === 'step-completed')
        .map((e) => (e as { stepId: string }).stepId);
      expect(done).toEqual((scene.steps ?? []).map((s) => s.id));
      expect(events.some((e) => e.type === 'scene-completed')).toBe(true);
    },
  );
  const predicting = scenes.filter((s) => s.scene.steps?.some((st) => st.predict));
  it.each(predicting.map((s) => [`${s.lesson} ${s.scene.id}`, s.scene] as const))(
    '%s (wrong answers first)',
    (_name, scene) => {
      const { events, wrongFeedback } = playScene(scene, true);
      expect(wrongFeedback).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'scene-completed')).toBe(true);
    },
  );
});
