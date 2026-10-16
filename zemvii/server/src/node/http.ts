// The Node HTTP binding: turns HTTP requests into ApiRequests, and serves
// uploaded media and the built web app.
//
// Security measures:
//   * Session cookie: HttpOnly, SameSite=Lax, Secure behind HTTPS.
//   * CSRF: state-changing API calls must carry the `X-Zemvii: 1` header
//     (a cross-site form or image cannot set it) and, when present, an Origin
//     matching the host.
//   * Strict Content-Security-Policy and other security headers.
//   * Per-IP rate limits, body size limits, path-traversal-safe static files.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Api } from '../api/routes.ts';
import { MAX_VIDEO_BYTES } from '../services/media.ts';

export const SESSION_COOKIE = 'zv_session';
const JSON_LIMIT = 1024 * 1024;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// ---- Rate limiting -------------------------------------------------------------

interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  #buckets = new Map<string, Bucket>();
  #perMinute: number;
  constructor(perMinute: number) {
    this.#perMinute = perMinute;
  }
  allow(key: string, now = Date.now()): boolean {
    if (this.#buckets.size > 50_000) this.#buckets.clear();
    const bucket = this.#buckets.get(key) ?? { tokens: this.#perMinute, updated: now };
    bucket.tokens = Math.min(this.#perMinute, bucket.tokens + ((now - bucket.updated) / 60_000) * this.#perMinute);
    bucket.updated = now;
    if (bucket.tokens < 1) {
      this.#buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.#buckets.set(key, bucket);
    return true;
  }
}

// ---- Helpers -------------------------------------------------------------------

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // ignore malformed cookies
    }
  }
  return out;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isHttps(req: IncomingMessage, trustProxy: boolean): boolean {
  return Boolean((req.socket as { encrypted?: boolean }).encrypted) || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
}

async function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw Object.assign(new Error('too large'), { status: 413 });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

const errorBody = (code: string, message: string) => ({ error: { code, message, details: null } });

/** Serve a file with Range support (Safari needs it for video). */
function serveFile(req: IncomingMessage, res: ServerResponse, path: string, cache: string, extra: Record<string, string> = {}) {
  const stat = statSync(path);
  const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes', ...extra };
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(stat.size) });
  if (req.method === 'HEAD') res.end();
  else createReadStream(path).pipe(res);
}

/** Resolve `relative` inside `root`, refusing anything that escapes it. */
export function safeJoin(root: string, relative: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = resolve(root, '.' + sep + normalize(decoded).replace(/^([/\\])+/, ''));
  const base = resolve(root);
  return full === base || full.startsWith(base + sep) ? full : null;
}

// ---- Server --------------------------------------------------------------------

export interface HttpOptions {
  api: Api;
  mediaDir: string;
  webDir: string | null;
  trustProxy?: boolean;
  secureCookies?: boolean;
  log?: (line: string) => void;
}

export function createHttpServer(options: HttpOptions): Server {
  const authLimiter = new RateLimiter(10);
  const writeLimiter = new RateLimiter(120);
  const readLimiter = new RateLimiter(600);
  const trustProxy = options.trustProxy ?? false;

  return createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = (req.method ?? 'GET').toUpperCase();
    const ip = clientIp(req, trustProxy);
    try {
      if (url.pathname === '/healthz') {
        send(res, 200, { ok: true });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const isWrite = method !== 'GET' && method !== 'HEAD';
        const isAuth = /^\/api\/(auth\/(login|signup)|recovery\/(start|complete|status))$/.test(url.pathname);
        const limiter = isAuth ? authLimiter : isWrite ? writeLimiter : readLimiter;
        if (!limiter.allow(`${isAuth ? 'a' : isWrite ? 'w' : 'r'}:${ip}`)) {
          send(res, 429, errorBody('rate_limited', 'Too many requests. Try again in a minute.'), { 'Retry-After': '60' });
          return;
        }
        if (isWrite) {
          if (req.headers['x-zemvii'] !== '1') {
            send(res, 403, errorBody('csrf', 'Missing request header.'));
            return;
          }
          const origin = req.headers.origin;
          let originHost: string | null = null;
          if (origin) {
            try {
              originHost = new URL(origin).host;
            } catch {
              originHost = 'invalid';
            }
          }
          if (originHost !== null && originHost !== req.headers.host) {
            send(res, 403, errorBody('csrf', 'Cross-site request refused.'));
            return;
          }
        }
        const isUpload = url.pathname === '/api/media' && method === 'POST';
        const raw = isWrite ? await readBody(req, isUpload ? MAX_VIDEO_BYTES : JSON_LIMIT) : undefined;
        let body: unknown;
        if (raw && !isUpload && raw.length) {
          if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
            send(res, 415, errorBody('unsupported_media_type', 'Send JSON.'));
            return;
          }
          try {
            body = JSON.parse(new TextDecoder().decode(raw));
          } catch {
            send(res, 400, errorBody('bad_json', 'The request body is not valid JSON.'));
            return;
          }
        }
        const cookies = parseCookies(req.headers.cookie);
        const result = await options.api({
          method,
          path: url.pathname,
          query: url.searchParams,
          body,
          raw: isUpload ? raw : undefined,
          token: cookies[SESSION_COOKIE] ?? null,
          userAgent: String(req.headers['user-agent'] ?? ''),
        });
        const headers: Record<string, string | string[]> = {};
        if (result.session !== undefined) {
          const secure = options.secureCookies ?? isHttps(req, trustProxy);
          const attributes = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
          headers['Set-Cookie'] =
            result.session === null
              ? `${SESSION_COOKIE}=; ${attributes}; Max-Age=0`
              : `${SESSION_COOKIE}=${encodeURIComponent(result.session)}; ${attributes}; Max-Age=${30 * 86_400}`;
        }
        if (url.pathname === '/api/me/export' && result.status === 200) headers['Content-Disposition'] = 'attachment; filename="zemvii-export.json"';
        send(res, result.status, result.body, headers);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        send(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }

      if (url.pathname.startsWith('/media/')) {
        const file = safeJoin(options.mediaDir, url.pathname.slice('/media/'.length));
        if (!file || !/^[A-Za-z0-9]+\.(jpg|png|webp|gif|mp4|webm)$/.test(url.pathname.slice('/media/'.length)) || !existsSync(file)) {
          send(res, 404, errorBody('not_found', 'Not found.'));
          return;
        }
        serveFile(req, res, file, 'public, max-age=31536000, immutable', { 'Content-Disposition': 'inline' });
        return;
      }

      if (options.webDir) {
        const candidate = url.pathname === '/' ? null : safeJoin(options.webDir, url.pathname);
        if (candidate && existsSync(candidate) && statSync(candidate).isFile()) {
          const immutable = url.pathname.startsWith('/assets/');
          serveFile(req, res, candidate, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
          return;
        }
        const index = join(options.webDir, 'index.html');
        if (existsSync(index)) {
          serveFile(req, res, index, 'no-cache');
          return;
        }
      }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Zemvii API is running. Build the web app (npm run build) to serve it from here.');
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 413) send(res, 413, errorBody('too_large', 'That request is too large.'));
      else {
        options.log?.(`error ${method} ${url.pathname}: ${String(error)}`);
        if (!res.headersSent) send(res, 500, errorBody('internal', 'Something went wrong.'));
        else res.end();
      }
    } finally {
      if (url.pathname.startsWith('/api/')) options.log?.(`${method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
}
