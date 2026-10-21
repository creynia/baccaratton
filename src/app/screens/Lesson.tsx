import { useContent } from '../context';
import { NotFound } from './NotFound';

/** Placeholder lesson view: the title and the block kinds. The app WP renders the blocks. */
export function LessonView(props: { id: string }) {
  const lesson = useContent().lessons.find((l) => l.id === props.id);
  if (!lesson) return <NotFound />;
  return (
    <article class="page">
      <h1>{lesson.title}</h1>
      <p class="muted">{lesson.summary}</p>
      <ul class="blocks" aria-label="Lesson blocks">
        {lesson.blocks.map((b, i) => (
          <li key={i} data-kind={b.kind}>
            {b.kind}
          </li>
        ))}
      </ul>
    </article>
  );
}
