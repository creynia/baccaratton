import { Link } from '../components/Link';
import { useContent } from '../context';

export function Sources() {
  const { sources } = useContent();
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Sources</h1>
      <p>
        Every figure in this app is computed by the app itself, in exact arithmetic or exhaustive
        enumeration, and cross-checked against the published references below. The rules and
        strategies are the standard ones; these are the places they're documented.
      </p>
      {sources.map((g) => (
        <section key={g.group} class="source-group" aria-label={g.group}>
          <h2>{g.group}</h2>
          <ul class="source-list">
            {g.items.map((it) => (
              <li key={it.id} data-source={it.id}>
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer">
                    {it.title}
                  </a>
                ) : (
                  <strong>{it.title}</strong>
                )}
                {it.author && <span class="muted"> · {it.author}</span>}
                {it.note && <div class="muted source-note">{it.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
