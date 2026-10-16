// Data fetching with a small stale-while-revalidate cache, so going back to a
// page shows it instantly while fresh data loads.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client.ts';

const cache = new Map<string, unknown>();
const listeners = new Set<(prefix: string) => void>();

/** Ask every mounted query whose path starts with `prefix` to reload. */
export function invalidate(...prefixes: string[]): void {
  for (const prefix of prefixes) for (const l of listeners) l(prefix);
}

export function peek<T>(path: string): T | undefined {
  return cache.get(path) as T | undefined;
}

export interface Query<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (update: (current: T | undefined) => T | undefined) => void;
}

export function useApi<T>(path: string | null, opts: { poll?: number } = {}): Query<T> {
  const [data, setDataState] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    setLoading(true);
    try {
      const result = await api.get<T>(p);
      if (pathRef.current !== p) return;
      cache.set(p, result);
      setDataState(result);
      setError(null);
    } catch (e) {
      if (pathRef.current !== p) return;
      setError(e instanceof ApiError ? e : new ApiError(0, 'error', String(e), null));
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDataState(path ? (cache.get(path) as T | undefined) : undefined);
    setError(null);
    if (path) void reload();
    else setLoading(false);
  }, [path, reload]);

  useEffect(() => {
    const listener = (prefix: string) => {
      if (pathRef.current && pathRef.current.startsWith(prefix)) void reload();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [reload]);

  useEffect(() => {
    if (!opts.poll || !path) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, opts.poll);
    return () => clearInterval(id);
  }, [opts.poll, path, reload]);

  const setData = useCallback((update: (current: T | undefined) => T | undefined) => {
    setDataState((current) => {
      const next = update(current);
      if (pathRef.current) cache.set(pathRef.current, next);
      return next;
    });
  }, []);

  return { data, error, loading: loading && data === undefined, reload, setData };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const handler = () => setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
