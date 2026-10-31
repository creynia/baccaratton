import { Link } from '../components/Link';
import { OfflineLink } from '../components/OfflineLink';

const ITEMS = [
  { to: '/rules', label: 'Drawing rules', note: 'When each hand draws a third card' },
  { to: '/bets', label: 'Bets & paytables', note: 'Payouts and house edge per variant' },
  { to: '/roads', label: 'Roads', note: 'How to read the scoreboard' },
  { to: '/glossary', label: 'Glossary', note: 'Every baccarat word' },
  { to: '/sources', label: 'Sources', note: 'Where the rules, figures and strategies come from' },
  { to: '/settings', label: 'Settings', note: 'Table variant, bet unit, progress' },
  { to: '/about', label: 'About', note: 'Version, updates and help' },
] as const;

export function More() {
  return (
    <div class="page">
      <h1>More</h1>
      <ul class="lesson-list">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to} class="lesson-row">
              <span class="lesson-main">
                <strong>{i.label}</strong>
                <span class="muted">{i.note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <OfflineLink />
      </p>
    </div>
  );
}
