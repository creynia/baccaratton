import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import content from 'virtual:content';
import { App } from '../../src/app/App';
import { AppProviders } from '../../src/app/context';
import { ROUTES } from '../../src/app/routes';
import { MemoryStorage, STORAGE_KEY } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { TABS } from '../../src/app/components/Shell';

const mount = (hash: string) => {
  location.hash = hash;
  const store = new Store(new MemoryStorage());
  return render(
    <AppProviders content={content} store={store}>
      <App />
    </AppProviders>,
  );
};

beforeEach(() => {
  window.scrollTo = () => undefined;
});
afterEach(cleanup);

describe('app shell', () => {
  it('has exactly the four tabs Learn · Play · Drill · More (D11), in both navs', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Learn', 'Play', 'Drill', 'More']);
    const { getByRole } = mount('#/');
    for (const name of ['Main', 'Tabs']) {
      const links = getByRole('navigation', { name }).querySelectorAll('a');
      expect([...links].map((a) => a.getAttribute('href'))).toEqual([
        '#/learn',
        '#/play',
        '#/drill',
        '#/more',
      ]);
    }
  });

  it.each([
    ['#/', null],
    ['#/learn', '/learn'],
    ['#/play', '/play'],
    ['#/drill', '/drill'],
    ['#/more', '/more'],
    ['#/rules', '/more'],
    ['#/bets', '/more'],
    ['#/bets/banker', '/more'],
    ['#/roads', '/more'],
    ['#/glossary', '/more'],
    ['#/settings', '/more'],
    ['#/sources', '/more'],
    ['#/about', '/more'],
  ])('%s renders one h1 in main and marks the right tab', (hash, tab) => {
    const { container } = mount(hash);
    expect(container.querySelectorAll('main h1')).toHaveLength(1);
    const current = [...container.querySelectorAll('.tabbar a[aria-current="page"]')].map((a) =>
      a.getAttribute('href')?.slice(1),
    );
    expect(current).toEqual(tab ? [tab] : []);
  });

  it('every route in the table renders (no throw), including a lesson from the content bundle', () => {
    const lesson = content.lessons[0]!;
    for (const r of ROUTES) {
      const hash = '#' + r.pattern.replace(':lessonId', lesson.id).replace(':betId', 'banker');
      const { container } = mount(hash);
      expect(container.querySelector('main h1')).not.toBeNull();
      cleanup();
    }
  });

  it('lists the chapters and lessons of the content bundle on Learn', () => {
    const { container } = mount('#/learn');
    for (const l of content.lessons)
      expect(container.querySelector(`a[href="#/learn/${l.id}"]`)).not.toBeNull();
  });

  it('shows a not-found page with a way home', () => {
    const { container } = mount('#/nope');
    expect(container.querySelector('main h1')).not.toBeNull();
    expect(container.querySelector('main a[href="#/"]')).not.toBeNull();
    const lesson = mount('#/learn/does-not-exist');
    expect(lesson.container.querySelectorAll('main h1')).toHaveLength(1);
  });

  it('shows the in-memory banner when storage is blocked', () => {
    location.hash = '#/';
    const newer = new MemoryStorage();
    newer.setItem(STORAGE_KEY, '{"version":9}'); // read-only: progress can't be saved
    const store = new Store(newer);
    const { getByRole } = render(
      <AppProviders content={content} store={store}>
        <App />
      </AppProviders>,
    );
    expect(getByRole('status')).toBeTruthy();
  });

  it('applies the theme settings to the document', () => {
    mount('#/');
    expect(document.documentElement.getAttribute('data-motion')).toMatch(/^(reduce|full)$/);
    expect(document.documentElement.getAttribute('data-fourcolor')).toBe('false');
  });
});
