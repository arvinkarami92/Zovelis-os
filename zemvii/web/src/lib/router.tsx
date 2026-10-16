// A small hash router (#/path?query). Hash routing works the same on the
// Zemvii server, a static host and inside the demo's frame. If the frame
// refuses hash changes, navigation continues in memory.

import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export interface Route {
  path: string;
  query: URLSearchParams;
  key: string;
}

let memory: string | null = null;
const listeners = new Set<() => void>();
const history: string[] = [];
const scrolls = new Map<string, number>();

function readHash(): string {
  if (memory !== null) return memory;
  try {
    const hash = location.hash.replace(/^#/, '');
    return hash.startsWith('/') ? hash : '/';
  } catch {
    return '/';
  }
}

let current = parse(readHash());

function parse(raw: string): Route {
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(query), key: raw };
}

function emit() {
  const next = parse(readHash());
  if (next.key === current.key) return;
  scrolls.set(current.key, window.scrollY);
  current = next;
  for (const l of listeners) l();
}

try {
  addEventListener('hashchange', () => {
    memory = null;
    emit();
  });
} catch {
  // no window events (tests)
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (to === current.key) return;
  if (!opts.replace) history.push(current.key);
  try {
    if (opts.replace) location.replace(`#${to}`);
    else location.hash = to;
    memory = null;
  } catch {
    memory = to;
  }
  emit();
}

export function back(fallback = '/home'): void {
  const previous = history.pop();
  navigate(previous ?? fallback, { replace: true });
}

export function savedScroll(key: string): number | undefined {
  return scrolls.get(key);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Match "/u/:handle" against "/u/maya" → { handle: 'maya' }. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
