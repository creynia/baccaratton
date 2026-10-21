import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../jobs/client';
import { EvSheet } from './EvSheet';
import { Scoreboard } from './Scoreboard';
import { Simulator } from './Simulator';
import { Tableau } from './Tableau';
import { DEFAULT_SIM_SETTINGS } from './types';

afterEach(cleanup);

// WP0 placeholders: they render with their final props and a landmark, nothing more.
describe('placeholder components', () => {
  it('Simulator renders a labelled region', () => {
    const { getByRole } = render(
      <Simulator settings={DEFAULT_SIM_SETTINGS} evClient={createEvClient()} />,
    );
    expect(getByRole('region', { name: 'Table' })).toBeTruthy();
  });
  it('EvSheet, Tableau and Scoreboard take their final props', () => {
    const { container } = render(
      <div>
        <EvSheet preview={null} />
        <Tableau view="full" highlight={['b5/p9']} />
        <Scoreboard entries={[]} view={['bead', 'big']} />
      </div>,
    );
    expect(container.querySelector('.ev-sheet')).not.toBeNull();
    expect(container.querySelector('.tableau')?.getAttribute('data-view')).toBe('full');
    expect(container.querySelector('.scoreboard')).not.toBeNull();
  });
  it('the default settings follow D5, D6 and D13', () => {
    expect(DEFAULT_SIM_SETTINGS).toMatchObject({
      handsPerHour: 72,
      shoeTracker: false,
      variant: 'punto-banco',
      tiePays: 8,
    });
  });
});
