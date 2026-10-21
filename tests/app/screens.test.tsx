import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import content from 'virtual:content';
import type { BetEv, BetId, BetTier, DrillGrade, DrillSpot, TableRules } from '../../src/sim';
import { App } from '../../src/app/App';
import { AppProviders } from '../../src/app/context';
import { About } from '../../src/app/screens/About';
import { Drill, drillHref, parseDrillQuery, shoeParam } from '../../src/app/screens/Drill';
import type { DrillDeps } from '../../src/app/screens/Drill';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { parseCards } from '../../src/sim';

// math is a stub until its WP lands: fake fullShoeEvs with the pinned edges of curriculum.md
// section 6 (exact fractions), switchable so the "pending" path is tested too.
const fake = vi.hoisted(() => ({ mathReady: true }));
vi.mock('../../src/sim', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/sim')>();
  const F = (num: bigint, den: bigint) => ({ num, den });
  const EDGE: Record<string, [bigint, bigint, BetTier]> = {
    'punto-banco/banker': [114753351728n, 10847218479825n, 'good'],
    'ez/banker': [66274384744n, 6508331087895n, 'good'],
    'super-6/banker': [284694798368n, 19524993263685n, 'good'],
    player: [241149546272n, 19524993263685n, 'good'],
    tie8: [103841353768n, 723147898655n, 'sucker'],
    tie9: [63053127805n, 1301666217579n, 'fair'],
    pair: [43n, 415n, 'sucker'],
    'dragon-bonus-player': [103547854751n, 3904998652737n, 'fair'],
    'dragon-bonus-banker': [9683026823n, 103306842665n, 'sucker'],
    'dragon-7': [64613588827n, 848912750595n, 'costly'],
    'panda-8': [153010345753n, 1501922558745n, 'sucker'],
  };
  const key = (bet: BetId, r: TableRules) =>
    bet === 'banker'
      ? `${r.variant}/banker`
      : bet === 'tie'
        ? `tie${r.tiePays}`
        : bet.endsWith('-pair')
          ? 'pair'
          : bet;
  const fullShoeEvs = (r: TableRules): BetEv[] => {
    if (!fake.mathReady) throw new Error('TODO(math): fullShoeEvs');
    return real.BET_IDS.map((bet) => {
      const [n, d, tier] = EDGE[key(bet, r)]!;
      const main = bet === 'player' || bet === 'banker';
      return {
        bet,
        offered: real.BET_IDS_BY_VARIANT[r.variant].includes(bet),
        ev: F(-n, d),
        edge: F(n, d),
        ...(main ? { edgePerResolved: F(n * 1000n, d * 905n) } : {}),
        pWin: F(458597n, 1000000n),
        pPush: F(main ? 95156n : 0n, 1000000n),
        pLose: F(446247n, 1000000n),
        sd: 1,
        tier,
        why: { rows: [], casesLabel: '', formula: '' },
      };
    });
  };
  return { ...real, fullShoeEvs };
});

const mount = (hash: string, store = new Store(new MemoryStorage())) => {
  location.hash = hash;
  const r = render(
    <AppProviders content={content} store={store}>
      <App />
    </AppProviders>,
  );
  return { ...r, store };
};
const text = (el: Element) => el.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(() => {
  window.scrollTo = () => undefined;
  fake.mathReady = true;
});
afterEach(cleanup);

describe('Bets & paytables', () => {
  it('shows the perfect-strategy line computed for all three variants', () => {
    const { getByTestId } = mount('#/bets');
    expect(text(getByTestId('perfect-strategy'))).toBe(
      'Perfect strategy: Banker, house edge 1.06% (EZ 1.02%; Super 6: Player 1.24%).',
    );
  });

  it('lists the variant’s bets with the edge per bet placed (3 decimals) and a tier badge', () => {
    const { container } = mount('#/bets');
    const banker = container.querySelector('[data-bet="banker"]')!;
    expect(text(banker)).toContain('House edge 1.058%');
    expect(text(banker)).toContain('Good bet');
    expect(text(banker)).toContain('Lowest edge on this table');
    expect(text(banker)).toContain('about $7.62 an hour at $10 × 72 hands');
    expect(text(container.querySelector('[data-bet="tie"]')!)).toContain('Sucker bet');
    expect(container.querySelector('[data-bet="dragon-7"]')).toBeNull(); // EZ only (D3)
  });

  it('switches variant and tie payout from the query (?variant=, ?tie=)', () => {
    const ez = mount('#/bets?variant=ez&tie=9').container;
    expect(ez.querySelector('[data-bet="dragon-7"]')).not.toBeNull();
    expect(text(ez.querySelector('[data-bet="tie"]')!)).toContain('4.844%');
    expect(text(ez.querySelector('[data-bet="tie"]')!)).toContain('Pays 9 to 1');
    cleanup();
    const s6 = mount('#/bets?variant=super-6').container;
    expect(text(s6.querySelector('[data-bet="player"]')!)).toContain('Lowest edge on this table');
    expect(text(s6.querySelector('[data-bet="banker"]')!)).not.toContain('Lowest edge');
  });

  it('says the edges are pending while math is a stub', () => {
    fake.mathReady = false;
    const { getByTestId, container } = mount('#/bets');
    expect(getByTestId('edges-pending')).toBeTruthy();
    expect(container.querySelector('[data-bet="banker"]')).not.toBeNull();
  });

  it('bet detail shows the per-resolved edge (D32), outcomes and per-variant payouts', () => {
    const { getByTestId, container } = mount('#/bets/banker');
    expect(text(getByTestId('bet-edge'))).toContain('1.058% per bet placed');
    expect(text(getByTestId('per-resolved'))).toMatch(/ties excluded\): 1\.169%/);
    expect(text(container)).toContain('Pays 1 to 1');
    expect(container.querySelector('a[href="#/play?variant=punto-banco&tie=8"]')).not.toBeNull();
  });

  it('EZ-only bets open at an EZ table; unknown bets are not found', () => {
    const d7 = mount('#/bets/dragon-7').container;
    expect(text(d7)).toContain('Offered at EZ Baccarat');
    expect(text(d7)).toContain('7.611%');
    cleanup();
    expect(text(mount('#/bets/lucky-6').container)).toContain('not found');
  });
});

describe('Settings', () => {
  it('shows each variant with its Banker edge and changes the store', () => {
    const { container, store } = mount('#/settings');
    const select = container.querySelector('select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Punto Banco (5% commission): Banker edge 1.06%',
      'EZ Baccarat (no commission): Banker edge 1.02%',
      'Super 6 (Banker 6 pays half): Banker edge 1.46%',
    ]);
    fireEvent.change(select, { target: { value: 'ez' } });
    expect(store.settings.variant).toBe('ez');
  });

  it('toggles the sim settings and clamps numbers', () => {
    const { getByLabelText, store } = mount('#/settings');
    fireEvent.click(getByLabelText(/Shoe tracker/));
    fireEvent.click(getByLabelText(/Show roads/));
    fireEvent.click(getByLabelText(/Confirm sucker bets/));
    expect(store.settings).toMatchObject({
      shoeTracker: true,
      showRoads: false,
      confirmCostlyBets: false,
    });
    fireEvent.change(getByLabelText(/Hands per hour/), { target: { value: '9999' } });
    expect(store.settings.handsPerHour).toBe(500);
    fireEvent.change(getByLabelText(/Bet unit/), { target: { value: '25' } });
    expect(store.settings.unitCents).toBe(2_500);
  });

  it('exports, resets and imports progress', () => {
    const { getByText, getByLabelText, store } = mount('#/settings');
    store.completeLesson('welcome');
    fireEvent.click(getByText('Export'));
    const code = (getByLabelText('Progress code') as HTMLTextAreaElement).value;
    expect(code).toMatch(/^baccaratton1:/);
    fireEvent.click(getByText('Reset progress'));
    fireEvent.click(getByText('Yes, reset'));
    expect(store.status('welcome')).toBe('new');
    fireEvent.input(getByLabelText('Progress code'), { target: { value: code } });
    fireEvent.click(getByText('Import'));
    fireEvent.click(getByText('Yes, replace'));
    expect(store.status('welcome')).toBe('done');
  });

  it('has a Check for updates button and the build code', () => {
    const { getByText, getByTestId } = mount('#/settings');
    expect(getByText('Check for updates')).toBeTruthy();
    expect(getByTestId('settings-build').textContent).toBe('test');
  });
});

describe('About', () => {
  it('shows version and build, and reports the update check', async () => {
    location.hash = '#/about';
    const check = vi.fn(() => Promise.resolve('up-to-date' as const));
    const { getByText, getByTestId, findByText } = render(
      <AppProviders content={content} store={new Store(new MemoryStorage())}>
        <About check={check} />
      </AppProviders>,
    );
    expect(getByTestId('build-sha').textContent).toBe('test');
    expect(getByTestId('version').textContent).toBe('test');
    const btn = getByText('Check for updates') as HTMLButtonElement;
    if (!btn.disabled) {
      fireEvent.click(btn);
      expect(await findByText('You have the latest version.')).toBeTruthy();
      expect(check).toHaveBeenCalled();
    } else {
      expect(getByTestId('update-status').textContent).toMatch(/not available/);
    }
  });
});

describe('Rules', () => {
  it('describes a highlighted cell and every Banker row from TABLEAU', () => {
    const { getByTestId } = mount('#/rules?highlight=b5/p4');
    expect(text(getByTestId('highlight'))).toContain(
      "Banker 5, Player's third card 4: the Banker draws.",
    );
    expect(getByTestId('highlight').querySelector('a')?.getAttribute('href')).toBe(
      '#/drill?mode=banker&focus=b5%2Fp4',
    );
    const rows = [...getByTestId('banker-rows').querySelectorAll('li')].map(text);
    expect(rows).toEqual([
      'Banker 0 always draws.',
      'Banker 1 always draws.',
      'Banker 2 always draws.',
      'Banker 3 draws on anything except a Player third card of 8.',
      "Banker 4 draws when the Player's third card is 2–7.",
      "Banker 5 draws when the Player's third card is 4–7.",
      "Banker 6 draws when the Player's third card is 6, 7.",
      'Banker 7 always stands.',
    ]);
  });

  it('ignores an unknown highlight', () => {
    const { queryByTestId } = mount('#/rules?highlight=b9/p1');
    expect(queryByTestId('highlight')).toBeNull();
  });
});

describe('Drill', () => {
  const spot: DrillSpot = {
    code: 'banker-5:3h2c6d.Kd5s',
    category: 'banker-5',
    mode: 'banker',
    player: parseCards('3h 2c 6d'),
    banker: parseCards('Kd 5s'),
    cell: 'b5/p6',
    question: 'Does the Banker draw?',
    options: ['Draw', 'Stand'],
  };
  const fakeDeps = (): DrillDeps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      nextSpot: (rng, filter) => {
        calls.push(JSON.stringify(filter));
        return { spot, rng };
      },
      gradeSpot: (s, chosen): DrillGrade => ({
        category: s.category,
        correct: chosen === 'Draw',
        answer: 'Draw',
        chosen,
        rule: 'banker-5-draws-on-4-7',
        cell: s.cell,
        explanation: 'Banker 5 draws on 4 to 7.',
      }),
      spotFromCode: () => spot,
    };
  };
  const mountDrill = (query: string, deps?: DrillDeps, store = new Store(new MemoryStorage())) => {
    const r = render(
      <AppProviders content={content} store={store}>
        <Drill query={new URLSearchParams(query)} {...(deps ? { deps } : {})} />
      </AppProviders>,
    );
    return { ...r, store };
  };

  it('parses ?mode=, ?cat= and ?focus= (D29)', () => {
    expect(parseDrillQuery(new URLSearchParams(''))).toEqual({ mode: 'mixed' });
    expect(parseDrillQuery(new URLSearchParams('cat=banker-3'))).toEqual({
      mode: 'banker',
      category: 'banker-3',
    });
    expect(parseDrillQuery(new URLSearchParams('mode=player&cat=banker-3')).mode).toBe('banker');
    expect(parseDrillQuery(new URLSearchParams('mode=mixed&cat=which-bet'))).toEqual({
      mode: 'mixed',
      category: 'which-bet',
    });
    expect(parseDrillQuery(new URLSearchParams('mode=total')).mode).toBe('mixed');
    expect(parseDrillQuery(new URLSearchParams('focus=misses')).focus).toBe('misses');
    expect(parseDrillQuery(new URLSearchParams('focus=b5/p4,zz')).focus).toEqual(['b5/p4']);
    expect(drillHref({ mode: 'banker', focus: ['b5/p4'] })).toBe('/drill?mode=banker&focus=b5/p4');
  });

  it('builds the forced shoe in deal order for "Play it out"', () => {
    expect(shoeParam(parseCards('3h 2c 6d'), parseCards('Kd 5s'))).toBe('3h,Kd,2c,5s,6d');
  });

  it('asks, grades and records per category; a miss links the chart and the table', () => {
    const deps = fakeDeps();
    const { getByText, getByTestId, store } = mountDrill('mode=banker&cat=banker-5', deps);
    expect(JSON.parse(deps.calls[0]!)).toMatchObject({ mode: 'banker', category: 'banker-5' });
    expect(text(getByTestId('drill-spot'))).toContain('Does the Banker draw?');
    fireEvent.click(getByText('Stand'));
    const result = getByTestId('drill-result');
    expect(result.dataset.correct).toBe('false');
    expect(text(result)).toContain('Not quite. Draw. Banker 5 draws on 4 to 7.');
    expect(result.querySelector('a[href="#/rules?highlight=b5/p6"]')).not.toBeNull();
    expect(result.querySelector('a[href="#/play?shoe=3h,Kd,2c,5s,6d"]')).not.toBeNull();
    expect(store.drill.byCategory['banker-5']).toEqual({ answered: 1, correct: 0 });
    expect(store.drill.recentMisses).toEqual([spot.code]);
    fireEvent.click(getByText('Next'));
    fireEvent.click(getByText('Draw'));
    expect(text(getByTestId('drill-result'))).toContain('Correct!');
    expect(getByTestId('streak').textContent).toBe('1');
    expect(store.drill.recentMisses).toEqual([]);
  });

  it('replays misses with spotFromCode, then says it is done', () => {
    const store = new Store(new MemoryStorage());
    store.recordDrill('banker-5', false, spot.code);
    const deps = fakeDeps();
    const { getByText, getByTestId } = mountDrill('focus=misses', deps, store);
    expect(deps.calls).toHaveLength(0);
    fireEvent.click(getByText('Draw'));
    fireEvent.click(getByText('Next'));
    expect(getByTestId('review-done')).toBeTruthy();
  });

  it('works with the real strategy drill (no fakes)', () => {
    const { getByTestId, container, store } = mountDrill('mode=player');
    const spotEl = getByTestId('drill-spot');
    expect(['natural', 'player-draw']).toContain(spotEl.dataset.category);
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Your answer"] button'),
    ];
    expect(buttons.map((b) => b.textContent)).toEqual(['Draw', 'Stand']);
    fireEvent.click(buttons[0]!);
    expect(getByTestId('drill-result')).toBeTruthy();
    const answered = Object.values(store.drill.byCategory).reduce((n, v) => n + v.answered, 0);
    expect(answered).toBe(1);
  });

  it('shows a friendly card when the drill module is unavailable', () => {
    const deps: DrillDeps = {
      ...fakeDeps(),
      nextSpot: () => {
        throw new Error('TODO(strategy)');
      },
    };
    expect(mountDrill('', deps).getByTestId('drill-unavailable')).toBeTruthy();
  });
});

describe('Learn and lessons', () => {
  const first = content.lessons[0]!;

  it('lists every chapter with lesson status, and the Drawing rules card first', () => {
    const { container, store } = mount('#/learn');
    expect(container.querySelector('main a.rules-card')?.getAttribute('href')).toBe('#/rules');
    for (const ch of content.chapters)
      expect(container.querySelector(`[data-chapter="${ch.id}"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="#/learn/${first.id}"]`)?.className).toContain('st-new');
    cleanup();
    store.completeLesson(first.id);
    const again = mount('#/learn', store).container;
    expect(again.querySelector(`a[href="#/learn/${first.id}"]`)?.className).toContain('st-done');
  });

  it('renders every block of a lesson and records quiz answers and completion', () => {
    const withQuiz = content.lessons.find((l) => l.blocks.some((b) => b.kind === 'quiz'))!;
    const { container, getByText, store } = mount(`#/learn/${withQuiz.id}`);
    expect(store.status(withQuiz.id)).toBe('progress');
    const kinds = new Set(withQuiz.blocks.map((b) => b.kind));
    if (kinds.has('math')) expect(container.querySelector('details.math')).not.toBeNull();
    if (kinds.has('tip')) expect(container.querySelector('aside.tip')).not.toBeNull();
    if (kinds.has('scene')) expect(container.querySelector('section.scene')).not.toBeNull();
    const quiz = withQuiz.blocks.find((b) => b.kind === 'quiz')!;
    if (quiz.kind !== 'quiz') throw new Error('no quiz');
    const fs = container.querySelector(`[data-quiz="${quiz.quiz.id}"]`)!;
    const radios = fs.querySelectorAll('input[type="radio"]');
    fireEvent.click(radios[quiz.quiz.answer]!);
    fireEvent.click(fs.querySelector('button')!);
    expect(store.lesson(withQuiz.id)?.quizzes[quiz.quiz.id]).toMatchObject({ correct: true });
    fireEvent.click(getByText('Mark complete'));
    expect(store.status(withQuiz.id)).toBe('done');
  });

  it('draws a quiz hand as labelled Player and Banker cards with totals', () => {
    const lesson = content.lessons.find((l) =>
      l.blocks.some((b) => b.kind === 'quiz' && b.quiz.hand),
    );
    if (!lesson) return; // no quiz with a hand in this content
    const { container } = mount(`#/learn/${lesson.id}`);
    const hand = container.querySelector('[data-testid="quiz-hand"]')!;
    expect(text(hand)).toMatch(/Player.*Banker/);
    expect(hand.querySelectorAll('.cards[role="img"]')).toHaveLength(2);
    expect(hand.querySelector('.cards')?.getAttribute('aria-label')).toMatch(/\(total \d\)$/);
  });

  it('Home offers to continue with the next lesson', () => {
    const { container } = mount('#/');
    const go = container.querySelector('main a.btn-big')!;
    expect(go.getAttribute('href')).toBe(`#/learn/${first.id}`);
    expect(text(go)).toContain('Start');
  });
});

describe('Glossary and Roads', () => {
  it('filters the glossary by search', () => {
    const { container, getByLabelText } = mount('#/glossary');
    const all = container.querySelectorAll('dl.glossary > div').length;
    expect(all).toBe(content.glossary.length);
    fireEvent.input(getByLabelText('Search glossary'), { target: { value: 'zzzzqq' } });
    expect(container.querySelectorAll('dl.glossary > div')).toHaveLength(0);
  });

  it('Roads draws a scoreboard and explains the derived roads', () => {
    const { container } = mount('#/roads');
    expect(container.querySelector('.scoreboard')).not.toBeNull();
    expect(text(container)).toContain('Big Eye Boy');
    expect(text(container)).toContain("Past results don't change the next hand");
  });
});
