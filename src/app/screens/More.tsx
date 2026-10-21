import { Link } from '../components/Link';

const ITEMS = [
  { to: '/rules', label: 'Drawing rules' },
  { to: '/bets', label: 'Bets & paytables' },
  { to: '/roads', label: 'Roads' },
  { to: '/glossary', label: 'Glossary' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
] as const;

export function More() {
  return (
    <div class="page">
      <h1>More</h1>
      <ul class="lesson-list">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to} class="lesson-row">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
