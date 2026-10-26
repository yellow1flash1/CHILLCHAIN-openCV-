# What changed from FreshGrid

ChillChain is a separate copy of the FreshGrid app (the FreshGrid folder was not changed). The core features are the same: scan → store → move → sell, escrow and ratings. What changed is **who it is for** and **how each feature fits perishables**.

| Area | FreshGrid | ChillChain |
| --- | --- | --- |
| Users | Staple-crop farmers selling at mandis | Growers/FPOs of exotic, short-window and export fruit, flowers, mushrooms, polyhouse greens; buyers are quick-commerce, retail, HoReCa, exporters, florists, processors |
| Brand | Wheat crest, tricolour | Your chain logo (leaf-green link + berry, chill-blue link + snowflake), logo colours across the app, new icons |
| Crops | Cereals, pulses, oilseeds, vegetables | 30 perishables, each with shelf-life hours open-air and in cold chain |
| Scan | A/B/C grade | Grade + **ripeness** + harvest time + cooled? → server-side **sell-by clock** and recommended route |
| Store | Cold rooms by the day | **Pre-coolers, cold rooms, ripening chambers**, booked **by the hour** or day |
| Move | Book a truck | **Shared reefer loads** (pay your share) and a **delivery deadline**; drivers take a whole pool |
| Sell | Mandi price + escrow | **Pre-orders before harvest**, **price steps down as a lot ages**, channels by grade (retail / flash / processor) |
| Advisor | FasalNiti (20 field crops, sowing season) | **ProfitPlanter** ("What should I plant?"): 15 high-value options by climate, water, payback, 5-year profit and indicative subsidy |
| Ratings | KrishiSaakh, grain-oriented questions | **ChillScore** (same engine): fresh-on-arrival, ventilated crates, chill injury, **delivered before deadline** |
| Assistant | Kisan Sahayak | Chill Sahayak, which knows the clocks and pre-orders |

## Files

- New: `neon/009_chillchain.sql`, `src/lib/shelf.ts`, `src/lib/advisor.ts`, `src/components/fg/SellClock.tsx`, `DemandTab.tsx`, `AdvisorTab.tsx`, tests `shelf.test.ts`, `advisor.test.ts`, icons `public/icon-192.png`, `public/icon-512.png`.
- Removed: `src/lib/fasalniti.ts`, `src/components/fg/FasalNitiTab.tsx`, its test, `public/favicon.ico`, the stray root `index.tsx`.
- Reworked: crops, scan, storage, trucks, buyer market, home, navigation, theme, logo, roles, onboarding, ratings text, assistant prompt, privacy text, docs.
