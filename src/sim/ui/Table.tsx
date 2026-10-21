import './sim.css';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Orientation } from './layouts';

const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** `auto` follows the viewport (landscape phones only); a scene or the gallery can force either. */
export function useOrientation(pref: 'auto' | Orientation = 'auto'): Orientation {
  const read = (): Orientation => {
    try {
      return typeof matchMedia === 'function' && matchMedia(LANDSCAPE_QUERY).matches
        ? 'landscape'
        : 'portrait';
    } catch {
      return 'portrait';
    }
  };
  const [auto, setAuto] = useState<Orientation>(read);
  useEffect(() => {
    if (pref !== 'auto' || typeof matchMedia !== 'function') return;
    const mq = matchMedia(LANDSCAPE_QUERY);
    const on = () => setAuto(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return pref === 'auto' ? auto : pref;
}

export interface TableProps {
  orientation: Orientation;
  status?: ComponentChildren;
  felt: ComponentChildren;
  actions: ComponentChildren;
  chips?: ComponentChildren;
  /** Portrait: the roads strip under the felt. Landscape: the bottom of the rail. */
  roads?: ComponentChildren;
  /** Landscape rail extras (step panel, compact EV list). */
  rail?: ComponentChildren;
  /** Inline confirm / alternative card, toasts. */
  notices?: ComponentChildren;
  /** The EV sheet: a dialog in portrait, a rail panel in landscape. */
  sheet?: ComponentChildren;
}

/**
 * Layout shell (simulator.md §4.2–4.3). Portrait: status, felt, roads, notices, then the chip rack
 * and action bar docked (sticky) above the tab bar, so Deal never leaves the screen. Landscape
 * (844 × 390): the status line and the felt on the left, a 324 px rail whose Deal button is always
 * visible.
 */
export function Table({
  orientation,
  status,
  felt,
  actions,
  chips,
  roads,
  rail,
  notices,
  sheet,
}: TableProps) {
  if (orientation === 'landscape') {
    return (
      <section
        class="sim-table sim-table-landscape"
        aria-label="Table"
        data-orientation="landscape"
      >
        <div class="sim-table-felt-col">
          {status}
          <div class="sim-table-felt">{felt}</div>
        </div>
        <aside class="sim-rail" aria-label="Controls">
          <div class="sim-rail-actions">{actions}</div>
          {notices}
          {chips}
          <div class="sim-rail-body" tabindex={0} role="region" aria-label="Bets, EV and roads">
            {sheet}
            {rail}
            {roads}
          </div>
        </aside>
      </section>
    );
  }
  return (
    <section class="sim-table sim-table-portrait" aria-label="Table" data-orientation="portrait">
      {status}
      <div class="sim-table-felt">{felt}</div>
      {roads}
      {notices}
      <div class="sim-table-dock">
        {chips}
        <div class="sim-table-actions">{actions}</div>
      </div>
      {sheet}
    </section>
  );
}
