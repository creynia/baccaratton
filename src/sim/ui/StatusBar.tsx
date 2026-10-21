import './sim.css';
import type { Cents } from '../engine/types';
import { ShoeMeter } from './ShoeMeter';
import type { ShoeMeterProps } from './ShoeMeter';
import { money } from './text';

export interface StatusBarProps {
  bankroll: Cents;
  onFelt: Cents;
  shoe?: ShoeMeterProps | null;
  /** Session net (shown signed). */
  sessionNet?: Cents | null;
}

/** Bankroll · on felt · shoe meter · session ± (simulator.md section 4.2). */
export function StatusBar({ bankroll, onFelt, shoe, sessionNet }: StatusBarProps) {
  return (
    <div class="sim-status" data-testid="status-bar">
      <span>
        <span class="sim-status-k">Bankroll</span>{' '}
        <strong class="sim-money" data-testid="bankroll">
          {money(bankroll, { cents: 'always' })}
        </strong>
      </span>
      <span>
        <span class="sim-status-k">On felt</span> <strong class="sim-money">{money(onFelt)}</strong>
      </span>
      {sessionNet != null ? (
        <span>
          <span class="sim-status-k">Session</span>{' '}
          <strong class="sim-money">{money(sessionNet, { sign: true, cents: 'always' })}</strong>
        </span>
      ) : null}
      {shoe ? <ShoeMeter {...shoe} /> : null}
    </div>
  );
}
