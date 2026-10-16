# Zemvii progress

Branch: `zemvii` (the Zovelis OS files on `main` are untouched; Zemvii lives in `zemvii/`).

## Completed

- [x] Research on Facebook / Instagram / TikTok gaps (2025–2026 sources) → `docs/STRATEGY.md`

## In progress

- [ ] Server foundation: schema, async Store, SQLite + memory adapters

## Not started

- [ ] Core algorithms: feed dials ranking + explanations, tone check, wellbeing, payouts
- [ ] Services and API routes with integration tests
- [ ] Node HTTP server binding, demo seed data
- [ ] Web app (design system, router, transports, all pages)
- [ ] Browser end-to-end verification, live demo, push

## Known bugs

None yet.

## Decisions

- Server has no runtime npm dependencies: Node 22 runs TypeScript directly
  (type stripping) and uses the built-in `node:sqlite`.
- The Store interface is async so a Postgres adapter can replace SQLite
  without touching services.
- The same API router runs in Node and in the browser (demo mode with an
  in-memory store), so the live demo exercises the real business logic.
