# Zemvii progress

Branch: `zemvii`. Zemvii lives in `zemvii/`; the Zovelis OS files on `main`
are untouched.

## Completed

- [x] Research on Facebook / Instagram / TikTok gaps (2025–2026 sources) → `docs/STRATEGY.md`
- [x] Data model and storage: async `Store`, SQLite (`node:sqlite`) and in-memory adapters, shared contract tests
- [x] Core logic: Feed Dials ranking with explanations, tone check, wellbeing (quiet hours, digests, budget), 90/10 payments, age rules, visibility
- [x] API: 106 endpoints over a framework-agnostic router (accounts, recovery friends, graph, circles, posts, comments, notes, feeds, discover, search, notifications, messages, spaces, plans, creator, wallet, Zemvii+, wellbeing, reports, moderation, appeals, media, export, deletion)
- [x] Node HTTP server: CSRF guard, CSP and security headers, rate limits, HttpOnly sessions, upload sniffing, Range requests, static web app
- [x] Demo world: 18 fictional people, 2 fictional brands, a spam account for the moderation queue, 63 posts (9 of them clips), 6 spaces, 7 plans; personas reply and react
- [x] Web app: landing, sign-up with age protections, onboarding, Friends and Mix feeds with caught-up endings, Feed Dials, Why am I seeing this, tone nudges, composer with origin labels and audiences, generative art, Clips in sets, Discover, search, topics, profiles, circles, messages and requests, notifications with digests, spaces, plans with memories, creator dashboard, wallet, Zemvii+, wellbeing, settings, Account Status, moderation queue, data export and deletion, light and dark themes
- [x] In-browser demo build that runs the real API, plus a single-page builder (`scripts/make-artifact.mjs`)
- [x] Tests: 75 unit and integration tests (both storage adapters); browser end-to-end journey for the server build and the demo build at phone and desktop sizes
- [x] Live demo published as a private artifact (shareable from its Share menu)
- [x] Docs: README, ARCHITECTURE, STRATEGY

## Next (in priority order)

1. **Real payments**: Stripe Checkout and Connect for tips, memberships and payouts (web first, to avoid app-store fees where allowed).
2. **End-to-end encrypted messages** with MLS (RFC 9420) before public launch.
3. **Postgres adapter** for `Store`, object storage for media, video transcoding worker.
4. **Human verification and age assurance** with a privacy-preserving provider (no ID stored).
5. **Push notifications** (Web Push, then APNs/FCM) that respect digests and quiet hours.
6. **Native apps** (React Native) reusing the API client and `server/src/core`.
7. **Import from other networks**: read the data-export archives of Instagram, Facebook and TikTok.
8. **ActivityPub / AT Protocol bridge** so people can take their audience with them.
9. CI for `zemvii/` (typecheck, tests, e2e) once Zemvii has its own repository.

## Known issues

- The demo world shifts all its timestamps forward when you come back after
  6+ hours, so posts stay fresh; usage days in Wellbeing don't shift with it.
- Video uploads are stored as uploaded (no transcoding), so some phone videos
  (HEVC) may not play in every browser.
- Search uses substring matching; fine for the demo, not for millions of posts.
- In the demo you are both the only moderator and the person whose posts get
  moderated, so appeals of your own decisions can't be resolved (by design, a
  different moderator must review an appeal).

## Decisions

- The server has no runtime npm dependencies: Node 22.18+ runs TypeScript
  directly (type stripping) and stores data with the built-in `node:sqlite`.
- The `Store` interface is async so a Postgres adapter can replace SQLite
  without touching services.
- The same API router runs in Node and in the browser (demo mode), so the demo
  exercises the real business logic.
- Teen protections are enforced on the server, not only in the interface.
- Licence: not chosen yet (`UNLICENSED`); the owner decides.
