import { describe, expect, it } from 'vitest';
import { createEvClient } from './client';
import type { EvClientOptions } from './client';
import type { Progress } from '../engine/job';
import type { SimulateRequest, SimulateResult } from '../strategy/types';

const req = { strategy: { id: 'flat-banker', unit: 1000 } } as unknown as SimulateRequest;

// A stub job: yields progress `req.hands` times and returns an empty result.
function* stubJob(r: SimulateRequest): Generator<Progress | undefined, SimulateResult, void> {
  for (let i = 0; i < r.hands; i++) yield { done: i, total: r.hands };
  return { series: [], ms: 0 };
}
const jobs: NonNullable<EvClientOptions['jobs']> = { simulate: stubJob };
const hands = (n: number) => ({ ...req, hands: n });
const client = (extra: EvClientOptions = {}) => createEvClient({ jobs, ...extra });

describe('createEvClient (in-thread)', () => {
  it('runs a job, reports progress and says it is in-thread', async () => {
    const c = client();
    const seen: number[] = [];
    const res = await c.run('simulate', hands(3), { onProgress: (p) => seen.push(p.done) });
    expect(res).toEqual({ series: [], ms: 0 });
    expect(seen).toEqual([0, 1, 2]);
    expect(c.mode).toBe('inthread');
  });

  it('latest wins per key: the older run is aborted', async () => {
    const c = client({ sliceMs: 0 });
    const first = c.run('simulate', hands(1000), { key: 'k' });
    const second = c.run('simulate', hands(2), { key: 'k' });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toBeDefined();
  });

  it('aborts through an AbortSignal, before and during a run', async () => {
    const c = client({ sliceMs: 0 });
    const ctl = new AbortController();
    const p = c.run('simulate', hands(100_000), { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await expect(c.run('simulate', hands(1), { signal: ctl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects after dispose', async () => {
    const c = client();
    c.dispose();
    await expect(c.run('simulate', hands(1))).rejects.toThrow(/disposed/);
  });
});
