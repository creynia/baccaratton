// Scene runner (simulator.md section 5): pure runner + strict validation + the headless driver
// the Simulator container and the every-scene-completes test share.
export type * from './types';
export { validateScene, CONDITION_KINDS, forcedHandRecord } from './validate';
export type { SceneValidation } from './validate';
export {
  initScene,
  currentStep,
  activeGate,
  effectiveGate,
  gateAction,
  observe,
  isSatisfied,
  answerKey,
  matchAction,
  leaves,
  hasAcknowledged,
  needsHand,
  ALL_ACTIONS,
  DEFAULT_REJECT,
  PREDICT_OPTIONS,
  PREDICT_QUESTION,
} from './runner';
export type { SceneContext, Gate, AnswerKey } from './runner';
export { SimDriver, parseShoeParam, sessionSummary } from './driver';
export type {
  DriverView,
  DriverEvent,
  DriverOptions,
  Reveal,
  PredictFeedback,
  Snapshot,
} from './driver';
