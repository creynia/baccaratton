// @vitest-environment node
// Lints a temporary bad import in each layer and expects an error, so the layering rules in
// eslint.config.js can't silently stop working (architecture.md §6.1).
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// The files below don't exist, so the type-aware project service can't load them: lint them
// without type information and switch the type-checked rules off. Layering rules still run.
const typed = Object.fromEntries(
  tseslint.configs.recommendedTypeChecked.flatMap((c) =>
    Object.keys(c.rules ?? {}).map((r) => [r, 'off'] as const),
  ),
);
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false, project: false } },
      rules: typed,
    },
  ] as never,
});

async function violations(filePath: string, code: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals')
    .map((m) => `${m.ruleId}: ${m.message}`);
}

// Every pair (from-layer, forbidden-layer) at depth 0, plus relative forms at depth 1 and 2.
const bad: [string, string, string][] = [
  ['engine imports math', 'src/sim/engine/__tmp.ts', "import '../math/types';"],
  ['engine imports math (barrel)', 'src/sim/engine/__tmp.ts', "import '../math';"],
  ['engine imports preact', 'src/sim/engine/__tmp.ts', "import 'preact';"],
  ['engine imports the sim barrel', 'src/sim/engine/__tmp.ts', "import '..';"],
  ['engine imports the sim barrel (index)', 'src/sim/engine/__tmp.ts', "import '../index';"],
  ['engine (depth 1) imports strategy', 'src/sim/engine/a/__tmp.ts', "import '../../strategy';"],
  [
    'engine (depth 2) imports jobs',
    'src/sim/engine/a/b/__tmp.ts',
    "import '../../../jobs/client';",
  ],
  ['engine (depth 1) imports the sim barrel', 'src/sim/engine/a/__tmp.ts', "import '../..';"],
  ['engine imports app', 'src/sim/engine/__tmp.ts', "import '../../app/store';"],
  ['engine imports content', 'src/sim/engine/__tmp.ts', "import '../../content/types';"],
  ['engine imports ui', 'src/sim/engine/__tmp.ts', "import '../ui/Simulator';"],
  ['engine imports scene', 'src/sim/engine/__tmp.ts', "import '../scene/types';"],
  ['math imports strategy', 'src/sim/math/__tmp.ts', "import '../strategy';"],
  ['math (depth 1) imports strategy', 'src/sim/math/a/__tmp.ts', "import '../../strategy/types';"],
  ['math imports jobs', 'src/sim/math/__tmp.ts', "import '../jobs/protocol';"],
  ['math imports scene', 'src/sim/math/__tmp.ts', "import '../scene';"],
  ['math imports app', 'src/sim/math/__tmp.ts', "import '../../app/store';"],
  ['math imports preact', 'src/sim/math/__tmp.ts', "import 'preact/hooks';"],
  ['strategy imports ui', 'src/sim/strategy/__tmp.ts', "import '../ui/Simulator';"],
  ['strategy imports scene', 'src/sim/strategy/__tmp.ts', "import '../scene/types';"],
  ['strategy imports jobs', 'src/sim/strategy/__tmp.ts', "import '../jobs';"],
  ['strategy (depth 1) imports jobs', 'src/sim/strategy/a/__tmp.ts', "import '../../jobs/runner';"],
  ['strategy imports the sim barrel', 'src/sim/strategy/__tmp.ts', "import '../index';"],
  ['scene imports jobs', 'src/sim/scene/__tmp.ts', "import '../jobs/client';"],
  ['scene imports ui', 'src/sim/scene/__tmp.ts', "import '../ui/EvSheet';"],
  ['scene imports content', 'src/sim/scene/__tmp.ts', "import '../../content/types';"],
  ['scene imports preact', 'src/sim/scene/__tmp.ts', "import 'preact';"],
  ['jobs imports ui', 'src/sim/jobs/__tmp.ts', "import '../ui/EvSheet';"],
  ['jobs imports scene', 'src/sim/jobs/__tmp.ts', "import '../scene/types';"],
  ['jobs imports app', 'src/sim/jobs/__tmp.ts', "import '../../app/settings';"],
  ['jobs imports preact', 'src/sim/jobs/__tmp.ts', "import 'preact';"],
  ['jobs (depth 1) imports ui', 'src/sim/jobs/a/__tmp.ts', "import '../../ui/types';"],
  ['ui imports app', 'src/sim/ui/__tmp.ts', "import '../../app/settings';"],
  ['ui (depth 1) imports app', 'src/sim/ui/layouts/__tmp.ts', "import '../../../app/settings';"],
  ['ui imports content', 'src/sim/ui/__tmp.ts', "import '../../content/types';"],
  ['ui imports jobs internals', 'src/sim/ui/__tmp.ts', "import '../jobs/runner';"],
  ['ui imports jobs jobs.ts', 'src/sim/ui/__tmp.ts', "import '../jobs/jobs';"],
  ['ui imports the sim barrel', 'src/sim/ui/__tmp.ts', "import '..';"],
  ['content imports app', 'src/content/__tmp.ts', "import '../app/settings';"],
  ['content imports the sim barrel', 'src/content/__tmp.ts', "import '../sim';"],
  ['content imports ui', 'src/content/__tmp.ts', "import '../sim/ui/Simulator';"],
  ['content imports jobs', 'src/content/__tmp.ts', "import '../sim/jobs';"],
  ['pwa imports app', 'src/pwa/__tmp.ts', "import '../app/settings';"],
  ['pwa imports sim', 'src/pwa/__tmp.ts', "import '../sim/engine';"],
  ['pwa imports content', 'src/pwa/__tmp.ts', "import '../content/types';"],
  ['engine uses document', 'src/sim/engine/__tmp.ts', 'export const a = document.title;'],
  ['math uses localStorage', 'src/sim/math/__tmp.ts', 'export const a = localStorage;'],
  ['strategy uses window', 'src/sim/strategy/__tmp.ts', 'export const a = window;'],
  ['scene uses fetch', 'src/sim/scene/__tmp.ts', "export const a = fetch('x');"],
  ['jobs uses window', 'src/sim/jobs/__tmp.ts', 'export const a = window;'],
  ['jobs uses self', 'src/sim/jobs/__tmp.ts', 'export const a = self;'],
  ['jobs uses postMessage', 'src/sim/jobs/__tmp.ts', "postMessage('x');"],
];

const good: [string, string, string][] = [
  ['engine imports itself', 'src/sim/engine/__tmp.ts', "import './types';\nexport const a = 1;"],
  [
    'engine (depth 1) imports itself',
    'src/sim/engine/a/__tmp.ts',
    "import '../types';\nexport const a = 1;",
  ],
  ['math imports engine', 'src/sim/math/__tmp.ts', "import '../engine';\nexport const a = 1;"],
  [
    'strategy imports math',
    'src/sim/strategy/__tmp.ts',
    "import '../math/types';\nexport const a = 1;",
  ],
  [
    'scene imports strategy',
    'src/sim/scene/__tmp.ts',
    "import '../strategy/types';\nexport const a = 1;",
  ],
  [
    'jobs imports engine, math and strategy',
    'src/sim/jobs/__tmp.ts',
    "import '../engine/job';\nimport '../math';\nimport '../strategy';\nexport const a = 1;",
  ],
  [
    'jobs may use MessageChannel and setTimeout',
    'src/sim/jobs/__tmp.ts',
    'export const a = [MessageChannel, setTimeout];',
  ],
  ['ui imports the jobs client', 'src/sim/ui/__tmp.ts', "import '../jobs/client';"],
  [
    'ui imports the jobs index and protocol',
    'src/sim/ui/__tmp.ts',
    "import '../jobs/index';\nimport '../jobs/protocol';",
  ],
  [
    'ui imports scene and engine',
    'src/sim/ui/__tmp.ts',
    "import '../scene/types';\nimport '../engine';",
  ],
  [
    'ui uses preact and the DOM',
    'src/sim/ui/__tmp.ts',
    "import 'preact';\nexport const a = document.title;",
  ],
  ['app imports the sim', 'src/app/__tmp.ts', "import '../sim';\nexport const a = 1;"],
  [
    'content imports the sim sub-barrels',
    'src/content/__tmp.ts',
    "import '../sim/engine';\nimport '../sim/scene';\nexport const a = 1;",
  ],
];

describe('layering lint', () => {
  it.each(bad)('rejects: %s', async (_name, path, code) => {
    expect((await violations(path, code)).length).toBeGreaterThan(0);
  });
  it.each(good)('allows: %s', async (_name, path, code) => {
    expect(await violations(path, code)).toEqual([]);
  });
});
