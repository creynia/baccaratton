// Scene runner (simulator.md section 5.1). `validateScene` is a shape-only stub in WP0; the
// runner functions are TODO(integration).
import type { Action, HandRecord, Validation } from '../engine/types';
import type { SceneConfig, SceneInput, SceneRuntime, SceneStep } from './types';

export type * from './types';
export { validateScene, CONDITION_KINDS } from './validate';
export type { SceneValidation } from './validate';

const todo = (name: string): never => {
  throw new Error(`TODO(integration): ${name}`);
};

export function initScene(_scene: SceneConfig): SceneRuntime {
  return todo('initScene');
}
export function currentStep(_scene: SceneConfig, _rt: SceneRuntime): SceneStep | undefined {
  return todo('currentStep');
}
/** Rejects with `not-allowed-by-scene` and the step's hint. */
export function gateAction(_scene: SceneConfig, _rt: SceneRuntime, _action: Action): Validation {
  return todo('gateAction');
}
export function observe(_scene: SceneConfig, _rt: SceneRuntime, _input: SceneInput): SceneRuntime {
  return todo('observe');
}
export function answerKey(
  _step: SceneStep,
  _hand: HandRecord,
): { answer: string; ruleRow: string } {
  return todo('answerKey');
}
