// How the web app reaches the API. The server build uses HTTP; the demo build
// runs the real API router in the browser (see demo.ts).

export interface TransportResponse {
  status: number;
  body: any;
}

export interface Transport {
  mode: 'server' | 'demo';
  /** `path` starts with /api. */
  request(method: string, path: string, body?: unknown): Promise<TransportResponse>;
  upload(blob: Blob): Promise<TransportResponse>;
  /** Demo only: wipe the local demo world and start again. */
  reset?(): Promise<void>;
}

async function toResponse(res: Response): Promise<TransportResponse> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { error: { code: 'bad_response', message: `The server answered ${res.status}.`, details: null } };
  }
  return { status: res.status, body };
}

const offline = (): TransportResponse => ({
  status: 0,
  body: { error: { code: 'offline', message: "Can't reach Zemvii. Check your connection and try again.", details: null } },
});

export function httpTransport(): Transport {
  return {
    mode: 'server',
    async request(method, path, body) {
      try {
        const res = await fetch(path, {
          method,
          credentials: 'same-origin',
          headers: { 'X-Zemvii': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return toResponse(res);
      } catch {
        return offline();
      }
    },
    async upload(blob) {
      try {
        const res = await fetch('/api/media', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-Zemvii': '1', 'Content-Type': blob.type || 'application/octet-stream' },
          body: blob,
        });
        return toResponse(res);
      } catch {
        return offline();
      }
    },
  };
}
