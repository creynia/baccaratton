import './sim.css';
// The drawing-rule chart, generated from the engine's own TABLEAU and playerDraws (D34 views
// `player`, `banker`, `full`; highlights and taps use the TableauCellId syntax `p5`, `b4/p7`,
// `b6/s`, `nat`).
import { TABLEAU, playerDraws } from '../engine/tableau';
import type { TableauCellId } from '../strategy/types';

export type TableauView = 'player' | 'banker' | 'full';

export interface TableauProps {
  view: TableauView;
  /** Cells to highlight (D34 `TableauCellId`): `b4/p7`, `b6/s` (Player stood), `p5` (Player rule). */
  highlight?: readonly TableauCellId[];
  /** Makes cells tappable (Rules screen: open a Drill or a forced deal on that cell). */
  onCell?: (cell: TableauCellId) => void;
  caption?: string;
}

const P_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const B_TOTALS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Parses a cell id: `p5`, `b4/p7`, `b6/s`, `nat`. Returns null for anything else. */
export function parseTableauCell(
  id: TableauCellId,
):
  | { kind: 'player'; total: number }
  | { kind: 'banker'; total: number; third: number | 'stood' }
  | { kind: 'natural' }
  | null {
  if (id === 'nat') return { kind: 'natural' };
  let m = /^p([0-9])$/.exec(id);
  if (m) return { kind: 'player', total: Number(m[1]) };
  m = /^b([0-7])\/(s|p([0-9]))$/.exec(id);
  if (m)
    return { kind: 'banker', total: Number(m[1]), third: m[2] === 's' ? 'stood' : Number(m[3]) };
  return null;
}

function Cell({
  id,
  draws,
  hl,
  onCell,
  spoken,
  text,
}: {
  id: TableauCellId;
  draws: boolean | null;
  hl: boolean;
  onCell?: (cell: TableauCellId) => void;
  spoken: string;
  text?: string;
}) {
  const t = text ?? (draws ? 'D' : 'S');
  const kind = draws === null ? 'nat' : draws ? 'draw' : 'stand';
  const inner = (
    <>
      <span aria-hidden="true">{t}</span>
      <span class="sim-sr">{spoken}</span>
    </>
  );
  return (
    <td
      class={`sim-tab-cell is-${kind}${hl ? ' is-hl' : ''}`}
      data-cell={id}
      aria-current={hl ? 'true' : undefined}
    >
      {onCell ? (
        <button
          type="button"
          class="sim-tab-btn"
          onClick={() => onCell(id)}
          data-hit={`cell-${id}`}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </td>
  );
}

function PlayerChart({
  hl,
  onCell,
}: {
  hl: (id: TableauCellId) => boolean;
  onCell?: (c: TableauCellId) => void;
}) {
  return (
    <table class="sim-tab sim-tab-player" data-chart="player">
      <caption>Player (two-card total)</caption>
      <thead>
        <tr>
          <th scope="col">Total</th>
          <th scope="col">Player</th>
        </tr>
      </thead>
      <tbody>
        {P_VALUES.map((t) => {
          const d = playerDraws(t, 0);
          const nat = d.rule === 'natural';
          const id = `p${t}`;
          return (
            <tr key={t}>
              <th scope="row">{t}</th>
              <Cell
                id={id}
                draws={nat ? null : d.draws}
                hl={hl(id) || (nat && hl('nat'))}
                onCell={onCell}
                text={nat ? 'N' : undefined}
                spoken={
                  nat
                    ? `Player ${t}: a natural, both stand`
                    : `Player ${t}: ${d.draws ? 'draws' : 'stands'}`
                }
              />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BankerChart({
  hl,
  onCell,
}: {
  hl: (id: TableauCellId) => boolean;
  onCell?: (c: TableauCellId) => void;
}) {
  return (
    <div class="sim-tab-scroll" tabindex={0} role="region" aria-label="Banker drawing chart">
      <table class="sim-tab sim-tab-banker" data-chart="banker">
        <caption>Banker (two-card total) against the Player’s third card</caption>
        <colgroup>
          <col class="sim-tab-col-head" />
          <col class="sim-tab-col-stood" />
          {P_VALUES.map((v) => (
            <col key={v} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>
              <abbr title="Banker total">B</abbr>
            </th>
            <th scope="col" rowSpan={2} class="sim-tab-stood">
              <abbr title="The Player stood (no third card)">Stood</abbr>
            </th>
            <th scope="colgroup" colSpan={10}>
              Player’s 3rd card
            </th>
          </tr>
          <tr>
            {P_VALUES.map((v) => (
              <th key={v} scope="col">
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {B_TOTALS.map((b) => {
            const row = TABLEAU[b]!;
            const stood = `b${b}/s`;
            return (
              <tr key={b}>
                <th scope="row">{b}</th>
                <Cell
                  id={stood}
                  draws={row[0]!}
                  hl={hl(stood)}
                  onCell={onCell}
                  spoken={`Banker ${b}, Player stood: ${row[0] ? 'draws' : 'stands'}`}
                />
                {P_VALUES.map((v) => {
                  const id = `b${b}/p${v}`;
                  const d = row[1 + v]!;
                  return (
                    <Cell
                      key={v}
                      id={id}
                      draws={d}
                      hl={hl(id)}
                      onCell={onCell}
                      spoken={`Banker ${b}, Player's third card ${v}: ${d ? 'draws' : 'stands'}`}
                    />
                  );
                })}
              </tr>
            );
          })}
          <tr class={hl('nat') ? 'is-hl' : undefined}>
            <th scope="row">8–9</th>
            <td colSpan={11} class="sim-tab-nat" data-cell="nat">
              A natural: both stand
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The tableau: D = draws, S = stands, N = natural (letters, never colour alone). */
export function Tableau({ view, highlight = [], onCell, caption }: TableauProps) {
  const set = new Set(highlight);
  const hl = (id: TableauCellId) => set.has(id);
  return (
    <figure
      class={`tableau sim-tableau${onCell ? ' is-tap' : ''}`}
      data-view={view}
      aria-label="Drawing rules"
    >
      <figcaption>{caption ?? 'Drawing rules'}</figcaption>
      <div class="sim-tab-charts">
        {view !== 'banker' ? <PlayerChart hl={hl} onCell={onCell} /> : null}
        {view !== 'player' ? <BankerChart hl={hl} onCell={onCell} /> : null}
      </div>
      <p class="sim-tab-legend">
        <span class="sim-tab-key is-draw">D</span> draws ·{' '}
        <span class="sim-tab-key is-stand">S</span> stands ·{' '}
        <span class="sim-tab-key is-nat">N</span> natural (8 or 9 in two cards: nobody draws)
      </p>
    </figure>
  );
}
