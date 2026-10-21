// The sandbox snapshot (architecture.md section 2.4: PersistedV1.sandbox, opaque to the app). The
// app stores whatever `toSnapshot` returns and hands it back; `fromSnapshot` checks the shape and
// that it was taken at the same table, so a reload resumes the same shoe mid-way.
import type { Snapshot } from '../scene/driver';
import type { TiePays, VariantId } from '../engine/types';

export interface SandboxSnapshot extends Snapshot {
  /** The chip selected in the rack. */
  chip?: number;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function fromSnapshot(
  raw: unknown,
  table: { variant: VariantId; tiePays: TiePays },
): SandboxSnapshot | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.state)) return null;
  const s = raw.state;
  if (s.version !== 1 || !isObj(s.rules) || !isObj(s.shoe) || !isObj(s.stats)) return null;
  if (s.rules.variant !== table.variant || s.rules.tiePays !== table.tiePays) return null;
  if (!Array.isArray(s.shoe.order) || !Array.isArray(s.shoe.exposed) || !Array.isArray(s.history))
    return null;
  if (typeof s.bankroll !== 'number' || typeof raw.startEquity !== 'number') return null;
  return raw as unknown as SandboxSnapshot;
}

export function toSnapshot(s: Snapshot, chip: number): SandboxSnapshot {
  return { ...s, chip };
}
