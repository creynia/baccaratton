import { describe, expect, it } from 'vitest';
import * as math from './math';
import * as scene from './scene';
import * as strategy from './strategy';

// Math, strategy and scene-runner surfaces throw their TODO marker until their WP lands.
describe('math / strategy / scene stubs', () => {
  const stubs: [RegExp, () => unknown][] = [
    [/TODO\(math\)/, () => math.outcomeDistribution([])],
    [/TODO\(math\)/, () => math.betEvs({} as never, {} as never)],
    [/TODO\(math\)/, () => math.fullShoeEvs({} as never)],
    [/TODO\(math\)/, () => math.previewSlip({} as never)],
    [/TODO\(math\)/, () => math.shoeTracker({} as never)],
    [/TODO\(math\)/, () => math.betTier({} as never)],
    [/TODO\(math\)/, () => math.perHourCents({} as never, 72)],
    [/TODO\(strategy\)/, () => strategy.getStrategy('martingale')],
    [/TODO\(strategy\)/, () => strategy.nextSpot({} as never, { mode: 'mixed' })],
    [/TODO\(strategy\)/, () => strategy.gradeSpot({} as never, 'Draw')],
    [/TODO\(strategy\)/, () => strategy.spotCode({} as never)],
    [/TODO\(strategy\)/, () => strategy.spotFromCode('')],
    [/TODO\(strategy\)/, () => strategy.simulateJob({} as never)],
    [/TODO\(integration\)/, () => scene.initScene({} as never)],
    [/TODO\(integration\)/, () => scene.currentStep({} as never, {} as never)],
    [/TODO\(integration\)/, () => scene.gateAction({} as never, {} as never, {} as never)],
    [/TODO\(integration\)/, () => scene.observe({} as never, {} as never, {} as never)],
    [/TODO\(integration\)/, () => scene.answerKey({} as never, {} as never)],
  ];
  it.each(stubs.map((s, i) => [i, ...s] as const))(
    'stub %i throws its marker',
    (_i, marker, call) => {
      expect(call).toThrow(marker);
    },
  );
});
