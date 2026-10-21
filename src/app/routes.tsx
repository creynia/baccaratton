import type { VNode } from 'preact';
import { matchPath } from './router';
import type { ParsedHash } from './router';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { LessonView } from './screens/Lesson';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { Placeholder } from './screens/Placeholder';
import { Play } from './screens/Play';

type Render = (p: Record<string, string>, r: ParsedHash) => VNode;

/** architecture.md section 2.1. Screens that are not built yet render a placeholder. */
export const ROUTES: { pattern: string; render: Render }[] = [
  { pattern: '/', render: () => <Home /> },
  { pattern: '/learn', render: () => <Learn /> },
  { pattern: '/learn/:lessonId', render: (p) => <LessonView id={p.lessonId!} /> },
  { pattern: '/play', render: (_p, r) => <Play query={r.query} /> },
  { pattern: '/drill', render: () => <Placeholder title="Drill" /> },
  { pattern: '/rules', render: () => <Placeholder title="Drawing rules" /> },
  { pattern: '/bets', render: () => <Placeholder title="Bets & paytables" /> },
  { pattern: '/bets/:betId', render: () => <Placeholder title="Bet" /> },
  { pattern: '/roads', render: () => <Placeholder title="Roads" /> },
  { pattern: '/glossary', render: () => <Placeholder title="Glossary" /> },
  { pattern: '/settings', render: () => <Placeholder title="Settings" /> },
  { pattern: '/about', render: () => <Placeholder title="About" /> },
  { pattern: '/more', render: () => <More /> },
];

export function renderRoute(route: ParsedHash): VNode {
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, route.path);
    if (params) return r.render(params, route);
  }
  return <NotFound />;
}
