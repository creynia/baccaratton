// The container's effective settings (simulator.md section 4.6): SimSettings from the app, the
// scene's own table and ui, and the sandbox query (`?seed= ?shoe= ?variant= ?tie= ?system=
// ?speed=`, architecture.md section 2.1). Pure.
import { parseShoeParam } from '../scene/driver';
import type { SceneConfig } from '../scene/types';
import { STRATEGY_IDS } from '../strategy/ids';
import type { StrategyId } from '../strategy/types';
import type { Cents, ForcedHand, TiePays, VariantId } from '../engine/types';
import { VARIANT_IDS } from '../engine/types';
import { effectiveSpeed } from './animation';
import type { Speed } from './animation';
import type { SimSettings } from './types';

export interface SandboxQuery {
  seed?: number;
  forced?: ForcedHand[];
  variant?: VariantId;
  tiePays?: TiePays;
  system?: StrategyId;
  speed?: Speed;
  /** Problems with the query, shown once as a toast. */
  errors: string[];
}

export function parseSandboxQuery(q: URLSearchParams | undefined): SandboxQuery {
  const out: SandboxQuery = { errors: [] };
  if (!q) return out;
  const seed = q.get('seed');
  if (seed !== null) {
    const n = Number(seed);
    if (Number.isInteger(n)) out.seed = n >>> 0;
    else out.errors.push(`?seed=${seed} is not a whole number`);
  }
  const shoe = q.get('shoe');
  if (shoe) {
    try {
      out.forced = parseShoeParam(shoe);
    } catch (e) {
      out.errors.push(`?shoe=: ${(e as Error).message}`);
    }
  }
  const v = q.get('variant');
  if (v !== null) {
    if ((VARIANT_IDS as readonly string[]).includes(v)) out.variant = v as VariantId;
    else out.errors.push(`?variant=${v} is not a table variant`);
  }
  const tie = q.get('tie');
  if (tie === '8' || tie === '9') out.tiePays = Number(tie) as TiePays;
  const sys = q.get('system');
  if (sys !== null) {
    if ((STRATEGY_IDS as readonly string[]).includes(sys)) out.system = sys as StrategyId;
    else out.errors.push(`?system=${sys} is not a betting system`);
  }
  const sp = q.get('speed');
  if (sp === 'normal' || sp === 'fast' || sp === 'instant') out.speed = sp;
  return out;
}

/** OS reduced motion and the app's instant setting win over a scene's or query's speed. */
export function pickSpeed(settings: SimSettings, wanted?: Speed): Speed {
  if (settings.animationSpeed === 'instant') return 'instant';
  return effectiveSpeed(wanted ?? settings.animationSpeed);
}

/** The table a session plays at. */
export function tableOf(
  settings: SimSettings,
  scene: SceneConfig | undefined,
  q: SandboxQuery,
): { variant: VariantId; tiePays: TiePays } {
  if (scene) return { variant: scene.variant ?? 'punto-banco', tiePays: scene.tiePays ?? 8 };
  return { variant: q.variant ?? settings.variant, tiePays: q.tiePays ?? settings.tiePays };
}

/** The chip the rack starts on. */
export function defaultChip(scene: SceneConfig | undefined, chips: readonly Cents[]): Cents {
  const want = scene?.ui?.defaultChip ?? (scene ? 500 : 2500);
  return chips.includes(want) ? want : chips[0]!;
}

/** A random 32-bit seed for free play. */
export function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return (Date.now() ^ 0x9e3779b9) >>> 0;
  }
}
