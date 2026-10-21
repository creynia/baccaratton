import { Link } from '../components/Link';

export function NotFound() {
  return (
    <div class="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/" class="btn">
          Go home
        </Link>
      </p>
    </div>
  );
}
