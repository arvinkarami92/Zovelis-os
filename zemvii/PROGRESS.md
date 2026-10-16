# Zemvii progress

Branch: `zemvii` (the Zovelis OS files on `main` are untouched; Zemvii lives in `zemvii/`).

## Completed

- [x] Research on Facebook / Instagram / TikTok gaps (2025–2026 sources) → `docs/STRATEGY.md`
- [x] Server foundation: schema, async Store, SQLite + memory adapters (contract tests on both)
- [x] Core algorithms: feed dials ranking + explanations, tone check, wellbeing, payouts, visibility
- [x] Services and API routes (~90 endpoints) with integration tests on both adapters (75 tests passing)

## In progress

- [ ] Node HTTP server binding, demo seed data

## Not started

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
