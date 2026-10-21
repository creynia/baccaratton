// Minimal `validateScene` (WP0): shape only. The integration WP replaces it with the strict
// no-dead-ends validation of simulator.md section 5.4 (same signature).
import { BET_IDS, VARIANT_IDS } from '../engine/types';
import type { SceneConfig } from './types';

export type SceneValidation =
  | { ok: true; scene: SceneConfig; errors: []; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Condition keys of the `Condition` union in types.ts. */
export const CONDITION_KINDS: readonly string[] = [
  'all',
  'any',
  'action',
  'event',
  'hands',
  'handResult',
  'betOnFelt',
  'bankrollAtLeast',
  'bankrollAtMost',
  'previewed',
  'tapped',
  'predicted',
  'autoPlayCompleted',
  'trackerPositive',
  'acknowledged',
];

function checkCondition(c: unknown, where: string, errors: string[]): void {
  if (!isObj(c)) {
    errors.push(`${where}: completeWhen must be a mapping`);
    return;
  }
  const keys = Object.keys(c).filter((k) => k !== 'count');
  const kind = keys.find((k) => CONDITION_KINDS.includes(k));
  if (!kind) {
    errors.push(`${where}: unknown condition (known: ${CONDITION_KINDS.join(', ')})`);
    return;
  }
  if (kind === 'all' || kind === 'any') {
    const list = c[kind];
    if (!Array.isArray(list) || list.length === 0)
      errors.push(`${where}: ${kind} needs a non-empty list`);
    else list.forEach((x, i) => checkCondition(x, `${where}.${kind}[${i}]`, errors));
  }
}

export function validateScene(json: unknown): SceneValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ['scene must be a mapping'], warnings };
  if (typeof json.id !== 'string' || json.id === '')
    errors.push('scene id must be a non-empty string');
  if (json.version !== 1) errors.push('scene version must be 1');
  if (json.variant !== undefined && !(VARIANT_IDS as readonly unknown[]).includes(json.variant))
    errors.push(
      `unknown variant ${JSON.stringify(json.variant)} (known: ${VARIANT_IDS.join(', ')})`,
    );
  if (isObj(json.bets))
    for (const bet of Object.keys(json.bets))
      if (!(BET_IDS as readonly string[]).includes(bet)) errors.push(`unknown bet id "${bet}"`);
  if (json.steps !== undefined) {
    if (!Array.isArray(json.steps)) errors.push('steps must be a list');
    else {
      const seen = new Set<string>();
      json.steps.forEach((step: unknown, i) => {
        const where = `step ${i + 1}`;
        if (!isObj(step)) return void errors.push(`${where}: must be a mapping`);
        if (typeof step.id !== 'string' || step.id === '') errors.push(`${where}: id is required`);
        else if (seen.has(step.id)) errors.push(`${where}: duplicate step id "${step.id}"`);
        else seen.add(step.id);
        if (typeof step.text !== 'string' || step.text === '')
          errors.push(`${where}: text is required`);
        checkCondition(step.completeWhen, where, errors);
      });
    }
  }
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, scene: json as unknown as SceneConfig, errors: [], warnings };
}
