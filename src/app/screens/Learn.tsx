import { Link } from '../components/Link';
import { useContent } from '../context';

export function Learn() {
  const content = useContent();
  return (
    <div class="page">
      <h1>Learn</h1>
      <p>
        <Link to="/rules" class="card">
          Drawing rules
        </Link>
      </p>
      {content.chapters.map((ch) => (
        <section class="chapter" key={ch.id} aria-labelledby={`ch-${ch.id}`}>
          <header>
            <h2 id={`ch-${ch.id}`}>{ch.title}</h2>
            <p class="muted">{ch.summary}</p>
          </header>
          <ul class="lesson-list">
            {ch.lessons.map((id) => {
              const l = content.lessons.find((x) => x.id === id);
              return l ? (
                <li key={id}>
                  <Link to={`/learn/${id}`} class="lesson-row">
                    {l.title}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
