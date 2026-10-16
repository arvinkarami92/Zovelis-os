// The application container: storage, media storage, clock and options.
// Created once by the Node server, once per test, and once in the browser
// for the demo.

import type { Store } from '../store/store.ts';
import type { MessageRow, PostRow, UserRow } from '../store/types.ts';

export interface MediaStorage {
  /** Persist bytes and return the URL clients use to fetch them. */
  save(bytes: Uint8Array, mime: string, id: string): Promise<string>;
}

export interface AppOptions {
  store: Store;
  media: MediaStorage;
  now?: () => number;
  /** PBKDF2 iterations for new password hashes. */
  passwordIterations?: number;
  minAge?: number;
  /**
   * Demo/dev only: "Verify you're human" succeeds without a provider, and
   * the wallet can be topped up with test credits. Never enable in production.
   */
  simulated?: boolean;
  /** Called after a message is stored (the demo uses it for persona replies). */
  onMessage?: (app: App, message: MessageRow) => void;
  /** Called after an account is created (the demo uses it to welcome people into the demo world). */
  onSignup?: (app: App, user: UserRow) => Promise<void>;
  /** Called after a post is created (the demo's personas react to your posts). */
  onPost?: (app: App, post: PostRow) => void;
  log?: (message: string, error?: unknown) => void;
}

export interface App {
  store: Store;
  media: MediaStorage;
  now(): number;
  passwordIterations: number;
  minAge: number;
  simulated: boolean;
  onMessage: (app: App, message: MessageRow) => void;
  onSignup: (app: App, user: UserRow) => Promise<void>;
  onPost: (app: App, post: PostRow) => void;
  log: (message: string, error?: unknown) => void;
  /** Small per-process cache (ranked Mix feeds, so paging is stable). */
  cache: Map<string, { at: number; value: unknown }>;
}

export function createApp(options: AppOptions): App {
  return {
    store: options.store,
    media: options.media,
    now: options.now ?? (() => Date.now()),
    passwordIterations: options.passwordIterations ?? 600_000,
    minAge: options.minAge ?? 13,
    simulated: options.simulated ?? false,
    onMessage: options.onMessage ?? (() => {}),
    onSignup: options.onSignup ?? (async () => {}),
    onPost: options.onPost ?? (() => {}),
    log: options.log ?? ((message, error) => console.error(message, error ?? '')),
    cache: new Map(),
  };
}

export function cacheGet<T>(app: App, key: string, maxAgeMs: number): T | undefined {
  const entry = app.cache.get(key);
  if (!entry || app.now() - entry.at > maxAgeMs) return undefined;
  return entry.value as T;
}

export function cacheSet(app: App, key: string, value: unknown): void {
  if (app.cache.size > 2000) app.cache.clear();
  app.cache.set(key, { at: app.now(), value });
}

export function cacheDelete(app: App, prefix: string): void {
  for (const key of app.cache.keys()) if (key.startsWith(prefix)) app.cache.delete(key);
}

/** Settings or follows changed: drop cached rankings so the next load re-ranks. */
export function invalidateFeeds(app: App, userId: string): void {
  cacheDelete(app, `mix:${userId}`);
  cacheDelete(app, `clips:${userId}`);
  cacheDelete(app, `interests:${userId}`);
}
