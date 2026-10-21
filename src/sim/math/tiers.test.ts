import { describe, expect, it } from 'vitest';
import { frac } from './fraction';
import { betTier } from './tiers';

describe('betTier (D19)', () => {
  it.each([
    [frac(-1n, 100n), 'free'],
    [frac(0n), 'free'],
    [frac(1n, 10n ** 12n), 'good'],
    [frac(2n, 100n), 'good'],
    [frac(2n * 10n ** 9n + 1n, 10n ** 11n), 'fair'],
    [frac(5n, 100n), 'fair'],
    [frac(5n * 10n ** 9n + 1n, 10n ** 11n), 'costly'],
    [frac(9n * 10n ** 9n - 1n, 10n ** 11n), 'costly'],
    [frac(9n, 100n), 'sucker'],
    [frac(1n), 'sucker'],
  ] as const)('%o → %s', (edge, tier) => {
    expect(betTier(edge)).toBe(tier);
  });
});
