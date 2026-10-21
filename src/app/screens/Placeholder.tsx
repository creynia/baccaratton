import type { ComponentChildren } from 'preact';

/** A screen that is not built yet: one h1 and a short note. The app WP replaces each use. */
export function Placeholder(props: { title: string; children?: ComponentChildren }) {
  return (
    <div class="page">
      <h1>{props.title}</h1>
      <div class="card">{props.children ?? <p class="muted">Coming soon.</p>}</div>
    </div>
  );
}
