// Typed access to the Zemvii API, whichever transport is in use.

import type { Transport } from './transport.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  details: any;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let transport: Transport | null = null;
const unauthorizedListeners = new Set<() => void>();

export function setTransport(t: Transport): void {
  transport = t;
}

export function getTransport(): Transport {
  if (!transport) throw new Error('Transport not ready');
  return transport;
}

export const isDemo = () => transport?.mode === 'demo';

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await getTransport().request(method, `/api${path}`, body);
  if (res.status >= 200 && res.status < 300) return res.body as T;
  const error = res.body?.error ?? {};
  if (res.status === 401 && !path.startsWith('/auth/')) for (const l of unauthorizedListeners) l();
  throw new ApiError(res.status, error.code ?? 'error', error.message ?? 'Something went wrong.', error.details ?? null);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = { ok: true }>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = { ok: true }>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T = { ok: true }>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = { ok: true }>(path: string) => request<T>('DELETE', path),
  async upload(blob: Blob): Promise<{ id: string; url: string; mime: string; size: number }> {
    const res = await getTransport().upload(blob);
    if (res.status >= 200 && res.status < 300) return res.body;
    const error = res.body?.error ?? {};
    throw new ApiError(res.status, error.code ?? 'error', error.message ?? 'Upload failed.', error.details ?? null);
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
