import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import type { EvClient } from '../jobs/protocol';
import type { SceneConfig } from '../scene/types';
import { Simulator } from './Simulator';
import { StepPanel, richText } from './StepPanel';
import { DEFAULT_SIM_SETTINGS } from './types';

const evClient = {
  run: () => Promise.reject(new Error('not in this test')),
  mode: 'inthread',
  dispose: () => {},
} as unknown as EvClient;
const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };

describe('StepPanel text', () => {
  it('renders {{cards =N}} as cards with a total badge, never raw markup', () => {
    const { container } = render(<p>{richText('Banker {{4h Jd =4}} and {{Kh 7d =}} **bold**')}</p>);
    expect(container.textContent).not.toContain('{{');
    expect(container.querySelectorAll('.pc')).toHaveLength(4);
    expect([...container.querySelectorAll('.pc-total')].map((e) => e.textContent)).toEqual([
      '4',
      '7',
    ]);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });
  it('shows the Next button for an acknowledged step', () => {
    const { getByText } = render(
      <StepPanel
        step={{ id: 'a', text: 'Read', completeWhen: { acknowledged: true }, advance: 'button' }}
        index={0}
        count={2}
        done={false}
        showNext
      />,
    );
    expect(getByText('Next')).toBeTruthy();
  });
});

describe('Simulator in a scene', () => {
  const l20: SceneConfig = {
    id: 't20',
    version: 1,
    bankroll: 50_000,
    allowedBets: ['player', 'player-pair'],
    steps: [
      {
        id: 'bet',
        text: 'Bet',
        allowedActions: ['set-bet', 'clear-bets'],
        completeWhen: { betOnFelt: { bet: 'player-pair', minAmount: 500 } },
      },
    ],
  };
  it('a Sucker bet asks for a second tap, without "Banker instead" when Banker is not allowed', () => {
    const { container, queryByTestId, getByTestId } = render(
      <Simulator scene={l20} mode="scene" settings={settings} evClient={evClient} />,
    );
    fireEvent.click(container.querySelector('[data-hit="player-pair"]')!);
    const card = getByTestId('sucker-confirm');
    expect(card.textContent).toContain('Bet it anyway');
    expect(card.querySelector('[data-action="use-alternative"]')).toBeNull();
    fireEvent.click(card.querySelector('[data-action="confirm-bet"]')!);
    expect(queryByTestId('sucker-confirm')).toBeNull();
    expect(getByTestId('step-panel').getAttribute('data-done')).toBe('true');
  });
  it('opening the EV sheet previews every row (l17-s2, l21)', () => {
    const scene: SceneConfig = {
      id: 't21',
      version: 1,
      variant: 'ez',
      steps: [
        {
          id: 'look',
          text: 'Open the sheet on Panda 8 and Dragon 7',
          allowedActions: ['set-bet', 'clear-bets'],
          completeWhen: {
            all: [{ previewed: { bet: 'panda-8' } }, { previewed: { bet: 'dragon-7' } }],
          },
        },
        {
          id: 'end',
          text: 'Done',
          allowedActions: [],
          completeWhen: { acknowledged: true },
          advance: 'button',
        },
      ],
    };
    const { container, getByTestId } = render(
      <Simulator scene={scene} mode="scene" settings={settings} evClient={evClient} />,
    );
    expect(getByTestId('step-tip').textContent).toContain('EV');
    fireEvent.click(container.querySelector('[data-action="ev"]')!);
    expect(getByTestId('step-panel').getAttribute('data-step')).toBe('end');
  });
});

describe('every lesson step renders its {{cards}}', () => {
  it('no raw {{…}} markup in any step text, hint or math', async () => {
    const { buildContent } = await import('../../content/load');
    const bundle = buildContent(process.cwd());
    const raw: string[] = [];
    for (const l of bundle.lessons)
      for (const b of l.blocks)
        if (b.kind === 'scene')
          for (const st of b.scene.steps ?? [])
            for (const t of [st.text, st.hint, st.math]) {
              if (!t) continue;
              const { container } = render(<p>{richText(t)}</p>);
              if (container.textContent?.includes('{{')) raw.push(`${b.scene.id}/${st.id}`);
              cleanup();
            }
    expect(raw).toEqual([]);
  });
});
