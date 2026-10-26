import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  LocateFixed,
  PackageCheck,
  Phone,
  Power,
  Snowflake,
  Warehouse,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import { soundAllowed, useInvalidate, useMe, useOwnerDashboard, useSettings } from "@/lib/data";
import { useTabEvents } from "@/lib/nav";
import { inr } from "@/lib/income";
import type { Facility, OwnerBooking, OwnerRoom, OwnerStats } from "@/lib/types";
import { Badge, Btn, Field, Label, SectionTitle, Skeleton, inputCls } from "./ui";
import { TopBar } from "./TopBar";
import { DISTRICTS } from "./Onboarding";
import { FACILITY } from "./ColdTab";
import { RatePrompt, RepsProvider, UserRep } from "./KrishiSaakh";

const DAY = 86_400_000;
const ends = (b: OwnerBooking) => new Date(b.ends_at).getTime();
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const daysLeft = (b: OwnerBooking) => Math.ceil((ends(b) - Date.now()) / DAY);
const hoursLeftOf = (b: OwnerBooking) => Math.ceil((ends(b) - Date.now()) / 3_600_000);

type BState = "arriving" | "stored" | "ended" | "released";
const bState = (b: OwnerBooking): BState =>
  b.released_at
    ? "released"
    : ends(b) <= Date.now()
      ? "ended"
      : b.checked_in_at
        ? "stored"
        : "arriving";
const isActive = (b: OwnerBooking) => {
  const x = bState(b);
  return x === "arriving" || x === "stored";
};

/** Full / filling / available, so the owner sees the state of the room at a glance. */
function capacity(used: number, total: number, accepting: boolean) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  if (!accepting)
    return {
      pct,
      key: "paused" as const,
      en: "Bookings paused",
      hi: "बुकिंग रुकी है",
      tone: "muted" as const,
      bar: "bg-muted-foreground",
    };
  if (used >= total)
    return {
      pct,
      key: "full" as const,
      en: "STORAGE FULL",
      hi: "स्टोरेज भरा है",
      tone: "red" as const,
      bar: "bg-destructive",
    };
  if (pct >= 80)
    return {
      pct,
      key: "filling" as const,
      en: "Filling fast",
      hi: "जल्दी भर रहा है",
      tone: "amber" as const,
      bar: "bg-warning",
    };
  return {
    pct,
    key: "ok" as const,
    en: "Space available",
    hi: "जगह उपलब्ध है",
    tone: "green" as const,
    bar: "bg-success",
  };
}

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
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.18);
    navigator.vibrate?.(120);
  } catch {
    /* browsers block sound until the user has tapped the page once */
  }
}

export function OwnerShell() {
  const { s, t } = useStore();
  const dash = useOwnerDashboard();
  const st = useSettings();
  const inv = useInvalidate();
  const [tab, setTab] = useState<"live" | "bookings" | "room">("live");
  const [err, setErr] = useState("");
  const [fresh, setFresh] = useState<OwnerBooking[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const desktop = s.mode === "desktop";
  const d = dash.data;

  // Detect bookings that arrived since the last refresh and alert the owner.
  useEffect(() => {
    if (!d) return undefined;
    if (seen.current === null) {
      seen.current = new Set(d.bookings.map((b) => b.id));
      return undefined;
    }
    const added = d.bookings.filter((b) => !seen.current!.has(b.id));
    if (!added.length) return undefined;
    added.forEach((b) => seen.current!.add(b.id));
    setFresh((f) => [...added, ...f].slice(0, 3));
    if (soundAllowed(st.data?.settings)) beep();
    const h = setTimeout(() => setFresh([]), 20_000);
    return () => clearTimeout(h);
  }, [d]);

  useTabEvents(
    useCallback((k: string) => {
      if (k === "live" || k === "bookings" || k === "room") setTab(k);
    }, []),
  );
  const act = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setErr("");
    const r = await fn();
    if (r.error) setErr(r.error.message);
    inv("owner", "cold_rooms");
  };

  const wrap = (children: ReactNode) => (
    <RepsProvider ids={d?.bookings.map((b) => b.farmer_id) ?? []}>
      <div className="min-h-screen">
        <TopBar />
        <div className={`mx-auto px-4 py-4 ${desktop ? "max-w-4xl" : "max-w-[680px]"}`}>
          <RatePrompt />
          {children}
        </div>
      </div>
    </RepsProvider>
  );
  if (dash.isError)
    return wrap(
      <div className="card-classic space-y-2 p-4 text-sm">
        <p className="font-semibold text-destructive">
          {t("Could not load your cold room", "कोल्ड रूम लोड नहीं हो सका")}
        </p>
        <p className="break-words text-xs text-muted-foreground">
          {(dash.error as Error)?.message}
        </p>
        <Btn className="w-full" onClick={() => dash.refetch()}>
          {t("Try again", "फिर कोशिश करें")}
        </Btn>
      </div>,
    );
  if (dash.isLoading || !d) return wrap(<Skeleton rows={4} />);
  if (!d.room || !d.stats) return wrap(<OwnerSetup />);
  const { room, stats } = d;

  return wrap(
    <>
      <div className="mb-4 grid grid-cols-3 gap-0.5 rounded-[9px] bg-secondary p-0.5">
        {(
          [
            ["live", Warehouse, t("Live", "लाइव")],
            ["bookings", ClipboardCheck, t("Bookings", "बुकिंग")],
            ["room", Power, t("My room", "मेरा कक्ष")],
          ] as const
        ).map(([k, I, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-md py-2 text-sm font-medium ${tab === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <I className="h-4 w-4" />
            {l}
          </button>
        ))}
      </div>

      {fresh.length > 0 && (
        <div className="mb-3 space-y-2" role="status" aria-live="polite">
          {fresh.map((b) => (
            <div
              key={b.id}
              className="flex items-start gap-2 rounded-lg border border-primary/30 bg-accent p-3 text-sm"
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <b>
                  {t("New booking", "नई बुकिंग")} {b.pass_no}
                </b>
                <br />
                {b.farmer_name || t("A farmer", "एक किसान")} · {b.crates} {t("crates", "क्रेट")}{" "}
                {cropBy(b.crop).emoji} {cropBy(b.crop).en} ·{" "}
                {b.hours ? `${b.hours} ${t("hour(s)", "घंटे")}` : `${b.days} ${t("day(s)", "दिन")}`}
              </div>
              <button
                className="text-xs font-semibold text-primary"
                onClick={() => setFresh((f) => f.filter((x) => x.id !== b.id))}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}
      {err && (
        <p className="mb-3 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>
      )}

      {tab === "live" && (
        <LiveView
          room={room}
          stats={stats}
          bookings={d.bookings}
          chart={d.chart}
          updatedAt={dash.dataUpdatedAt}
          act={act}
        />
      )}
      {tab === "bookings" && <BookingsView bookings={d.bookings} act={act} />}
      {tab === "room" && <RoomSettings room={room} used={stats.used} />}
    </>,
  );
}

/* ---------------- Live ---------------- */
function LiveView({
  room,
  stats,
  bookings,
  chart,
  updatedAt,
  act,
}: {
  room: OwnerRoom;
  stats: OwnerStats;
  bookings: OwnerBooking[];
  chart: { label: string; crates: number }[];
  updatedAt: number;
  act: (fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;
}) {
  const { t } = useStore();
  const cap = capacity(stats.used, stats.total_slots, room.accepting_bookings);
  const free = Math.max(0, stats.total_slots - stats.used);
  const soon = bookings
    .filter((b) => isActive(b) && ends(b) - Date.now() < 2 * DAY)
    .sort((a, b) => ends(a) - ends(b));
  const unpaid = bookings.filter((b) => !b.paid && bState(b) !== "released");
  const latest = bookings.slice(0, 5);
  return (
    <div className="space-y-4">
      <SectionTitle
        icon={Warehouse}
        title={t("Live room status", "कक्ष की लाइव स्थिति")}
        sub={t("Capacity, today's bookings and earnings", "क्षमता, आज की बुकिंग और कमाई")}
      />
      <div className="card-classic p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{room.name}</h2>
            <p className="text-xs text-muted-foreground">
              {room.district}, {room.state}
            </p>
          </div>
          <Badge tone={cap.tone}>{t(cap.en, cap.hi)}</Badge>
        </div>
        <div className="my-3">
          <div className="mb-1 flex items-end justify-between">
            <span className="text-3xl font-semibold text-foreground">{cap.pct}%</span>
            <span className="text-sm text-muted-foreground">
              {stats.used} / {stats.total_slots} {t("crates", "क्रेट")}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${cap.bar}`}
              style={{ width: `${cap.pct}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base text-success">{free}</b>
            {t("free crates", "खाली क्रेट")}
          </div>
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base">{stats.active_bookings}</b>
            {t("active bookings", "चालू बुकिंग")}
          </div>
          <div className="rounded-lg bg-popover p-2">
            <b className="block text-base">{room.temp_c.toFixed(1)}°C</b>
            {room.humidity}% RH
          </div>
        </div>
        {cap.key === "full" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t(
              "Farmers cannot book until you release space.",
              "जगह खाली करने तक किसान बुक नहीं कर सकते।",
            )}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t("Live · updated", "लाइव · अपडेट")} {new Date(updatedAt).toLocaleTimeString("en-IN")}
          </p>
          <Btn
            v="outline"
            className="px-3 py-1.5 text-xs"
            onClick={() =>
              act(() =>
                api.updateRoom({
                  rate: room.rate_per_crate_day,
                  slots: room.total_slots,
                  temp: room.temp_c,
                  humidity: room.humidity,
                  phone: room.phone ?? "",
                  accepting: !room.accepting_bookings,
                }),
              )
            }
          >
            <Power className="h-3.5 w-3.5" />
            {room.accepting_bookings
              ? t("Pause bookings", "बुकिंग रोकें")
              : t("Resume bookings", "बुकिंग चालू करें")}
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          [t("This month", "इस महीने"), inr(stats.revenue_month)],
          [t("Total earned", "कुल कमाई"), inr(stats.revenue_total)],
          [t("Unpaid dues", "बकाया"), inr(stats.dues)],
        ].map(([l, v]) => (
          <div key={l as string} className="card-classic p-3 text-center">
            <Wallet className="mx-auto mb-1 h-4 w-4 text-primary" />
            <b className="block text-sm">{v}</b>
            <span className="text-[0.68rem] text-muted-foreground">{l}</span>
          </div>
        ))}
      </div>

      <div className="card-classic p-4">
        <Label>{t("Crates booked, last 7 days", "पिछले 7 दिनों में बुक क्रेट")}</Label>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis width={28} tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="crates"
                fill="currentColor"
                className="text-primary"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {soon.length > 0 && (
        <div>
          <Label>{t("Ending within 48 hours", "48 घंटे में खत्म")}</Label>
          <div className="space-y-2">
            {soon.map((b) => (
              <div
                key={b.id}
                className="card-classic flex items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <b>{b.pass_no}</b> · {b.crates} {t("crates", "क्रेट")} · {b.bay}
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {b.farmer_name} · {t("ends", "खत्म")} {fmtDate(b.ends_at)}
                  </span>
                </div>
                <div className="flex gap-1">
                  {b.farmer_phone && (
                    <a
                      href={`tel:${b.farmer_phone}`}
                      aria-label="Call"
                      className="rounded-lg border border-primary/40 p-2 text-primary"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                  <Btn
                    className="px-3 py-1.5 text-xs"
                    onClick={() => act(() => api.ownerRelease(b.id))}
                  >
                    {t("Release", "खाली करें")}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {unpaid.length > 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          {unpaid.length}{" "}
          {t(
            "booking(s) not paid yet. Open Bookings to mark cash received.",
            "बुकिंग का भुगतान बाकी है। बुकिंग टैब में नकद प्राप्त करें।",
          )}
        </p>
      )}

      <div>
        <Label>{t("Latest bookings", "ताज़ा बुकिंग")}</Label>
        {latest.length === 0 && (
          <p className="card-classic p-4 text-center text-sm text-muted-foreground">
            {t(
              "No bookings yet. They will appear here the moment a farmer books.",
              "अभी कोई बुकिंग नहीं। किसान के बुक करते ही यहाँ दिखेगी।",
            )}
          </p>
        )}
        <div className="space-y-2">
          {latest.map((b) => (
            <BookingCard key={b.id} b={b} act={act} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Bookings ---------------- */
const FILTERS = [
  ["active", "Active", "चालू"],
  ["arriving", "Not arrived", "आना बाकी"],
  ["stored", "In storage", "स्टोरेज में"],
  ["done", "Finished", "पूरी"],
  ["all", "All", "सभी"],
] as const;

function BookingsView({
  bookings,
  act,
}: {
  bookings: OwnerBooking[];
  act: (fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;
}) {
  const { t } = useStore();
  const [fl, setFl] = useState<(typeof FILTERS)[number][0]>("active");
  const [q, setQ] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inv = useInvalidate();

  const list = useMemo(
    () =>
      bookings.filter((b) => {
        const st = bState(b);
        const okF =
          fl === "all" ||
          (fl === "active"
            ? isActive(b)
            : fl === "done"
              ? st === "ended" || st === "released"
              : st === fl);
        const hay =
          `${b.pass_no} ${b.farmer_name ?? ""} ${b.farmer_phone ?? ""} ${b.farmer_village ?? ""}`.toLowerCase();
        return okF && (!q || hay.includes(q.toLowerCase()));
      }),
    [bookings, fl, q],
  );

  const checkIn = async () => {
    setMsg(null);
    const r = await api.ownerCheckIn(pass.trim());
    if (r.error || !r.data) return setMsg({ ok: false, text: r.error?.message ?? "Not found" });
    setMsg({
      ok: true,
      text: `${r.data.pass_no} ✓ ${r.data.farmer_name} · ${r.data.crates} ${t("crates", "क्रेट")} ${cropBy(r.data.crop).en} → ${t("bay", "बे")} ${r.data.bay}`,
    });
    setPass("");
    inv("owner");
  };
  return (
    <div>
      <SectionTitle
        icon={ClipboardCheck}
        title={t("Gate check-in", "गेट चेक-इन")}
        sub={t("Type the gate pass number the farmer shows", "किसान का गेट पास नंबर डालें")}
      />
      <div className="card-classic mb-4 p-3">
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={pass}
            onChange={(e) => setPass(e.target.value.toUpperCase())}
            placeholder="GP-3FA91C0B"
            onKeyDown={(e) => e.key === "Enter" && pass.trim().length >= 4 && checkIn()}
          />
          <Btn className="shrink-0" onClick={checkIn} disabled={pass.trim().length < 4}>
            <CheckCircle2 className="h-4 w-4" />
            {t("Check in", "चेक-इन")}
          </Btn>
        </div>
        {msg && (
          <p
            className={`mt-2 text-xs font-semibold ${msg.ok ? "text-success" : "text-destructive"}`}
          >
            {msg.text}
          </p>
        )}
      </div>
      <input
        className={`${inputCls} mb-2`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(
          "Search pass no, farmer, phone, village",
          "पास नंबर, किसान, फोन, गाँव खोजें",
        )}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([k, en, hi]) => (
          <button
            key={k}
            onClick={() => setFl(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${fl === k ? "border-primary/30 bg-accent text-primary" : "border-border text-muted-foreground"}`}
          >
            {t(en, hi)}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className="card-classic p-4 text-center text-sm text-muted-foreground">
          {t("Nothing here.", "यहाँ कुछ नहीं।")}
        </p>
      )}
      <div className="space-y-3">
        {list.map((b) => (
          <BookingCard key={b.id} b={b} act={act} />
        ))}
      </div>
    </div>
  );
}

function BookingCard({
  b,
  act,
  compact,
}: {
  b: OwnerBooking;
  act: (fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;
  compact?: boolean;
}) {
  const { t } = useStore();
  const st = bState(b);
  const tone = { arriving: "amber", stored: "green", ended: "red", released: "muted" } as const;
  const label = {
    arriving: t("Not arrived", "आना बाकी"),
    stored: t("In storage", "स्टोरेज में"),
    ended: t("Term over", "अवधि खत्म"),
    released: t("Released", "खाली किया"),
  }[st];
  const dl = daysLeft(b);
  return (
    <div className="card-classic p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">
            {b.pass_no}{" "}
            <span className="font-sans text-xs font-normal text-muted-foreground">
              · {t("bay", "बे")} {b.bay}
            </span>
          </p>
          <p className="text-sm text-foreground">
            {b.farmer_name || t("Farmer", "किसान")}
            {b.farmer_village ? `, ${b.farmer_village}` : ""}
          </p>
          <div className="mt-0.5">
            <UserRep id={b.farmer_id} flow={1} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={tone[st]}>{label}</Badge>
          <Badge tone={b.paid ? "green" : "amber"}>
            {b.paid ? t("Paid", "भुगतान हुआ") : t("Unpaid", "बकाया")}
          </Badge>
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Snowflake className="h-3.5 w-3.5" />
        {cropBy(b.crop).emoji} {cropBy(b.crop).en} · {b.crates} {t("crates", "क्रेट")} ×{" "}
        {b.hours ? `${b.hours} ${t("hour(s)", "घंटे")}` : `${b.days} ${t("day(s)", "दिन")}`} ·{" "}
        {inr(b.amount)}
      </p>
      {!compact && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("Booked", "बुक")} {fmtTime(b.created_at)} ·{" "}
          {st === "stored" || st === "arriving"
            ? dl <= 0
              ? t("ends today", "आज खत्म")
              : b.hours
                ? `${hoursLeftOf(b)} ${t("hour(s) left", "घंटे बाकी")}`
                : `${dl} ${t("day(s) left", "दिन बाकी")}`
            : `${t("ended", "खत्म")} ${fmtDate(b.ends_at)}`}
          {b.checked_in_at ? ` · ${t("arrived", "पहुँचा")} ${fmtTime(b.checked_in_at)}` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {b.farmer_phone && (
          <a
            href={`tel:${b.farmer_phone}`}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary"
          >
            <Phone className="h-3.5 w-3.5" />
            {b.farmer_phone}
          </a>
        )}
        {st === "arriving" && (
          <Btn
            className="px-3 py-1.5 text-xs"
            onClick={() => act(() => api.ownerCheckIn(b.pass_no))}
          >
            {t("Check in", "चेक-इन")}
          </Btn>
        )}
        {(st === "arriving" || st === "stored" || st === "ended") && (
          <Btn
            v="outline"
            className="px-3 py-1.5 text-xs"
            onClick={() => act(() => api.ownerRelease(b.id))}
          >
            <PackageCheck className="h-3.5 w-3.5" />
            {t("Collected / release", "माल ले गए")}
          </Btn>
        )}
        {!b.paid && st !== "released" && (
          <Btn
            v="gold"
            className="px-3 py-1.5 text-xs"
            onClick={() => act(() => api.ownerMarkPaid(b.id))}
          >
            {t("Mark cash received", "नकद मिला")}
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function RoomSettings({ room, used }: { room: OwnerRoom; used: number }) {
  const { t } = useStore();
  const inv = useInvalidate();
  const [f, setF] = useState({
    rate: room.rate_per_crate_day,
    slots: room.total_slots,
    temp: room.temp_c,
    humidity: room.humidity,
    phone: room.phone ?? "",
    accepting: room.accepting_bookings,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await api.updateRoom(f);
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error.message });
    setMsg({
      ok: true,
      text: t(
        "Saved. Farmers see the new rate and capacity now.",
        "सेव हो गया। किसानों को नया रेट और क्षमता दिखेगी।",
      ),
    });
    inv("owner", "cold_rooms");
  };
  return (
    <>
      <SectionTitle
        icon={Power}
        title={t("My room", "मेरा कक्ष")}
        sub={t(
          "Rate, capacity, temperature and bookings on/off",
          "रेट, क्षमता, तापमान और बुकिंग चालू/बंद",
        )}
      />
      <div className="card-classic space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{room.name}</h3>
          {room.verified ? (
            <Badge tone="green">{t("Verified", "सत्यापित")}</Badge>
          ) : (
            <Badge tone="amber">{t("Pending verification", "सत्यापन बाकी")}</Badge>
          )}
        </div>
        {!room.verified && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Farmers can already book you. They see a “New listing” tag until ChillChain verifies your facility.",
              "किसान अभी भी बुक कर सकते हैं। सत्यापन तक “New listing” टैग दिखेगा।",
            )}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Rate (₹ / crate / day)", "रेट (₹ / क्रेट / दिन)")}>
            <input
              type="number"
              min={1}
              max={500}
              className={inputCls}
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: Math.floor(+e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Total crate capacity", "कुल क्रेट क्षमता")}>
            <input
              type="number"
              min={used || 1}
              max={5000}
              className={inputCls}
              value={f.slots}
              onChange={(e) => setF({ ...f, slots: Math.floor(+e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Temperature (°C)", "तापमान (°C)")}>
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={f.temp}
              onChange={(e) => setF({ ...f, temp: +e.target.value })}
            />
          </Field>
          <Field label={t("Humidity (%)", "नमी (%)")}>
            <input
              type="number"
              className={inputCls}
              value={f.humidity}
              onChange={(e) => setF({ ...f, humidity: Math.floor(+e.target.value || 0) })}
            />
          </Field>
        </div>
        <Field label={t("Phone (shown to farmers)", "फोन (किसानों को दिखेगा)")}>
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={10}
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.accepting}
            onChange={(e) => setF({ ...f, accepting: e.target.checked })}
          />
          {t("Accepting new bookings", "नई बुकिंग ले रहे हैं")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t(
            `${used} crates are stored right now, so capacity cannot go below that.`,
            `अभी ${used} क्रेट रखे हैं, इसलिए क्षमता इससे कम नहीं हो सकती।`,
          )}
        </p>
        {msg && (
          <p className={`text-xs font-semibold ${msg.ok ? "text-success" : "text-destructive"}`}>
            {msg.text}
          </p>
        )}
        <Btn className="w-full" onClick={save} disabled={busy}>
          {t("Save changes", "बदलाव सेव करें")}
        </Btn>
      </div>
    </>
  );
}

/* ---------------- First-time setup ---------------- */
const BADGES = [
  "Solar",
  "24/7",
  "Back-up Power",
  "Loading Dock",
  "Bulk",
  "Community",
  "Pre-cooling",
  "Ethylene ripening",
  "Export pack-house",
  "Flowers",
] as const;
function OwnerSetup() {
  const { t } = useStore();
  const { data: me } = useMe();
  const inv = useInvalidate();
  const [f, setF] = useState({
    name: me?.profile?.org_name ?? "",
    address: "",
    pin: "",
    state: me?.profile?.state ?? "Maharashtra",
    district: me?.profile?.district ?? "Satara",
    facility: "precool" as Facility,
    rate: 25,
    rateHour: 3,
    slots: 100,
    temp: 4,
    humidity: 85,
    phone: me?.profile?.phone ?? "",
  });
  const [badges, setBadges] = useState<(typeof BADGES)[number][]>([]);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps([p.coords.latitude, p.coords.longitude]),
      () =>
        setErr(
          t(
            "Location permission denied. We will use your district centre.",
            "अनुमति नहीं मिली। ज़िले का केंद्र इस्तेमाल होगा।",
          ),
        ),
      { timeout: 8000 },
    );
  const submit = async () => {
    setBusy(true);
    setErr("");
    const r = await api.registerRoom({
      name: f.name.trim(),
      address: f.address.trim(),
      state: f.state,
      district: f.district,
      rate: f.rate,
      rateHour: f.rateHour,
      facility: f.facility,
      slots: f.slots,
      temp: f.temp,
      humidity: f.humidity,
      phone: f.phone,
      badges,
      ...(/^\d{6}$/.test(f.pin) ? { pin: f.pin } : {}),
      ...(gps ? { lat: gps[0], lng: gps[1] } : {}),
    });
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    inv("owner", "cold_rooms");
  };
  return (
    <div>
      <SectionTitle
        icon={Warehouse}
        title={t("Register your storage", "अपना भंडारण दर्ज करें")}
        sub={t(
          "Growers will see it on the map and can book crates by the hour or the day",
          "उत्पादक इसे नक्शे पर देखकर घंटे या दिन के हिसाब से क्रेट बुक कर सकेंगे",
        )}
      />
      <div className="card-classic space-y-3 p-4">
        <div>
          <Label>{t("What kind of facility?", "किस तरह की सुविधा?")}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(FACILITY) as Facility[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setF({ ...f, facility: k, temp: k === "ripening" ? 18 : k === "precool" ? 2 : 4 })
                }
                className={`rounded-lg border-2 p-2 text-left text-xs ${f.facility === k ? "border-primary bg-accent" : "border-border"}`}
              >
                <b className="block text-sm text-foreground">{t(FACILITY[k].en, FACILITY[k].hi)}</b>
                <span className="text-muted-foreground">
                  {t(FACILITY[k].descEn, FACILITY[k].descHi)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <Field label={t("Facility name", "सुविधा का नाम")}>
          <input
            className={inputCls}
            maxLength={80}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Shree Ram Cold Storage"
          />
        </Field>
        <Field label={t("Address", "पता")}>
          <input
            className={inputCls}
            maxLength={160}
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
            placeholder="GT Road, near Mandi gate"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("State", "राज्य")}>
            <select
              className={inputCls}
              value={f.state}
              onChange={(e) =>
                setF({
                  ...f,
                  state: e.target.value,
                  district: DISTRICTS[e.target.value]?.[0] ?? "",
                })
              }
            >
              {Object.keys(DISTRICTS).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label={t("District", "ज़िला")}>
            <select
              className={inputCls}
              value={f.district}
              onChange={(e) => setF({ ...f, district: e.target.value })}
            >
              {(DISTRICTS[f.state] ?? []).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("PIN code (optional)", "पिन कोड (वैकल्पिक)")}>
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={6}
            value={f.pin}
            onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Btn v="outline" className="w-full" onClick={locate}>
          <LocateFixed className="h-4 w-4" />
          {gps
            ? t("📍 Location saved", "📍 स्थान सेव")
            : t("Use my GPS location (recommended)", "मेरा GPS स्थान (बेहतर)")}
        </Btn>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Rate (₹ / crate / day)", "रेट (₹ / क्रेट / दिन)")}>
            <input
              type="number"
              min={1}
              max={500}
              className={inputCls}
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: Math.floor(+e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Rate (₹ / crate / hour)", "रेट (₹ / क्रेट / घंटा)")}>
            <input
              type="number"
              min={1}
              max={100}
              className={inputCls}
              value={f.rateHour}
              onChange={(e) => setF({ ...f, rateHour: Math.floor(+e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Crate capacity", "क्रेट क्षमता")}>
            <input
              type="number"
              min={1}
              max={5000}
              className={inputCls}
              value={f.slots}
              onChange={(e) => setF({ ...f, slots: Math.floor(+e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Temperature (°C)", "तापमान (°C)")}>
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={f.temp}
              onChange={(e) => setF({ ...f, temp: +e.target.value })}
            />
          </Field>
          <Field label={t("Humidity (%)", "नमी (%)")}>
            <input
              type="number"
              className={inputCls}
              value={f.humidity}
              onChange={(e) => setF({ ...f, humidity: Math.floor(+e.target.value || 0) })}
            />
          </Field>
        </div>
        <Field label={t("Phone (shown to growers)", "फोन (उत्पादकों को दिखेगा)")}>
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={10}
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <div>
          <Label>{t("Facilities", "सुविधाएँ")}</Label>
          <div className="flex flex-wrap gap-2">
            {BADGES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() =>
                  setBadges((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b]))
                }
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${badges.includes(b) ? "border-primary/30 bg-accent text-primary" : "border-border text-muted-foreground"}`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
        <Btn
          className="w-full"
          onClick={submit}
          disabled={busy || f.name.trim().length < 3 || f.address.trim().length < 5}
        >
          {busy ? "…" : t("Register facility", "सुविधा दर्ज करें")}
        </Btn>
      </div>
    </div>
  );
}
