import { simulateJob } from '../strategy';
import type { Job } from '../engine/job';
import type { EvJobs, JobKind } from './protocol';

/** Wires each job kind to its generator. Add a line per new kind in protocol.ts. */
export const JOBS: { [K in JobKind]: Job<EvJobs[K]['req'], EvJobs[K]['res']> } = {
  simulate: simulateJob,
};
