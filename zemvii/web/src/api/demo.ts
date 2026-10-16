// The in-browser demo: the real Zemvii API (routes, validation, services,
// ranking, tone check) running on an in-memory store, seeded with the
// fictional demo world. State is kept in this browser (IndexedDB) so the demo
// survives a reload; if storage is unavailable it simply starts fresh.

import { MemoryStore, type MemoryDump } from '../../../server/src/store/memory.ts';
import { createApp, type App } from '../../../server/src/services/app.ts';
import { createApi } from '../../../server/src/api/routes.ts';
import { personaReactions, personaReplies, seedWorld, welcomeVisitor } from '../../../server/src/seed/seed.ts';
import type { Transport } from './transport.ts';

const DB_NAME = 'zemvii-demo';
const KEY = 'state-v1';
const TIME_COLUMNS = [
  'createdAt', 'startsAt', 'endsAt', 'deliverAt', 'lastMessageAt', 'lastReadAt', 'expiresAt', 'readAt', 'updatedAt',
  'feedSeenAt', 'lastActiveAt', 'renewsAt', 'startedAt', 'lastSeenAt', 'resolvedAt', 'appealAt', 'appealResolvedAt', 'editedAt',
];

interface Saved {
  dump: MemoryDump;
  savedAt: number;
  token: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const request = run(tx.objectStore('kv'));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

/** Move every timestamp forward so a world saved days ago still feels current. */
function shiftTimes(dump: MemoryDump, delta: number): MemoryDump {
  for (const rows of Object.values(dump)) {
    for (const row of rows ?? []) {
      for (const column of TIME_COLUMNS) {
        const value = row[column];
        if (typeof value === 'number' && value > 0) row[column] = value + delta;
      }
    }
  }
  return dump;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Uploads stay in this browser as data URLs. */
const dataUrlMedia = {
  async save(bytes: Uint8Array, mime: string) {
    return `data:${mime};base64,${base64(bytes)}`;
  },
};

export async function createDemoTransport(): Promise<Transport> {
  const now = Date.now();
  let saved = await idb<Saved>('readonly', (s) => s.get(KEY));
  if (saved && (!saved.dump || !Array.isArray(saved.dump.users))) saved = undefined;
  if (saved && now - saved.savedAt > 6 * 3_600_000) saved.dump = shiftTimes(saved.dump, now - saved.savedAt);

  const store = new MemoryStore(saved?.dump);
  let token: string | null = saved?.token ?? null;
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };
  const later = () => {
    // Personas act a few seconds after a message or post; save after they have.
    for (const ms of [6_000, 14_000]) setTimeout(markDirty, ms);
  };

  const app: App = createApp({
    store,
    media: dataUrlMedia,
    simulated: true,
    passwordIterations: 60_000,
    onMessage: (a, message) => {
      personaReplies(a, message);
      later();
    },
    onPost: (a, post) => {
      personaReactions(a, post);
      later();
    },
    onSignup: (a, user) => welcomeVisitor(a, user, { makeModerator: true, walletCents: 2500 }),
    log: (message, error) => console.warn(`[zemvii demo] ${message}`, error ?? ''),
  });
  if (!saved) {
    // Personas never log in in the demo, so they get an unusable password hash.
    await seedWorld(store, { now, passwordHash: '!', tzOffsetMin: -new Date().getTimezoneOffset() });
    dirty = true;
  }
  const api = createApi(app);

  const persist = async () => {
    if (!dirty) return;
    dirty = false;
    const value: Saved = { dump: store.dump(), savedAt: Date.now(), token };
    // If storage is unavailable this quietly fails and the demo keeps running in memory.
    await idb('readwrite', (s) => s.put(value, KEY));
  };
  setInterval(() => void persist(), 4000);
  addEventListener('pagehide', () => void persist());
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persist();
  });

  const call = async (method: string, path: string, body: unknown, raw?: Uint8Array) => {
    const url = new URL(path, 'https://demo.zemvii.invalid');
    const res = await api({
      method,
      path: url.pathname,
      query: url.searchParams,
      body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
      raw,
      token,
      userAgent: navigator.userAgent,
    });
    if (res.session !== undefined) {
      token = res.session;
      dirty = true;
    }
    if (method !== 'GET') dirty = true;
    return { status: res.status, body: JSON.parse(JSON.stringify(res.body ?? null)) };
  };

  return {
    mode: 'demo',
    request: (method, path, body) => call(method, path, body),
    async upload(blob) {
      return call('POST', '/api/media', undefined, new Uint8Array(await blob.arrayBuffer()));
    },
    async reset() {
      await idb('readwrite', (s) => s.delete(KEY));
      token = null;
      dirty = false;
      location.reload();
    },
  };
}
