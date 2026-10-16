// A tiny, framework-agnostic router. The Node HTTP server and the browser
// demo both turn requests into an `ApiRequest` and call `handle`, so exactly
// the same routes, validation and services run in both places.

import type { App } from '../services/app.ts';
import type { UserRow } from '../store/types.ts';
import { HttpError, forbidden, notFound, unauthorized } from '../services/errors.ts';
import { resolveSession } from '../services/auth.ts';

export interface ApiRequest {
  method: string;
  /** Path including the /api prefix, without the query string. */
  path: string;
  query: URLSearchParams;
  body: unknown;
  /** Raw bytes for uploads. */
  raw?: Uint8Array;
  token: string | null;
  userAgent: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** undefined: unchanged; string: new session token; null: log out. */
  session?: string | null;
}

export type Access = 'public' | 'user' | 'admin';

export interface RouteContext {
  app: App;
  req: ApiRequest;
  params: Record<string, string>;
  /** The logged-in user (always set for 'user' and 'admin' routes). */
  me: UserRow;
  /** The logged-in user or null (for 'public' routes). */
  viewer: UserRow | null;
  body: Record<string, unknown>;
  query: URLSearchParams;
  setSession(token: string | null): void;
}

type Handler = (c: RouteContext) => Promise<unknown>;

interface Route {
  method: string;
  parts: string[];
  access: Access;
  handler: Handler;
}

export class Router {
  #routes: Route[] = [];

  add(method: string, pattern: string, access: Access, handler: Handler): this {
    this.#routes.push({ method, parts: pattern.split('/').filter(Boolean), access, handler });
    return this;
  }
  get(pattern: string, access: Access, handler: Handler) {
    return this.add('GET', pattern, access, handler);
  }
  post(pattern: string, access: Access, handler: Handler) {
    return this.add('POST', pattern, access, handler);
  }
  patch(pattern: string, access: Access, handler: Handler) {
    return this.add('PATCH', pattern, access, handler);
  }
  put(pattern: string, access: Access, handler: Handler) {
    return this.add('PUT', pattern, access, handler);
  }
  delete(pattern: string, access: Access, handler: Handler) {
    return this.add('DELETE', pattern, access, handler);
  }

  #match(method: string, path: string): { route: Route; params: Record<string, string> } | 'method' | null {
    const parts = path.split('/').filter(Boolean);
    let methodMismatch = false;
    for (const route of this.#routes) {
      if (route.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const want = route.parts[i];
        if (want.startsWith(':')) {
          try {
            params[want.slice(1)] = decodeURIComponent(parts[i]);
          } catch {
            ok = false;
            break;
          }
        } else if (want !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      return { route, params };
    }
    return methodMismatch ? 'method' : null;
  }

  async handle(app: App, req: ApiRequest): Promise<ApiResponse> {
    let session: string | null | undefined;
    try {
      const match = this.#match(req.method, req.path);
      if (match === null) throw notFound('No such endpoint.');
      if (match === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
      const viewer = await resolveSession(app, req.token);
      if (match.route.access !== 'public' && !viewer) throw unauthorized();
      if (match.route.access === 'admin' && viewer?.role !== 'admin') throw forbidden('Moderators only.');
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
      const result = await match.route.handler({
        app,
        req,
        params: match.params,
        me: viewer as UserRow,
        viewer,
        body,
        query: req.query,
        setSession(token) {
          session = token;
        },
      });
      return { status: 200, body: result === undefined ? { ok: true } : result, session };
    } catch (error) {
      if (error instanceof HttpError) {
        return { status: error.status, body: { error: { code: error.code, message: error.message, details: error.details ?? null } }, session };
      }
      app.log(`Unhandled error on ${req.method} ${req.path}`, error);
      return { status: 500, body: { error: { code: 'internal', message: 'Something went wrong on our side. Please try again.', details: null } }, session };
    }
  }
}
