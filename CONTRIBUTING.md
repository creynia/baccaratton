# Contributing to baccaratton

Thanks for helping people learn Baccarat. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Setup

Prerequisite: Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

## Scripts

| Script                 | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Vite dev server                                             |
| `npm run build`        | Typecheck and build the PWA into `dist/`                    |
| `npm run build:single` | Build the self-contained `dist-single/baccaratton.html`     |
| `npm run build:all`    | Both of the above; copies `baccaratton.html` into `dist/`   |
| `npm run preview`      | Serve `dist/`                                               |
| `npm test`             | Unit tests (Vitest)                                         |
| `npm run test:e2e`     | Playwright end-to-end tests                                 |
| `npm run lint`         | ESLint                                                      |
| `npm run typecheck`    | TypeScript                                                  |
| `npm run format`       | Prettier (write)                                            |
| `npm run check`        | lint + typecheck + format check + unit tests (what CI runs) |

## How the code is organised

The architecture map is in [`docs/design/architecture.md`](docs/design/architecture.md); the rules of the simulator are in `docs/design/simulator.md`; `docs/design/decisions.md` wins where they disagree. Frozen contract files (`src/sim/*/types.ts`, `src/sim/jobs/protocol.ts`) change only through the maintainer.

**The engine stays pure.** Engine, math, strategy, scene and jobs code under `src/sim/` must not import Preact or any UI/app code, and must not touch the DOM or browser storage. The layering (engine, math, strategy, scene, jobs, ui, content, app, pwa) is enforced by ESLint and by `tests/build/layering.test.ts`, and keeps the maths testable. Every EV number must be checkable against exact fractions.

## Writing a lesson

Lessons are Markdown files under `content/lessons/`. The format is in [`docs/authoring.md`](docs/authoring.md) (design: `docs/design/architecture.md` §3).

## End-to-end tests locally

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npx playwright install chromium          # or: export PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers
npm run test:e2e
```

## Ideas to pick up

Deferred, self-contained ideas are collected in [`docs/chips.md`](docs/chips.md). Open an issue or PR and link it there when you start one.

## Pull requests

- Use conventional-ish commit messages: `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `chore: ...`.
- Every PR must pass `npm run check`. CI also runs the build and e2e tests.
- Keep PRs focused, and fill in the PR template.

## CI notes

- A GitHub Pages deploy can time out in "updating_pages", and the next one then fails with "deployment in progress". This is a GitHub-side flake: re-run the failed job from the Actions tab.
- The offline file must stay under 600 kB (target 450 kB); `npm run build:single` fails above that and on any external reference.
