# Setting up ChillChain

Payments are **not** included: escrow, UPI and transport fares are simulated (test mode).

## 1. Accounts and keys

Copy `.env.example` to `.env` and fill it in. **Never commit `.env`** (it is in `.gitignore`).

| Variable                                         | Needed?                 | Where from                                                                                                                                       |
| ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                   | Yes                     | Neon → Connection string (pooled)                                                                                                                |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Yes                     | Clerk dashboard → API keys                                                                                                                       |
| `RESEND_API_KEY`, `RESEND_FROM`, `OPS_EMAIL`     | Optional                | Resend; `OPS_EMAIL` gets "driver needed" emails                                                                                                  |
| `VISION_API_URL`, `VISION_API_KEY`               | Yes for the competition | `VisionApiUrl` output of `sam deploy` and the key you chose (see `vision/README.md`). Without them, photo scans fall back to Gemini Vision       |
| `GEMINI_API_KEY` (`GEMINI_MODEL` optional)       | Optional                | Google AI Studio; powers Chill / Safar Sahayak and the grading fallback                                                                          |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`         | Optional                | Razorpay Dashboard → Test mode → API Keys. Without them, payments are simulated. Only `rzp_test_` keys are used unless `RAZORPAY_ALLOW_LIVE=yes` |
| `DATA_GOV_IN_API_KEY`                            | Optional                | Live mandi prices. Free: sign up at data.gov.in, then My Account → generate API key. Without it, prices are indicative                           |
| `R2_*`                                           | Optional                | Cloudflare R2 for scan photos (leave empty to switch off)                                                                                        |
| `ADMIN_EMAILS`                                   | Optional                | Comma-separated login emails allowed into `/admin`                                                                                               |
| `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_EMAIL`       | Optional                | Shown in Settings → Help                                                                                                                         |

In the Clerk dashboard, set the application name to **ChillChain** (it appears on the sign-in box).

Use a **new Neon project and a new Clerk application** for ChillChain, so it stays separate from FreshGrid.

## 2. Database

Run these in the Neon SQL Editor, **in this order, one file at a time, each once**. Make sure the editor is on the same project, branch and database as `DATABASE_URL`.

| File                                   | What it adds                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `neon/schema.sql`                      | Profiles, roles, cold rooms, scans, bookings, lots, escrow handover codes                                                       |
| `neon/002_transport.sql`               | Districts, vehicle types, transporters, truck bookings, fare quotes                                                             |
| `neon/003a_owner_role.sql`             | The `owner` role (**run alone** and wait for success)                                                                           |
| `neon/003b_owner.sql`                  | Cold room owners: registration, check-in, release, pause                                                                        |
| `neon/004a_transporter_role.sql`       | The `transporter` role (**run alone**)                                                                                          |
| `neon/004b_transporter.sql`            | Driver accounts: nearby loads, accept, trip status, fare received                                                               |
| `neon/005_transporter_quick_setup.sql` | More vehicle types, operating radius, "verify later" document gate                                                              |
| `neon/006_krishisaakh.sql`             | ChillScore ratings with the 48-hour double-blind reveal                                                                         |
| `neon/007_farm_profile.sql`            | Farmer's saved FasalNiti farm details                                                                                           |
| `neon/008_settings.sql`                | Settings, privacy consent, palledari, driver online switch, rating disputes                                                     |
| `neon/009_chillchain.sql`              | Sell-by clock, pre-cool/ripening rooms, hourly slots, pre-orders, shared trucks, price decay, new districts and demo facilities |
| `neon/010_batch1.sql`                  | Who graded a scan (AI / grower) and the air temperature the clock used; partial pre-orders; partial acceptance at delivery      |
| `neon/011_razorpay.sql`                | Razorpay payments table; amount quotes for lots, bookings and dues, so the server (not the browser) sets what Razorpay charges  |
| `neon/012_live_prices.sql`             | Live mandi prices: a copy of Agmarknet daily reports per market and day, and when they were last refreshed                      |

Optional, for testing only: `neon/demo_transporters.sql` (fake drivers; delete before real use).

`009` and then `010` must run after all the others. `009` replaces `create_booking`, `create_lot`, `place_order`, `create_transport`, `transport_quote`, `transporter_nearby`, `transporter_accept` and `owner_register_room` with new versions.

## 3. Run locally

```bash
bun install
```

```bash
bun run dev
```

Open http://localhost:8080. Checks: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`. GitHub Actions runs all four on every push (`.github/workflows/ci.yml`).

Offline mode: the build writes `/sw.js` (template in `scripts/sw.js`) with the list of built files, so phones keep the app and update when a new build is deployed. The service worker is only registered in production builds; `bun run dev` removes any old one. Saved data lives in IndexedDB (`src/lib/offline.ts`, `src/lib/outbox.ts`) and is cleared on sign-out. To try it locally: `NITRO_PRESET=node-server bun run build`, then `PORT=4175 node --env-file=.env .output/server/index.mjs`, open it once, then turn the network off in the browser's dev tools.

Languages: after adding or changing a `t("English", "हिन्दी")` text, run `bun scripts/i18n-extract.ts` to refresh `src/i18n/en.json`, `templates.json` and `source.tsv`, then add the new keys to each `src/i18n/<code>.json`. Until a dictionary has a key, that text shows in Hindi (Devanagari languages) or English. `bun run test` fails if a dictionary falls below 90% or a `{n}` placeholder doesn't match.

## 4. Admin tasks

Most are in the admin console at `/admin` (verify drivers and cold rooms, resolve rating disputes). Others in the SQL Editor:

- Give a demo room an owner: `UPDATE cold_rooms SET owner_id = 'user_xxx' WHERE name = '...';`
- Add a driver by hand: `INSERT INTO transporters (name, phone, vehicle_key, vehicle_no, base_district) VALUES (...);`
- Change fares: edit the rows in `vehicle_types`.

## 5. Deploy (Cloudflare)

Live at **https://chillchain.chillchain.workers.dev** (Cloudflare account chillchain001@gmail.com).

```bash
bunx wrangler@4 login
```

```bash
bun run deploy
```

`bun run deploy` builds the app (the Clerk publishable key from `.env` is baked into the page at build time) and uploads the `chillchain` Worker; `nodejs_compat` is set by the build. Server secrets live in Cloudflare, not in the upload. After changing one in `.env`, update it with `bunx wrangler@4 secret put NAME --name chillchain`. Secrets in use: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, `ADMIN_EMAILS` (add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `DATA_GOV_IN_API_KEY`, `RESEND_*`, `R2_*` the same way when you get them).

The app uses Clerk's development instance, which works on the workers.dev address. A Clerk production instance needs your own domain.
