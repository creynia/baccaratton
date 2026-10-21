import { describe, expect, it } from 'vitest';
import { CONDITION_KINDS, validateScene } from './validate';

const ok = {
  id: 's1',
  version: 1,
  steps: [{ id: 'a', text: 'Hello', completeWhen: { acknowledged: true }, advance: 'button' }],
};

describe('validateScene (shape only in WP0)', () => {
  it('accepts a minimal scene and returns it', () => {
    const r = validateScene(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scene.id).toBe('s1');
  });
  it('accepts a scene with no steps (a free table)', () => {
    expect(validateScene({ id: 'free', version: 1, variant: 'ez' }).ok).toBe(true);
  });
  it.each([
    ['not a mapping', 'x'],
    ['no id', { version: 1 }],
    ['wrong version', { id: 'a', version: 2 }],
    ['unknown variant', { id: 'a', version: 1, variant: 'classic' }],
    ['unknown bet id', { id: 'a', version: 1, bets: { 'dragon-8': 500 } }],
    ['steps not a list', { id: 'a', version: 1, steps: {} }],
    [
      'step without id',
      { id: 'a', version: 1, steps: [{ text: 't', completeWhen: { hands: 1 } }] },
    ],
    [
      'duplicate step ids',
      {
        id: 'a',
        version: 1,
        steps: [
          { id: 's', text: 't', completeWhen: { hands: 1 } },
          { id: 's', text: 't', completeWhen: { hands: 1 } },
        ],
      },
    ],
    [
      'step without text',
      { id: 'a', version: 1, steps: [{ id: 's', completeWhen: { hands: 1 } }] },
    ],
    ['step without completeWhen', { id: 'a', version: 1, steps: [{ id: 's', text: 't' }] }],
    [
      'unknown condition',
      { id: 'a', version: 1, steps: [{ id: 's', text: 't', completeWhen: { nope: 1 } }] },
    ],
    [
      'empty all',
      { id: 'a', version: 1, steps: [{ id: 's', text: 't', completeWhen: { all: [] } }] },
    ],
  ])('rejects: %s', (_name, json) => {
    const r = validateScene(json);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('checks nested conditions', () => {
    const r = validateScene({
      id: 'a',
      version: 1,
      steps: [{ id: 's', text: 't', completeWhen: { all: [{ hands: 1 }, { nope: true }] } }],
    });
    expect(r.ok).toBe(false);
  });
  it('knows every Condition kind of the frozen types', () => {
    expect(CONDITION_KINDS).toHaveLength(15);
  });
});
