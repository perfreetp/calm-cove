import { createSignal } from 'solid-js';

export interface Route {
  name:
    | 'projects'
    | 'project'
    | 'editor'
    | 'review'
    | 'review-shot'
    | 'library'
    | 'learner'
    | 'learner-shot'
    | 'deliveries'
    | 'activity';
  params: Record<string, string>;
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'projects', params: {} };
  switch (parts[0]) {
    case 'projects':
      if (parts[1]) return { name: 'project', params: { id: parts[1] } };
      return { name: 'projects', params: {} };
    case 'editor':
      return { name: 'editor', params: { shotId: parts[1] ?? '' } };
    case 'review':
      return parts[1] ? { name: 'review-shot', params: { shotId: parts[1] } } : { name: 'review', params: {} };
    case 'library':
      return { name: 'library', params: {} };
    case 'learner':
      return parts[1] ? { name: 'learner-shot', params: { shotId: parts[1] } } : { name: 'learner', params: {} };
    case 'deliveries':
      return { name: 'deliveries', params: {} };
    case 'activity':
      return { name: 'activity', params: {} };
    default:
      return { name: 'projects', params: {} };
  }
}

const [route, setRoute] = createSignal<Route>(parse(window.location.hash));

window.addEventListener('hashchange', () => {
  setRoute(parse(window.location.hash));
});

export { route };

export function navigate(path: string): void {
  if (window.location.hash === `#${path}`) return;
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}

export const routes = {
  projects: () => '/projects',
  project: (id: string) => `/projects/${id}`,
  editor: (shotId: string) => `/editor/${shotId}`,
  review: () => '/review',
  reviewShot: (shotId: string) => `/review/${shotId}`,
  library: () => '/library',
  learner: () => '/learner',
  learnerShot: (shotId: string) => `/learner/${shotId}`,
  deliveries: () => '/deliveries',
  activity: () => '/activity',
};
