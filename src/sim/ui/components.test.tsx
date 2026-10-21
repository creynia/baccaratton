import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame } from '../engine/game';
import { parseRoadString } from '../engine/roads';
import { VARIANT_RULES } from '../engine/rules';
import { BET_IDS_BY_VARIANT } from '../engine/ids';
import { ActionBar } from './ActionBar';
import { AltCard } from './AltCard';
import { Card } from './Card';
import { ChipRack } from './ChipRack';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { Scoreboard } from './Scoreboard';
import { SessionPanel } from './SessionPanel';
import { SettleToast } from './SettleToast';
import { ShoeTracker } from './ShoeTracker';
import { Tableau } from './Tableau';
import { TierBadge } from './TierBadge';
import { buildTimeline } from './animation';
import {
  ROAD_FIXTURES,
  SESSION_FIXTURE,
  dealEvents,
  fixturePreview,
  fixtureTracker,
  forcedHand,
  settled,
} from './fixtures';
import { MINUS } from './text';

afterEach(cleanup);
const PB = VARIANT_RULES['punto-banco'];

describe('EvSheet', () => {
  it('lists every offered bet with its edge and tier label, before Deal', () => {
    const p = fixturePreview(PB, { banker: 2500, tie: 1000 });
    const { getByTestId, getAllByRole } = render(<EvSheet preview={p} rules={PB} />);
    const rows = getAllByRole('listitem').filter((li) => li.dataset.bet);
    expect(rows.map((r) => r.dataset.bet)).toEqual([...BET_IDS_BY_VARIANT['punto-banco']]);
    const banker = getByTestId('ev-row-banker');
    expect(banker.textContent).toContain('Good bet');
    expect(banker.textContent).toContain('1.06%');
    expect(banker.textContent).toContain('Lowest edge on this table');
    expect(banker.textContent).toContain(`${MINUS}$0.26 per hand`);
    expect(getByTestId('ev-row-tie').textContent).toContain('Sucker bet');
    expect(getByTestId('ev-slip-total').textContent).toBe(
      `This hand: ${MINUS}$1.70 expected · about $122.43 an hour ($35 on the felt)`,
    );
    // Per hour is always the positive-cost sentence (curriculum §8.1), on and off the slip.
    expect(banker.textContent).toContain('About $19.04 an hour at 72 hands');
    expect(getByTestId('ev-row-player').textContent).toContain('About $8.89 an hour at 72 hands');
    expect(getByTestId('ev-sheet').textContent).not.toContain('/hour');
  });
  it('never shows the per-resolved edge in the headline (D32), only in Why?', () => {
    const p = fixturePreview(PB, { banker: 1000 });
    const { getByTestId, queryByTestId, rerender } = render(<EvSheet preview={p} rules={PB} />);
    expect(getByTestId('ev-sheet').textContent).not.toContain('1.17%');
    expect(queryByTestId('why-table')).toBeNull();
    rerender(<EvSheet preview={p} rules={PB} whyOpen="banker" onToggleWhy={() => {}} />);
    const why = getByTestId('why-table');
    expect(why.textContent).toContain('1.17%');
    expect(why.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(3);
    expect(why.textContent).toContain('2,292,252,566,437,888');
    // The shared denominator is in the caption once; long counts break only after commas.
    expect(why.querySelector('caption')!.textContent).toContain('4,998,398,275,503,360');
    expect(why.querySelectorAll('wbr').length).toBeGreaterThan(5);
    const approx = why.querySelector('.sim-why-approx')!;
    expect(approx.textContent).toBe('≈ 2.29 × 10¹⁵ (45.8597%)');
    expect(approx.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(approx);
    expect(approx.getAttribute('aria-expanded')).toBe('true');
    expect(why.querySelector('.sim-why-full.is-open')).not.toBeNull();
  });
  it('offers the alternative and "Use this" moves to Banker', () => {
    const p = fixturePreview(PB, { tie: 1000 });
    const use = vi.fn();
    const { getByTestId } = render(<EvSheet preview={p} rules={PB} onUseAlternative={use} />);
    const card = getByTestId('alt-card');
    expect(card.textContent).toContain('Banker costs $0.11 per $10 hand instead of $1.44');
    fireEvent.click(card.querySelector('[data-action="use-alternative"]')!);
    expect(use).toHaveBeenCalledWith(expect.objectContaining({ from: 'tie', to: 'banker' }));
  });
  it('in Super 6 the alternative for Banker is Player', () => {
    const r = VARIANT_RULES['super-6'];
    const p = fixturePreview(r, { banker: 1000 });
    const { getByTestId } = render(<EvSheet preview={p} rules={r} onUseAlternative={() => {}} />);
    expect(getByTestId('alt-card').textContent).toContain('Player is cheaper at a Super 6 table');
  });
  it('shows the Shoe tracker line second (D6)', () => {
    const p = fixturePreview(PB, {});
    const { getByTestId } = render(<EvSheet preview={p} rules={PB} tracker={p} />);
    expect(getByTestId('tracker-line-banker').textContent).toContain('This shoe');
  });
  it('is a focus-trapped dialog that closes on Escape', () => {
    const close = vi.fn();
    const { getByRole } = render(
      <EvSheet preview={fixturePreview(PB, {})} rules={PB} mode="dialog" onClose={close} />,
    );
    const d = getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });
  it('practice mode (null preview) hides the numbers', () => {
    const { getByTestId } = render(<EvSheet preview={null} />);
    expect(getByTestId('ev-sheet').textContent).toContain('Practice mode');
  });
});

describe('AltCard: the inline Sucker second tap', () => {
  it('places the bet only on "Bet it anyway"', () => {
    const confirm = vi.fn();
    const use = vi.fn();
    const { getByText, getByRole } = render(
      <AltCard
        mode="confirm"
        bet="tie"
        tier="sucker"
        text="Tie loses $1.44 per $10 on average. Bet it anyway?"
        to="banker"
        onConfirm={confirm}
        onUse={use}
        onDismiss={() => {}}
        autoFocus
      />,
    );
    expect(getByRole('alertdialog').textContent).toContain('Sucker bet');
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(getByText('Bet it anyway'));
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('Banker instead'));
    expect(use).toHaveBeenCalledTimes(1);
  });
});

describe('Felt and BetSpot', () => {
  it('draws the variant’s spots: EZ adds Dragon 7 and Panda 8, others don’t', () => {
    for (const v of ['punto-banco', 'ez', 'super-6'] as const) {
      const { container, unmount } = render(
        <Felt orientation="portrait" rules={VARIANT_RULES[v]} bets={{}} />,
      );
      const spots = [...container.querySelectorAll('[data-spot]')].map((e) =>
        e.getAttribute('data-spot'),
      );
      expect(spots.sort()).toEqual([...BET_IDS_BY_VARIANT[v]].sort());
      unmount();
    }
  });
  it('spots are buttons with spoken amount, payout, tier and edge', () => {
    const p = fixturePreview(PB, { banker: 2500 });
    const tap = vi.fn();
    const { getByRole } = render(
      <Felt
        orientation="portrait"
        rules={PB}
        bets={{ banker: 2500 }}
        sheet={p.sheet}
        onSpot={tap}
      />,
    );
    const b = getByRole('button', { name: /^Banker, \$25 on it/ });
    expect(b.getAttribute('aria-label')).toBe(
      'Banker, $25 on it. Pays 1 to 1, less 5% commission. Good bet, house edge 1.06%.',
    );
    // SVG needs the lowercase attribute to be focusable (Preact writes props on SVG verbatim).
    expect(b.getAttribute('tabindex')).toBe('0');
    fireEvent.click(b);
    expect(tap).toHaveBeenCalledWith('banker');
    fireEvent.keyDown(b, { key: 'Enter' });
    expect(tap).toHaveBeenCalledTimes(2);
    const tie = getByRole('button', { name: /^Tie/ });
    expect(tie.getAttribute('aria-label')).toContain('Sucker bet, house edge 14.36%');
  });
  it('practice mode: no tier badges on the felt', () => {
    const { container } = render(
      <Felt orientation="landscape" rules={PB} bets={{}} sheet={null} />,
    );
    expect(container.querySelector('.sim-felt-badge')).toBeNull();
  });
  it('HandView: the third card lies sideways and is named', () => {
    const h = forcedHand('2h 3d 4c', '5s Kd 6h');
    const { container, getByRole } = render(
      <Felt
        orientation="portrait"
        rules={PB}
        bets={{}}
        player={h.player.cards}
        banker={h.banker.cards}
      />,
    );
    const sideways = container.querySelectorAll('.sim-card.is-sideways');
    expect(sideways).toHaveLength(2);
    expect(sideways[0]!.getAttribute('transform')).toContain('rotate(90)');
    expect(getByRole('img', { name: 'Four of clubs, third card' })).toBeTruthy();
    expect(container.querySelector('[data-hand="player"] .sim-total-text')!.textContent).toBe('9');
  });
  it('uses text-presentation suits and the 4-colour deck', () => {
    const { container } = render(
      <svg>
        <Card card={8 * 4 + 2} x={0} y={0} w={56} h={78} fourColor />
      </svg>,
    );
    const pip = container.querySelector('.sim-pip')!;
    expect(pip.textContent).toBe('♦︎');
    expect(pip.getAttribute('class')).toContain('is-four');
  });
  it('a timeline animates the cards; skipped flushes them', () => {
    const r = settled(forcedHand('Kh 2d 3c', '4s 3h'), { banker: 2500 }, PB);
    const tl = buildTimeline(dealEvents(r), 'normal');
    const cards = { player: r.hand.player.cards, banker: r.hand.banker.cards };
    const { container, rerender } = render(
      <Felt orientation="portrait" rules={PB} bets={{}} {...cards} timeline={tl} />,
    );
    expect(container.querySelectorAll('.sim-card-slide.is-anim').length).toBe(5);
    rerender(<Felt orientation="portrait" rules={PB} bets={{}} {...cards} timeline={tl} skipped />);
    expect(container.querySelectorAll('.is-anim').length).toBe(0);
  });
  it('shows a Skip button while animating; Escape skips', () => {
    const r = settled(forcedHand('Kh 2d 3c', '4s 3h'), { banker: 2500 }, PB);
    const tl = buildTimeline(dealEvents(r), 'normal');
    const skip = vi.fn();
    const cards = { player: r.hand.player.cards, banker: r.hand.banker.cards };
    const { getByRole, queryByRole, rerender } = render(
      <Felt
        orientation="portrait"
        rules={PB}
        bets={{}}
        {...cards}
        timeline={tl}
        playing
        onSkip={skip}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Skip' }));
    expect(skip).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(skip).toHaveBeenCalledTimes(2);
    rerender(
      <Felt
        orientation="portrait"
        rules={PB}
        bets={{}}
        {...cards}
        timeline={tl}
        playing={false}
        onSkip={skip}
      />,
    );
    expect(queryByRole('button', { name: 'Skip' })).toBeNull();
  });
});

describe('ActionBar', () => {
  it('reads "Rebet & Deal" on an empty felt with rebet allowed and lastBets (D30)', () => {
    const deal = vi.fn();
    const { getByRole, rerender } = render(
      <ActionBar slipTotal={0} lastTotal={3500} canRebet onDeal={deal} onClear={() => {}} />,
    );
    fireEvent.click(getByRole('button', { name: /Rebet & Deal/ }));
    expect(deal).toHaveBeenCalledWith({ rebet: true });
    rerender(<ActionBar slipTotal={3500} evCents={-170} canRebet lastTotal={3500} onDeal={deal} />);
    expect(getByRole('button', { name: /^Deal/ }).textContent).toContain(
      `Slip $35 · EV ${MINUS}$1.70`,
    );
    rerender(<ActionBar slipTotal={0} lastTotal={3500} canRebet={false} onDeal={deal} />);
    expect(getByRole('button', { name: /^Deal/ }).textContent).not.toContain('Rebet');
  });
});

describe('ChipRack', () => {
  it('offers $1 $5 $25 $100 $500 (D16) as a radio group', () => {
    const pick = vi.fn();
    const { getAllByRole } = render(<ChipRack selected={2500} onSelect={pick} />);
    const chips = getAllByRole('radio');
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
      '$1 chip',
      '$5 chip',
      '$25 chip',
      '$100 chip',
      '$500 chip',
    ]);
    fireEvent.click(chips[3]!);
    expect(pick).toHaveBeenCalledWith(10_000);
  });
});

describe('TierBadge', () => {
  it('always has a text label', () => {
    const { container } = render(
      <div>
        {(['free', 'good', 'fair', 'costly', 'sucker'] as const).map((t) => (
          <TierBadge key={t} tier={t} />
        ))}
        <TierBadge tier="free" tracker />
      </div>,
    );
    expect([...container.querySelectorAll('.sim-badge-text')].map((e) => e.textContent)).toEqual([
      'No house edge',
      'Good bet',
      'Fair',
      'Costly',
      'Sucker bet',
      'Edge to you',
    ]);
  });
});

describe('SettleToast (D35)', () => {
  it('has a tappable commission line that opens an explainer', () => {
    const r = settled(forcedHand('Kh 2d 3c', '4s 3h'), { banker: 2500 }, PB);
    const tapped = vi.fn();
    const { getByTestId, getByRole } = render(
      <SettleToast result={r} rules={PB} onCommission={tapped} />,
    );
    expect(getByTestId('settle-toast').textContent).toContain('Banker wins 7 to 5.');
    expect(getByTestId('settle-money').textContent).toBe('You win $23.75.');
    fireEvent.click(getByRole('button', { name: '$1.25 commission (5% of $25)' }));
    expect(tapped).toHaveBeenCalledTimes(1);
    expect(getByTestId('commission-explainer').textContent).toContain('$25 × 5% = $1.25');
    expect(getByTestId('commission-explainer').textContent).not.toContain('(1.06%)');
  });
  it('no commission line without a commission', () => {
    const r = settled(forcedHand('Kh 2d 3c', '4s 3h'), { player: 2500 }, PB);
    const { queryByRole } = render(<SettleToast result={r} rules={PB} />);
    expect(queryByRole('button', { name: /commission/ })).toBeNull();
  });
});

describe('SessionPanel (curriculum §8.4)', () => {
  it('shows the session fields and emits tapped: session', () => {
    const tap = vi.fn();
    const { getByTestId, getByRole } = render(
      <SessionPanel summary={SESSION_FIXTURE} onTap={tap} />,
    );
    const t = getByTestId('session-panel').textContent;
    expect(t).toContain('Total bet$520');
    expect(getByTestId('session-expected').textContent).toBe(`${MINUS}$5.65`);
    expect(getByTestId('session-actual').textContent).toBe('+$35.00');
    expect(getByTestId('session-luck').textContent).toBe('+$40.65');
    expect(t).toContain('Your average edge: 1.09%');
    expect(t).toContain('(Banker only: 1.06%)');
    expect(getByTestId('session-commission').textContent).toBe('Commission paid: $4.75.');
    fireEvent.click(getByRole('button', { name: /Session/ }));
    expect(tap).toHaveBeenCalled();
  });
});

describe('Scoreboard', () => {
  it('draws the bead plate and Big Road from the pinned fixture', () => {
    const entries = parseRoadString(ROAD_FIXTURES.dragonTail);
    const { container, getByTestId } = render(<Scoreboard entries={entries} />);
    expect(container.querySelectorAll('.sim-bead')).toHaveLength(12);
    const big = [...container.querySelectorAll('.sim-big')].map(
      (e) =>
        `${e.classList.contains('is-banker') ? 'B' : 'P'}(${e.getAttribute('data-col')},${e.getAttribute('data-row')})`,
    );
    expect(big).toEqual([
      'B(0,0)',
      'B(0,1)',
      'B(0,2)',
      'B(0,3)',
      'B(0,4)',
      'B(0,5)',
      'B(1,5)',
      'P(1,0)',
      'P(1,1)',
      'B(2,0)',
    ]);
    expect(container.querySelectorAll('.sim-big-tie')).toHaveLength(2); // leading tie + P(1,0)
    expect(getByTestId('roads-text').textContent).toBe(
      'Last 10: B B B B B B P T P B; Banker 8, Player 2, Tie 2.',
    );
  });
  it('rebuilds from real engine history and taps emit the road', () => {
    let s = createGame({ seed: 3 });
    for (let i = 0; i < 12; i++) {
      const r = applyAction(s, { type: 'deal' });
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
    }
    const tap = vi.fn();
    const { container, getByRole } = render(<Scoreboard entries={s.history} onTap={tap} />);
    expect(container.querySelectorAll('.sim-bead')).toHaveLength(12);
    fireEvent.click(getByRole('button', { name: /^Big Road/ }));
    expect(tap).toHaveBeenCalledWith('big');
  });
});

describe('Tableau', () => {
  it('is generated from TABLEAU with D34 cell ids and highlights', () => {
    const { container } = render(<Tableau view="full" highlight={['b4/p7', 'b6/s', 'p5']} />);
    expect(container.querySelectorAll('[data-chart="player"] td[data-cell]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-chart="banker"] td[data-cell^="b"]')).toHaveLength(88);
    const hl = [...container.querySelectorAll('td.is-hl')].map((e) => e.getAttribute('data-cell'));
    expect(hl.sort()).toEqual(['b4/p7', 'b6/s', 'p5']);
    const cell = (id: string) => container.querySelector(`td[data-cell="${id}"]`)!.textContent;
    expect(cell('b3/p8')).toContain('S');
    expect(cell('b6/p6')).toContain('D');
    expect(cell('b5/s')).toContain('D');
    expect(cell('p8')).toContain('N');
  });
  it('views and taps', () => {
    const tap = vi.fn();
    const { container, getByRole } = render(<Tableau view="banker" onCell={tap} />);
    expect(container.querySelector('[data-chart="player"]')).toBeNull();
    fireEvent.click(getByRole('button', { name: "Banker 4, Player's third card 7: draws" }));
    expect(tap).toHaveBeenCalledWith('b4/p7');
  });
});

describe('ShoeTracker', () => {
  it('badges a positive bet "Edge to you"', () => {
    const { getByTestId } = render(<ShoeTracker view={fixtureTracker(VARIANT_RULES.ez)} />);
    const t = getByTestId('shoe-tracker');
    expect(t.textContent).toContain('Exact for the 52 cards left');
    expect(t.querySelector('tr[data-bet="dragon-7"]')!.textContent).toContain('Edge to you');
  });
});
