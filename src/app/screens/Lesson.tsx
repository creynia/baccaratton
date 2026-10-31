import { useEffect, useState } from 'preact/hooks';
import { Html } from '../components/Html';
import { LessonScene } from '../components/LessonScene';
import { Link } from '../components/Link';
import { Quiz } from '../components/Quiz';
import { RoadsBlock } from '../components/RoadsBlock';
import { TableauBlock } from '../components/TableauBlock';
import { useContent, useStore } from '../context';
import { FINAL_EXAM_ID, finalExamScore } from '../store';
import { NotFound } from './NotFound';

/** `[^n]` buttons scroll to the matching item of the Sources list (hash routing rules out #fragments). */
function jumpToSource(e: MouseEvent) {
  const btn = (e.target as Element | null)?.closest?.('[data-cite]');
  if (!btn) return;
  const li = document.querySelector(`[data-source-n="${btn.getAttribute('data-cite')}"]`);
  if (li instanceof HTMLElement) {
    li.scrollIntoView?.({ block: 'center' });
    li.classList.add('flash');
    setTimeout(() => li.classList.remove('flash'), 1500);
  }
}

export function LessonView({ id }: { id: string }) {
  const content = useContent();
  const store = useStore();
  const idx = content.lessons.findIndex((l) => l.id === id);
  const lesson = content.lessons[idx];
  const [retakes, setRetakes] = useState(0);
  useEffect(() => {
    if (lesson) store.start(lesson.id);
  }, [lesson?.id]);
  if (!lesson) return <NotFound what="That lesson" />;
  const prev = content.lessons[idx - 1];
  const next = content.lessons[idx + 1];
  const done = store.status(lesson.id) === 'done';
  const progress = store.lesson(lesson.id);
  const chapter = content.chapters.find((c) => c.id === lesson.chapterId);
  const quizzes = lesson.blocks.filter((b) => b.kind === 'quiz').length;
  const right = lesson.blocks.filter(
    (b) => b.kind === 'quiz' && progress?.quizzes[b.quiz.id]?.correct,
  ).length;
  return (
    <article class="page lesson" data-lesson={lesson.id} onClick={jumpToSource}>
      <Link to="/learn" class="back">
        {'←'} All lessons
      </Link>
      <h1>{lesson.title}</h1>
      <p class="muted">
        {chapter ? `${chapter.title} · ` : ''}
        {lesson.minutes} min
        {quizzes > 0 && (
          <span data-testid="quiz-progress">
            {' '}
            · {right}/{quizzes} quiz questions right
          </span>
        )}
      </p>
      {lesson.blocks.map((b, i) => {
        switch (b.kind) {
          case 'html':
            return <Html key={i} html={b.html} />;
          case 'tip':
            return (
              <aside key={i} class="tip">
                <strong class="tip-tag">Tip</strong>
                <Html html={b.html} />
              </aside>
            );
          case 'math':
            return (
              <details key={i} class="math">
                <summary>Show the math: {b.title}</summary>
                <Html html={b.html} />
              </details>
            );
          case 'scene':
            return (
              <LessonScene
                key={`${lesson.id}:${b.scene.id}`}
                lessonId={lesson.id}
                scene={b.scene}
              />
            );
          case 'tableau':
            return <TableauBlock key={i} tableau={b.tableau} />;
          case 'roads':
            return <RoadsBlock key={i} roads={b.roads} />;
          case 'quiz':
            return (
              <Quiz
                key={`${lesson.id}:${b.quiz.id}:${retakes}`}
                quiz={b.quiz}
                answeredBefore={progress?.quizzes[b.quiz.id]?.correct === true}
                onAnswer={(ok) => store.markQuiz(lesson.id, b.quiz.id, ok)}
              />
            );
        }
      })}
      {lesson.sources && (
        <section class="lesson-sources" aria-label="Sources">
          <h2>Sources</h2>
          <ol>
            {lesson.sources.map((src, i) => (
              <li key={i} data-source-n={i + 1}>
                {src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.title}
                  </a>
                ) : (
                  src.title
                )}
                {src.author && `, ${src.author}`}
                {src.note && <span class="source-note"> {src.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {lesson.id === FINAL_EXAM_ID && (
        <section class="card exam-score" aria-label="Exam score">
          <p>
            First-try score:{' '}
            <strong>{Math.round((finalExamScore(content, store) ?? 0) * 100)}%</strong>. Only your
            first answer to each question counts.
          </p>
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => {
              store.resetLesson(lesson.id);
              setRetakes((n) => n + 1);
            }}
          >
            Retake exam
          </button>
        </section>
      )}
      <footer class="lesson-foot">
        <button
          type="button"
          class={done ? 'btn btn-ghost' : 'btn'}
          aria-pressed={done}
          onClick={() => store.completeLesson(lesson.id, !done)}
        >
          {done ? '✓ Completed (tap to undo)' : 'Mark complete'}
        </button>
        <div class="prevnext">
          {prev ? (
            <Link to={`/learn/${prev.id}`}>
              {'←'} {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/learn/${next.id}`}>
              {next.title} {'→'}
            </Link>
          ) : (
            <span />
          )}
        </div>
      </footer>
    </article>
  );
}
