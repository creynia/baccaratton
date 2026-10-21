import { Link } from '../components/Link';

export function NotFound(props: { what?: string }) {
  return (
    <div class="page">
      <h1>{props.what ? `${props.what} was not found` : 'Page not found'}</h1>
      <p>
        <Link to="/" class="btn">
          Go home
        </Link>
      </p>
    </div>
  );
}
