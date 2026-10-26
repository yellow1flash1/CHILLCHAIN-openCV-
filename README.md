# ChillChain 🍓❄️ Every hour counts

ChillChain is a phone app for **short-shelf-life, high-value produce**: exotic fruit (dragon fruit, avocado, kiwi, blueberry, passion fruit, rambutan), short-window fruit (Shahi litchi, Mahabaleshwar strawberry, Kashmir cherry, Purandar fig, jamun), export fruit (Nashik grapes, Solapur pomegranate, Alphonso/Kesar mango), cut flowers, mushrooms and polyhouse greens.

It connects **growers and FPOs**, **reefer transporters**, **pre-cooling / cold room / ripening-chamber owners** and **buyers** (quick-commerce, premium retail, hotels and restaurants, exporters, florists and processors). A grower scans a lot and sees a **sell-by clock**; the app then says what to do in the next few hours: pre-cool by the hour, take a buyer's pre-order, list it, share a reefer truck, ripen it, or send it to a processor. It works in 15 languages, chosen in Settings: English, Hindi, Marathi, Bengali, Telugu, Tamil, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese, Urdu (right to left), Nepali and Maithili.

> **OpenCV AI Competition 2026 entry.** Every photo scan is graded by an **OpenCV 5 agent running on AWS Lambda (Graviton)**: it finds each piece, measures bruises, browning, mould and ripe colour, grades the lot by its worst pieces, and decides the next step (retake with a fix, grower confirms, pull out bad pieces and rescan, or accept). Technical report: [docs/OPENCV-AWS.md](docs/OPENCV-AWS.md) · service and deploy: [vision/README.md](vision/README.md) · submission kit: [docs/SUBMISSION.md](docs/SUBMISSION.md).

**Docs:** [Setup](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Demo walkthrough](docs/DEMO.md) · [What changed from FreshGrid](docs/CHANGES-FROM-FRESHGRID.md)

> This is a prototype. No real money moves: every payment is a test payment, and a few steps are simulated. They are all listed [further down](#whats-real-and-whats-simulated).

## Team

| Name                                                              | Role               |
| ----------------------------------------------------------------- | ------------------ |
| Rahul Rajpal ([@yellow1flash1](https://github.com/yellow1flash1)) | Backend developer  |
| Anmol                                                             | App UI             |
| Parth                                                             | Database manager   |
| Anirudh                                                           | Frontend developer |

## Why we pivoted

Judges at the first round told us the ground reality of mandis is different for staple crops: farmers sell through commission agents who also lend them money, prices come from MSP or the agent, and at ₹15–25/kg there is no margin for grading, cold rooms or escrow. They liked the technology and suggested exotic and short-life fruit.

That is where our engine fits: produce that is **expensive**, **spoils in days**, whose **price depends heavily on grade**, and whose **buyers are organised and digital**. Many of these crops (dragon fruit, avocado, blueberry) have no proper mandi channel at all, so ChillChain fills a gap instead of competing with arhtiyas.

## What it does

The app opens on **"Who are you?"**: Grower / FPO, Reefer / transporter, Buyer, or Cold room / pre-cooler / ripening owner.

**Growers** (Home · Plan · Cool/Move · Sell · Help)

- **Scan & sell-by clock:** AI grade (A/B/C) from the camera or a photo (the OpenCV 5 agent on AWS, which shows the photo with every piece outlined by grade and tells the grower to retake, confirm, or pull out bad pieces; Gemini Vision as fallback; on-phone models for two crops), ripeness, harvest time and whether the lot was cooled give a live **"sell within X hours"** countdown. Open-air clocks run faster on hot days, using today's forecast for the grower's district.
- **Best move now:** for each scanned lot, the money in hand after storage and truck costs for every next step (sell today, pre-cool then sell, fill a buyer's pre-order, ripen then sell, or a processor), with the best one highlighted.
- **Weather card:** heat, rain and cold-night alerts with harvest and transport advice.
- **ProfitPlanter:** "What should I plant?" ranks 15 high-value options (dragon fruit, avocado, kiwi, blueberry, strawberry, fig, pomegranate, grapes, litchi, gerbera polyhouse, marigold, mushrooms, microgreens…) by climate, water, payback years and 5-year profit for the grower's land and budget, with indicative MIDH/NHB subsidy.
- **Storage:** pre-coolers, cold rooms and ripening chambers on a live map, bookable **by the hour** or by the day.
- **Reefer trucks:** **share a truck** with growers going the same way and pay only for your boxes, or book a whole one; set a **delivery deadline** from the sell-by clock.
- **Buyer demand:** accept all or **part of a buyer's pre-order before harvest**; your share goes into escrow straight away and the rest stays open for other growers.
- **Money:** escrow sales with a secret 6-digit handover code, storage dues, passbook, income estimator.
- **Chill Sahayak:** a Gemini assistant that knows the grower's clocks, bookings, lots and open pre-orders.

**Buyers** (Market · Pre-orders · My orders): graded lots with a live clock and a price that **steps down as the lot ages** (100% → 90% → 75% → 60%, 50% to processors after the deadline), filtered by channel (premium retail, flash sale, processor); post pre-orders; confirm delivery with the grower's code, and **accept part of a lot** with a reason when some of it is not up to grade (only the accepted weight is paid; the grower can offer the rest to processors). Each lot shows whether it was AI-checked or self-graded. Processors start on the C-grade / expiring lots.

**Transporters:** nearby loads sorted by deadline, shared loads taken as one pool, "Deliver by" badges, UPI/cash fare collection, earnings and the Safar Sahayak assistant.

**Storage owners:** register a cold room, pre-cooler or ripening chamber with day and hour rates; live capacity, gate check-in, release, earnings.

**ChillScore ratings (all roles):** six rating flows that mix app records with 3-tap answers. For perishables the questions now cover arriving fresh and cold, ventilated crates, chill injury and **delivery before the deadline**. 48-hour double-blind reveal, weather shield and disputes.

## What's real and what's simulated

| Area                                           | Status              | Notes                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, roles, profiles, settings             | ✅ Real             | Clerk login; data in Neon Postgres, every action checked on the server                                                                                                                                                                                                                                                              |
| Sell-by clock, channels, price steps           | ✅ Real logic       | Calculated on the server and in Postgres from the scan; the browser cannot change them                                                                                                                                                                                                                                              |
| Hourly storage, shared truck fares, pre-orders | ✅ Real logic       | Postgres functions; pools match by route, day, vehicle and capacity                                                                                                                                                                                                                                                                 |
| AI grading                                     | ✅ Real             | OpenCV 5 agent on AWS Lambda grades every photo scan (per-piece defects, ripeness, retake / confirm / sort-and-rescan decisions); Gemini Vision is the fallback when AWS is unreachable; on-phone models for apple and cherry tomato. The grower can override (shown to buyers). Accuracy on real photos: see docs/OPENCV-AWS.md §7 |
| Ripeness stage                                 | 🟡 AI estimate      | From Gemini Vision or the grower's own pick                                                                                                                                                                                                                                                                                         |
| Weather-adjusted clock                         | ✅ Real             | Open-Meteo forecast for the grower's district; open-air produce spoils ~2.5× faster per +10 °C                                                                                                                                                                                                                                      |
| "Best move now"                                | 🟡 Estimates        | Real storage rates, pre-orders and fare formula; price assumptions are shown on screen                                                                                                                                                                                                                                              |
| Shelf-life hours, advisor costs, subsidies     | 🟡 Indicative       | From post-harvest handbooks and typical MIDH/NHB patterns; verify locally                                                                                                                                                                                                                                                           |
| Live mandi prices                              | ✅ Real (needs key) | Agmarknet daily reports from every government mandi, refreshed every 30 min into Postgres: state and all-India middle price, like-for-like change, 2-week trend and each market's price. Crops mandis don't report (blueberry, microgreens…) stay indicative                                                                        |
| Storage on the map                             | 🟡 Sample data      | 10 demo facilities in growing regions; real owners can register their own                                                                                                                                                                                                                                                           |
| UPI / QR payments and escrow                   | 🔴 Simulated        | No payment gateway yet; UTRs are random test numbers                                                                                                                                                                                                                                                                                |
| Offline mode                                   | ✅ Real             | Installable app; opens without network on the last signed-in account with the last data seen (kept 7 days); scans made offline wait on the phone and upload when back online; on-phone grading models and map tiles are saved for the field. Bookings, orders and payments need internet                                            |
| Emails                                         | ✅ Real             | Resend (optional)                                                                                                                                                                                                                                                                                                                   |
| WhatsApp / SMS alerts, reefer temperature logs | 🔴 Not yet          | Next steps                                                                                                                                                                                                                                                                                                                          |

## Tech stack

- **Frontend:** React 19, TanStack Start / Router / Query, Tailwind CSS 4, Recharts, Leaflet
- **Login:** Clerk · **Database:** Neon serverless Postgres (SQL in [`neon/`](neon)) · **Email:** Resend · **Photos (optional):** Cloudflare R2
- **Computer vision:** OpenCV 5.0.0 (Python) grading agent on **AWS Lambda arm64 (Graviton)** + API Gateway + S3 + CloudWatch, deployed with AWS SAM ([`vision/`](vision))
- **AI:** Gemini Vision as grading fallback, TensorFlow.js on-phone models (loaded only when scanning), Google Gemini for the assistants; Claude helped write code
- **Tooling:** Bun, Vite, TypeScript, Vitest, ESLint, Prettier, GitHub Actions CI

## Running it locally

Full steps are in [docs/SETUP.md](docs/SETUP.md). Use a **new** Neon project and Clerk app (not FreshGrid's). In short:

```bash
bun install
```

```bash
cp .env.example .env
```

Fill in `.env`, run the SQL files in `neon/` in order (ending with `013_opencv_vision.sql`), then:

```bash
bun run dev
```

Other scripts: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, `bun run format`.

## Where things are

```
src/
├─ routes/            # index (welcome → login → profile → role app), privacy, admin, api/chat
├─ components/fg/     # screens: Shell (grower), ScanTab, ColdTab, TransportTab, DemandTab, AdvisorTab, BuyerShell, …
├─ lib/vision*.ts     # client for the OpenCV 5 grading agent on AWS
├─ lib/shelf.ts       # sell-by clock, ripeness, channels, price steps
├─ lib/advisor.ts     # ProfitPlanter ("what should I plant?") engine
├─ lib/crops.ts       # produce catalogue with shelf-life hours
└─ test/              # Vitest tests (shelf, advisor, income, routing, ratings)
neon/                 # database SQL, run in order
vision/               # OpenCV 5 grading agent (Python), AWS SAM template, tests, evaluation
```

## Next steps

1. Ripeness and more crop grading models (strawberry, dragon fruit, litchi, roses).
2. A real UPI gateway with escrow confirmed by webhook.
3. Reefer temperature logging (Bluetooth loggers) as proof of an unbroken cold chain for exporters.
4. WhatsApp alerts when a clock turns urgent or a matching pre-order appears.
5. Interviews with growers, quick-commerce buyers and pack-house owners to tune shelf-life and price steps.

## Credits and notes

- **AI tools:** we used Claude to help write code and documentation. The idea, the grading models and the product decisions are ours.
- **Open data and services:** [Agmarknet / data.gov.in](https://data.gov.in), [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), [Teachable Machine](https://teachablemachine.withgoogle.com/), Google Gemini, Clerk, Neon, Resend.
- **Not affiliated** with NPCI, e-NAM, Agmarknet, MIDH, NHB, IMD or any government body.
