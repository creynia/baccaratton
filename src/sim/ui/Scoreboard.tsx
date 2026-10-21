import './sim.css';
// Scoreboards (simulator.md §3, D4): the Bead plate and the Big Road, drawn from the engine's pure
// road builders. Every mark carries a letter or a shape, never colour alone. Each road scrolls
// sideways inside its own strip; the page never scrolls sideways.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { beadPlate, bigRoad, roadCounts } from '../engine/roads';
import type { BeadCell, BigRoadCell, RoadEntry } from '../engine/types';

export type RoadView = 'bead' | 'big';

export interface ScoreboardProps {
  entries: readonly RoadEntry[];
  /** Which roads to draw; default both. */
  view?: readonly RoadView[];
  rows?: number;
  caption?: string;
  /** Tap a road (scenes wait for `tapped: bead-plate | big-road`). */
  onTap?: (road: RoadView) => void;
  /** Bead plate shows the winning total instead of the letter. */
  showTotals?: boolean;
  /** Columns always drawn (the grid fills the strip even when the shoe is young). */
  minColumns?: number;
  /** Cell size in CSS px (18 by default, simulator.md §4.2). */
  cell?: number;
}

const LETTER = { banker: 'B', player: 'P', tie: 'T' } as const;

/** "Last 10: B B P T B …; Banker 23, Player 19, Tie 4". */
export function roadsText(entries: readonly RoadEntry[]): string {
  if (entries.length === 0) return 'No hands yet this shoe.';
  const c = roadCounts(entries);
  const last = entries.slice(-10).map((e) => LETTER[e.winner]);
  return `Last ${last.length}: ${last.join(' ')}; Banker ${c.banker}, Player ${c.player}, Tie ${c.tie}.`;
}

function PairDots({ x, y, s, b, p }: { x: number; y: number; s: number; b: boolean; p: boolean }) {
  const r = Math.max(2, s * 0.14);
  return (
    <>
      {b ? (
        <circle cx={x + r + 0.5} cy={y + r + 0.5} r={r} class="sim-road-pair is-banker" />
      ) : null}
      {p ? (
        <circle cx={x + s - r - 0.5} cy={y + s - r - 0.5} r={r} class="sim-road-pair is-player" />
      ) : null}
    </>
  );
}

function Grid({ cols, rows, s }: { cols: number; rows: number; s: number }) {
  const d: string[] = [];
  for (let c = 0; c <= cols; c++) d.push(`M${c * s} 0V${rows * s}`);
  for (let r = 0; r <= rows; r++) d.push(`M0 ${r * s}H${cols * s}`);
  return <path d={d.join('')} class="sim-road-grid" />;
}

function Bead({ c, s, showTotals }: { c: BeadCell; s: number; showTotals?: boolean }) {
  const x = c.col * s;
  const y = c.row * s;
  const e = c.entry;
  return (
    <g class={`sim-bead is-${e.winner}${e.prefilled ? ' is-prefilled' : ''}`} data-index={c.index}>
      <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.42} class="sim-bead-dot" />
      <text
        x={x + s / 2}
        y={y + s / 2 + s * 0.2}
        text-anchor="middle"
        class="sim-bead-text"
        font-size={s * 0.55}
      >
        {showTotals ? e.total : LETTER[e.winner]}
      </text>
      <PairDots x={x} y={y} s={s} b={e.bankerPair} p={e.playerPair} />
    </g>
  );
}

function BigCell({ c, s, extraTies }: { c: BigRoadCell; s: number; extraTies: number }) {
  const x = c.col * s;
  const y = c.row * s;
  const ties = c.ties + extraTies;
  return (
    <g class={`sim-big is-${c.winner}`} data-index={c.index} data-col={c.col} data-row={c.row}>
      <circle
        cx={x + s / 2}
        cy={y + s / 2}
        r={s * 0.36}
        class="sim-big-ring"
        stroke-width={s * 0.14}
      />
      {ties > 0 ? (
        <>
          <path
            d={`M${x + s * 0.2} ${y + s * 0.8}L${x + s * 0.8} ${y + s * 0.2}`}
            class="sim-big-tie"
            stroke-width={s * 0.12}
          />
          {ties > 1 ? (
            <text
              x={x + s / 2}
              y={y + s / 2 + s * 0.18}
              text-anchor="middle"
              class="sim-big-ties"
              font-size={s * 0.5}
            >
              {ties}
            </text>
          ) : null}
        </>
      ) : null}
      <PairDots x={x} y={y} s={s} b={c.bankerPair} p={c.playerPair} />
    </g>
  );
}

function Strip({
  name,
  road,
  onTap,
  children,
  label,
  cols,
  cell,
}: {
  name: string;
  road: RoadView;
  onTap?: (road: RoadView) => void;
  children: ComponentChildren;
  label: string;
  cols: number;
  cell: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cols]);
  return (
    <div class="sim-road" data-road={road}>
      <div class="sim-road-name">{name}</div>
      <div
        ref={ref}
        class={`sim-road-scroll${onTap ? ' is-tap' : ''}`}
        style={`--sim-cell:${cell}px`}
        role={onTap ? 'button' : 'img'}
        tabIndex={onTap ? 0 : undefined}
        aria-label={label}
        data-target={road === 'bead' ? 'bead-plate' : 'big-road'}
        data-hit={onTap ? (road === 'bead' ? 'bead-plate' : 'big-road') : undefined}
        onClick={onTap ? () => onTap(road) : undefined}
        onKeyDown={
          onTap
            ? (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap(road);
                }
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/** Bead plate + Big Road with the header counts and a text alternative. */
export function Scoreboard({
  entries,
  view = ['bead', 'big'],
  rows = 6,
  caption,
  onTap,
  showTotals,
  minColumns = 12,
  cell = 18,
}: ScoreboardProps) {
  const s = cell;
  const counts = roadCounts(entries);
  const text = roadsText(entries);
  const beads = view.includes('bead') ? beadPlate(entries, rows) : [];
  const big = view.includes('big') ? bigRoad(entries, rows) : null;
  const beadCols = Math.max(minColumns, beads.reduce((m, c) => Math.max(m, c.col + 1), 0) + 1);
  const bigCols = big
    ? Math.max(minColumns, big.cells.reduce((m, c) => Math.max(m, c.col + 1), 0) + 1)
    : 0;
  const firstBig = big?.cells[0]?.index;
  return (
    <figure class="scoreboard sim-scoreboard" aria-label="Scoreboard" data-testid="scoreboard">
      <figcaption class="sim-road-head">
        <span>{caption ?? 'Scoreboard'}</span>
        <span class="sim-road-counts">
          <span class="sim-road-count is-banker">B {counts.banker}</span>
          <span class="sim-road-count is-player">P {counts.player}</span>
          <span class="sim-road-count is-tie">T {counts.tie}</span>
          {counts.bankerPair ? (
            <span class="sim-road-count">B pair {counts.bankerPair}</span>
          ) : null}
          {counts.playerPair ? (
            <span class="sim-road-count">P pair {counts.playerPair}</span>
          ) : null}
        </span>
      </figcaption>
      {view.includes('bead') ? (
        <Strip
          name="Bead plate"
          road="bead"
          onTap={onTap}
          label={`Bead plate. ${text}`}
          cols={beadCols}
          cell={s}
        >
          <svg
            width={beadCols * s}
            height={rows * s}
            viewBox={`0 0 ${beadCols * s} ${rows * s}`}
            aria-hidden="true"
          >
            <Grid cols={beadCols} rows={rows} s={s} />
            {beads.map((c) => (
              <Bead key={c.index} c={c} s={s} showTotals={showTotals} />
            ))}
          </svg>
        </Strip>
      ) : null}
      {big ? (
        <Strip
          name="Big Road"
          road="big"
          onTap={onTap}
          label={`Big Road: ${big.streaks.length} streaks${big.streaks.length ? `, longest ${Math.max(...big.streaks.map((x) => x.length))}` : ''}. ${text}`}
          cols={bigCols}
          cell={s}
        >
          <svg
            width={bigCols * s}
            height={rows * s}
            viewBox={`0 0 ${bigCols * s} ${rows * s}`}
            aria-hidden="true"
          >
            <Grid cols={bigCols} rows={rows} s={s} />
            {big.cells.map((c) => (
              <BigCell
                key={c.index}
                c={c}
                s={s}
                extraTies={c.index === firstBig ? big.leadingTies : 0}
              />
            ))}
          </svg>
        </Strip>
      ) : null}
      <p class="sim-sr" data-testid="roads-text">
        {text}
      </p>
    </figure>
  );
}
