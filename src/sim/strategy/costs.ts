// Exact expected bet for a fresh session (curriculum.md section 7.2): forward dynamic programming
// over a system's memory states, driven by the same `stepMemory` the simulation uses. Hands are
// independent with the full-shoe probabilities (simulator.md section 2.5). Labouchère has no small
// state space: it is Monte Carlo (≈) in the tests.
import { betUnits, initMemory, stepMemory, tableCap } from './presets';
import type { StrategyMemory, StrategySpec } from './types';

/** Full-shoe hand probabilities, 8 decks (simulator.md section 2.5). */
export const P_BANKER = 8954111587648 / 19524993263685;
export const P_PLAYER = 8712962041376 / 19524993263685;
export const P_TIE = 619306544887 / 6508331087895;

const keyOf = (m: StrategyMemory): string => JSON.stringify(m.line ?? m.units ?? m.step);

/**
 * E[total units bet over `hands` hands] from step 1, with probabilities of the main bet
 * winning / losing / pushing per hand. `maxUnits` applies the table maximum (`tableCap`), the
 * same rule the simulation uses. `maxStates` guards against unbounded state spaces.
 */
export function expectedUnitsBet(
  spec: StrategySpec,
  hands: number,
  p: { win: number; lose: number; push: number },
  maxUnits = Infinity,
  maxStates = 50_000,
): number {
  let states = new Map<string, { mem: StrategyMemory; prob: number }>();
  const step = (m: StrategyMemory, o: 'win' | 'lose' | 'push'): StrategyMemory =>
    tableCap(stepMemory(m, spec, o), spec, maxUnits);
  const m0 = tableCap(initMemory(spec), spec, maxUnits);
  states.set(keyOf(m0), { mem: m0, prob: 1 });
  let total = 0;
  for (let h = 0; h < hands; h++) {
    const next = new Map<string, { mem: StrategyMemory; prob: number }>();
    const add = (mem: StrategyMemory, prob: number): void => {
      const k = keyOf(mem);
      const cur = next.get(k);
      if (cur) cur.prob += prob;
      else next.set(k, { mem, prob });
    };
    for (const { mem, prob } of states.values()) {
      total += prob * betUnits(mem, spec);
      add(step(mem, 'win'), prob * p.win);
      add(step(mem, 'lose'), prob * p.lose);
      add(step(mem, 'push'), prob * p.push);
    }
    if (next.size > maxStates) throw new Error(`expectedUnitsBet: over ${maxStates} states`);
    states = next;
  }
  return total;
}

/** Main-bet probabilities for a Player or Banker target (ties push). */
export function targetProbabilities(target: 'banker' | 'player'): {
  win: number;
  lose: number;
  push: number;
} {
  return target === 'banker'
    ? { win: P_BANKER, lose: P_PLAYER, push: P_TIE }
    : { win: P_PLAYER, lose: P_BANKER, push: P_TIE };
}
