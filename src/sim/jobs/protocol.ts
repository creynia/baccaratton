// ===== src/sim/jobs/protocol.ts — FROZEN =====
import type { SimulateRequest, SimulateResult } from '../strategy/types';
import type { Progress } from '../engine/job';
export type { Progress, Job } from '../engine/job';

export interface EvJobs {
  simulate: { req: SimulateRequest; res: SimulateResult }; // auto-play, many sessions, compare
}
export type JobKind = keyof EvJobs;
export interface EvClient {
  run<K extends JobKind>(
    kind: K, req: EvJobs[K]['req'],
    opts?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<EvJobs[K]['res']>;
  readonly mode: 'worker' | 'inthread';
  dispose(): void;
}
