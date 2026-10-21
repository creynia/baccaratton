import { describe, expect, it } from 'vitest';
import * as engine from './index';

// Every API surface the engine WP must implement throws a TODO(engine) marker until then, so
// nothing can silently depend on a stub. Delete a line here when its function is implemented.
describe('engine stubs', () => {
  const stubs: [string, () => unknown][] = [
    ['createGame', () => engine.createGame()],
    ['applyAction', () => engine.applyAction({} as never, { type: 'clear-bets' })],
    ['replay', () => engine.replay({} as never, [])],
    ['visibleView', () => engine.visibleView({} as never)],
    ['equity', () => engine.equity({} as never)],
    ['legalActions', () => engine.legalActions({} as never)],
    ['queueForced', () => engine.queueForced({} as never, [])],
    ['startShoe', () => engine.startShoe({} as never, 'fresh')],
    ['resolveRules', () => engine.resolveRules()],
    ['betDef', () => engine.betDef('player')],
    ['settleHand', () => engine.settleHand({} as never, {}, {} as never)],
    ['profitCents', () => engine.profitCents(100, {} as never)],
    ['validateAction', () => engine.validateAction({} as never, { type: 'clear-bets' })],
    ['validateForcedHand', () => engine.validateForcedHand({} as never, {} as never)],
    ['roadEntry', () => engine.roadEntry({} as never)],
    ['beadPlate', () => engine.beadPlate([])],
    ['bigRoad', () => engine.bigRoad([])],
    ['roadCounts', () => engine.roadCounts([])],
    ['playHand', () => engine.playHand(() => 0)],
  ];
  it.each(stubs)('%s throws TODO(engine)', (_name, call) => {
    expect(call).toThrow(/^TODO\(engine\)/);
  });
});
