import './sim.css';
import type { Cents } from '../engine/types';
import { CHIP_DENOMS, chipClass, chipLabel } from './ChipStack';
import { money } from './text';

export interface ChipRackProps {
  chips?: readonly Cents[];
  selected: Cents;
  onSelect: (c: Cents) => void;
  /** Chips worth more than this are disabled (the bankroll). */
  maxAffordable?: Cents;
  disabled?: boolean;
  /** Two rows in the landscape rail. */
  compact?: boolean;
}

/** The chip rack (HTML, chips ≥ 48 px, D16 $1 $5 $25 $100 $500). Pick a chip, then tap a spot. */
export function ChipRack({
  chips = CHIP_DENOMS,
  selected,
  onSelect,
  maxAffordable,
  disabled,
  compact,
}: ChipRackProps) {
  return (
    <div
      class={`sim-rack${compact ? ' is-compact' : ''}`}
      role="radiogroup"
      aria-label="Chip value"
      data-testid="chip-rack"
    >
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={selected === c}
          aria-label={`${money(c)} chip`}
          disabled={disabled || (maxAffordable !== undefined && c > maxAffordable)}
          class={`sim-rack-chip ${chipClass(c)}${selected === c ? ' is-selected' : ''}`}
          onClick={() => onSelect(c)}
          data-chip={c}
          data-hit={`chip-${c}`}
        >
          <span class="sim-rack-face">{chipLabel(c)}</span>
        </button>
      ))}
    </div>
  );
}
