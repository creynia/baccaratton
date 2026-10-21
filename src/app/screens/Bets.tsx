import { BET_IDS, VARIANT_IDS } from '../../sim';
import type { BetEv, BetId, TiePays, VariantId } from '../../sim';
import { Html } from '../components/Html';
import { Link } from '../components/Link';
import { TierBadge } from '../components/TierBadge';
import {
  VARIANT_NAME,
  VARIANT_SHORT,
  betName,
  cheapestMain,
  fullShoe,
  offeredBets,
  payoutText,
  perfectStrategyLine,
  tableRules,
  variantsOffering,
} from '../bets';
import { useContent, useStore } from '../context';
import { money, moneyFrac, pct } from '../format';
import { navigate } from '../router';
import { NotFound } from './NotFound';

/** `?variant=` and `?tie=` override the current setting (the screen's own switch). */
function tableFrom(query: URLSearchParams, s: { variant: VariantId; tiePays: TiePays }) {
  const v = query.get('variant');
  const t = query.get('tie');
  const variant = (VARIANT_IDS as readonly string[]).includes(v ?? '')
    ? (v as VariantId)
    : s.variant;
  const tiePays: TiePays = t === '9' ? 9 : t === '8' ? 8 : s.tiePays;
  return { variant, tiePays };
}

function TableSwitch(props: { path: string; variant: VariantId; tiePays: TiePays }) {
  const go = (variant: VariantId, tiePays: TiePays) =>
    navigate(`${props.path}?variant=${variant}&tie=${tiePays}`);
  return (
    <div class="switches">
      <div class="segmented" role="group" aria-label="Table variant">
        {VARIANT_IDS.map((v) => (
          <button
            key={v}
            type="button"
            class="seg"
            aria-pressed={v === props.variant}
            onClick={() => go(v, props.tiePays)}
          >
            {VARIANT_SHORT[v]}
          </button>
        ))}
      </div>
      <div class="segmented" role="group" aria-label="Tie pays">
        {([8, 9] as const).map((t) => (
          <button
            key={t}
            type="button"
            class="seg"
            aria-pressed={t === props.tiePays}
            onClick={() => go(props.variant, t)}
          >
            Tie {t}:1
          </button>
        ))}
      </div>
    </div>
  );
}

/** Per hour at the unit bet: unit × edge × hands per hour, to the cent. */
const perHour = (ev: BetEv, unitCents: number, handsPerHour: number) =>
  moneyFrac({ num: ev.edge.num * BigInt(unitCents * handsPerHour), den: ev.edge.den });

/** Bets & paytables (`#/bets`): every bet the variant offers, edge per bet placed first (D14). */
export function BetsList({ query }: { query: URLSearchParams }) {
  const content = useContent();
  const store = useStore();
  const s = store.settings;
  const { variant, tiePays } = tableFrom(query, s);
  const rules = tableRules(variant, tiePays);
  const evs = fullShoe(variant, tiePays);
  const best = evs ? cheapestMain(evs) : null;
  const line = perfectStrategyLine(tiePays);
  const isCurrent = variant === s.variant && tiePays === s.tiePays;
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Bets & paytables</h1>
      {line && (
        <p class="lead" data-testid="perfect-strategy">
          <strong>{line.split(':')[0]}</strong>:{line.slice(line.indexOf(':') + 1)}
        </p>
      )}
      <TableSwitch path="/bets" variant={variant} tiePays={tiePays} />
      <p class="muted">
        {VARIANT_NAME[variant]}, Tie {tiePays} to 1, 8 decks.{' '}
        {isCurrent ? (
          'This is your table in Settings.'
        ) : (
          <Link to="/settings">Change your table</Link>
        )}
      </p>
      {!evs && (
        <p class="card muted" role="status" data-testid="edges-pending">
          House edges appear here once the odds engine is part of this build.
        </p>
      )}
      <ul class="plain bet-list">
        {offeredBets(variant).map((id) => {
          const ev = evs?.find((e) => e.bet === id);
          const pays = payoutText(id, rules);
          return (
            <li key={id} class="card bet-row" data-bet={id}>
              <header class="row">
                <h2>
                  <Link to={`/bets/${id}?variant=${variant}&tie=${tiePays}`}>{betName(id)}</Link>
                </h2>
                {ev && <TierBadge tier={ev.tier} />}
                {ev && best?.bet === id && (
                  <span class="badge tier-good">Lowest edge on this table</span>
                )}
              </header>
              {pays && <p>{pays}</p>}
              {ev && (
                <p>
                  House edge <strong class="money">{pct(ev.edge, 3)}</strong>
                  <span class="muted">
                    {' '}
                    · about <span class="money">{perHour(ev, s.unitCents, s.handsPerHour)}</span> an
                    hour at {money(s.unitCents)} × {s.handsPerHour} hands
                  </span>
                </p>
              )}
              {content.bets[id]?.summary && <p class="muted">{content.bets[id]?.summary}</p>}
            </li>
          );
        })}
      </ul>
      <p class="muted">
        House edge per bet placed, ties counted as a push for Player and Banker
        {variant === 'ez' ? ', and as a push for Banker when it wins with a three-card 7' : ''}.
        Exact for a full 8-deck shoe.
      </p>
    </div>
  );
}

function Outcomes({ ev }: { ev: BetEv }) {
  return (
    <table class="bets" aria-label="Outcome probabilities">
      <tbody>
        <tr>
          <td>Wins</td>
          <td class="num">{pct(ev.pWin, 2)}</td>
        </tr>
        <tr>
          <td>Pushes (stake back)</td>
          <td class="num">{pct(ev.pPush, 2)}</td>
        </tr>
        <tr>
          <td>Loses</td>
          <td class="num">{pct(ev.pLose, 2)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Bet detail (`#/bets/:betId`): copy, paytable per variant, edge, per-resolved edge (D32). */
export function BetDetail({ id, query }: { id: string; query: URLSearchParams }) {
  const content = useContent();
  const store = useStore();
  const s = store.settings;
  if (!(BET_IDS as readonly string[]).includes(id)) return <NotFound what="That bet" />;
  const bet = id as BetId;
  const offeredIn = variantsOffering(bet);
  const t = tableFrom(query, s);
  const variant = offeredIn.includes(t.variant) ? t.variant : offeredIn[0]!;
  const { tiePays } = t;
  const ev = fullShoe(variant, tiePays)?.find((e) => e.bet === bet);
  const copy = content.bets[bet];
  const lesson = copy?.lessonId ? content.lessons.find((l) => l.id === copy.lessonId) : undefined;
  return (
    <div class="page">
      <Link to={`/bets?variant=${variant}&tie=${tiePays}`} class="back">
        {'←'} Bets & paytables
      </Link>
      <h1>{copy?.name ?? betName(bet)}</h1>
      {offeredIn.length < VARIANT_IDS.length && (
        <p class="muted">
          Offered at {offeredIn.map((v) => VARIANT_NAME[v]).join(', ')} tables only.
        </p>
      )}
      {ev && (
        <section class="card" aria-label="House edge" data-testid="bet-edge">
          <p>
            <TierBadge tier={ev.tier} /> House edge <strong class="money">{pct(ev.edge, 3)}</strong>{' '}
            per bet placed at {VARIANT_NAME[variant]}
            {bet === 'tie' ? `, Tie ${tiePays} to 1` : ''}.
          </p>
          <p>
            About <span class="money">{perHour(ev, s.unitCents, s.handsPerHour)}</span> an hour at{' '}
            {money(s.unitCents)} a hand and {s.handsPerHour} hands an hour, on average.
          </p>
          {ev.edgePerResolved && (
            <p class="muted" data-testid="per-resolved">
              Counting only decided hands (ties excluded): {pct(ev.edgePerResolved, 3)}.
            </p>
          )}
          <Outcomes ev={ev} />
        </section>
      )}
      <section class="card" aria-label="Paytable">
        <h2>Pays</h2>
        <table class="bets">
          <tbody>
            {offeredIn.map((v) => (
              <tr key={v}>
                <td>{VARIANT_SHORT[v]}</td>
                <td>{payoutText(bet, tableRules(v, tiePays)) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {copy ? (
        <>
          <p class="lead">{copy.summary}</p>
          <Html html={copy.howItWorks} />
          {copy.tip && <p class="tip">{copy.tip}</p>}
        </>
      ) : (
        <p class="muted">No description yet.</p>
      )}
      <div class="row">
        <Link to={`/play?variant=${variant}&tie=${tiePays}`} class="btn">
          Try it at the table
        </Link>
        {lesson && (
          <Link to={`/learn/${lesson.id}`} class="btn btn-ghost">
            Lesson: {lesson.title}
          </Link>
        )}
      </div>
    </div>
  );
}
