// In-thread job client (architecture.md section 4.2, Plan A): time-slices generator jobs on the
// main thread. Latest wins per `key`, abort via AbortSignal. No worker, no cache.
import { runSliced } from './runner';
import { JOBS } from './jobs';
import type { Job, Progress } from '../engine/job';
import type { EvClient, EvJobs, JobKind } from './protocol';

export interface EvClientOptions {
  /** Time slice before yielding to the event loop (ms). Default 8. */
  sliceMs?: number;
  /** Test hook: replace the job table. */
  jobs?: { [K in JobKind]: Job<EvJobs[K]['req'], EvJobs[K]['res']> };
  /** Test hook: replace the yield (default MessageChannel, falling back to setTimeout). */
  yieldFn?: () => Promise<void>;
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/** Yields with a MessageChannel round trip (no 4 ms setTimeout clamp); setTimeout if unavailable. */
function makeYield(): () => Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.addEventListener('message', () => waiting.shift()?.());
  channel.port1.start();
  return () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      channel.port2.postMessage(null);
    });
}

export function createEvClient(opts: EvClientOptions = {}): EvClient {
  const jobs = opts.jobs ?? JOBS;
  const sliceMs = opts.sliceMs ?? 8;
  const yieldFn = opts.yieldFn ?? makeYield();
  const latestByKey = new Map<string, symbol>();
  const cancels = new Set<() => void>();
  let disposed = false;

  return {
    run<K extends JobKind>(
      kind: K,
      req: EvJobs[K]['req'],
      o?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
    ): Promise<EvJobs[K]['res']> {
      if (disposed) return Promise.reject(new Error('EvClient disposed'));
      if (o?.signal?.aborted) return Promise.reject(abortError());
      const token = Symbol(kind);
      if (o?.key) latestByKey.set(o.key, token);
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
      };
      cancels.add(cancel);
      o?.signal?.addEventListener('abort', cancel);
      const superseded = () => o?.key !== undefined && latestByKey.get(o.key) !== token;
      return runSliced<EvJobs[K]['req'], EvJobs[K]['res']>(jobs[kind], req, {
        sliceMs,
        yieldFn,
        onProgress: o?.onProgress,
        isCancelled: () => cancelled || superseded(),
      })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === 'CancelledError') throw abortError();
          throw e;
        })
        .finally(() => {
          cancels.delete(cancel);
          o?.signal?.removeEventListener('abort', cancel);
          if (o?.key && latestByKey.get(o.key) === token) latestByKey.delete(o.key);
        });
    },
    mode: 'inthread',
    dispose() {
      disposed = true;
      for (const cancel of cancels) cancel();
    },
  };
}
