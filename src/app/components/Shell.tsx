import type { ComponentChildren } from 'preact';
import { Link } from './Link';

/** U+FE0E asks for the text (not emoji) presentation, so Android does not draw coloured icons. */
const TEXT = '︎';

/** D11: Learn · Play · Drill · More. Bets, Roads, Rules, Glossary, Settings, About live under More. */
export const TABS = [
  { to: '/learn', label: 'Learn', icon: `♠${TEXT}`, match: (p: string) => p.startsWith('/learn') },
  { to: '/play', label: 'Play', icon: `♦${TEXT}`, match: (p: string) => p.startsWith('/play') },
  { to: '/drill', label: 'Drill', icon: `◎${TEXT}`, match: (p: string) => p.startsWith('/drill') },
  {
    to: '/more',
    label: 'More',
    icon: `≡${TEXT}`,
    match: (p: string) => /^\/(more|rules|bets|roads|glossary|settings|about)(\/|$)/.test(p),
  },
] as const;

export function Shell(props: {
  path: string;
  banner?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="shell">
      <header class="topbar">
        <Link to="/" class="brand">
          baccaratton
        </Link>
        <nav class="topnav" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} aria-current={t.match(props.path) ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {props.banner}
      <main id="main" tabIndex={-1}>
        {props.children}
      </main>
      <nav class="tabbar" aria-label="Tabs">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} aria-current={t.match(props.path) ? 'page' : undefined}>
            <span class="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
