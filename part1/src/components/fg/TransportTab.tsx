import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin, Phone, Snowflake, Truck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import { CropSelect } from "./CropSelect";
import {
  useColdRooms,
  useInvalidate,
  useLots,
  useMe,
  useTransportMeta,
  useTransports,
} from "@/lib/data";
import { inr } from "@/lib/income";
import type { Transport, TransportQuote, TransportStatus } from "@/lib/types";
import { Skeleton, Badge, Btn, Field, Label, SectionTitle, inputCls } from "./ui";
import { RepsProvider, UserRep } from "./KrishiSaakh";

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
// <input type="datetime-local"> works in local time; these convert to and from ISO.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const STATUS: Record<
  TransportStatus,
  { en: string; hi: string; tone: "gold" | "green" | "amber" | "red" | "muted" }
> = {
  requested: { en: "Finding driver", hi: "ड्राइवर खोज रहे हैं", tone: "amber" },
  assigned: { en: "Driver assigned", hi: "ड्राइवर तय", tone: "gold" },
  in_transit: { en: "On the way", hi: "रास्ते में", tone: "gold" },
  delivered: { en: "Delivered", hi: "पहुँच गया", tone: "green" },
  cancelled: { en: "Cancelled", hi: "रद्द", tone: "muted" },
};

export function TransportTab() {
  const { s, set, t, session } = useStore();
  const { data: me } = useMe();
  const meta = useTransportMeta();
  const rooms = useColdRooms();
  const lots = useLots();
  const trips = useTransports();
  const inv = useInvalidate();

  const vehicles = meta.data?.vehicles ?? [];
  const districts = meta.data?.districts ?? [];
  const myLots = (lots.data ?? []).filter(
    (l) => l.farmer_id === session?.user.id && (l.status === "open" || l.status === "escrow"),
  );

  const [lotId, setLotId] = useState("");
  // A scan can hand over its crop and sell-by time, which becomes the delivery deadline.
  const [crop, setCrop] = useState(s.prefillCrop ?? "strawberry");
  const [kg, setKg] = useState(150);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [reefer, setReefer] = useState(true);
  const [shared, setShared] = useState(true);
  const [date, setDate] = useState(todayIST());
  const [deadline, setDeadline] = useState(
    s.prefillSellBy && new Date(s.prefillSellBy).getTime() > Date.now()
      ? toLocalInput(s.prefillSellBy)
      : "",
  );
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (s.prefillCrop || s.prefillSellBy)
      set((x) => ({ ...x, prefillCrop: null, prefillSellBy: null }));
  }, [s.prefillCrop, s.prefillSellBy, set]);
  const [quote, setQuote] = useState<TransportQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Transport | null>(null);

  // Start from the farmer's own district.
  useEffect(() => {
    if (!from && me?.profile?.district) setFrom(me.profile.district);
  }, [from, me?.profile?.district]);

  // Keep the chosen vehicle able to carry the load: pick the smallest one that fits.
  useEffect(() => {
    if (!vehicles.length) return;
    const cur = vehicles.find((v) => v.key === vehicle);
    if (cur && cur.capacity_kg >= kg) return;
    setVehicle(vehicles.find((v) => v.capacity_kg >= kg)?.key ?? "");
  }, [vehicles, kg, vehicle]);

  const dest = useMemo(
    () =>
      to.startsWith("room:")
        ? { toRoomId: to.slice(5) }
        : to.startsWith("dist:")
          ? { toDistrict: to.slice(5) }
          : null,
    [to],
  );

  // Live fare estimate (the database calculates it; the browser only displays it).
  useEffect(() => {
    setQuote(null);
    setQuoteErr("");
    if (!from || !dest || !vehicle || kg < 1) return;
    let cancelled = false;
    const h = setTimeout(async () => {
      const r = await api.quoteTransport({ from, ...dest, vehicle, kg, reefer, shared });
      if (cancelled) return;
      if (r.error) setQuoteErr(r.error.message);
      else setQuote(r.data);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [from, dest, vehicle, kg, reefer, shared]);

  const pickLot = (id: string) => {
    setLotId(id);
    const l = myLots.find((x) => x.id === id);
    if (l) {
      setKg(l.kg);
      setCrop(l.crop);
    }
  };

  const book = async () => {
    if (!dest || !vehicle)
      return setErr(t("Choose where to deliver and a vehicle", "कहाँ पहुँचाना है और वाहन चुनें"));
    setBusy(true);
    setErr("");
    const r = await api.createTransport({
      from,
      ...dest,
      vehicle,
      kg,
      reefer,
      crop,
      shared,
      pickupDate: date,
      ...(deadline ? { deliverBy: new Date(deadline).toISOString() } : {}),
      ...(lotId ? { lotId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (r.error || !r.data) return setErr(r.error?.message ?? "Booking failed");
    setDone(r.data as unknown as Transport);
    inv("transports");
  };

  const setStatus = async (id: string, status: "cancelled" | "in_transit" | "delivered") => {
    setErr("");
    const r = await api.setTransportStatus(id, status);
    if (r.error) setErr(r.error.message);
    inv("transports");
  };

  const vName = (key: string) => {
    const v = vehicles.find((x) => x.key === key);
    return v ? t(v.name, v.name_hi ?? v.name) : key;
  };
  const noFit = vehicles.length > 0 && kg > Math.max(...vehicles.map((v) => v.capacity_kg));

  return (
    <RepsProvider ids={(trips.data ?? []).map((x) => x.transporter_user_id)}>
      <div>
        <SectionTitle
          icon={Truck}
          title={t("Reefer trucks", "रीफ़र ट्रक")}
          sub={t(
            "Share a cold truck with nearby growers or book a whole one, with a delivery deadline",
            "पास के उत्पादकों के साथ ठंडा ट्रक साझा करें या पूरा बुक करें, डिलीवरी की समय सीमा के साथ",
          )}
        />

        {done ? (
          <div className="card-classic mb-5 space-y-2 p-4 text-center">
            <Truck className="mx-auto h-8 w-8 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              {done.status === "assigned"
                ? t("Truck booked", "ट्रक बुक हो गया")
                : t("Request received", "अनुरोध मिल गया")}
            </h3>
            <p className="font-mono text-lg font-semibold tracking-wider">{done.trip_code}</p>
            <p className="text-sm text-muted-foreground">
              {done.from_district} → {done.to_label} · {done.pickup_date}
            </p>
            {done.pool_code && (
              <p className="text-sm">
                <Badge tone="gold">
                  <Users className="h-3 w-3" />
                  {t("Shared truck", "साझा ट्रक")} {done.pool_code}
                </Badge>
              </p>
            )}
            {done.deliver_by && (
              <p className="text-sm text-foreground">
                {t("Deliver by", "पहुँचाना है")} <b>{fmtWhen(done.deliver_by)}</b>
              </p>
            )}
            {done.status === "assigned" ? (
              <p className="text-sm">
                {t("Driver", "ड्राइवर")}: <b>{done.driver_name}</b>
                {done.driver_phone && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="font-semibold text-primary underline"
                      href={`tel:${done.driver_phone}`}
                    >
                      {done.driver_phone}
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "No driver is free yet. We will email you when one is assigned.",
                  "अभी कोई ड्राइवर खाली नहीं है। तय होते ही ईमेल मिलेगा।",
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("Estimated fare", "अनुमानित किराया")} {inr(done.amount)} ·{" "}
              {t("pay the driver after delivery", "डिलीवरी के बाद ड्राइवर को भुगतान करें")}
            </p>
            <Btn className="mt-2 w-full" onClick={() => setDone(null)}>
              {t("Book another truck", "एक और ट्रक बुक करें")}
            </Btn>
          </div>
        ) : (
          <div className="card-classic mb-5 space-y-3 p-4">
            {myLots.length > 0 && (
              <Field label={t("For one of my lots (optional)", "मेरे किसी लॉट के लिए (वैकल्पिक)")}>
                <select
                  className={inputCls}
                  value={lotId}
                  onChange={(e) => pickLot(e.target.value)}
                >
                  <option value="">{t("— none —", "— कोई नहीं —")}</option>
                  {myLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lot_code} · {cropBy(l.crop).en} · {l.kg} kg
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("Crop", "फसल")}>
                <CropSelect value={crop} onChange={setCrop} />
              </Field>
              <Field label={t("Weight (kg)", "वज़न (किग्रा)")}>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={kg}
                  onChange={(e) => setKg(Math.max(0, Math.floor(+e.target.value || 0)))}
                />
              </Field>
            </div>
            <Field label={t("Pickup from (district)", "कहाँ से उठाना है (ज़िला)")}>
              <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">{t("Choose district", "ज़िला चुनें")}</option>
                {districts.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}, {d.state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Deliver to", "कहाँ पहुँचाना है")}>
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">{t("Choose destination", "गंतव्य चुनें")}</option>
                <optgroup
                  label={t("Storage (pre-cool, cold, ripening)", "भंडारण (प्री-कूल, कोल्ड, पकाई)")}
                >
                  {(rooms.data ?? []).map((r) => (
                    <option key={r.id} value={`room:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup
                  label={t("Buyer city / market (district)", "खरीदार का शहर / बाज़ार (ज़िला)")}
                >
                  {districts.map((d) => (
                    <option key={d.name} value={`dist:${d.name}`}>
                      {d.name}, {d.state}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            <div>
              <Label>{t("Vehicle", "वाहन")}</Label>
              {noFit && (
                <p className="mb-2 text-xs font-semibold text-destructive">
                  {t(
                    "This is more than one truck can carry. Split it into two bookings.",
                    "यह एक ट्रक से ज़्यादा है। दो बुकिंग करें।",
                  )}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {vehicles.map((v) => {
                  const fits = v.capacity_kg >= kg;
                  const on = vehicle === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      disabled={!fits}
                      onClick={() => setVehicle(v.key)}
                      className={`rounded-lg border-2 p-2 text-left text-xs disabled:opacity-40 ${on ? "border-primary bg-accent" : "border-border"}`}
                    >
                      <b className="block text-sm text-foreground">
                        {t(v.name, v.name_hi ?? v.name)}
                      </b>
                      <span className="text-muted-foreground">
                        {t("Up to", "अधिकतम")} {v.capacity_kg.toLocaleString("en-IN")} kg
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [
                    true,
                    Users,
                    t("Share a truck", "ट्रक साझा करें"),
                    t(
                      "Pool with growers going the same way; pay for your boxes only",
                      "उसी रास्ते के उत्पादकों के साथ; सिर्फ़ अपने माल का किराया",
                    ),
                  ],
                  [
                    false,
                    Truck,
                    t("Whole truck", "पूरा ट्रक"),
                    t("Leave as soon as you load", "लोड होते ही निकलें"),
                  ],
                ] as const
              ).map(([v, I, l, d]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setShared(v)}
                  className={`rounded-lg border-2 p-2 text-left text-xs ${shared === v ? "border-primary bg-accent" : "border-border"}`}
                >
                  <b className="flex items-center gap-1 text-sm text-foreground">
                    <I className="h-4 w-4" />
                    {l}
                  </b>
                  <span className="text-muted-foreground">{d}</span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reefer}
                onChange={(e) => setReefer(e.target.checked)}
              />
              <Snowflake className="h-4 w-4 text-chill" />
              {t(
                "Refrigerated (reefer) body (+35%): keep the cold chain unbroken",
                "रीफ़र (ठंडा) ट्रक (+35%): कोल्ड चेन न टूटे",
              )}
            </label>

            <Field label={t("Pickup date", "उठाने की तारीख")}>
              <input
                type="date"
                className={inputCls}
                min={todayIST()}
                max={addDays(todayIST(), 30)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field
              label={t(
                "Deliver by (optional, from your sell-by clock)",
                "कब तक पहुँचाना है (वैकल्पिक, बिक्री घड़ी से)",
              )}
            >
              <input
                type="datetime-local"
                className={inputCls}
                value={deadline}
                min={toLocalInput(new Date().toISOString())}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            <Field label={t("Note for the driver (optional)", "ड्राइवर के लिए नोट (वैकल्पिक)")}>
              <input
                className={inputCls}
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("Village road, gate, landmark…", "गाँव का रास्ता, पहचान…")}
              />
            </Field>

            <div className="rounded-lg bg-popover p-3 text-sm">
              {quote ? (
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {shared
                        ? t("Your share of the fare", "किराये में आपका हिस्सा")
                        : t("Estimated fare", "अनुमानित किराया")}
                    </p>
                    <p className="text-2xl font-semibold text-primary">{inr(quote.amount)}</p>
                  </div>
                  <p className="text-right text-xs text-muted-foreground">
                    ~{quote.distance_km} km
                    <br />
                    {vName(vehicle)}
                  </p>
                </div>
              ) : quoteErr ? (
                <p className="text-xs font-semibold text-destructive">{quoteErr}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("Choose a destination to see the fare.", "किराया देखने के लिए गंतव्य चुनें।")}
                </p>
              )}
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                {t(
                  "Fare is an estimate based on distance. Pay the driver directly after delivery.",
                  "किराया दूरी पर आधारित अनुमान है। डिलीवरी के बाद ड्राइवर को सीधे भुगतान करें।",
                )}
              </p>
            </div>
            {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
            <Btn className="w-full" onClick={book} disabled={busy || !quote || !from || kg < 1}>
              <Truck className="h-4 w-4" />
              {busy
                ? t("Booking…", "बुक हो रहा है…")
                : shared
                  ? t("Join a shared truck", "साझा ट्रक में जुड़ें")
                  : t("Book truck", "ट्रक बुक करें")}
            </Btn>
          </div>
        )}

        <Label>{t("My trips", "मेरी यात्राएँ")}</Label>
        <div className="space-y-3">
          {trips.isLoading && <Skeleton rows={2} />}
          {!trips.isLoading && (trips.data ?? []).length === 0 && (
            <p className="card-classic p-4 text-center text-sm text-muted-foreground">
              {t("No trips yet.", "अभी कोई यात्रा नहीं।")}
            </p>
          )}
          {(trips.data ?? []).map((x) => {
            const st = STATUS[x.status];
            return (
              <div key={x.id} className="card-classic p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold">{x.trip_code}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {x.from_district} → {x.to_label}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{t(st.en, st.hi)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {cropBy(x.crop).emoji} {cropBy(x.crop).en} · {x.kg.toLocaleString("en-IN")} kg ·{" "}
                  {vName(x.vehicle_key)}
                  {x.reefer ? " · ❄" : ""} · ~{x.distance_km} km
                </p>
                {(x.pool_code || x.deliver_by) && (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {x.pool_code && (
                      <Badge tone="gold">
                        <Users className="h-3 w-3" />
                        {t("Shared", "साझा")} {x.pool_code}
                      </Badge>
                    )}
                    {x.deliver_by && (
                      <Badge tone={new Date(x.deliver_by).getTime() < Date.now() ? "red" : "muted"}>
                        <Clock className="h-3 w-3" />
                        {t("By", "तक")} {fmtWhen(x.deliver_by)}
                      </Badge>
                    )}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {x.pickup_date} · {t("Fare", "किराया")} {inr(x.amount)}
                </p>
                {x.driver_name && x.status !== "cancelled" && (
                  <p className="mt-2 flex items-center gap-1 text-sm">
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    {x.driver_name}
                    {x.driver_phone && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="font-semibold text-primary underline"
                          href={`tel:${x.driver_phone}`}
                        >
                          {x.driver_phone}
                        </a>
                      </>
                    )}
                    {x.vehicle_no && (
                      <span className="text-xs text-muted-foreground"> · {x.vehicle_no}</span>
                    )}
                    <span className="ml-1">
                      <UserRep id={x.transporter_user_id} flow={4} />
                    </span>
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  {x.status === "assigned" && (
                    <Btn className="flex-1" onClick={() => setStatus(x.id, "in_transit")}>
                      {t("Picked up", "उठा लिया")}
                    </Btn>
                  )}
                  {x.status === "in_transit" && (
                    <Btn className="flex-1" onClick={() => setStatus(x.id, "delivered")}>
                      {t("Mark delivered", "पहुँच गया")}
                    </Btn>
                  )}
                  {(x.status === "requested" || x.status === "assigned") && (
                    <Btn
                      v="outline"
                      className="flex-1"
                      onClick={() => setStatus(x.id, "cancelled")}
                    >
                      {t("Cancel", "रद्द करें")}
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </RepsProvider>
  );
}
