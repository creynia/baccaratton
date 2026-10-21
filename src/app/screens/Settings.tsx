import { useState } from 'preact/hooks';
import { VARIANT_IDS } from '../../sim';
import type { BetId, TiePays, VariantId } from '../../sim';
import { VARIANT_NAME, fullShoe } from '../bets';
import { CheckUpdates } from '../components/CheckUpdates';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { pct } from '../format';
import type { Settings as SettingsData } from '../settings';
import { LIMITS, decodeImport } from '../storage';
import { effectiveSpeed } from '../theme';

type Speed = SettingsData['animationSpeed'];
type Theme = SettingsData['theme'];

function Check(props: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>
        {props.label}
        {props.note && <span class="muted"> {props.note}</span>}
      </span>
    </label>
  );
}

/** A whole-number field: clamps to [min, max] on commit and re-syncs the input when it differs. */
function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => {
          const input = e.currentTarget;
          const v = Number(input.value);
          if (input.value.trim() === '' || !Number.isFinite(v)) {
            input.value = String(props.value);
            return;
          }
          const n = Math.min(Math.max(Math.round(v), props.min), props.max);
          if (String(n) !== input.value) input.value = String(n);
          props.onCommit(n);
        }}
      />
    </label>
  );
}

/** The edge of `bet` at a table, computed by math (never typed); '' while math is a stub. */
function edgeOf(variant: VariantId, tiePays: TiePays, bet: BetId): string {
  const ev = fullShoe(variant, tiePays)?.find((e) => e.bet === bet);
  return ev ? pct(ev.edge, 2) : '';
}

export function Settings() {
  const store = useStore();
  const s = store.settings;
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const forcedInstant = effectiveSpeed(s) === 'instant' && s.animationSpeed !== 'instant';
  const set = (p: Partial<SettingsData>) => store.updateSettings(p);
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Settings</h1>

      <section class="card form" aria-labelledby="set-table">
        <h2 id="set-table">Table</h2>
        <label>
          Variant
          <select
            value={s.variant}
            onChange={(e) => set({ variant: e.currentTarget.value as VariantId })}
          >
            {VARIANT_IDS.map((v) => {
              const edge = edgeOf(v, s.tiePays, 'banker');
              return (
                <option key={v} value={v}>
                  {VARIANT_NAME[v]}
                  {edge ? `: Banker edge ${edge}` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Tie pays
          <select
            value={String(s.tiePays)}
            onChange={(e) => set({ tiePays: e.currentTarget.value === '9' ? 9 : 8 })}
          >
            {([8, 9] as const).map((t) => {
              const edge = edgeOf(s.variant, t, 'tie');
              return (
                <option key={t} value={String(t)}>
                  {t} to 1{edge ? `: edge ${edge}` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <p class="muted">
          Always 8 decks, a burn at the start of each shoe and a cut card 16 cards from the end.
          Dragon 7 and Panda 8 are offered at EZ tables only.
        </p>
        <NumberField
          label="Bet unit ($)"
          value={Math.round(s.unitCents / 100)}
          min={LIMITS.unitDollars.min}
          max={LIMITS.unitDollars.max}
          step={5}
          onCommit={(n) => set({ unitCents: n * 100 })}
        />
        <NumberField
          label="Starting bankroll ($)"
          value={Math.round(s.defaultBankrollCents / 100)}
          min={LIMITS.bankrollDollars.min}
          max={LIMITS.bankrollDollars.max}
          step={50}
          onCommit={(n) => set({ defaultBankrollCents: n * 100 })}
        />
        <NumberField
          label="Hands per hour (for every per-hour cost)"
          value={s.handsPerHour}
          min={LIMITS.handsPerHour.min}
          max={LIMITS.handsPerHour.max}
          step={1}
          onCommit={(n) => set({ handsPerHour: n })}
        />
        <Check
          label="Confirm sucker bets"
          note="(a second tap before a bet with a 9% or higher edge)"
          checked={s.confirmCostlyBets}
          onChange={(v) => set({ confirmCostlyBets: v })}
        />
        <Check
          label="Practice mode"
          note="(hide the EV until the hand settles)"
          checked={s.practice}
          onChange={(v) => set({ practice: v })}
        />
        <Check
          label="Shoe tracker"
          note="(also show the exact EV for the cards left in this shoe)"
          checked={s.shoeTracker}
          onChange={(v) => set({ shoeTracker: v })}
        />
        <Check
          label="Show roads"
          note="(Bead plate and Big Road under the table)"
          checked={s.showRoads}
          onChange={(v) => set({ showRoads: v })}
        />
      </section>

      <section class="card form" aria-labelledby="set-look">
        <h2 id="set-look">Look and feel</h2>
        <label>
          Theme
          <select value={s.theme} onChange={(e) => set({ theme: e.currentTarget.value as Theme })}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Animation speed
          <select
            value={forcedInstant ? 'instant' : s.animationSpeed}
            disabled={forcedInstant}
            onChange={(e) => set({ animationSpeed: e.currentTarget.value as Speed })}
          >
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
            <option value="instant">
              {forcedInstant ? 'Instant (reduced motion)' : 'Instant'}
            </option>
          </select>
        </label>
        <Check
          label="Reduce motion"
          note="(always instant; your device setting is honoured too)"
          checked={s.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
        />
        <Check
          label="Four-colour deck"
          checked={s.fourColorDeck}
          onChange={(v) => set({ fourColorDeck: v })}
        />
      </section>

      <section class="card form" aria-labelledby="set-progress">
        <h2 id="set-progress">Your progress</h2>
        {!store.persistent && (
          <p role="alert" class="warn">
            Progress will not be saved in this copy. Use Export to keep it.
          </p>
        )}
        <div class="row">
          <button
            type="button"
            class="btn"
            onClick={() => {
              setCode(store.exportCode());
              setMsg('Copy this code somewhere safe. Paste it on another device to restore.');
            }}
          >
            Export
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            disabled={code.trim() === '' || confirmImport}
            onClick={() => {
              if (decodeImport(code)) {
                setMsg('');
                setConfirmImport(true);
              } else setMsg('That code is not valid.');
            }}
          >
            Import
          </button>
        </div>
        <textarea
          rows={3}
          readOnly={confirmImport}
          aria-label="Progress code"
          placeholder="Progress code"
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
        {confirmImport && (
          <div class="row">
            <span>Replace your current progress?</span>
            <button
              type="button"
              class="btn btn-danger"
              onClick={() => {
                setMsg(store.importCode(code) ? 'Progress imported.' : 'That code is not valid.');
                setConfirmImport(false);
              }}
            >
              Yes, replace
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirmImport(false)}>
              Cancel
            </button>
          </div>
        )}
        {msg && <p role="status">{msg}</p>}
        {confirmReset ? (
          <div class="row">
            <span>Erase all lesson and drill progress?</span>
            <button
              type="button"
              class="btn btn-danger"
              onClick={() => {
                store.reset();
                setConfirmReset(false);
                setMsg('Progress reset.');
              }}
            >
              Yes, reset
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" class="btn btn-danger" onClick={() => setConfirmReset(true)}>
            Reset progress
          </button>
        )}
      </section>
      <section class="card form" aria-labelledby="set-updates">
        <h2 id="set-updates">Updates</h2>
        <CheckUpdates />
        <p class="muted">
          Build <span data-testid="settings-build">{__BUILD_SHA__}</span>.{' '}
          <Link to="/about">About this app</Link>
        </p>
      </section>
    </div>
  );
}
