# Notes for AI coding assistants

- This is ChillChain, a separate copy of FreshGrid aimed at short-shelf-life, high-value produce. Do not change the FreshGrid folder from here.
- Shelf-life, channel and price-decay rules live in `src/lib/shelf.ts`; `priceFactor()` must stay in step with `lot_price_factor()` in `neon/009_chillchain.sql`.

- Stack: TanStack Start (React 19) + Tailwind 4, Clerk login, Neon Postgres. Plain Vite config in `vite.config.ts`.
- All database access goes through server functions in `src/lib/*.functions.ts`; the caller's id comes from Clerk (`requireUserId`), never from the request.
- Database changes are new numbered files in `neon/` (see `docs/SETUP.md`), never edits to files that were already run.
- Before finishing a change run: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.
- Every user-facing string uses `t("English", "हिन्दी")`.
- Photo grading goes to the OpenCV 5 service in `vision/` first (`src/lib/vision.server.ts`); Gemini Vision is the fallback. Python changes: run `python -m pytest -q` in `vision/`.
