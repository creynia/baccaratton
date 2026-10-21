import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../jobs/client';
import type { Progress } from '../engine/job';
import type {
  SessionSeries,
  SimulateRequest,
  SimulateResult,
  StrategySpec,
} from '../strategy/types';
import { AutoPlayPanel } from './AutoPlayPanel';
import { BankrollChart, niceTicks, seriesLabel } from './BankrollChart';
import { binFinals, OutcomeHistogram } from './OutcomeHistogram';
import { SurvivalChart } from './SurvivalChart';
import { DEFAULT_SIM_SETTINGS } from './types';

afterEach(cleanup);

function fixture(
  spec: StrategySpec,
  hands: number,
  sessions: number,
  bankroll = 100_000,
): SessionSeries {
  const cols = hands + 1;
  const line = Float64Array.from({ length: cols }, (_, i) => bankroll - i * 10);
  const s: SessionSeries = {
    strategy: spec,
    expected: Float64Array.from({ length: cols }, (_, i) => bankroll - i * 10.58),
    finals: Int32Array.from({ length: sessions }, (_, i) => bankroll - 700 + i * 100),
    meanFinal: bankroll - 762,
    meanFinalCi95: sessions > 1 ? 300 : 0,
    bustRate: 0.02,
    probAhead: 0.4,
    handsPlayed: hands * sessions,
    meanBetPerHand: 1000,
    costPerHourCents: 762,
    capHits: 3,
    winners: { player: 40, banker: 41, tie: 9 },
    sideBetHits: {},
  };
  if (sessions === 1) s.equity = Int32Array.from(line);
  else {
    s.p10 = line.map((v) => v - 2000);
    s.p50 = line;
    s.p90 = line.map((v) => v + 2000);
    s.survival = Float64Array.from({ length: cols }, (_, i) => 1 - i / cols / 10);
  }
  return s;
}

describe('charts', () => {
  it('one session: equity line, expected line, start line, no band', () => {
    render(
      <BankrollChart
        series={[fixture({ id: 'flat-banker', unit: 1000 }, 72, 1)]}
        bankroll={100_000}
        hands={72}
      />,
    );
    const c = screen.getByTestId('bankroll-chart');
    expect(c.querySelector('[data-testid=equity]')).toBeTruthy();
    expect(c.querySelector('[data-testid=expected]')).toBeTruthy();
    expect(c.querySelector('[data-testid=start-line]')).toBeTruthy();
    expect(c.querySelector('[data-testid=band]')).toBeNull();
    expect(c.querySelector('svg')!.getAttribute('aria-label')).toMatch(
      /Flat Banker: ends \$992.80/,
    );
    expect(screen.queryByTestId('legend')).toBeNull(); // one series: the title names it
  });
  it('many sessions + compare: band, median, a legend with colour and dash per series', () => {
    const series = [
      fixture({ id: 'flat-banker', unit: 1000 }, 720, 100),
      fixture({ id: 'martingale', unit: 1000, target: 'player' }, 720, 100),
    ];
    const { container } = render(<BankrollChart series={series} bankroll={100_000} hands={720} />);
    expect(container.querySelectorAll('[data-testid=band]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid=median]')).toHaveLength(2);
    const legend = screen.getByTestId('legend');
    expect(legend.textContent).toContain('Martingale on Player');
    const dashes = [...legend.querySelectorAll('line')].map((l) =>
      l.getAttribute('stroke-dasharray'),
    );
    expect(new Set(dashes).size).toBe(2);
    expect(screen.getByText(/middle 80% of sessions/)).toBeTruthy();
  });
  it('hover shows a crosshair and a tooltip', () => {
    const { container } = render(
      <BankrollChart
        series={[fixture({ id: 'paroli', unit: 1000 }, 72, 1)]}
        bankroll={100_000}
        hands={72}
      />,
    );
    const rect = container.querySelector('rect')!;
    fireEvent.pointerMove(rect, { clientX: 0 });
    expect(screen.getByTestId('chart-tooltip').textContent).toMatch(/Hand 0/);
    expect(screen.getByTestId('crosshair')).toBeTruthy();
    fireEvent.pointerLeave(rect);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });
  it('survival curve per series', () => {
    const series = [
      fixture({ id: 'flat-banker', unit: 1000 }, 72, 100),
      fixture({ id: 'labouchere', unit: 1000 }, 72, 100),
    ];
    render(<SurvivalChart series={series} hands={72} />);
    expect(screen.getAllByTestId('survival-line')).toHaveLength(2);
    expect(
      screen.getByTestId('survival-chart').querySelector('svg')!.getAttribute('aria-label'),
    ).toMatch(/Labouchère 9\d%/);
  });
  it('final-equity histogram bins every session', () => {
    const s = fixture({ id: 'flat-banker', unit: 1000 }, 72, 100);
    const bins = binFinals(s.finals);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(100);
    render(<OutcomeHistogram series={s} bankroll={100_000} />);
    expect(screen.getAllByTestId('bin').length).toBeGreaterThan(1);
    expect(screen.getByText(/Banker won/)).toBeTruthy();
  });
  it('helpers', () => {
    expect(niceTicks(0, 1000, 4)).toEqual([0, 500, 1000]);
    expect(seriesLabel({ id: 'flat-player', unit: 1000, target: 'player' })).toBe('Flat Player');
    expect(seriesLabel({ id: 'dalembert', unit: 1000, label: 'Mine' })).toBe('Mine');
  });
});

describe('AutoPlayPanel', () => {
  it('runs through the job client and shows charts, the summary and labels', async () => {
    const seen: SimulateRequest[] = [];
    function* job(req: SimulateRequest): Generator<Progress | undefined, SimulateResult, void> {
      seen.push(req);
      yield { done: 1, total: 2 };
      const specs = [req.strategy, ...(req.compare ?? [])];
      return { series: specs.map((s) => fixture(s, req.hands, req.sessions, req.bankroll)), ms: 1 };
    }
    const evClient = createEvClient({ jobs: { simulate: job } });
    const events: unknown[] = [];
    render(
      <AutoPlayPanel
        evClient={evClient}
        settings={DEFAULT_SIM_SETTINGS}
        handOptions={[72]}
        sessionOptions={[100]}
        bankroll={1_000_000}
        compare={[
          { id: 'flat-banker', unit: 1000 },
          { id: 'martingale', unit: 1000, target: 'banker', maxSteps: 7 },
        ]}
        onEvent={(e) => events.push(e)}
      />,
    );
    fireEvent.click(screen.getByTestId('auto-run'));
    await waitFor(() => expect(screen.getByTestId('auto-play-result')).toBeTruthy());
    expect(seen[0]).toMatchObject({
      hands: 72,
      sessions: 100,
      bankroll: 1_000_000,
      handsPerHour: 72,
    });
    expect(seen[0]!.compare!.map((s) => s.id)).toEqual(['martingale']);
    expect(screen.getByTestId('survival-chart')).toBeTruthy();
    const table = screen.getByTestId('auto-summary');
    expect(table.textContent).toContain('≈ simulated');
    expect(table.textContent).toContain('exact');
    expect(screen.getByTestId('auto-sentence').textContent).toMatch(
      /bet an average \$10 per hand, so it cost 1.06% of that/,
    );
    expect(events).toEqual([{ type: 'auto-play-completed', hands: 72, strategy: 'flat-banker' }]);
    evClient.dispose();
  });
  it('groups systems by lens and keeps controls shrinkable at phone width', () => {
    const evClient = createEvClient();
    const { container } = render(
      <AutoPlayPanel evClient={evClient} settings={DEFAULT_SIM_SETTINGS} />,
    );
    const labels = [...container.querySelectorAll('optgroup')].map((g) => g.getAttribute('label'));
    expect(labels).toEqual(['Lowest edge', 'Practical', 'Fun per dollar']);
    expect(container.querySelectorAll('option[value=martingale]')).toHaveLength(1);
    for (const el of container.querySelectorAll<HTMLElement>('input[type=number], select'))
      expect(['0', '0px']).toContain(el.style.minWidth);
    evClient.dispose();
  });
  it('shows a run error', async () => {
    // eslint-disable-next-line require-yield
    function* bad(): Generator<Progress | undefined, SimulateResult, void> {
      throw new Error('simulate: below the table minimum');
    }
    const evClient = createEvClient({ jobs: { simulate: bad } });
    render(<AutoPlayPanel evClient={evClient} settings={DEFAULT_SIM_SETTINGS} />);
    fireEvent.click(screen.getByTestId('auto-run'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/table minimum/));
    evClient.dispose();
  });
});
