import type { VariantId } from '../../engine/types';
import { landscapeLayout } from './landscape';
import { portraitLayout } from './portrait';
import type { FeltLayout, Orientation } from './types';

export * from './types';
export { portraitLayout, landscapeLayout };

const cache = new Map<string, FeltLayout>();

/** simulator.md section 4.1: the layout for an orientation and a variant (memoised). */
export function feltLayout(o: Orientation, variant: VariantId): FeltLayout {
  const key = `${o}:${variant}`;
  let l = cache.get(key);
  if (!l) {
    l = o === 'landscape' ? landscapeLayout(variant) : portraitLayout(variant);
    cache.set(key, l);
  }
  return l;
}
