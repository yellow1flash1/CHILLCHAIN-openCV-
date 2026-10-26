import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Snowflake,
  Clock,
  Droplets,
  LocateFixed,
  MapPin,
  Navigation,
  Printer,
  Search,
  Thermometer,
} from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import { CropSelect } from "./CropSelect";
import {
  useBookings,
  useColdRooms,
  useInvalidate,
  useMe,
  useSettings,
  type Booking,
  type ColdRoom,
} from "@/lib/data";
import { inr } from "@/lib/income";
import { Skeleton, Badge, Btn, Field, Label, Modal, SectionTitle, inputCls } from "./ui";
import { UpiPay } from "./UpiPay";
import { RepsProvider, UserRep } from "./KrishiSaakh";
import type { Facility } from "@/lib/types";
import { DISTRICT_LL, km } from "@/lib/geo";
import { langInfo } from "@/lib/i18n";

const ColdMap = lazy(() => import("./ColdMap"));
export const FACILITY: Record<
  Facility,
  { en: string; hi: string; descEn: string; descHi: string }
> = {
  precool: {
    en: "Pre-cooling",
    hi: "प्री-कूलिंग",
    descEn: "Pulls field heat out within hours of harvest. Book by the hour.",
    descHi: "तोड़ने के कुछ घंटों में खेत की गर्मी निकालता है। घंटे से बुक करें।",
  },
  cold_room: {
    en: "Cold room",
    hi: "कोल्ड रूम",
    descEn: "Holds produce at the right temperature for days.",
    descHi: "माल को सही तापमान पर कई दिन रखता है।",
  },
  ripening: {
    en: "Ripening chamber",
    hi: "पकाई कक्ष",
    descEn: "Controlled ethylene ripening for avocado, mango, kiwi and banana.",
    descHi: "एवोकाडो, आम, कीवी और केले को नियंत्रित तरीके से पकाता है।",
  },
};
const FILTERS = [
  ["all", "All", "सभी"],
  ["precool", "Pre-cooling", "प्री-कूलिंग"],
  ["cold_room", "Cold rooms", "कोल्ड रूम"],
  ["ripening", "Ripening", "पकाई कक्ष"],
  ["solar", "Solar", "सोलर"],
  ["247", "24/7", "24/7"],
] as const;
type Filter = (typeof FILTERS)[number][0];
export function ColdTab() {
  const { s, set, t } = useStore();
  const { data: me } = useMe();
  const rooms = useColdRooms();
  const settings = useSettings();
  const [q, setQ] = useState("");
  // A scan can send the grower here looking for a pre-cooler or ripening chamber.
  const [fl, setFl] = useState<Filter>(s.prefillFacility ?? "all");
  useEffect(() => {
    if (s.prefillFacility) set((x) => ({ ...x, prefillFacility: null }));
  }, [s.prefillFacility, set]);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [gpsMsg, setGpsMsg] = useState("");
  const [hub, setHub] = useState<ColdRoom | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const here: [number, number] =
    gps ?? DISTRICT_LL[me?.profile?.district ?? ""] ?? DISTRICT_LL["Satara"]!;
  const locate = () => {
    if (settings.data?.settings.location === false)
      return setGpsMsg(
        t("Location is turned off in Settings → Privacy", "लोकेशन सेटिंग → गोपनीयता में बंद है"),
      );
    if (!navigator.geolocation)
      return setGpsMsg(t("GPS not available on this device", "GPS उपलब्ध नहीं"));
    setGpsMsg(t("Locating…", "स्थान खोज रहे हैं…"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps([p.coords.latitude, p.coords.longitude]);
        setGpsMsg(t("📍 Using your GPS location", "📍 आपका GPS स्थान"));
      },
      () =>
        setGpsMsg(
          t("Location permission denied — using your district", "अनुमति नहीं मिली — ज़िले से दूरी"),
        ),
      { timeout: 8000 },
    );
  };
  const list = useMemo(
    () =>
      (rooms.data ?? [])
        .map((r) => ({ ...r, km: km(here, [r.lat, r.lng]) }))
        .filter(
          (h) =>
            (fl === "all" || h.facility === fl || h.tags.includes(fl)) &&
            (!q ||
              `${h.name} ${h.address} ${h.district} ${h.pin}`
                .toLowerCase()
                .includes(q.toLowerCase())),
        )
        .sort((a, b) => a.km - b.km),
    [rooms.data, here, fl, q],
  );
  return (
    <RepsProvider ids={(rooms.data ?? []).map((r) => r.owner_id)}>
      <div>
        <SectionTitle
          icon={Snowflake}
          title={t("Storage", "भंडारण")}
          sub={t(
            "Pre-coolers, cold rooms and ripening chambers near you, by the hour or the day",
            "पास के प्री-कूलर, कोल्ड रूम और पकाई कक्ष, घंटे या दिन के हिसाब से",
          )}
        />
        <div className="card-classic mb-3 overflow-hidden p-2">
          {mounted ? (
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <ColdMap rooms={list} me={here} onPick={setHub} />
            </Suspense>
          ) : (
            <div className="h-64 rounded-lg bg-muted" />
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            className={inputCls + " pl-9"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Village, town, district or PIN", "गाँव, शहर या पिन")}
          />
        </div>
        <Btn v="outline" className="mb-2 w-full" onClick={locate}>
          <LocateFixed className="h-4 w-4" />
          {t("Use My Location (GPS)", "मेरा स्थान")}
        </Btn>
        {gpsMsg && <p className="mb-2 text-xs text-success">{gpsMsg}</p>}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map(([k, en, hi]) => (
            <button
              key={k}
              onClick={() => setFl(k)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${fl === k ? "border-primary/30 bg-accent text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t(en, hi)}
            </button>
          ))}
        </div>
        {fl in FACILITY && (
          <p className="-mt-2 mb-4 text-xs text-muted-foreground">
            {t(FACILITY[fl as Facility].descEn, FACILITY[fl as Facility].descHi)}
          </p>
        )}
        <div className="space-y-3">
          {rooms.isLoading && <Skeleton rows={3} />}
          {!rooms.isLoading && list.length === 0 && (
            <p className="card-classic p-4 text-center text-sm text-muted-foreground">
              {t("No storage matches. Try another filter or search.", "कोई भंडारण नहीं मिला")}
            </p>
          )}
          {list.map((h) => (
            <div key={h.id} className="card-classic p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {langInfo(s.lang).deva && h.name_hi ? h.name_hi : h.name}
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {h.address}, {h.district} · {h.pin} · <b>{h.km.toFixed(1)} km</b>
                  </p>
                  <div className="mt-1.5">
                    <UserRep id={h.owner_id} flow={6} showLabel />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">₹{h.rate_per_crate_day}</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {t("/crate/day", "/क्रेट/दिन")}
                  </p>
                  {h.rate_per_crate_hour != null && (
                    <p className="text-[0.65rem] font-semibold text-saffron-strong">
                      ₹{h.rate_per_crate_hour} {t("/crate/hour", "/क्रेट/घंटा")}
                    </p>
                  )}
                  {h.palledari_per_crate != null && (
                    <p className="text-[0.65rem] text-muted-foreground">
                      + ₹{h.palledari_per_crate} {t("palledari", "पल्लेदारी")}
                    </p>
                  )}
                </div>
              </div>
              <div className="my-3 grid grid-cols-3 gap-2 rounded-lg bg-popover p-2 text-center text-xs">
                <div>
                  <Thermometer className="mx-auto h-4 w-4 text-primary-2" />
                  <b>{Number(h.temp_c).toFixed(1)}°C</b>
                </div>
                <div>
                  <Droplets className="mx-auto h-4 w-4 text-primary-2" />
                  <b>{h.humidity}% RH</b>
                </div>
                <div>
                  <span className="block text-base font-bold text-success">{h.free}</span>
                  {t("slots free", "स्लॉट खाली")}
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                <Badge tone={h.facility === "ripening" ? "amber" : "green"}>
                  {h.facility === "cold_room" ? (
                    <Snowflake className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {t(FACILITY[h.facility].en, FACILITY[h.facility].hi)}
                </Badge>
                {h.badges.map((b) => (
                  <Badge key={b}>{b}</Badge>
                ))}
                {!h.verified && <Badge tone="amber">{t("New listing", "नई लिस्टिंग")}</Badge>}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <a
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 text-sm font-semibold text-primary"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="h-4 w-4" />
                  {t("Directions", "रास्ता")}
                </a>
                <Btn onClick={() => setHub(h)} disabled={h.free < 1}>
                  {!h.accepting_bookings
                    ? t("Paused by owner", "मालिक ने रोका")
                    : h.free < 1
                      ? t("Storage full", "स्टोरेज भरा है")
                      : t("Book slot", "स्लॉट बुक करें")}
                </Btn>
              </div>
            </div>
          ))}
        </div>
        <MyBookings />
        {hub && <BookModal hub={hub} onClose={() => setHub(null)} />}
      </div>
    </RepsProvider>
  );
}

function BookModal({ hub, onClose }: { hub: ColdRoom; onClose: () => void }) {
  const { s, set, t } = useStore();
  const inv = useInvalidate();
  const [crop, setCrop] = useState(s.prefillCrop ?? "strawberry");
  const [crates, setCrates] = useState(10);
  // Pre-coolers are usually needed for a few hours; ripening takes a few days.
  const [byHour, setByHour] = useState(hub.facility === "precool");
  const [days, setDays] = useState(hub.facility === "ripening" ? 4 : 1);
  const [hours, setHours] = useState(4);
  const perHour = hub.rate_per_crate_hour ?? Math.max(1, Math.ceil(hub.rate_per_crate_day / 12));
  const [mode, setMode] = useState<"upi" | "credit">("upi");
  const [step, setStep] = useState<"form" | "pay" | "pass">("form");
  const [pass, setPass] = useState<Booking | null>(null);
  const [err, setErr] = useState("");
  const total = byHour ? crates * hours * perHour : crates * days * hub.rate_per_crate_day;
  const valid =
    crates >= 1 &&
    crates <= hub.free &&
    (byHour ? hours >= 1 && hours <= 72 : days >= 1 && days <= 60);
  const confirm = async (u?: string, method?: string) => {
    // Amount, pass no., bay and the free-slot check are all decided by the database (create_booking).
    const { data, error } = await api.createBooking({
      coldRoomId: hub.id,
      crop,
      crates,
      ...(byHour ? { hours } : { days }),
      payMode: mode,
      ...(u ? { utr: u } : {}),
      ...(method ? { payMethod: method } : {}),
    });
    if (error || !data) {
      setErr(error?.message ?? "Booking failed");
      setStep("form");
      inv("cold_rooms");
      return;
    }
    set((x) => ({ ...x, prefillCrop: null }));
    inv("bookings", "cold_rooms");
    setPass(data as unknown as Booking);
    setStep("pass");
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={step === "pass" ? t("Storage gate pass", "गेट पास") : hub.name}
    >
      {step === "form" && (
        <div className="space-y-3">
          <Field label={t("Choose Crop", "फसल चुनें")}>
            <CropSelect value={crop} onChange={setCrop} />
          </Field>
          <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-secondary p-0.5">
            {(
              [
                [true, t("By the hour", "घंटे से")],
                [false, t("By the day", "दिन से")],
              ] as const
            ).map(([v, l]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setByHour(v)}
                className={`min-h-9 rounded-md text-sm font-medium ${byHour === v ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Number of crates", "क्रेट संख्या")}>
              <input
                type="number"
                min={1}
                max={hub.free}
                className={inputCls}
                value={crates}
                onChange={(e) => setCrates(Math.max(0, +e.target.value))}
              />
            </Field>
            {byHour ? (
              <Field label={t("Hours (1–72)", "घंटे (1–72)")}>
                <input
                  type="number"
                  min={1}
                  max={72}
                  className={inputCls}
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, +e.target.value))}
                />
              </Field>
            ) : (
              <Field label={t("Days (1–60)", "दिन (1–60)")}>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className={inputCls}
                  value={days}
                  onChange={(e) => setDays(Math.max(0, +e.target.value))}
                />
              </Field>
            )}
          </div>
          {!valid && (
            <p className="text-xs text-destructive">
              {byHour
                ? t(`Crates 1–${hub.free}, hours 1–72`, `क्रेट 1–${hub.free}, घंटे 1–72`)
                : t(`Crates 1–${hub.free}, days 1–60`, `क्रेट 1–${hub.free}, दिन 1–60`)}
            </p>
          )}
          <div className="space-y-2">
            {(
              [
                ["upi", t("Pay Now via UPI", "अभी UPI से भुगतान"), inr(total)],
                [
                  "credit",
                  t("Pay Later from Harvest Sale (FPO Credit)", "बिक्री से बाद में"),
                  "₹0 upfront",
                ],
              ] as const
            ).map(([k, l, v]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`flex w-full items-center justify-between rounded-lg border-2 p-3 text-left text-sm ${mode === k ? "border-primary bg-accent" : "border-border"}`}
              >
                <span className="font-semibold">{l}</span>
                <b className="text-primary">{v}</b>
              </button>
            ))}
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-sm">
            <span>
              {byHour
                ? `${crates} × ${hours} h × ₹${perHour}`
                : `${crates} × ${days} d × ₹${hub.rate_per_crate_day}`}
            </span>
            <b className="text-lg text-primary">{inr(total)}</b>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Btn
            className="w-full"
            disabled={!valid}
            onClick={() => (mode === "upi" ? setStep("pay") : confirm())}
          >
            {mode === "upi"
              ? t("Proceed to UPI", "UPI पर जाएँ")
              : t("Confirm Booking", "बुकिंग पक्की करें")}
          </Btn>
        </div>
      )}
      {step === "pay" && (
        <UpiPay
          amount={total}
          payee={hub.name}
          onPaid={(u, m) => confirm(u, m)}
          charge={{
            purpose: "booking",
            coldRoomId: hub.id,
            crop,
            crates,
            ...(byHour ? { hours } : { days }),
          }}
          onSettled={(r) => {
            set((x) => ({ ...x, prefillCrop: null }));
            inv("bookings", "cold_rooms");
            setPass(r.booking as Booking);
            setStep("pass");
          }}
        />
      )}
      {step === "pass" && pass && <GatePass b={pass} room={hub} />}
    </Modal>
  );
}

export function GatePass({ b, room }: { b: Booking; room?: ColdRoom }) {
  const { data: me } = useMe();
  const rooms = useColdRooms();
  const hub = room ?? rooms.data?.find((h) => h.id === b.cold_room_id);
  return (
    <div className="print-area certificate p-4 text-sm">
      <p className="text-center text-xs text-muted-foreground">ChillChain gate pass</p>
      <h4 className="text-center text-lg font-semibold text-primary">{hub?.name}</h4>
      <p className="text-center text-xs text-muted-foreground">
        {hub?.address}, {hub?.district}
      </p>
      <div className="my-3 flex justify-center">
        <div className="rounded bg-popover p-2">
          <QRCodeSVG
            value={`CC|${b.pass_no}|${b.bay}|${b.crates}|${me?.profile?.fpo_id}`}
            size={140}
            fgColor="#237A47"
            bgColor="transparent"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-y-1">
        <span>Pass No.</span>
        <b>{b.pass_no}</b>
        <span>Slot / Bay</span>
        <b className="text-success">Bay {b.bay}</b>
        <span>Grower</span>
        <b>{me?.profile?.full_name}</b>
        <span>Crop</span>
        <b>{cropBy(b.crop).en}</b>
        <span>{b.hours ? "Crates × Hours" : "Crates × Days"}</span>
        <b>
          {b.crates} × {b.hours ?? b.days}
        </b>
        <span>Until</span>
        <b>
          {new Date(b.ends_at).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </b>
        <span>Amount</span>
        <b>
          {inr(b.amount)} {b.paid ? "(Paid)" : "(FPO Credit)"}
        </b>
        <span>Date</span>
        <b>{b.created_at.slice(0, 10)}</b>
      </div>
      <Btn v="outline" className="mt-3 w-full" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print Pass
      </Btn>
    </div>
  );
}

function MyBookings() {
  const { t } = useStore();
  const bookings = useBookings();
  const [open, setOpen] = useState<Booking | null>(null);
  if (!bookings.data?.length) return null;
  return (
    <div className="mt-6">
      <Label>{t("Your gate passes", "मेरे गेट पास")}</Label>
      <div className="space-y-2">
        {bookings.data.map((b) => (
          <button
            key={b.id}
            onClick={() => setOpen(b)}
            className="card-classic flex w-full items-center justify-between px-3 py-2 text-left text-sm"
          >
            <span>
              {cropBy(b.crop).emoji} {b.pass_no} · Bay {b.bay} ·{" "}
              <span className="text-xs text-muted-foreground">{b.created_at.slice(0, 10)}</span>
            </span>
            <Badge tone={b.paid ? "green" : "amber"}>{b.paid ? "Paid" : "Credit"}</Badge>
          </button>
        ))}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Gate Pass">
        {open && <GatePass b={open} />}
      </Modal>
    </div>
  );
}
