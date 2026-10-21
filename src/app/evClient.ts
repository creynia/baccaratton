import { createEvClient } from '../sim';
import type { EvClient } from '../sim';

let client: EvClient | null = null;
/** One EV client per page, created on first use. */
export function getEvClient(): EvClient {
  return (client ??= createEvClient());
}
