// Zemvii server entry point.
//
// Environment:
//   PORT              (default 8787)
//   HOST              (default 127.0.0.1; use 0.0.0.0 in a container)
//   ZEMVII_DATA       data directory for the database and uploads (default ./data)
//   ZEMVII_WEB        built web app to serve (default ../web/dist if it exists)
//   ZEMVII_SIMULATED  "1" for local development and demos only: seeds the
//                     fictional demo world, simulates human verification and
//                     test-mode wallet credits, and lets personas reply.
//                     Never enable it in production.
//   TRUST_PROXY       "1" behind a reverse proxy (X-Forwarded-For/-Proto)
//   COOKIE_SECURE     "1" to always mark the session cookie Secure

import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../store/sqlite.ts';
import { createApp, type MediaStorage } from '../services/app.ts';
import { createApi } from '../api/routes.ts';
import { MEDIA_EXTENSIONS } from '../services/media.ts';
import { hashPassword } from '../services/crypto.ts';
import { createHttpServer } from './http.ts';
import { personaReactions, personaReplies, seedWorld, welcomeVisitor } from '../seed/seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = resolve(process.env.ZEMVII_DATA ?? join(here, '../../data'));
const webCandidate = resolve(process.env.ZEMVII_WEB ?? join(here, '../../../web/dist'));
const webDir = existsSync(join(webCandidate, 'index.html')) ? webCandidate : null;
const simulated = process.env.ZEMVII_SIMULATED === '1';
const mediaDir = join(dataDir, 'media');
mkdirSync(mediaDir, { recursive: true });

const diskMedia: MediaStorage = {
  async save(bytes, mime, id) {
    const name = `${id}.${MEDIA_EXTENSIONS[mime]}`;
    await writeFile(join(mediaDir, name), bytes, { flag: 'wx' });
    return `/media/${name}`;
  },
};

const store = new SqliteStore(join(dataDir, 'zemvii.db'));
const app = createApp({
  store,
  media: diskMedia,
  simulated,
  onMessage: simulated ? personaReplies : undefined,
  onPost: simulated ? personaReactions : undefined,
  onSignup: simulated ? (a, user) => welcomeVisitor(a, user, { walletCents: 2500 }) : undefined,
  log: (message, error) => console.error(`[zemvii] ${message}`, error ?? ''),
});

if (simulated) {
  // Personas share one known password so developers can log in as them.
  await seedWorld(store, { now: Date.now(), passwordHash: await hashPassword('zemvii-demo-password', 100_000), tzOffsetMin: -new Date().getTimezoneOffset() });
}

const server = createHttpServer({
  api: createApi(app),
  mediaDir,
  webDir,
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookies: process.env.COOKIE_SECURE === '1' ? true : undefined,
  log: process.env.ZEMVII_QUIET === '1' ? undefined : (line) => console.log(line),
});

server.listen(port, host, () => {
  console.log(`Zemvii listening on http://${host}:${port}`);
  console.log(`  data: ${dataDir}`);
  console.log(`  web:  ${webDir ?? '(not built: run npm run build)'}`);
  if (simulated) console.log('  SIMULATED MODE: demo world, test credits, simulated verification. Do not use in production.');
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
