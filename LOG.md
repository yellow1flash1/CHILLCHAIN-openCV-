# Build log: ChillChain

Team Rocket (Rahul, Anmol, Anirudh, Parth) · Prompt-ae-thon 2026, CodeChef BVCOE Chapter × Horizon

Live: https://chillchain.chillchain.workers.dev

---

## How it started

In the first round of this hackathon we built **FreshGrid**: an app for staple-crop farmers (wheat, pulses, vegetables) to grade produce, book cold storage and sell to buyers with escrow.

**The problem with FreshGrid (judges' feedback):** mandis don't work that way for staple crops. Farmers sell through commission agents who also lend them money, prices come from MSP or the agent, and at ₹15–25/kg there is no margin to pay for grading, cold rooms or escrow. They liked the tech but said it was aimed at the wrong crops, and suggested exotic and short-life fruit.

**What we changed:** we kept the engine (scan → store → move → sell, escrow, ratings) and rebuilt it as **ChillChain** for produce that is expensive, spoils in days and sells on grade: strawberries, litchi, dragon fruit, flowers, mushrooms. Many of these have no proper mandi channel at all. For them the real problem isn't the price, it's the clock, so every lot now gets a sell-by clock and everything in the app is about beating it.

## Log

**Oct 21:** Copied the FreshGrid code into a new project. Set up Neon Postgres, Clerk login and the base tables (`neon/schema.sql`). Kept the 4-role idea: grower, transporter, buyer, cold-room owner.

**Oct 21:** Truck bookings and fare quotes (`002`). Cold-room owner side: register a room, check farmers in with a gate pass, release crates (`003a/b`). Wrote demo drivers for testing.

**Oct 21:** Driver accounts: see nearby loads, accept trips, mark delivered and paid (`004`, `005`). Added "verify later" so drivers can look around before uploading RC, licence and insurance.
ChillScore ratings (`006`). Ratings stay hidden for 48 hours, or until both sides rate, so nobody rates in revenge. New users start near an average score, so one bad rating doesn't sink them.
Saved farm profile for the crop advisor (`007`) and the settings page (`008`).

**Oct 22:** The big pivot day (`009_chillchain.sql`).

- New crop list: exotic and short-life fruit, flowers, mushrooms, polyhouse greens.
- Shelf-life rules and price steps (100 → 90 → 75 → 60%, then processor only). These live in Postgres as well as `src/lib/shelf.ts` and have to match exactly.
- Pre-coolers and ripening rooms rented by the hour, not the month.
- Shared reefer trucks: lots going the same route on the same day share one truck.
- Buyer pre-orders with escrow.

Then `010`: who graded a scan (AI or the grower), the air temperature the clock used, partial acceptance at delivery with refunds for the rejected part.

Grading: Gemini Vision for any crop, plus small on-phone models (Teachable Machine) for apple and cherry tomato so it works without signal. When Gemini runs out of free quota the grower can grade it themselves, and buyers see "self-graded".

Redesigned the UI to look like an iPhone app (grouped lists, large titles, the bottom tab bar).

**Oct 22:**

- **15 languages.** Every string goes through `t("English", "हिन्दी")`. A script collects them all and each language has its own dictionary. Urdu needed right-to-left.
- **Razorpay in test mode** (`011`). The server works out the amount, so the browser can't change what gets charged. Failed orders refund automatically.
- **Offline mode.** Growers are often in fields with no signal: the app opens with the last data, and scans made offline wait on the phone and upload later.
- **Live mandi prices** from Agmarknet (`012`), saved every 30 minutes. Two bugs we hit: flowers are reported per bunch, not per kg (tuberose came out at ₹0.60/kg), and comparing different markets on different days showed fake +400% jumps. Fixed by comparing each market only with itself.
- Deployed on Cloudflare Workers.

**Oct 26: OpenCV AI Competition 2026 (powered by AWS).**

- New `vision/` service: an OpenCV 5.0.0 grading agent. It checks the photo (focus, light, glare), corrects lighting, finds the produce with one of three segmenters, separates touching fruit with a watershed, measures bruises, browning, mould and ripe colour on every piece, grades the lot by its worst 10%, and decides the next step: retake (with the fix), confirm (grower decides), sort and rescan (pull the outlined bad pieces), or accept.
- Deployed as an arm64 (Graviton) Lambda container behind API Gateway, with photos, annotated images and decision traces in S3 and a CloudWatch dashboard (`vision/template.yaml`).
- The app now sends every photo scan to it first (Gemini Vision is the fallback), shows the annotated photo and the agent's steps, and stores what it saw (`013_opencv_vision.sql`).
- Fixed the repo: the code had been uploaded into "ChillChain 2" and "ChillChain 3" folders, and `.prettierrc` was missing.
- Bugs that taught us something: a crate full of red berries looked like a red colour cast (fixed by measuring the cast only on grey pixels), and the dark gaps between berries looked like bruises (kept open unless small or bright).

## Things that went wrong / what we learned

- Free AI quotas run out at the worst time. Always have a manual fallback.
- "Online" on a phone doesn't mean the internet works. We treat a failed request as offline too.
- Money rules (price steps, escrow amounts) belong in the database, not just the app.
- Government price data is messy; check units before trusting it.

## AI we used

- **claude.code**
- **gemini.argon:** for research of data from google
- **Inside the app:** Gemini Vision grades photos and runs the chat helper. TensorFlow.js runs the on-phone grading models.
- **While building:** we used an AI coding assistant (Claude) a lot: for writing and fixing a good share of the code, the translations into the 13 extra languages, and first drafts of the slides.
- **What was ours:** the idea and the pivot from FreshGrid, which features to build and in what order, the rules (shelf life, price steps, ratings), design choices, testing, and the deploy.
- **cloudflare:** for deploy
- **neon:** for sql and datamangement, the sql files
- **resend:** for sending mails
- **clerk**

## what's real and fake

Real
Sign-in, roles, profiles, settings: Clerk handles login, data sits in Neon, and the server checks every action."Real login, real database."

Sell-by clock, channels, price steps: the server and Postgres calculate the deadline, the A/B/C channel and the price drop. "Real. The browser cannot change them."

Hourly storage, shared trucks, pre-orders: Postgres functions book the cold room and pool trucks by route, day, vehicle and capacity. "Real logic, running live."

AI grading: apple and cherry tomato have models running on the phone. For any other crop, Gemini Vision grades the photo on the server, asks for a retake when unsure, and lets the grower override (buyers see the override). "Real. Two crops run on-phone, all other crops use Gemini Vision."

Weather-adjusted clock: it uses the Open-Meteo forecast for the grower's district, and open-air produce spoils about 2.5× faster for every +10 °C. "Hot day, shorter clock, automatically."

Live mandi prices: Agmarknet government prices refresh every 30 minutes into Postgres. Crops that mandis don't report (blueberry, microgreens) stay indicative. "Real where the government reports, labelled indicative where it doesn't."

Offline mode: the app is installable and opens without network with the last data seen (kept 7 days). Scans made offline upload later. Bookings, orders and payments still need internet. "Scans work in a field with no signal."

Emails: Resend sends them. It is optional.
Estimate
Ripeness stage: an AI estimate from Gemini Vision, or the grower picks it. "An estimate, and the grower can correct it."

"Best move now": it uses real storage rates, pre-orders and the fare formula, but the price assumptions are shown on screen."A suggestion, with its assumptions visible."

Shelf-life hours, advisor costs, subsidies: these come from post-harvest handbooks and typical MIDH/NHB patterns. "Starting values. We tune them in the pilot."

Storage on the map: 10 demo facilities (sample data) in growing regions. Real owners can register their own, with their own UPI/QR payments.

Payments: there is no payment gateway yet, and the UTRs (bank transaction reference numbers) are random test numbers. "Simulated. A licensed partner comes next."

Not yet
WhatsApp/SMS alerts, reefer temperature logs: these are next steps. "Planned for the pilot."

## API KEY USED

gemini api key for chatbot
INDIAN Government api key for live prices

## What's still under progress

No real money moves (test payments only). . WhatsApp/SMS alerts and reefer temperature logs aren't built yet.
