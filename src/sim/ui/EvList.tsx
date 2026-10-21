import './sim.css';
import type { BetId } from '../engine/types';
import type { BetEv } from '../math/types';
import { TierBadge } from './TierBadge';
import { BET_LABEL, bestMainBet, pct } from './text';

export interface EvListProps {
  sheet: readonly BetEv[];
  slip?: readonly BetId[];
  onOpen?: (bet: BetId) => void;
}

/** The compact EV list of the landscape rail: every spot's edge and badge. */
export function EvList({ sheet, slip = [], onOpen }: EvListProps) {
  const best = bestMainBet(sheet);
  return (
    <ul class="sim-evmini" aria-label="House edge of every bet" data-testid="ev-list">
      {sheet
        .filter((b) => b.offered)
        .map((b) => (
          <li key={b.bet} class={slip.includes(b.bet) ? 'is-on-slip' : undefined} data-bet={b.bet}>
            {onOpen ? (
              <button type="button" class="sim-evmini-btn" onClick={() => onOpen(b.bet)}>
                <span class="sim-evmini-name">{BET_LABEL[b.bet]}</span>
                <span class="sim-evmini-edge">{pct(b.edge)}</span>
                <TierBadge tier={b.tier} short />
              </button>
            ) : (
              <span class="sim-evmini-btn">
                <span class="sim-evmini-name">{BET_LABEL[b.bet]}</span>
                <span class="sim-evmini-edge">{pct(b.edge)}</span>
                <TierBadge tier={b.tier} short />
              </span>
            )}
            {b.bet === best ? <span class="sim-sr"> (lowest edge on this table)</span> : null}
          </li>
        ))}
    </ul>
  );
}
