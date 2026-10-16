# Zemvii

**The social network that works for you, not on you.**
Your people. Your feed. Your rules.

Zemvii is a new social platform built around what Facebook, Instagram and
TikTok are missing in 2026: feeds you control, a finish line instead of an
endless scroll, honest labels on AI content, kindness built into posting,
real-life plans, fair pay for creators, and moderation you can understand and
appeal. The research behind it, with sources, is in
[docs/STRATEGY.md](docs/STRATEGY.md).

This repository contains a working v1: the API server, the web app (a
mobile-first PWA), a fictional demo world, and tests.

## What you can do in v1

| Pillar | What's built |
| --- | --- |
| **Your people first** | Friends feed: everyone you follow, newest first, complete, with "N new since your last visit" and a clear end. Circles (Close friends, Family, your own) as post audiences, plan invites and group chats. |
| **Your feed, your rules** | Mix feed ranked by **Feed Dials** (Friends↔Discover, Fresh↔Popular, Calm), presets, boosted and muted topics, muted words. **Why am I seeing this?** on every post shows the real formula and score breakdown. |
| **A finish line** | "You're all caught up" on both feeds (Mix stops at 60 posts). **Clips** in sets of 8 with a breathing pause. Daily time budget with one gentle check-in, quiet hours, notification **digests** (08:00, 13:00, 19:00), optional "What brings you here?" prompt, a Wellbeing page that counts conversations, not minutes. |
| **Real humans, honest media** | Every post is labelled Human-made, AI-assisted or AI-generated; one switch hides AI-generated posts. Verified-human badges (the check is simulated in this version). Undisclosed AI is a report reason and moderators can relabel. |
| **Kind by design** | **Pause & rethink**: a tone check nudges before hurtful posts, comments and messages; threats are blocked; self-harm is answered with support resources instead of a block. The Calm dial lowers heated posts. Hidden words, reply controls, block, mute, community notes. |
| **Real life** | **Plans** with RSVPs, capacity, sharing into chats, and memories from people who went. **Spaces**: communities with rules, members, plans and their own feed. |
| **Fair to creators** | Tips and supporter memberships with a flat 10% fee shown before paying (creators keep 90%), supporters-only posts, a creator dashboard that ranks posts by saves, comments and tips. Wallet in test mode. |
| **Trust you can see** | **Account Status** explains every moderation decision with a one-tap appeal reviewed by a different moderator; reporters are told the outcome. **Recovery friends**: two of your three chosen friends vouch for you if you're locked out. |
| **Your data is yours** | No tracking. Contextual sponsored posts only (matched to nearby posts' topics, max 1 in 12, never in Friends, never for teens or Zemvii+). Full JSON export, real deletion. |
| **Teen safety** | Under-18s: private by default (always private under 16), no messages or follow without approval from adults they don't know, not recommended or searchable to adults, no payments, no public meetups, quiet hours always on. |

## Run it

Needs **Node.js 22.18 or newer** (it runs the TypeScript directly and uses the
built-in `node:sqlite`; the server has no runtime npm dependencies).

```sh
npm install
npm run dev          # API on :8787 (demo world) + web app on http://localhost:5173
```

In development the server runs in **simulated mode**: it seeds a world of
fictional people, posts, spaces and plans, welcomes each new account into it,
lets personas reply to your messages and react to your posts, simulates human
verification and gives test wallet credits. Personas can be logged into with
the password `zemvii-demo-password`.

### Production

```sh
npm run build                         # builds web/dist
ZEMVII_DATA=/var/lib/zemvii npm start # serves the API and the web app on :8787
```

| Variable | Meaning |
| --- | --- |
| `PORT`, `HOST` | Listen address (default `127.0.0.1:8787`; use `0.0.0.0` in a container) |
| `ZEMVII_DATA` | Directory for the SQLite database and uploads |
| `ZEMVII_WEB` | Built web app to serve (default `web/dist`) |
| `TRUST_PROXY=1` | Behind a reverse proxy: trust `X-Forwarded-For` / `-Proto` |
| `COOKIE_SECURE=1` | Always mark the session cookie `Secure` |
| `ZEMVII_SIMULATED=1` | Demo world and simulated verification/payments. **Never in production.** |

Put it behind HTTPS (for example Caddy or nginx). Back up `ZEMVII_DATA`.

### The in-browser demo

```sh
npm run build:demo   # web/dist-demo/ and a single self-contained web/dist-demo/zemvii-demo.html
```

The demo build runs the **real API** (router, validation, services, ranking,
tone check) inside the browser on an in-memory store, seeded with the demo
world and saved in the browser's IndexedDB. Any static host can serve it, and
the single HTML file works on its own.

## Check it

```sh
npm run check        # typecheck server and web, then 75 unit and integration tests
npm run e2e          # full journey in Chromium against the server build
npm run e2e:demo     # the same journey against the in-browser demo
```

- `server/test/store.test.ts`: one storage contract, run on SQLite and on the in-memory store.
- `server/test/core.test.ts`: ranking and dials, tone check, wellbeing math, money, age rules, visibility.
- `server/test/api.test.ts`: end-to-end through the router on both stores: audiences, teen protections, tone enforcement, blocks, message requests, plans, creator payments, moderation and appeals, recovery friends, digests, uploads, export and deletion.
- `scripts/e2e.mjs`: sign-up to moderation in a real browser at phone and desktop sizes, light and dark; fails on any page or console error. Set `CHROMIUM` to your Chromium/Chrome binary.

## Layout

```
docs/STRATEGY.md        research: what the giants miss, pillars, business model, go-to-market
docs/ARCHITECTURE.md    how it fits together, security, how to scale it
server/src/store/       data model (types, schema) and storage: SQLite + in-memory
server/src/core/        pure logic: feed ranking, tone check, wellbeing, money, age, visibility
server/src/services/    business logic per area (auth, posts, feed, messages, community, ...)
server/src/api/         framework-agnostic router and every endpoint
server/src/node/        Node HTTP server: cookies, CSRF, CSP, rate limits, uploads, static files
server/src/seed/        the fictional demo world and persona behaviour
web/src/                React app: pages, components, generative art, design system
scripts/                dev runner, browser end-to-end test, single-page demo builder
```

## What's simulated or missing in v1

Being explicit about it:

- **Payments** are test credits; real payments (Stripe, on the web) are not wired up.
- **Human verification** is simulated; production needs a privacy-preserving liveness provider.
- **Messages are not end-to-end encrypted yet** (MLS / RFC 9420 is on the roadmap and is a launch requirement).
- **Video** is stored as uploaded (no transcoding); no push notifications; no native apps yet.
- **One server process with SQLite.** The storage interface is async so a Postgres adapter can replace it; see docs/ARCHITECTURE.md.
- The tone check is rule-based (transparent, explainable); a learned model can sit behind the same interface.

Progress and next steps are tracked in [PROGRESS.md](PROGRESS.md).

## Licence

Not chosen yet: all rights reserved by the owner until a licence is added.
