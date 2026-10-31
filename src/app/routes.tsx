import type { VNode } from 'preact';
import { matchPath } from './router';
import type { ParsedHash } from './router';
import { About } from './screens/About';
import { BetDetail, BetsList } from './screens/Bets';
import { Drill } from './screens/Drill';
import { Glossary } from './screens/Glossary';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { LessonView } from './screens/Lesson';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { Play } from './screens/Play';
import { Roads } from './screens/Roads';
import { Rules } from './screens/Rules';
import { Settings } from './screens/Settings';
import { Sources } from './screens/Sources';

type Render = (p: Record<string, string>, r: ParsedHash) => VNode;

/** architecture.md section 2.1. */
export const ROUTES: { pattern: string; render: Render }[] = [
  { pattern: '/', render: () => <Home /> },
  { pattern: '/learn', render: () => <Learn /> },
  { pattern: '/learn/:lessonId', render: (p) => <LessonView id={p.lessonId!} /> },
  { pattern: '/play', render: (_p, r) => <Play query={r.query} /> },
  { pattern: '/drill', render: (_p, r) => <Drill query={r.query} /> },
  { pattern: '/rules', render: (_p, r) => <Rules query={r.query} /> },
  { pattern: '/bets', render: (_p, r) => <BetsList query={r.query} /> },
  { pattern: '/bets/:betId', render: (p, r) => <BetDetail id={p.betId!} query={r.query} /> },
  { pattern: '/roads', render: () => <Roads /> },
  { pattern: '/glossary', render: (_p, r) => <Glossary query={r.query} /> },
  { pattern: '/settings', render: () => <Settings /> },
  { pattern: '/sources', render: () => <Sources /> },
  { pattern: '/about', render: () => <About /> },
  { pattern: '/more', render: () => <More /> },
];

export function renderRoute(route: ParsedHash): VNode {
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, route.path);
    if (params) return r.render(params, route);
  }
  return <NotFound />;
}
