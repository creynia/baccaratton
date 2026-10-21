// Auto-play (simulator.md section 6.4, D9, D21): pick a system, unit, target, hands and sessions;
// run the `simulate` job through the EvClient (time-sliced, same thread); show the charts and a
// summary that labels what is exact and what is simulated (section 2.7).
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { formatMoney as engineMoney } from '../engine/money';

import type { EvClient, Progress } from '../jobs/protocol';
import { HAND_OPTIONS, MAX_HANDS, rulesFor, systemCost } from '../strategy/metrics';
import type { SystemCost } from '../strategy/metrics';
import { PICKER_GROUPS, STRATEGY_NAMES, unitLimits } from '../strategy/presets';
import type {
  SessionSeries,
  SimulateResult,
  StrategyId,
  StrategyLens,
  StrategySpec,
} from '../strategy/types';
import { BankrollChart, seriesLabel, Swatch } from './BankrollChart';
import { OutcomeHistogram } from './OutcomeHistogram';
import { SurvivalChart } from './SurvivalChart';
import type { SimSettings } from './types';

/** Money with the minus sign (−), never a hyphen. */
const formatMoney = (cents: number, opts?: { sign?: boolean }): string =>
  engineMoney(cents, opts).replace(/^-/, '\u2212');

const LENS_LABEL: Record<StrategyLens, string> = {
  'lowest-edge': 'Lowest edge',
  practical: 'Practical',
  fun: 'Fun per dollar',
};
const PROGRESSIONS: ReadonlySet<StrategyId> = new Set([
  'martingale',
  'paroli',
  'one-three-two-six',
  'fibonacci',
  'dalembert',
  'labouchere',
]);
const MAX_COMPARE = 4;

export type AutoPlayEvent = { type: 'auto-play-completed'; hands: number; strategy: string };

export interface AutoPlayPanelProps {
  evClient: EvClient;
  settings: SimSettings;
  /** Scene config (SceneConfig.autoPlay); all optional. */
  strategies?: StrategyId[];
  defaultStrategy?: StrategySpec;
  handOptions?: number[];
  sessionOptions?: number[];
  /** Strategies run on the same seeds (a scene's list replaces the picker). */
  compare?: StrategySpec[];
  bankroll?: number;
  seed?: number;
  onEvent?: (e: AutoPlayEvent) => void;
  /** Optional "Watch" (≤ 72 hands on the felt), wired by the container. */
  onWatch?: (spec: StrategySpec) => void;
}

/** The unit clamped to the system's table limits (its first bet must fit under the maximum). */
export function clampUnit(
  spec: Pick<StrategySpec, 'id' | 'sequence'>,
  cents: number,
  s: SimSettings,
): number {
  const { min, max } = unitLimits(spec, rulesFor(s.variant, s.tiePays));
  const whole = Math.round(cents / 100) * 100;
  return Math.min(max, Math.max(min, Number.isFinite(whole) ? whole : min));
}

const pct = (v: number, d = 2): string => `${(v * 100).toFixed(d)}%`;

function exactCost(spec: StrategySpec, settings: SimSettings, hands: number): SystemCost | null {
  try {
    return systemCost(spec, settings.variant, settings.tiePays, hands, settings.handsPerHour);
  } catch {
    return null; // math not available (or no exact model)
  }
}

export function AutoPlayPanel({
  evClient,
  settings,
  strategies,
  defaultStrategy,
  handOptions,
  sessionOptions,
  compare: sceneCompare,
  bankroll: sceneBankroll,
  seed: sceneSeed,
  onEvent,
  onWatch,
}: AutoPlayPanelProps) {
  const handChoices = handOptions?.length ? handOptions : [...HAND_OPTIONS];
  const sessionChoices = sessionOptions?.length ? sessionOptions : [1, 100];
  const allowed = (id: StrategyId): boolean => !strategies?.length || strategies.includes(id);
  const groups = PICKER_GROUPS.map((g) => ({ ...g, ids: g.ids.filter(allowed) })).filter(
    (g) => g.ids.length > 0,
  );
  const [id, setId] = useState<StrategyId>(
    defaultStrategy?.id ?? (allowed('flat-banker') ? 'flat-banker' : groups[0]!.ids[0]!),
  );
  const [unitDollars, setUnit] = useState((defaultStrategy?.unit ?? settings.unitCents) / 100);
  const [target, setTarget] = useState<'banker' | 'player'>(defaultStrategy?.target ?? 'banker');
  const [hands, setHands] = useState<number>(handChoices[0]!);
  const [custom, setCustom] = useState(false);
  const [sessions, setSessions] = useState(sessionChoices[sessionChoices.length - 1]!);
  const [seed, setSeed] = useState(sceneSeed ?? 1);
  const [bankrollDollars, setBankroll] = useState((sceneBankroll ?? 100_000) / 100);
  const [picked, setPicked] = useState<StrategyId[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<{
    res: SimulateResult;
    bankroll: number;
    hands: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const asked = Math.round(unitDollars) * 100;
  const unit = clampUnit(
    { id, sequence: defaultStrategy?.id === id ? defaultStrategy.sequence : undefined },
    asked,
    settings,
  );
  const selectId = useId();
  const bankroll = Math.max(0, Math.round(bankrollDollars) * 100);
  const picker: StrategySpec = {
    ...(defaultStrategy?.id === id ? defaultStrategy : {}),
    id,
    unit,
    ...(PROGRESSIONS.has(id) ? { target } : {}),
  };
  // A scene's compare list is the whole run: its first entry is the main series, the rest run
  // alongside on the same seeds (entries may share an id and differ only in side bets or label).
  const sceneMode = !!sceneCompare?.length;
  const spec: StrategySpec = sceneMode ? sceneCompare[0]! : picker;
  const others: StrategySpec[] = sceneMode
    ? sceneCompare.slice(1)
    : picked
        .filter((p) => p !== id)
        .map((p) => ({
          id: p,
          unit: clampUnit({ id: p }, asked, settings),
          ...(PROGRESSIONS.has(p) ? { target } : {}),
        }));
  const specKey = JSON.stringify(spec);
  const cost = useMemo(
    () => exactCost(JSON.parse(specKey) as StrategySpec, settings, hands),
    [specKey, settings.variant, settings.tiePays, settings.handsPerHour, hands],
  );

  async function run(): Promise<void> {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 1 });
    const h = Math.min(MAX_HANDS, Math.max(1, Math.round(hands)));
    try {
      const res = await evClient.run(
        'simulate',
        {
          strategy: spec,
          compare: others,
          variant: settings.variant,
          tiePays: settings.tiePays,
          hands: h,
          sessions,
          seed,
          bankroll,
          handsPerHour: settings.handsPerHour,
        },
        { key: 'auto-play', signal: ac.signal, onProgress: setProgress },
      );
      setResult({ res, bankroll, hands: h });
      setProgress(null);
      onEvent?.({ type: 'auto-play-completed', hands: h, strategy: spec.id });
    } catch (e) {
      setProgress(null);
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  }

  const running = progress !== null;
  const field = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: '13px',
    minWidth: 0,
  } as const;
  const control = {
    width: '100%',
    minWidth: 0,
    minHeight: '44px',
    boxSizing: 'border-box',
  } as const;
  return (
    <section
      data-testid="auto-play"
      aria-label="Auto-play"
      style={{ display: 'grid', gap: '12px' }}
    >
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}
      >
        {sceneMode ? null : (
          <div style={{ ...field, gridColumn: '1 / -1' }}>
            <label for={selectId}>System</label>
            <select
              id={selectId}
              style={control}
              value={id}
              data-testid="auto-strategy"
              onChange={(e) => setId(e.currentTarget.value as StrategyId)}
            >
              {groups.map((g) => (
                <optgroup key={g.lens} label={LENS_LABEL[g.lens]}>
                  {g.ids.map((s) => (
                    <option key={s} value={s}>
                      {STRATEGY_NAMES[s]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {sceneMode ? null : (
          <label style={field}>
            Unit ($)
            <input
              style={control}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={unitDollars}
              data-testid="auto-unit"
              onInput={(e) => setUnit(Number(e.currentTarget.value))}
            />
            {asked !== unit ? (
              <span style={{ color: 'var(--muted)' }} data-testid="auto-unit-note">
                Table limits: using {formatMoney(unit)}.
              </span>
            ) : null}
          </label>
        )}
        {!sceneMode && PROGRESSIONS.has(id) ? (
          <label style={field}>
            Bet on
            <select
              style={control}
              value={target}
              onChange={(e) => setTarget(e.currentTarget.value as 'banker' | 'player')}
            >
              <option value="banker">Banker</option>
              <option value="player">Player</option>
            </select>
          </label>
        ) : null}
        <label style={field}>
          Bankroll ($)
          <input
            style={control}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={bankrollDollars}
            onInput={(e) => setBankroll(Number(e.currentTarget.value))}
          />
        </label>
        <label style={field}>
          Hands
          <select
            style={control}
            data-testid="auto-hands"
            value={custom ? 'custom' : String(hands)}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === 'custom') setCustom(true);
              else {
                setCustom(false);
                setHands(Number(v));
              }
            }}
          >
            {handChoices.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString('en-US')}
                {n % settings.handsPerHour === 0 ? ` (${n / settings.handsPerHour} h)` : ''}
              </option>
            ))}
            {handOptions?.length ? null : <option value="custom">Custom…</option>}
          </select>
        </label>
        {custom ? (
          <label style={field}>
            Custom hands (≤ 20,000)
            <input
              style={control}
              type="number"
              min={1}
              max={MAX_HANDS}
              step={1}
              value={hands}
              onInput={(e) => setHands(Math.min(MAX_HANDS, Number(e.currentTarget.value) || 1))}
            />
          </label>
        ) : null}
        <label style={field}>
          Sessions
          <select
            style={control}
            data-testid="auto-sessions"
            value={String(sessions)}
            onChange={(e) => setSessions(Number(e.currentTarget.value))}
          >
            {sessionChoices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          Seed
          <input
            style={control}
            type="number"
            value={seed}
            onInput={(e) => setSeed(Number(e.currentTarget.value) | 0)}
          />
        </label>
      </div>
      {sceneCompare?.length ? (
        <p style={{ margin: 0, fontSize: '13px' }}>
          Compared on the same cards: {sceneCompare.map(seriesLabel).join(', ')}.
        </p>
      ) : (
        <fieldset style={{ border: 0, margin: 0, padding: 0, fontSize: '13px' }}>
          <legend style={{ padding: 0 }}>Compare on the same cards (up to {MAX_COMPARE})</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
            {groups
              .flatMap((g) => g.ids)
              .filter((s) => s !== id)
              .map((s) => {
                const on = picked.includes(s);
                return (
                  <label
                    key={s}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '44px' }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && picked.filter((p) => p !== id).length >= MAX_COMPARE}
                      onChange={(e) =>
                        setPicked(
                          e.currentTarget.checked ? [...picked, s] : picked.filter((p) => p !== s),
                        )
                      }
                    />
                    {STRATEGY_NAMES[s]}
                  </label>
                );
              })}
          </div>
        </fieldset>
      )}
      {cost ? (
        <p style={{ margin: 0, fontSize: '13px' }} data-testid="auto-exact">
          {cost.kind === 'exact' && cost.costPerHourCents !== null && cost.avgBetCents !== null ? (
            <>
              Exact over a {hands.toLocaleString('en-US')}-hand session: average bet{' '}
              {formatMoney(Math.round(cost.avgBetCents))} per hand, cost{' '}
              {formatMoney(Math.round(cost.costPerHourCents))} per hour ({settings.handsPerHour}{' '}
              hands an hour, edge {pct(cost.edge)}).
            </>
          ) : (
            <>
              Edge {pct(cost.edge)} on every bet; the average bet comes from the run (≈ simulated).
            </>
          )}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          class="btn"
          onClick={() => void run()}
          disabled={running}
          data-testid="auto-run"
        >
          Run
        </button>
        {onWatch ? (
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => onWatch(spec)}
            disabled={running}
          >
            Watch on the table
          </button>
        ) : null}
        {running ? (
          <>
            <progress value={progress.done} max={progress.total} aria-label="Simulation progress" />
            <button type="button" class="btn btn-ghost" onClick={() => ctl.current?.abort()}>
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? <Results {...result} settings={settings} /> : null}
    </section>
  );
}

function Results({
  res,
  bankroll,
  hands,
  settings,
}: {
  res: SimulateResult;
  bankroll: number;
  hands: number;
  settings: SimSettings;
}) {
  const many = res.series.some((s) => s.p10 !== undefined);
  const main = res.series[0]!;
  const sessions = main.finals.length;
  const noteId = useId();
  return (
    <div data-testid="auto-play-result" style={{ display: 'grid', gap: '10px' }}>
      <BankrollChart
        series={res.series}
        bankroll={bankroll}
        hands={hands}
        handsPerHour={settings.handsPerHour}
      />
      {many ? <SurvivalChart series={res.series} hands={hands} /> : null}
      <div data-testid="auto-summary" style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
        <p
          id={noteId}
          style={{ margin: 0, textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}
        >
          {sessions > 1 ? `${sessions} sessions` : '1 session'} of {hands.toLocaleString('en-US')}{' '}
          hands, same cards for every system. Cost/h (edge × money bet per hour) and "Expected" are
          exact given the bets placed; the rest is ≈ simulated.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-describedby={noteId}
            style={{
              borderCollapse: 'collapse',
              fontSize: '13px',
              fontVariantNumeric: 'tabular-nums',
              minWidth: '100%',
            }}
          >
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>
                  System
                </th>
                <th scope="col">Mean bet</th>
                <th scope="col">Cost/h</th>
                <th scope="col">Expected</th>
                <th scope="col">Actual (≈)</th>
                {many ? <th scope="col">Busted (≈)</th> : null}
                {many ? <th scope="col">Ahead (≈)</th> : null}
                <th scope="col">Cap resets</th>
              </tr>
            </thead>
            <tbody>
              {res.series.map((s, k) => (
                <Row key={k} s={s} k={k} bankroll={bankroll} many={many} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '13px' }} data-testid="auto-sentence">
        {sentence(main, settings.handsPerHour)}
      </p>
      {res.series.map((s, k) => (
        <OutcomeHistogram key={k} series={s} bankroll={bankroll} index={k} showWinners={k === 0} />
      ))}
    </div>
  );
}

function sentence(s: SessionSeries, handsPerHour: number): string {
  const edge = s.meanBetPerHand > 0 ? s.costPerHourCents / handsPerHour / s.meanBetPerHand : 0;
  return `${seriesLabel(s.strategy)} bet an average ${formatMoney(Math.round(s.meanBetPerHand))} per hand, so it cost ${pct(edge)} of that: the same edge on more money.`;
}

function Row({
  s,
  k,
  bankroll,
  many,
}: {
  s: SessionSeries;
  k: number;
  bankroll: number;
  many: boolean;
}) {
  const cell = { padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' } as const;
  const expected = s.expected[s.expected.length - 1]! - bankroll;
  const actual = s.meanFinal - bankroll;
  return (
    <tr>
      <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400, whiteSpace: 'normal' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Swatch k={k} />
          {seriesLabel(s.strategy)}
        </span>
      </th>
      <td style={cell}>{formatMoney(Math.round(s.meanBetPerHand))}</td>
      <td style={cell}>{formatMoney(Math.round(s.costPerHourCents))}</td>
      <td style={cell}>{formatMoney(Math.round(expected), { sign: true })}</td>
      <td style={cell}>
        {formatMoney(Math.round(actual), { sign: true })}
        {s.meanFinalCi95 > 0 ? ` ± ${formatMoney(Math.round(s.meanFinalCi95))}` : ''}
      </td>
      {many ? <td style={cell}>{pct(s.bustRate, 1)}</td> : null}
      {many ? <td style={cell}>{pct(s.probAhead, 0)}</td> : null}
      <td style={cell}>{s.capHits.toLocaleString('en-US')}</td>
    </tr>
  );
}
