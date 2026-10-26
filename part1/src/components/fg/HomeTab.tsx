import { useMemo, useState } from "react";
import {
  BellRing,
  ChevronRight,
  Megaphone,
  ScanLine,
  Snowflake,
  Sprout,
  Timer,
  Truck,
} from "lucide-react";
import { cropBy, useStore, type Tab } from "@/lib/store";
import {
  useBookings,
  useFarm,
  useLivePrices,
  useLots,
  useMe,
  usePreorders,
  useRate,
  useScans,
  useSettings,
  useTransports,
} from "@/lib/data";
import { inr } from "@/lib/income";
import { rankOptions } from "@/lib/advisor";
import { ROUTE, hoursLeft } from "@/lib/shelf";
import { Badge, Empty, SectionTitle } from "./ui";
import { RatePrompt } from "./KrishiSaakh";
import { SellClock, useNow } from "./SellClock";
import { WeatherCard } from "./Weather";
import { Change, LivePricesSheet } from "./LivePrices";
import { priceChange } from "@/lib/prices";

/** Grower home: what must move today (sell-by clock), buyer demand, prices and everything in progress. */
export function HomeTab() {
  const { s, set, t } = useStore();
  const { data: me } = useMe();
  const st = useSettings();
  const rate = useRate();
  const live = useLivePrices(me?.profile?.state);
  const [pricesOpen, setPricesOpen] = useState<string | false>(false);
  const scans = useScans();
  const bookings = useBookings();
  const trips = useTransports();
  const lots = useLots();
  const pre = usePreorders();
  const farm = useFarm();
  const now = useNow();
  const go = (tab: Tab) => {
    set((x) => ({ ...x, tab }));
    window.scrollTo({ top: 0 });
  };
  const name = (k: string) => t(cropBy(k).en, cropBy(k).hi);

  const settings = st.data?.settings ?? {};
  const myCrops = settings.crops?.length ? settings.crops : ["strawberry", "dragon", "litchi"];
  const prices = myCrops.slice(0, 6).map((k) => ({ k, ...rate(k, cropBy(k).rate) }));
  const alerts = (settings.priceAlerts ?? [])
    .map((a) => ({ a, r: rate(a.crop, 0) }))
    .filter(({ a, r }) => r.live && (a.dir === "above" ? r.rate >= a.price : r.rate <= a.price));

  const uid = me?.profile?.id;
  const myLots = (lots.data ?? []).filter((l) => l.farmer_id === uid);
  // Everything with a running clock: scans not yet listed, and open lots. Most urgent first.
  const clocks = useMemo(() => {
    const listedScans = new Set(myLots.map((l) => l.scan_id).filter(Boolean));
    return [
      ...(scans.data ?? [])
        .filter((x) => x.sell_by && !listedScans.has(x.id))
        .map((x) => ({
          id: x.id,
          crop: x.crop,
          label: x.batch_code,
          sellBy: x.sell_by!,
          from: x.harvested_at ?? x.created_at,
          route: x.route,
          tab: "scan" as Tab,
        })),
      ...myLots
        .filter((l) => l.status === "open" && l.sell_by)
        .map((l) => ({
          id: l.id,
          crop: l.crop,
          label: `${l.lot_code} · ${t("on market", "बाज़ार में")}`,
          sellBy: l.sell_by!,
          from: l.created_at,
          route: null,
          tab: "demand" as Tab,
        })),
    ]
      .filter((c) => hoursLeft(c.sellBy, now) > -24)
      .sort((a, b) => new Date(a.sellBy).getTime() - new Date(b.sellBy).getTime());
  }, [scans.data, myLots, now, t]);

  const demand = (pre.data ?? []).filter(
    (p) => p.status === "open" && p.buyer_id !== uid && myCrops.includes(p.crop),
  );
  const activeBookings = (bookings.data ?? []).filter((b) => new Date(b.ends_at).getTime() > now);
  const activeTrips = (trips.data ?? []).filter(
    (x) => x.status === "requested" || x.status === "assigned" || x.status === "in_transit",
  );
  const escrow = myLots.filter((l) => l.status === "escrow").reduce((a, l) => a + l.net_amount, 0);
  const dues = (bookings.data ?? []).filter((b) => !b.paid).reduce((a, b) => a + b.amount, 0);
  const pick = useMemo(() => (farm.data ? (rankOptions(farm.data)[0] ?? null) : null), [farm.data]);

  // Same layout as before; colours are the iOS system tints.
  const actions: [Tab, typeof ScanLine, string, string, string][] = [
    [
      "scan",
      ScanLine,
      t("Scan a lot", "लॉट स्कैन"),
      t("Grade + sell-by clock", "ग्रेड + बिक्री घड़ी"),
      "bg-success/15 text-success",
    ],
    [
      "cold",
      Snowflake,
      t("Pre-cool / store", "प्री-कूल / भंडारण"),
      t("By the hour", "घंटे के हिसाब से"),
      "bg-primary/15 text-primary",
    ],
    [
      "transport",
      Truck,
      t("Reefer truck", "रीफ़र ट्रक"),
      t("Share a cold truck", "ठंडा ट्रक साझा करें"),
      "bg-warning/15 text-warning",
    ],
    [
      "demand",
      Megaphone,
      t("Buyer demand", "खरीदार माँग"),
      t("Lock a price early", "पहले भाव पक्का"),
      "bg-destructive/15 text-destructive",
    ],
  ];

  return (
    <div className="space-y-5">
      <SectionTitle
        title={t(
          `Namaste${me?.profile?.full_name ? `, ${me.profile.full_name.split(" ")[0]}` : ""}`,
          `नमस्ते${me?.profile?.full_name ? `, ${me.profile.full_name.split(" ")[0]}` : ""}`,
        )}
        sub={t(
          "Every hour counts. Here is what must move today.",
          "हर घंटा कीमती है। आज क्या निकालना है, यहाँ देखें।",
        )}
      />
      <RatePrompt />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map(([k, I, l, d, c]) => (
          <button
            key={k}
            onClick={() => go(k)}
            className="card-classic flex min-h-24 flex-col items-start gap-2 p-3 text-left active:opacity-70"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${c}`}>
              <I className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-foreground">{l}</span>
              <span className="block text-[13px] text-muted-foreground">{d}</span>
            </span>
          </button>
        ))}
      </div>

      <WeatherCard />

      <div className="card-classic overflow-hidden">
        <div className="p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Timer className="h-4 w-4 text-warning" />
            {t("Sell-by clock", "बिक्री घड़ी")}
          </p>
          {clocks.length === 0 ? (
            <Empty
              icon={ScanLine}
              title={t("No clocks running", "कोई घड़ी नहीं चल रही")}
              sub={t(
                "Scan a lot after harvest to see how many hours you have to sell it.",
                "तोड़ने के बाद लॉट स्कैन करें, बेचने के लिए बचे घंटे दिखेंगे।",
              )}
            />
          ) : (
            <div className="divide-y divide-border">
              {clocks.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c.tab)}
                  className="flex w-full flex-wrap items-center gap-2 py-2.5 text-left text-sm"
                >
                  <span className="text-xl">{cropBy(c.crop).emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{name(c.crop)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.label}
                      {c.route ? ` · ${t(ROUTE[c.route].en, ROUTE[c.route].hi)}` : ""}
                    </span>
                  </span>
                  <SellClock sellBy={c.sellBy} from={c.from} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => go("demand")}
        className="card-classic flex w-full items-center gap-3 p-4 text-left active:bg-secondary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-destructive/15 text-destructive">
          <Megaphone className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-xs font-medium text-destructive">
            {t("Buyer demand", "खरीदार की माँग")}
          </span>
          {demand.length ? (
            <span className="block text-sm text-foreground">
              <b>{demand.length}</b>{" "}
              {t("open pre-orders for your crops, e.g.", "आपकी फसलों के खुले प्री-ऑर्डर, जैसे")}{" "}
              <b>
                {cropBy(demand[0]!.crop).emoji} {demand[0]!.kg} kg @ ₹{demand[0]!.price_per_kg}
              </b>
            </span>
          ) : (
            <span className="block text-sm text-foreground">
              {t(
                "No pre-orders for your crops yet. Buyers post here before harvest.",
                "अभी आपकी फसलों के प्री-ऑर्डर नहीं। खरीदार तोड़ने से पहले यहाँ डालते हैं।",
              )}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(({ a, r }, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[14px] bg-warning/15 p-3 text-sm"
            >
              <BellRing className="h-5 w-5 shrink-0 text-warning" />
              <span className="flex-1 text-foreground">
                <b>
                  {cropBy(a.crop).emoji} {name(a.crop)} ₹{r.rate}/kg
                </b>{" "}
                {t(
                  `at ${r.market} is ${a.dir} your ₹${a.price} alert`,
                  `${r.market} में आपके ₹${a.price} अलर्ट से ${a.dir === "above" ? "ऊपर" : "नीचे"}`,
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card-classic p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold text-foreground">{t("Market rates", "बाज़ार भाव")}</p>
          <span className="text-[0.68rem] text-muted-foreground">
            {prices.some((p) => p.live)
              ? t("Live · Agmarknet", "लाइव · एगमार्कनेट")
              : t("indicative farm-gate", "अनुमानित खेत भाव")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {prices.map((p) => (
            <button
              key={p.k}
              onClick={() => setPricesOpen(p.k)}
              className="flex items-center gap-2 rounded-[10px] bg-secondary px-3 py-2 text-left active:opacity-70"
            >
              <span className="text-2xl">{cropBy(p.k).emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  ₹{p.rate}
                  <span className="text-xs font-normal">/kg</span>{" "}
                  {p.live && (
                    <Change pct={priceChange(live.data?.crops.find((c) => c.crop === p.k))} />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {name(p.k)}
                  {!p.live && " *"}
                </span>
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPricesOpen("")}
          className="mt-3 text-[15px] font-semibold text-primary active:opacity-60"
        >
          {t("All live mandi prices →", "सभी लाइव मंडी भाव →")}
        </button>
        {pricesOpen !== false && (
          <LivePricesSheet open onClose={() => setPricesOpen(false)} focus={pricesOpen || null} />
        )}
        {!settings.crops?.length && (
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {t(
              "Choose your crops in Settings → My farm.",
              "अपनी फसलें सेटिंग → मेरा खेत में चुनें।",
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            [t("In escrow", "एस्क्रो में"), inr(escrow), "pay"],
            [t("Storage dues", "भंडारण बकाया"), inr(dues), "pay"],
            [t("Active trips", "चालू ट्रिप"), String(activeTrips.length), "transport"],
          ] as const
        ).map(([l, v, tab]) => (
          <button
            key={l}
            onClick={() => go(tab)}
            className="card-classic p-3 text-center active:opacity-70"
          >
            <b className="block text-base text-foreground">{v}</b>
            <span className="text-[0.7rem] text-muted-foreground">{l}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => go("advisor")}
        className="card-classic flex w-full items-center gap-3 p-4 text-left active:bg-secondary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-success/15 text-success">
          <Sprout className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-xs font-medium text-success">
            {t("ProfitPlanter", "प्रॉफ़िटप्लांटर")}
          </span>
          {pick?.ok ? (
            <span className="block text-sm text-foreground">
              {t("Best fit for your farm:", "आपके खेत के लिए सबसे सही:")}{" "}
              <b>
                {pick.o.emoji} {t(pick.o.en, pick.o.hi)}
              </b>{" "}
              <Badge tone="green">{pick.score}/100</Badge>
            </span>
          ) : (
            <span className="block text-sm text-foreground">
              {t(
                "Tell us about your farm to see which high-value crop pays back fastest",
                "अपने खेत के बारे में बताएँ, देखें कौन सी ऊँचे दाम वाली फसल सबसे जल्दी वसूल होती है",
              )}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          {t("In progress", "चल रहा है")}
        </p>
        {activeBookings.length + activeTrips.length === 0 ? (
          <Empty
            icon={Snowflake}
            title={t("Nothing in progress", "अभी कुछ नहीं चल रहा")}
            sub={t(
              "Book storage or a reefer truck and it will show up here.",
              "भंडारण या रीफ़र ट्रक बुक करें, यहाँ दिखेगा।",
            )}
          />
        ) : (
          <div className="ios-list">
            {activeBookings.slice(0, 3).map((b) => (
              <button
                key={b.id}
                onClick={() => go("cold")}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm active:bg-secondary"
              >
                <Snowflake className="h-4 w-4 text-primary" />
                <span className="flex-1">
                  {b.pass_no} · {b.crates} {t("crates", "क्रेट")} {cropBy(b.crop).emoji}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {t("until", "तक")}{" "}
                    {new Date(b.ends_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                    })}
                  </span>
                </span>
                <Badge tone={b.paid ? "green" : "amber"}>
                  {b.paid ? t("Paid", "भुगतान") : t("Due", "बकाया")}
                </Badge>
              </button>
            ))}
            {activeTrips.slice(0, 3).map((x) => (
              <button
                key={x.id}
                onClick={() => go("transport")}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm active:bg-secondary"
              >
                <Truck className="h-4 w-4 text-warning" />
                <span className="flex-1">
                  {x.trip_code} · {x.from_district} → {x.to_label}
                </span>
                <Badge tone="gold">
                  {x.status === "requested"
                    ? t("Finding driver", "ड्राइवर खोज रहे")
                    : x.status === "assigned"
                      ? t("Driver assigned", "ड्राइवर तय")
                      : t("On the way", "रास्ते में")}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
