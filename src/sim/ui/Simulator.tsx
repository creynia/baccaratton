import type { SimulatorProps } from './types';

/** Placeholder until the integration WP wires engine + math + jobs + UI + scenes. */
export function Simulator(props: SimulatorProps) {
  return (
    <section class="sim-placeholder card" data-testid="simulator" aria-label="Table">
      <h2>Table</h2>
      <p>The practice table is coming soon.</p>
      <p class="muted">
        {props.mode === 'scene' ? 'Lesson scene' : 'Sandbox'} · {props.settings.variant}
      </p>
    </section>
  );
}
