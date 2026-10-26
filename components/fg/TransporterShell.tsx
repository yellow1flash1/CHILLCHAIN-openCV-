import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock,
  IndianRupee,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  ShieldCheck,
  Snowflake,
  TrendingUp,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import {
  soundAllowed,
  useInvalidate,
  useMe,
  useSettings,
  useTransportMeta,
  useTransporterDashboard,
} from "@/lib/data";
import { useTabEvents } from "@/lib/nav";
import { inr } from "@/lib/income";
import type {
  DriverStats,
  DriverTrip,
  EarnPoint,
  NearbyTrip,
  Transporter,
  TransporterDashboard,
} from "@/lib/types";
import { Badge, Btn, Empty, Field, Label, Modal, SectionTitle, Skeleton, inputCls } from "./ui";
import { TopBar } from "./TopBar";
import { ChatPanel } from "./AssistTab";
import { langInfo } from "@/lib/i18n";
import { RatePrompt, RepsProvider, UserRep } from "./KrishiSaakh";

type DTab = "trips" | "pay" | "income" | "vehicle" | "help";
type Act = (fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 660;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.2);
    navigator.vibrate?.(150);
  } catch {
    /* browsers block sound until the user has tapped the page once */
  }
}

export function TransporterShell() {
  const { s, t } = useStore();
  const dash = useTransporterDashboard();
  const st = useSettings();
  const inv = useInvalidate();
  const [tab, setTab] = useState<DTab>("trips");
  const [err, setErr] = useState("");
  const [fresh, setFresh] = useState<NearbyTrip[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const desktop = s.mode === "desktop";
  const d = dash.data;

  // Alert the driver when a new request appears nearby.
  useEffect(() => {
    if (!d?.vehicle) return undefined;
    if (seen.current === null) {
      seen.current = new Set(d.nearby.map((x) => x.id));
      return undefined;
    }
    const added = d.nearby.filter((x) => !seen.current!.has(x.id));
    if (!added.length) return undefined;
    added.forEach((x) => seen.current!.add(x.id));
    setFresh((f) => [...added, ...f].slice(0, 3));
    if (soundAllowed(st.data?.settings)) beep();
    const h = setTimeout(() => setFresh([]), 20_000);
    return () => clearTimeout(h);
  }, [d]);

  useTabEvents(
    useCallback((k: string) => {
      if (["trips", "pay", "income", "vehicle", "help"].includes(k)) setTab(k as DTab);
    }, []),
  );
  const act: Act = async (fn) => {
    setErr("");
    const r = await fn();
    if (r.error) setErr(r.error.message);
    inv("driver");
  };

  const page = (children: ReactNode) => (
    <div className="min-h-screen">
      <TopBar />
      <div className={`mx-auto px-4 py-5 ${desktop ? "max-w-3xl" : "max-w-[680px]"}`}>
        {children}
      </div>
    </div>
  );
  if (dash.isError)
    return page(
      <div className="card-classic space-y-2 p-4 text-sm">
        <p className="font-semibold text-destructive">
          {t("Could not load your trips", "आपकी ट्रिप लोड नहीं हो सकीं")}
        </p>
        <p className="break-words text-xs text-muted-foreground">
          {(dash.error as Error)?.message}
        </p>
        <Btn className="w-full" onClick={() => dash.refetch()}>
          {t("Try again", "फिर कोशिश करें")}
        </Btn>
      </div>,
    );
  if (dash.isLoading || !d) return page(<Skeleton rows={4} />);
  if (!d.vehicle || !d.stats) return page(<VehicleSetup />);

  const tabs: {
    k: DTab;
    en: string;
    hi: string;
    shortEn: string;
    shortHi: string;
    I: typeof Truck;
    n?: number;
  }[] = [
    {
      k: "trips",
      en: "Trips",
      hi: "ट्रिप",
      shortEn: "Trips",
      shortHi: "ट्रिप",
      I: Truck,
      n: d.nearby.length,
    },
    {
      k: "pay",
      en: "Payments",
      hi: "भुगतान",
      shortEn: "Pay",
      shortHi: "भुगतान",
      I: IndianRupee,
      n: d.trips.filter((x) => x.status === "delivered" && !x.paid).length,
    },
    { k: "income", en: "Income", hi: "कमाई", shortEn: "Income", shortHi: "कमाई", I: TrendingUp },
    {
      k: "vehicle",
      en: "My vehicle",
      hi: "मेरी गाड़ी",
      shortEn: "Vehicle",
      shortHi: "गाड़ी",
      I: ShieldCheck,
    },
    {
      k: "help",
      en: "Safar assistant",
      hi: "सफ़र सहायक",
      shortEn: "Help",
      shortHi: "सहायक",
      I: Bot,
    },
  ];
  const go = (k: DTab) => {
    setTab(k);
    window.scrollTo({ top: 0 });
  };
  const count = (n?: number) =>
    n ? (
      <span className="ml-auto rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold text-primary-foreground">
        {n}
      </span>
    ) : null;

  return (
    <div className="min-h-screen">
      <TopBar />
      <div
        className={`mx-auto ${desktop ? "flex max-w-6xl gap-8 px-4 py-6" : "max-w-[680px] pb-[calc(96px+env(safe-area-inset-bottom))]"}`}
      >
        {desktop && (
          <nav className="sticky top-20 h-fit w-52 shrink-0" aria-label={t("Sections", "भाग")}>
            {tabs.map(({ k, en, hi, I, n }) => (
              <button
                key={k}
                onClick={() => go(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${tab === k ? "bg-secondary font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <I className="h-4 w-4 shrink-0" />
                {t(en, hi)}
                {count(n)}
              </button>
            ))}
          </nav>
        )}
        <main className={`min-w-0 flex-1 ${desktop ? "" : "px-4 pt-5"}`}>
          <RepsProvider
            ids={[...d.nearby.map((x) => x.farmer_id), ...d.trips.map((x) => x.farmer_id)]}
          >
            <RatePrompt />
            {fresh.length > 0 && (
              <div className="mb-3 space-y-2" role="status" aria-live="polite">
                {fresh.map((x) => (
                  <div
                    key={x.id}
                    className="flex items-start gap-2 rounded-lg border border-primary/30 bg-accent p-3 text-sm"
                  >
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="flex-1">
                      <b>{t("New load nearby", "पास में नया माल")}</b>
                      <br />
                      {x.kg} kg {cropBy(x.crop).en} · {x.from_district} → {x.to_label} ·{" "}
                      {inr(x.amount)}
                    </div>
                    <button
                      className="text-xs font-semibold text-primary"
                      onClick={() => {
                        setFresh((f) => f.filter((y) => y.id !== x.id));
                        go("trips");
                      }}
                    >
                      {t("View", "देखें")}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {err && (
              <p className="mb-3 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </p>
            )}
            {tab === "trips" && (
              <TripsView
                d={{ ...d, vehicle: d.vehicle, stats: d.stats }}
                act={act}
                updatedAt={dash.dataUpdatedAt}
              />
            )}
            {tab === "pay" && <PayView trips={d.trips} vehicle={d.vehicle} act={act} />}
            {tab === "income" && <IncomeView stats={d.stats} chart={d.chart} trips={d.trips} />}
            {tab === "vehicle" && <VehicleView v={d.vehicle} />}
            {tab === "help" && <DriverAssist d={d} />}
          </RepsProvider>
        </main>
      </div>
      {!desktop && (
        <nav
          className="ios-bar fixed inset-x-0 bottom-0 z-40 border-t-[0.5px] border-border pb-[env(safe-area-inset-bottom)]"
          aria-label={t("Sections", "भाग")}
        >
          <div className="mx-auto grid max-w-[680px] grid-cols-5">
            {tabs.map(({ k, shortEn, shortHi, I, n }) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => go(k)}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[49px] flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium ${on ? "text-primary" : "text-muted-foreground"}`}
                >
                  <span className="relative">
                    <I className="h-[26px] w-[26px]" strokeWidth={on ? 2.2 : 1.8} />
                    {n ? (
                      <span className="absolute -right-2.5 -top-1 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                        {n}
                      </span>
                    ) : null}
                  </span>
                  <span className="leading-none">{t(shortEn, shortHi)}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/* ---------------- Trips ---------------- */
function TripsView({
  d,
  act,
  updatedAt,
}: {
  d: TransporterDashboard & { vehicle: Transporter; stats: DriverStats };
  act: Act;
  updatedAt: number;
}) {
  const { t } = useStore();
  const meta = useTransportMeta();
  const vName =
    meta.data?.vehicles.find((v) => v.key === d.vehicle.vehicle_key)?.name ?? d.vehicle.vehicle_key;
  const active = d.trips.filter((x) => x.status === "assigned" || x.status === "in_transit");
  const [gate, setGate] = useState<NearbyTrip | null>(null);
  const needsDocs = !d.vehicle.docs_submitted_at;
  const st = useSettings();
  const inv = useInvalidate();
  const online = st.data?.available ?? true;
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Truck}
        title={t("Trips", "ट्रिप")}
        sub={
          online
            ? t("Online: new loads near you appear here", "ऑनलाइन: पास का नया माल यहाँ दिखेगा")
            : t("Offline: you won't get new loads", "ऑफ़लाइन: नया माल नहीं मिलेगा")
        }
        right={
          <button
            onClick={async () => {
              await api.setAvailability(!online);
              inv("settings", "driver");
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${online ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
          >
            {online ? t("● Online", "● ऑनलाइन") : t("○ Offline", "○ ऑफ़लाइन")}
          </button>
        }
      />
      {needsDocs && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {t("Verification pending", "सत्यापन बाकी")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "You can browse loads now. Add your RC, licence, insurance and fitness details before accepting a trip.",
                "आप अभी माल देख सकते हैं। ट्रिप लेने से पहले RC, लाइसेंस, बीमा और फिटनेस जोड़ें।",
              )}
            </p>
          </div>
        </div>
      )}
      <Modal
        open={!!gate}
        onClose={() => setGate(null)}
        title={t("Verify to accept this trip", "ट्रिप लेने के लिए सत्यापन करें")}
      >
        <p className="mb-3 text-sm text-muted-foreground">
          {t(
            "Farmers trust verified drivers with their harvest. Add your documents once and you can accept any trip.",
            "किसान सत्यापित ड्राइवरों पर भरोसा करते हैं। एक बार दस्तावेज़ जोड़ें, फिर कोई भी ट्रिप लें।",
          )}
        </p>
        <DocsForm
          submitLabel={t("Verify and accept trip", "सत्यापित करें और ट्रिप लें")}
          onDone={async () => {
            const g = gate;
            setGate(null);
            if (g) await act(() => api.acceptTrip(g.id));
          }}
        />
      </Modal>
      <div className="card-classic p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-semibold text-foreground">
              {d.vehicle.vehicle_no}
            </p>
            <p className="text-xs text-muted-foreground">
              {vName} · {qtl(d.vehicle.capacity_kg)}
              {d.vehicle.has_reefer ? ` · ${t("Reefer", "रीफ़र")}` : ""} · {d.vehicle.base_district}
            </p>
          </div>
          <VerifyBadge v={d.vehicle} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base text-primary">{d.nearby.length}</b>
            {t("loads nearby", "पास में माल")}
          </div>
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base">{d.stats.active}</b>
            {t("active trips", "चालू ट्रिप")}
          </div>
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base text-success">{inr(d.stats.earned_month)}</b>
            {t("this month", "इस महीने")}
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          {t("Online · updated", "ऑनलाइन · अपडेट")}{" "}
          {new Date(updatedAt).toLocaleTimeString("en-IN")}
        </p>
      </div>

      {active.length > 0 && (
        <div>
          <Label>{t("Your active trips", "आपकी चालू ट्रिप")}</Label>
          <div className="space-y-3">
            {active.map((x) => (
              <ActiveTrip key={x.id} x={x} act={act} />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>
          {t(
            `Loads near you (within ${d.vehicle.radius_km} km)`,
            `आपके पास का माल (${d.vehicle.radius_km} किमी तक)`,
          )}
        </Label>
        {d.nearby.length === 0 && (
          <Empty
            icon={Truck}
            title={
              online
                ? t("No loads near you right now", "अभी पास में कोई माल नहीं")
                : t("You are offline", "आप ऑफ़लाइन हैं")
            }
            sub={
              online
                ? t(
                    "New requests appear here automatically, with a sound. A bigger radius in My vehicle shows more loads.",
                    "नई बुकिंग आवाज़ के साथ अपने-आप दिखेगी। मेरी गाड़ी में दायरा बढ़ाने से ज़्यादा माल दिखेगा।",
                  )
                : t("Go online to see loads near you.", "पास का माल देखने के लिए ऑनलाइन हों।")
            }
          />
        )}
        <div className="space-y-3">
          {d.nearby.map((x) => (
            <NearbyCard
              key={x.id}
              x={x}
              act={act}
              onNeedDocs={needsDocs ? () => setGate(x) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Route({ from, to, km }: { from: string; to: string; km: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-medium text-foreground">{from}</span>
      <span className="h-px flex-1 border-t border-dashed border-border" />
      <span className="shrink-0 text-xs text-muted-foreground">{km} km</span>
      <span className="h-px flex-1 border-t border-dashed border-border" />
      <span className="truncate font-medium text-foreground">{to}</span>
    </div>
  );
}

function NearbyCard({
  x,
  act,
  onNeedDocs,
}: {
  x: NearbyTrip;
  act: Act;
  onNeedDocs?: (() => void) | undefined;
}) {
  const { t } = useStore();
  const [busy, setBusy] = useState(false);
  const c = cropBy(x.crop);
  return (
    <div className="card-classic p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {c.emoji} {x.kg.toLocaleString("en-IN")} kg {c.en}
          </p>
          <p className="text-xs text-muted-foreground">
            {x.trip_code} · {t("pickup", "पिकअप")} {x.pickup_km} km {t("from you", "आपसे")}
          </p>
          <div className="mt-1">
            <UserRep id={x.farmer_id} flow={3} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-success">{inr(x.amount)}</p>
          <p className="text-[0.68rem] text-muted-foreground">
            {t("estimated fare", "अनुमानित भाड़ा")}
          </p>
        </div>
      </div>
      <Route from={x.from_district} to={x.to_label} km={x.distance_km} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="muted">
          <CalendarDays className="h-3.5 w-3.5" />
          {fmtDate(x.pickup_date)}
        </Badge>
        {x.reefer && (
          <Badge tone="gold">
            <Snowflake className="h-3.5 w-3.5" />
            {t("Cold chain", "ठंडा वाहन")}
          </Badge>
        )}
        {x.pool_code && (
          <Badge tone="green">
            {t("Shared load", "साझा लोड")} {x.pool_code}
          </Badge>
        )}
        <Deadline at={x.deliver_by} />
      </div>
      {x.pool_code && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          {t(
            "Accepting takes every booking in this shared load (same route and day).",
            "स्वीकार करने पर इस साझा लोड की सभी बुकिंग आपकी होंगी (एक रास्ता, एक दिन)।",
          )}
        </p>
      )}
      {x.notes && (
        <p className="mt-2 rounded bg-popover px-2 py-1.5 text-xs text-muted-foreground">
          “{x.notes}”
        </p>
      )}
      <Btn
        className="mt-3 w-full"
        disabled={busy}
        onClick={async () => {
          if (onNeedDocs) return onNeedDocs();
          setBusy(true);
          await act(() => api.acceptTrip(x.id));
          setBusy(false);
        }}
      >
        <CheckCircle2 className="h-4 w-4" />
        {busy ? t("Accepting…", "स्वीकार हो रहा है…") : t("Accept trip", "ट्रिप स्वीकार करें")}
      </Btn>
    </div>
  );
}

/** "Deliver by Fri 6 PM": red once it is less than 6 hours away. */
function Deadline({ at }: { at: string | null }) {
  const { t } = useStore();
  if (!at) return null;
  const left = (new Date(at).getTime() - Date.now()) / 3_600_000;
  return (
    <Badge tone={left < 6 ? "red" : "amber"}>
      <Clock className="h-3.5 w-3.5" />
      {t("Deliver by", "पहुँचाएँ")}{" "}
      {new Date(at).toLocaleString("en-IN", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })}
    </Badge>
  );
}

const STEPS = ["assigned", "in_transit", "delivered"] as const;
function ActiveTrip({ x, act }: { x: DriverTrip; act: Act }) {
  const { t } = useStore();
  const c = cropBy(x.crop);
  const step = STEPS.indexOf(x.status as (typeof STEPS)[number]);
  const labels = [t("Accepted", "स्वीकार"), t("Picked up", "माल लिया"), t("Delivered", "पहुँचाया")];
  return (
    <div className="card-classic border-primary/30 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {c.emoji} {x.kg.toLocaleString("en-IN")} kg {c.en}
          </p>
          <p className="text-xs text-muted-foreground">
            {x.trip_code} · {t("pickup", "पिकअप")} {fmtDate(x.pickup_date)}
          </p>
        </div>
        <p className="text-lg font-semibold text-foreground">{inr(x.amount)}</p>
      </div>
      <Route from={x.from_district} to={x.to_label} km={x.distance_km} />
      {(x.pool_code || x.deliver_by) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {x.pool_code && (
            <Badge tone="green">
              {t("Shared load", "साझा लोड")} {x.pool_code}
            </Badge>
          )}
          <Deadline at={x.deliver_by} />
        </div>
      )}
      <ol className="my-3 grid grid-cols-3 gap-1 text-center text-[0.68rem]">
        {labels.map((l, i) => (
          <li
            key={l}
            className={`rounded-md py-1 ${i <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {l}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {x.farmer_name || t("Farmer", "किसान")}
          {x.farmer_village ? `, ${x.farmer_village}` : ""}
        </span>
        <UserRep id={x.farmer_id} flow={3} />
        {x.farmer_phone && (
          <a
            href={`tel:${x.farmer_phone}`}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary"
          >
            <Phone className="h-3.5 w-3.5" />
            {t("Call", "कॉल")}
          </a>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(x.status === "assigned" ? x.from_district : x.to_label)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary"
        >
          <Navigation className="h-3.5 w-3.5" />
          {t("Directions", "रास्ता")}
        </a>
      </div>
      <div className="mt-3 flex gap-2">
        {x.status === "assigned" && (
          <>
            <Btn
              className="flex-1"
              onClick={() => act(() => api.driverSetStatus(x.id, "in_transit"))}
            >
              <Truck className="h-4 w-4" />
              {t("Picked up, start trip", "माल लिया, ट्रिप शुरू")}
            </Btn>
            <Btn
              v="outline"
              onClick={() => {
                if (
                  confirm(
                    t(
                      "Give this trip back so another driver can take it?",
                      "यह ट्रिप वापस करें ताकि दूसरा ड्राइवर ले सके?",
                    ),
                  )
                )
                  act(() => api.driverSetStatus(x.id, "requested"));
              }}
            >
              <Undo2 className="h-4 w-4" />
              {t("Give back", "वापस करें")}
            </Btn>
          </>
        )}
        {x.status === "in_transit" && (
          <Btn className="flex-1" onClick={() => act(() => api.driverSetStatus(x.id, "delivered"))}>
            <PackageCheck className="h-4 w-4" />
            {t("Mark delivered", "डिलीवर हो गया")}
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ---------------- Payments ---------------- */
function PayView({ trips, vehicle, act }: { trips: DriverTrip[]; vehicle: Transporter; act: Act }) {
  const { t } = useStore();
  const { data: me } = useMe();
  const upi = me?.profile?.upi_id ?? "";
  const due = trips.filter((x) => x.status === "delivered" && !x.paid);
  const paid = trips.filter((x) => x.paid);
  const [qr, setQr] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={IndianRupee}
        title={t("Payments", "भुगतान")}
        sub={t(
          "Collect the fare after delivery by UPI or cash",
          "डिलीवरी के बाद UPI या नकद से भाड़ा लें",
        )}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="card-classic p-3 text-center">
          <Wallet className="mx-auto mb-1 h-4 w-4 text-warning" />
          <b className="block">{inr(due.reduce((a, x) => a + x.amount, 0))}</b>
          <span className="text-[0.68rem] text-muted-foreground">
            {t("to collect", "लेना बाकी")} · {due.length}
          </span>
        </div>
        <div className="card-classic p-3 text-center">
          <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-success" />
          <b className="block">{inr(paid.reduce((a, x) => a + x.amount, 0))}</b>
          <span className="text-[0.68rem] text-muted-foreground">
            {t("received", "मिल गया")} · {paid.length}
          </span>
        </div>
      </div>

      <div>
        <Label>{t("To collect", "लेना बाकी")}</Label>
        {due.length === 0 && (
          <p className="card-classic p-4 text-center text-sm text-muted-foreground">
            {t(
              "Nothing to collect. Delivered trips that are not paid yet show here.",
              "कुछ बाकी नहीं। बिना भुगतान वाली डिलीवरी यहाँ दिखेंगी।",
            )}
          </p>
        )}
        <div className="space-y-3">
          {due.map((x) => (
            <div key={x.id} className="card-classic p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {x.trip_code} · {x.farmer_name || t("Farmer", "किसान")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {x.from_district} → {x.to_label} · {t("delivered", "पहुँचाया")}{" "}
                    {x.delivered_at ? fmtTime(x.delivered_at) : ""}
                  </p>
                </div>
                <p className="text-lg font-semibold">{inr(x.amount)}</p>
              </div>
              {qr === x.id && (
                <div className="mt-3 flex flex-col items-center rounded-lg border border-border bg-popover p-3">
                  {upi ? (
                    <>
                      <QRCodeSVG
                        value={`upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(vehicle.name)}&am=${x.amount}&cu=INR&tn=${encodeURIComponent(`ChillChain ${x.trip_code}`)}`}
                        size={170}
                        fgColor="#1B4332"
                        bgColor="transparent"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {upi} ·{" "}
                        {t(
                          "ask the farmer to scan with any UPI app",
                          "किसान किसी भी UPI ऐप से स्कैन करें",
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-destructive">
                      {t(
                        "Add your UPI ID in your profile first.",
                        "पहले प्रोफ़ाइल में UPI ID जोड़ें।",
                      )}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Btn
                  v="outline"
                  className="px-2 text-xs"
                  onClick={() => setQr(qr === x.id ? null : x.id)}
                >
                  {qr === x.id ? t("Hide QR", "QR छिपाएँ") : t("Show UPI QR", "UPI QR")}
                </Btn>
                <Btn
                  className="px-2 text-xs"
                  onClick={() => act(() => api.driverMarkPaid(x.id, "UPI"))}
                >
                  {t("Got UPI", "UPI मिला")}
                </Btn>
                <Btn
                  v="gold"
                  className="px-2 text-xs"
                  onClick={() => act(() => api.driverMarkPaid(x.id, "Cash"))}
                >
                  {t("Got cash", "नकद मिला")}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("Received", "मिल गया")}</Label>
        {paid.length === 0 && (
          <p className="card-classic p-4 text-center text-sm text-muted-foreground">
            {t("No payments yet.", "अभी कोई भुगतान नहीं।")}
          </p>
        )}
        <div className="ios-list">
          {paid.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{x.trip_code}</p>
                <p className="text-xs text-muted-foreground">
                  {x.from_district} → {x.to_label} · {x.paid_at ? fmtDate(x.paid_at) : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-success">+{inr(x.amount)}</p>
                <Badge tone="muted">{x.pay_method}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Income ---------------- */
function IncomeView({
  stats,
  chart,
  trips,
}: {
  stats: DriverStats;
  chart: EarnPoint[];
  trips: DriverTrip[];
}) {
  const { t } = useStore();
  const perTrip = stats.trips_done ? Math.round(stats.earned_total / stats.trips_done) : 0;
  const perKm = stats.km_done
    ? trips.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0) / stats.km_done
    : 0;
  const tiles: [string, string][] = [
    [t("This month", "इस महीने"), inr(stats.earned_month)],
    [t("Total earned", "कुल कमाई"), inr(stats.earned_total)],
    [t("To collect", "लेना बाकी"), inr(stats.pending)],
    [t("Trips done", "पूरी ट्रिप"), String(stats.trips_done)],
    [t("Km driven", "किमी चले"), stats.km_done.toLocaleString("en-IN")],
    [t("Avg per trip", "प्रति ट्रिप"), inr(perTrip)],
  ];
  return (
    <div className="space-y-4">
      <SectionTitle
        icon={TrendingUp}
        title={t("Income", "कमाई")}
        sub={t("Fares you have received through ChillChain", "ChillChain से मिला भाड़ा")}
      />
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([l, v]) => (
          <div key={l} className="card-classic p-3 text-center">
            <b className="block text-sm text-foreground">{v}</b>
            <span className="text-[0.68rem] text-muted-foreground">{l}</span>
          </div>
        ))}
      </div>
      <div className="card-classic p-4">
        <Label>{t("Received, last 7 days", "पिछले 7 दिन में मिला")}</Label>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis width={40} tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip formatter={(v) => inr(Number(v))} />
              <Bar
                dataKey="amount"
                fill="currentColor"
                className="text-primary"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {perKm > 0 && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {t(
            `You earn about ₹${perKm.toFixed(1)} per km on paid trips. Subtract diesel and tolls to see your profit.`,
            `भुगतान वाली ट्रिप में लगभग ₹${perKm.toFixed(1)} प्रति किमी। डीज़ल और टोल घटाकर मुनाफ़ा देखें।`,
          )}
        </p>
      )}
    </div>
  );
}

/* ---------------- Vehicle ---------------- */
const qtl = (kg: number) =>
  kg >= 1000
    ? `${(kg / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} t`
    : `${(kg / 100).toLocaleString("en-IN", { maximumFractionDigits: 1 })} qtl`;

function VerifyBadge({ v }: { v: Transporter }) {
  const { t } = useStore();
  if (v.verified)
    return (
      <Badge tone="green">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("Verified", "सत्यापित")}
      </Badge>
    );
  if (v.docs_submitted_at)
    return (
      <Badge tone="amber">
        <CircleDashed className="h-3.5 w-3.5" />
        {t("In review", "जाँच जारी")}
      </Badge>
    );
  return (
    <Badge tone="amber">
      <CircleDashed className="h-3.5 w-3.5" />
      {t("Verification pending", "सत्यापन बाकी")}
    </Badge>
  );
}

function VehicleView({ v }: { v: Transporter }) {
  const { t } = useStore();
  const meta = useTransportMeta();
  const [edit, setEdit] = useState<"basic" | "docs" | null>(null);
  if (edit === "basic") return <VehicleSetup current={v} onDone={() => setEdit(null)} />;
  const vName = meta.data?.vehicles.find((x) => x.key === v.vehicle_key)?.name ?? v.vehicle_key;
  const mask = (x: string | null) => (x ? `${x.slice(0, 4)}••••${x.slice(-3)}` : "—");
  const rows: [string, string][] = [
    [t("Vehicle number", "गाड़ी नंबर"), v.vehicle_no ?? "—"],
    [t("Type", "प्रकार"), vName],
    [t("Payload capacity", "भार क्षमता"), qtl(v.capacity_kg)],
    [t("Refrigerated", "ठंडा (रीफ़र)"), v.has_reefer ? t("Yes", "हाँ") : t("No", "नहीं")],
    [t("Base district", "मुख्य ज़िला"), v.base_district ?? "—"],
    [t("Operating radius", "काम का दायरा"), `${v.radius_km} km`],
  ];
  const docs: [string, string][] = [
    [t("RC number", "RC नंबर"), mask(v.rc_number)],
    [t("Driving licence", "ड्राइविंग लाइसेंस"), mask(v.licence_number)],
    [t("Insurance policy", "बीमा पॉलिसी"), mask(v.insurance_number)],
    [t("Fitness certificate", "फिटनेस प्रमाणपत्र"), mask(v.fitness_number)],
    ["Aadhaar", v.aadhaar_last4 ? `•••• •••• ${v.aadhaar_last4}` : "—"],
  ];
  const box = v.verified
    ? [
        "bg-success/10 text-success",
        t(
          "Verified by ChillChain. Farmers see a verified badge on your trips.",
          "ChillChain द्वारा सत्यापित। किसानों को आपकी ट्रिप पर सत्यापित बैज दिखेगा।",
        ),
      ]
    : v.docs_submitted_at
      ? [
          "bg-warning/10 text-warning",
          t(
            "Documents received. ChillChain checks them within 24 hours; you can already accept trips.",
            "दस्तावेज़ मिल गए। ChillChain 24 घंटे में जाँच करेगा; आप अभी भी ट्रिप ले सकते हैं।",
          ),
        ]
      : [
          "bg-warning/10 text-warning",
          t(
            "Verification pending. You can browse loads, but you need to add documents before accepting a trip.",
            "सत्यापन बाकी है। माल देख सकते हैं, पर ट्रिप लेने से पहले दस्तावेज़ जोड़ें।",
          ),
        ];
  return (
    <div className="space-y-4">
      <SectionTitle
        icon={ShieldCheck}
        title={t("My vehicle", "मेरी गाड़ी")}
        sub={t("Your registered truck and documents", "आपकी दर्ज गाड़ी और दस्तावेज़")}
      />
      <div className={`flex items-start gap-3 rounded-lg p-3 text-sm ${box[0]}`}>
        {v.verified ? (
          <ShieldCheck className="h-5 w-5 shrink-0" />
        ) : (
          <CircleDashed className="h-5 w-5 shrink-0" />
        )}
        <p>{box[1]}</p>
      </div>
      <div className="ios-list">
        {rows.map(([l, val]) => (
          <div key={l} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{l}</span>
            <span className="text-right font-medium text-foreground">{val}</span>
          </div>
        ))}
      </div>
      <Btn v="outline" className="w-full" onClick={() => setEdit("basic")}>
        {t("Edit vehicle details", "गाड़ी की जानकारी बदलें")}
      </Btn>

      <div>
        <Label>{t("Verification documents", "सत्यापन दस्तावेज़")}</Label>
        {edit === "docs" || !v.docs_submitted_at ? (
          <div className="card-classic p-4">
            <DocsForm
              submitLabel={t("Submit for verification", "जाँच के लिए भेजें")}
              onDone={() => setEdit(null)}
              onCancel={v.docs_submitted_at ? () => setEdit(null) : undefined}
            />
          </div>
        ) : (
          <>
            <div className="ios-list">
              {docs.map(([l, val]) => (
                <div key={l} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="text-right font-medium text-foreground">{val}</span>
                </div>
              ))}
            </div>
            <Btn v="ghost" className="mt-2 w-full" onClick={() => setEdit("docs")}>
              {t("Update documents", "दस्तावेज़ बदलें")}
            </Btn>
            <p className="text-center text-[0.7rem] text-muted-foreground">
              {t(
                "Changing documents sends your vehicle for verification again.",
                "दस्तावेज़ बदलने पर दोबारा जाँच होगी।",
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Verhoeff checksum: every real Aadhaar number passes it, so typos are caught before submitting.
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const aadhaarOk = (n: string) =>
  /^[2-9]\d{11}$/.test(n) &&
  n
    .split("")
    .reverse()
    .reduce((c, d, i) => VD[c]![VP[i % 8]![+d]!]!, 0) === 0;
const VEHICLE_RE = /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{4}$/;
const DL_RE = /^[A-Z]{2}[ -]?\d{2}[ -]?\d{4}[ -]?\d{7}$/;
const RADII = [25, 50, 100, 150, 250, 400];

/* ---------------- Basic vehicle setup (documents can wait) ---------------- */
function VehicleSetup({ current, onDone }: { current?: Transporter; onDone?: () => void }) {
  const { t } = useStore();
  const { data: me } = useMe();
  const meta = useTransportMeta();
  const inv = useInvalidate();
  const vehicles = meta.data?.vehicles ?? [];
  const districts = meta.data?.districts ?? [];
  const states = useMemo(() => [...new Set(districts.map((x) => x.state))], [districts]);
  const [f, setF] = useState({
    vehicle: current?.vehicle_key ?? "",
    vehicleNo: current?.vehicle_no ?? "",
    capacity: current
      ? String(current.capacity_kg >= 1000 ? current.capacity_kg / 1000 : current.capacity_kg / 100)
      : "",
    unit: (current && current.capacity_kg < 1000 ? "qtl" : "t") as "qtl" | "t",
    reefer: current?.has_reefer ?? false,
    state: me?.profile?.state ?? "Haryana",
    district: current?.base_district ?? me?.profile?.district ?? "Sonipat",
    radius: current?.radius_km ?? 100,
  });
  const [step, setStep] = useState<"basic" | "docs">("basic");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const u = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    // keep the state in sync with the chosen district once the list has loaded
    const st = districts.find((x) => x.name === f.district)?.state;
    if (st && st !== f.state) setF((p) => ({ ...p, state: st }));
  }, [districts]); // eslint-disable-line react-hooks/exhaustive-deps

  const type = vehicles.find((v) => v.key === f.vehicle);
  const kg = Math.round((parseFloat(f.capacity) || 0) * (f.unit === "t" ? 1000 : 100));
  const pickType = (k: string) => {
    const v = vehicles.find((x) => x.key === k);
    setF((p) => ({
      ...p,
      vehicle: k,
      reefer: k === "reefer" ? true : p.reefer,
      ...(v
        ? {
            capacity: String(v.capacity_kg >= 1000 ? v.capacity_kg / 1000 : v.capacity_kg / 100),
            unit: v.capacity_kg >= 1000 ? ("t" as const) : ("qtl" as const),
          }
        : {}),
    }));
  };

  const save = async (then: "docs" | "done") => {
    const vno = f.vehicleNo.toUpperCase().trim();
    if (!f.vehicle) return setErr(t("Choose your vehicle type", "गाड़ी का प्रकार चुनें"));
    if (!VEHICLE_RE.test(vno))
      return setErr(
        t(
          "Enter the registration number like HR 26 AB 1234",
          "रजिस्ट्रेशन नंबर ऐसे डालें: HR 26 AB 1234",
        ),
      );
    if (kg < 100 || kg > 40000)
      return setErr(
        t(
          "Payload must be between 1 quintal and 40 tonnes",
          "भार क्षमता 1 क्विंटल से 40 टन के बीच हो",
        ),
      );
    if (!f.district) return setErr(t("Choose your base district", "मुख्य ज़िला चुनें"));
    const name = me?.profile?.full_name?.trim() || current?.name || "";
    const phone = me?.profile?.phone || current?.phone || "";
    setErr("");
    setBusy(true);
    const r = await api.registerVehicle({
      name,
      phone,
      vehicle: f.vehicle,
      vehicleNo: vno,
      district: f.district,
      capacity: kg,
      reefer: f.reefer,
      radius: f.radius,
    });
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    if (then === "docs") return setStep("docs");
    inv("driver");
    onDone?.();
  };

  if (step === "docs")
    return (
      <div>
        <SectionTitle
          icon={ShieldCheck}
          title={t("Verify your documents", "दस्तावेज़ सत्यापित करें")}
          sub={t(
            "Step 2 of 2 · needed before you accept your first trip",
            "चरण 2/2 · पहली ट्रिप लेने से पहले ज़रूरी",
          )}
        />
        <div className="card-classic p-4">
          <DocsForm
            submitLabel={t("Verify and continue", "सत्यापित करें और आगे बढ़ें")}
            onDone={() => {
              inv("driver");
              onDone?.();
            }}
            onCancel={() => {
              inv("driver");
              onDone?.();
            }}
            cancelLabel={t("Verify later", "बाद में सत्यापित करें")}
          />
        </div>
      </div>
    );

  return (
    <div>
      <SectionTitle
        icon={Truck}
        title={
          current
            ? t("Edit your vehicle", "गाड़ी की जानकारी बदलें")
            : t("Add your vehicle", "अपनी गाड़ी जोड़ें")
        }
        {...(current
          ? {}
          : { sub: t("Step 1 of 2 · takes less than a minute", "चरण 1/2 · एक मिनट से कम") })}
      />
      <div className="card-classic space-y-4 p-4">
        <Field label={t("Vehicle type *", "गाड़ी का प्रकार *")}>
          <select className={inputCls} value={f.vehicle} onChange={(e) => pickType(e.target.value)}>
            <option value="" disabled>
              {t("Choose vehicle type", "गाड़ी का प्रकार चुनें")}
            </option>
            {vehicles.map((v) => (
              <option key={v.key} value={v.key}>
                {t(v.name, v.name_hi ?? v.name)} · {t("up to", "तक")} {qtl(v.capacity_kg)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Vehicle registration number *", "गाड़ी रजिस्ट्रेशन नंबर *")}>
          <input
            className={`${inputCls} uppercase`}
            maxLength={14}
            value={f.vehicleNo}
            onChange={(e) => u("vehicleNo", e.target.value)}
            placeholder="HR 26 AB 1234"
          />
        </Field>
        <Field label={t("Payload capacity *", "भार क्षमता *")}>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              className={inputCls}
              value={f.capacity}
              onChange={(e) => u("capacity", e.target.value)}
              placeholder={type ? String(type.capacity_kg / 1000) : "6"}
            />
            <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-[9px] bg-secondary p-0.5">
              {(["qtl", "t"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => {
                    if (x !== f.unit)
                      setF((p) => ({
                        ...p,
                        unit: x,
                        capacity: p.capacity
                          ? String(x === "t" ? +p.capacity / 10 : +p.capacity * 10)
                          : "",
                      }));
                  }}
                  className={`rounded-md px-3 text-sm ${f.unit === x ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {x === "qtl" ? t("Quintal", "क्विंटल") : t("Tonne", "टन")}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.reefer}
            disabled={f.vehicle === "reefer"}
            onChange={(e) => u("reefer", e.target.checked)}
          />
          <Snowflake className="h-4 w-4 text-primary" />
          {t("Refrigerated / insulated body", "ठंडी / इंसुलेटेड बॉडी")}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("State", "राज्य")}>
            <select
              className={inputCls}
              value={f.state}
              onChange={(e) =>
                setF((p) => ({
                  ...p,
                  state: e.target.value,
                  district: districts.find((x) => x.state === e.target.value)?.name ?? "",
                }))
              }
            >
              {states.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Base location *", "मुख्य स्थान *")}>
            <select
              className={inputCls}
              value={f.district}
              onChange={(e) => u("district", e.target.value)}
            >
              {districts
                .filter((x) => x.state === f.state)
                .map((x) => (
                  <option key={x.name}>{x.name}</option>
                ))}
            </select>
          </Field>
        </div>
        <div>
          <Label>{t("Operating radius *", "काम का दायरा *")}</Label>
          <div className="grid grid-cols-6 gap-1">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => u("radius", r)}
                className={`rounded-lg border py-2 text-xs font-medium ${f.radius === r ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
        {current ? (
          <div className="flex gap-2">
            <Btn v="outline" onClick={onDone}>
              {t("Cancel", "रद्द करें")}
            </Btn>
            <Btn className="flex-1" disabled={busy} onClick={() => save("done")}>
              {t("Save changes", "बदलाव सेव करें")}
            </Btn>
          </div>
        ) : (
          <div className="space-y-2">
            <Btn className="w-full" disabled={busy} onClick={() => save("docs")}>
              <ShieldCheck className="h-4 w-4" />
              {t("Save and verify documents", "सेव करें और दस्तावेज़ सत्यापित करें")}
            </Btn>
            <Btn v="outline" className="w-full" disabled={busy} onClick={() => save("done")}>
              {t("Verify later, show me loads", "बाद में सत्यापन, अभी माल दिखाएँ")}
            </Btn>
            <p className="text-center text-[0.7rem] text-muted-foreground">
              {t(
                "You can browse loads right away. Documents are needed only before you accept a trip.",
                "आप तुरंत माल देख सकते हैं। दस्तावेज़ सिर्फ़ ट्रिप लेने से पहले चाहिए।",
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Documents (RC, DL, insurance, fitness, Aadhaar) ---------------- */
function DocsForm({
  submitLabel,
  onDone,
  onCancel,
  cancelLabel,
}: {
  submitLabel: string;
  onDone: () => void | Promise<void>;
  onCancel?: (() => void) | undefined;
  cancelLabel?: string;
}) {
  const { t } = useStore();
  const inv = useInvalidate();
  const [f, setF] = useState({
    rc: "",
    licence: "",
    insurance: "",
    fitness: "",
    aadhaar: "",
    consent: false,
  });
  const [step, setStep] = useState<"form" | "checking">("form");
  const [err, setErr] = useState("");
  const u = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const dl = f.licence.toUpperCase().trim();
  const checks = [
    { ok: f.rc.trim().length >= 6, en: "RC (registration)", hi: "RC" },
    { ok: DL_RE.test(dl), en: "Driving licence", hi: "ड्राइविंग लाइसेंस" },
    { ok: f.insurance.trim().length >= 6, en: "Insurance", hi: "बीमा" },
    { ok: f.fitness.trim().length >= 4, en: "Fitness certificate", hi: "फिटनेस" },
    { ok: aadhaarOk(f.aadhaar), en: "Aadhaar", hi: "आधार" },
  ];
  const submit = async () => {
    const bad = checks.find((c) => !c.ok);
    if (bad)
      return setErr(
        bad.en === "Aadhaar"
          ? t(
              "This Aadhaar number is not valid. Please check the 12 digits.",
              "आधार नंबर सही नहीं है। 12 अंक जाँचें।",
            )
          : bad.en === "Driving licence"
            ? t(
                "Enter the licence number like HR-0620110012345",
                "लाइसेंस नंबर ऐसे डालें: HR-0620110012345",
              )
            : t(`Please enter your ${bad.en} number`, `${bad.hi} नंबर डालें`),
      );
    if (!f.consent)
      return setErr(
        t("Please confirm the documents are yours", "पुष्टि करें कि दस्तावेज़ आपके हैं"),
      );
    setErr("");
    setStep("checking");
    const [r] = await Promise.all([
      api.submitVehicleDocs({
        rc: f.rc.trim(),
        licence: dl,
        insurance: f.insurance.trim(),
        fitness: f.fitness.trim(),
        aadhaar: f.aadhaar,
      }),
      new Promise((res) => setTimeout(res, 1500)), // short pause so the checklist animation can be read
    ]);
    if (r.error) {
      setStep("form");
      return setErr(r.error.message);
    }
    inv("driver");
    await onDone();
  };
  if (step === "checking")
    return (
      <div className="space-y-3 py-2">
        <p className="text-center font-semibold text-foreground">
          {t("Checking your documents…", "दस्तावेज़ जाँच रहे हैं…")}
        </p>
        {checks.map((c, i) => (
          <div
            key={c.en}
            className="flex items-center gap-2 text-sm"
            style={{ animation: `fade-in 0.3s ease ${i * 0.25}s both` }}
          >
            <CheckCircle2 className="h-4 w-4 text-success" />
            {t(c.en, c.hi)}
          </div>
        ))}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("RC number", "RC नंबर")}>
          <input
            className={`${inputCls} uppercase`}
            maxLength={20}
            value={f.rc}
            onChange={(e) => u("rc", e.target.value)}
          />
        </Field>
        <Field label={t("Driving licence number", "ड्राइविंग लाइसेंस नंबर")}>
          <input
            className={`${inputCls} uppercase`}
            maxLength={20}
            value={f.licence}
            onChange={(e) => u("licence", e.target.value)}
            placeholder="HR-0620110012345"
          />
        </Field>
        <Field label={t("Insurance policy number", "बीमा पॉलिसी नंबर")}>
          <input
            className={`${inputCls} uppercase`}
            maxLength={30}
            value={f.insurance}
            onChange={(e) => u("insurance", e.target.value)}
          />
        </Field>
        <Field label={t("Fitness certificate number", "फिटनेस प्रमाणपत्र नंबर")}>
          <input
            className={`${inputCls} uppercase`}
            maxLength={30}
            value={f.fitness}
            onChange={(e) => u("fitness", e.target.value)}
          />
        </Field>
      </div>
      <Field label={t("Aadhaar number", "आधार नंबर")}>
        <input
          className={inputCls}
          inputMode="numeric"
          maxLength={12}
          value={f.aadhaar}
          onChange={(e) => u("aadhaar", e.target.value.replace(/\D/g, ""))}
          placeholder="12 digits"
        />
      </Field>
      <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
        {checks.map((c) => (
          <li
            key={c.en}
            className={`flex items-center gap-1 ${c.ok ? "text-success" : "text-muted-foreground"}`}
          >
            {c.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5" />
            )}
            {t(c.en, c.hi)}
          </li>
        ))}
      </ul>
      <p className="text-[0.7rem] text-muted-foreground">
        {t(
          "Only the last 4 digits of your Aadhaar are saved. ChillChain checks your documents before giving you a verified badge.",
          "आधार के केवल आखिरी 4 अंक सेव होते हैं। सत्यापित बैज से पहले ChillChain आपके दस्तावेज़ जाँचता है।",
        )}
      </p>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={f.consent}
          onChange={(e) => u("consent", e.target.checked)}
        />
        {t(
          "I confirm these documents are mine and valid, and I agree to ChillChain verifying them.",
          "मैं पुष्टि करता/करती हूँ कि ये दस्तावेज़ मेरे और मान्य हैं, और ChillChain इनकी जाँच कर सकता है।",
        )}
      </label>
      {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Btn v="outline" onClick={onCancel}>
            {cancelLabel ?? t("Cancel", "रद्द करें")}
          </Btn>
        )}
        <Btn className="flex-1" onClick={submit}>
          <ShieldCheck className="h-4 w-4" />
          {submitLabel}
        </Btn>
      </div>
    </div>
  );
}

/* ---------------- Assistant ---------------- */
const DRIVER_CHIPS = [
  "How do I keep tomatoes fresh on a long trip?",
  "Which documents must I carry?",
  "How do I get paid for a trip?",
  "Best way to load crates safely",
  "डीज़ल का खर्च कैसे निकालें?",
];
function DriverAssist({ d }: { d: TransporterDashboard }) {
  const { s, t } = useStore();
  const { data: me } = useMe();
  const v = d.vehicle;
  const context = () =>
    [
      `LANGUAGE: ${langInfo(s.lang).name} (${langInfo(s.lang).native})`,
      `User is a TRANSPORTER (truck driver): ${me?.profile?.full_name}, base district ${v?.base_district}, vehicle ${v?.vehicle_no} (${v?.vehicle_key}, ${v?.capacity_kg} kg${v?.has_reefer ? ", refrigerated" : ""}), ${v?.verified ? "verified" : "verification pending"}. UPI ${me?.profile?.upi_id}. Today ${new Date().toISOString().slice(0, 10)}.`,
      `Loads near them: ${
        d.nearby
          .slice(0, 8)
          .map(
            (x) =>
              `${x.trip_code} ${x.kg}kg ${cropBy(x.crop).en} ${x.from_district}→${x.to_label} ${x.distance_km}km on ${x.pickup_date} fare ₹${x.amount}${x.reefer ? " reefer" : ""}`,
          )
          .join("; ") || "none"
      }.`,
      `Their trips: ${
        d.trips
          .slice(0, 10)
          .map(
            (x) =>
              `${x.trip_code} ${x.status} ${x.from_district}→${x.to_label} ₹${x.amount} ${x.paid ? `paid by ${x.pay_method}` : "unpaid"}`,
          )
          .join("; ") || "none"
      }.`,
      d.stats
        ? `Earnings: this month ₹${d.stats.earned_month}, total ₹${d.stats.earned_total}, to collect ₹${d.stats.pending}, ${d.stats.trips_done} trips, ${d.stats.km_done} km.`
        : "",
      `Fares are estimates set by ChillChain (base fare + per-km rate, +35% for reefer). The farmer pays the driver after delivery by UPI or cash. Payments in this app are test mode.`,
    ].join("\n");
  return (
    <ChatPanel
      storageKey="chillchain-driver-chat-v1"
      chips={DRIVER_CHIPS}
      context={context}
      title={t("Safar assistant", "सफ़र सहायक")}
      sub={t(
        "Ask about trips, loading, documents and payments",
        "ट्रिप, लोडिंग, दस्तावेज़ और भुगतान के बारे में पूछें",
      )}
      greeting={t(
        `Namaste ${me?.profile?.full_name ?? ""} ji 🚚 I'm your ChillChain Safar Sahayak. Ask me about your trips, keeping produce fresh on the road, documents or payments, in your own language.`,
        `नमस्ते ${me?.profile?.full_name ?? ""} जी 🚚 मैं आपका ChillChain सफ़र सहायक हूँ। अपनी ट्रिप, रास्ते में माल ताज़ा रखने, दस्तावेज़ या भुगतान के बारे में अपनी भाषा में पूछें।`,
      )}
    />
  );
}
