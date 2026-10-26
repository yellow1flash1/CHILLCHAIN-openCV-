import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  PackageCheck,
  Plus,
  ShoppingBasket,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import { CropSelect } from "./CropSelect";
import {
  useInvalidate,
  useLots,
  useMe,
  usePreorders,
  useRate,
  useSettings,
  useTransportMeta,
  type Lot,
} from "@/lib/data";
import { inr } from "@/lib/income";
import { CHANNEL, channelFor, priceFactor, type Channel } from "@/lib/shelf";
import { Badge, Btn, Empty, Field, Modal, SectionTitle, inputCls } from "./ui";
import { TopBar } from "./TopBar";
import { UpiPay } from "./UpiPay";
import { RatePrompt, RepsProvider, UserRep } from "./KrishiSaakh";
import { SellClock, useNow } from "./SellClock";
import { LivePricesSheet } from "./LivePrices";

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
/** What confirm_delivery reports back. */
type Settled = {
  utr: string;
  accepted_kg: number;
  rejected_kg: number;
  released: number;
  refund: number;
};
const REJECT_REASONS: [string, string][] = [
  ["Bruised or soft", "दबा या नरम"],
  ["Rot or mould", "सड़न या फफूँद"],
  ["Under-ripe or over-ripe", "कच्चा या ज़्यादा पका"],
  ["Below the agreed grade", "तय ग्रेड से कम"],
  ["Short weight", "वज़न कम"],
  ["Other", "अन्य"],
];
const addDays = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export function BuyerShell() {
  const { s, t, session } = useStore();
  const { data: me } = useMe();
  const lots = useLots();
  const rate = useRate();
  const inv = useInvalidate();
  const now = useNow();
  const [tab, setTab] = useState<"market" | "preorders" | "orders">("market");
  const [crop, setCrop] = useState("all");
  const [pricesOpen, setPricesOpen] = useState(false);
  // Processors start on the C-grade / expiring lots; everyone else on premium retail.
  const [channel, setChannel] = useState<Channel | "all">(
    me?.profile?.buyer_type === "processor" ? "processor" : "all",
  );
  const [buy, setBuy] = useState<Lot | null>(null);
  const [confirm, setConfirm] = useState<Lot | null>(null);
  const [code, setCode] = useState("");
  const [accKg, setAccKg] = useState(0); // weight accepted at delivery; the rest is rejected
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Settled | null>(null);
  const all = lots.data ?? [];
  const prefs = useSettings().data?.settings;
  const liked = (l: Lot) =>
    (prefs?.buyCrops?.includes(l.crop) ? 2 : 0) +
    (l.farmer_district && prefs?.buyDistricts?.includes(l.farmer_district) ? 1 : 0);
  // Price right now (the database fixes the same price when the order is placed).
  const priceNow = (l: Lot) =>
    Math.round(l.base_price * priceFactor(l.created_at, l.sell_by, now) * 100) / 100;
  const orderable = (l: Lot) => !l.sell_by || new Date(l.sell_by).getTime() + 86_400_000 > now;
  // Lots matching the buyer's crops and districts (Settings) come first, then the most urgent.
  const market = all
    .filter(
      (l) =>
        l.status === "open" &&
        orderable(l) &&
        (crop === "all" || l.crop === crop) &&
        (channel === "all" || channelFor(l.grade, l.created_at, l.sell_by, now) === channel),
    )
    .sort(
      (a, b) =>
        liked(b) - liked(a) ||
        (a.sell_by ? new Date(a.sell_by).getTime() : Infinity) -
          (b.sell_by ? new Date(b.sell_by).getTime() : Infinity),
    );
  const mine = all.filter((l) => l.buyer_id === session?.user.id);
  const desktop = s.mode === "desktop";

  const order = async (l: Lot) => {
    const { error } = await api.placeOrder(l.id);
    setBuy(null);
    if (error) return setErr(error.message);
    inv("lots");
    setTab("orders");
  };
  const confirmDelivery = async () => {
    if (!confirm) return;
    setErr("");
    const rejected = confirm.kg - accKg;
    if (accKg < 0 || accKg > confirm.kg)
      return setErr(t(`Enter 0 to ${confirm.kg} kg`, `0 से ${confirm.kg} किग्रा डालें`));
    if (rejected > 0 && !reason)
      return setErr(t("Choose why part of the lot is rejected", "कारण चुनें कि माल क्यों लौटाया"));
    // The code is checked in the database; the buyer's app never sees the real code.
    const { data, error } = await api.confirmDelivery(
      confirm.id,
      code.trim(),
      accKg,
      rejected > 0 ? [reason, note.trim()].filter(Boolean).join(": ") : undefined,
    );
    if (error) return setErr(error.message);
    const r = data as Settled & { status: "ok" | "wrong_code" | "locked"; attempts_left?: number };
    if (r.status === "wrong_code")
      return setErr(
        t(
          `Wrong code — ${r.attempts_left} attempt(s) left`,
          `गलत कोड — ${r.attempts_left} कोशिश बाकी`,
        ),
      );
    if (r.status === "locked")
      return setErr(
        t(
          "Too many wrong attempts. Ask the grower to generate a new code.",
          "बहुत गलत कोशिशें। उत्पादक से नया कोड बनवाएँ।",
        ),
      );
    setDone(r);
    inv("lots");
  };

  return (
    <RepsProvider ids={(lots.data ?? []).map((l) => l.farmer_id)}>
      <div className="min-h-screen">
        <TopBar />
        <div className={`mx-auto px-4 py-4 ${desktop ? "max-w-5xl" : "max-w-[680px]"}`}>
          <RatePrompt />
          <div className="mb-4 grid grid-cols-3 gap-0.5 rounded-[9px] bg-secondary p-0.5">
            {(
              [
                ["market", ShoppingBasket, t("Market", "बाज़ार")],
                ["preorders", ClipboardList, t("Pre-orders", "प्री-ऑर्डर")],
                ["orders", PackageCheck, t("My orders", "मेरे ऑर्डर")],
              ] as const
            ).map(([k, I, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center justify-center gap-1 rounded-md py-2 text-sm font-medium ${tab === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <I className="h-4 w-4" />
                {l}
              </button>
            ))}
          </div>
          {err && (
            <p className="mb-3 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </p>
          )}
          {tab === "market" && (
            <>
              <SectionTitle
                icon={ShoppingBasket}
                title={t("Graded lots, live sell-by clock", "ग्रेड किए लॉट, लाइव बिक्री घड़ी")}
                sub={t(
                  "Prices step down as lots age. Pay into escrow; it is released on delivery.",
                  "समय के साथ भाव घटता है। एस्क्रो में भुगतान, डिलीवरी पर जारी।",
                )}
              />
              <button
                onClick={() => setPricesOpen(true)}
                className="card-classic mb-3 flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-70"
              >
                <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {t("Live mandi prices", "लाइव मंडी भाव")}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {t(
                      "Compare lot prices with today's government mandi rates",
                      "लॉट के भाव की तुलना आज के सरकारी मंडी भाव से करें",
                    )}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {pricesOpen && <LivePricesSheet open onClose={() => setPricesOpen(false)} />}
              <div className="mb-3 flex flex-wrap gap-2">
                {(["all", "retail", "flash", "processor"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setChannel(k)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${channel === k ? "border-primary/30 bg-accent text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {k === "all" ? t("All lots", "सभी लॉट") : t(CHANNEL[k].en, CHANNEL[k].hi)}
                  </button>
                ))}
              </div>
              <CropSelect className="mb-4" value={crop} onChange={setCrop} allowAll />
              {market.length === 0 && (
                <Empty
                  icon={ShoppingBasket}
                  title={t("No lots here right now", "अभी यहाँ कोई लॉट नहीं")}
                  sub={t(
                    "New lots appear as growers scan and list them. Post a pre-order so growers can plan for you.",
                    "उत्पादक स्कैन करके लॉट डालते ही यहाँ दिखेंगे। प्री-ऑर्डर डालें ताकि उत्पादक आपके लिए योजना बना सकें।",
                  )}
                  action={
                    <Btn v="outline" onClick={() => setTab("preorders")}>
                      <Plus className="h-4 w-4" />
                      {t("Post a pre-order", "प्री-ऑर्डर डालें")}
                    </Btn>
                  }
                />
              )}
              <div className={`grid gap-3 ${desktop ? "grid-cols-2" : ""}`}>
                {market.map((l) => {
                  const m = rate(l.crop, 0);
                  const p = priceNow(l);
                  const ch = CHANNEL[channelFor(l.grade, l.created_at, l.sell_by, now)];
                  const total = Math.round(l.kg * p);
                  return (
                    <div key={l.id} className="card-classic p-4">
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="text-lg font-bold text-primary">
                            {cropBy(l.crop).emoji} {t(cropBy(l.crop).en, cropBy(l.crop).hi)} ·{" "}
                            {l.kg.toLocaleString("en-IN")} kg
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {l.farmer_name} · {l.farmer_district} · {l.lot_code}
                          </p>
                          <div className="mt-1">
                            <UserRep id={l.farmer_id} flow={2} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            tone={l.grade === "A" ? "green" : l.grade === "B" ? "amber" : "red"}
                          >
                            {t("Grade", "ग्रेड")} {l.grade}
                          </Badge>
                          <Badge tone={ch.tone}>{t(ch.en, ch.hi)}</Badge>
                          {l.grade_source && l.grade_source !== "simulated" && (
                            <Badge tone={l.grade_source === "self" ? "muted" : "green"}>
                              {l.grade_source === "self"
                                ? t("Self-graded", "खुद ग्रेड किया")
                                : t("AI-checked", "एआई से जाँचा")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {l.sell_by && (
                        <SellClock className="mt-2" sellBy={l.sell_by} from={l.created_at} />
                      )}
                      <div className="mt-2 flex items-end justify-between">
                        <div>
                          <p className="text-sm">
                            {p < l.base_price && (
                              <s className="mr-1 text-xs text-muted-foreground">₹{l.base_price}</s>
                            )}
                            ₹{p}/kg
                          </p>
                          {m.live && (
                            <p className="text-[0.65rem] text-muted-foreground">
                              {t("Market today", "आज बाज़ार")}: ₹{m.rate}/kg
                            </p>
                          )}
                        </div>
                        <p className="text-xl font-semibold text-primary">{inr(total)}</p>
                      </div>
                      <Btn
                        className="mt-3 w-full"
                        onClick={() => {
                          setErr("");
                          setBuy(l);
                        }}
                      >
                        {t("Order & pay into escrow", "ऑर्डर करें, एस्क्रो में भुगतान")}
                      </Btn>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {tab === "preorders" && <Preorders />}
          {tab === "orders" && (
            <>
              <SectionTitle
                icon={PackageCheck}
                title={t("My orders", "मेरे ऑर्डर")}
                sub={t(
                  "Confirm delivery with the grower's code to release payment",
                  "उत्पादक के कोड से डिलीवरी पक्की करके भुगतान जारी करें",
                )}
              />
              {mine.length === 0 && (
                <p className="card-classic p-4 text-sm text-muted-foreground">
                  {t("No orders yet.", "अभी कोई ऑर्डर नहीं।")}
                </p>
              )}
              <div className="space-y-3">
                {mine.map((l) => (
                  <div key={l.id} className="card-classic p-4">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-bold text-primary">
                          {cropBy(l.crop).emoji} {l.kg.toLocaleString("en-IN")} kg{" "}
                          {t(cropBy(l.crop).en, cropBy(l.crop).hi)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.farmer_name} · {l.lot_code}
                          {l.preorder_id
                            ? ` · ${t("from your pre-order", "आपके प्री-ऑर्डर से")}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        tone={
                          l.status === "rejected"
                            ? "red"
                            : l.status === "settled"
                              ? l.rejected_kg
                                ? "amber"
                                : "green"
                              : "amber"
                        }
                      >
                        {l.status === "rejected"
                          ? t("Rejected", "लौटाया")
                          : l.status === "settled"
                            ? l.rejected_kg
                              ? t("Partly accepted", "आंशिक स्वीकार")
                              : t("Delivered", "डिलीवर")
                            : t("Awaiting delivery", "डिलीवरी बाकी")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm">
                      {inr(Math.round((l.accepted_kg ?? l.kg) * Number(l.price_per_kg)))} · ₹
                      {l.price_per_kg}/kg
                      {l.utr ? ` · Ref ${l.utr}` : ""}
                    </p>
                    {l.rejected_kg > 0 && (
                      <p className="mt-1 text-xs text-warning">
                        {t(
                          `Accepted ${l.accepted_kg} kg · ${l.rejected_kg} kg rejected (${l.reject_reason ?? ""}), refunded`,
                          `${l.accepted_kg} किग्रा स्वीकार · ${l.rejected_kg} किग्रा लौटाया (${l.reject_reason ?? ""}), पैसा वापस`,
                        )}
                      </p>
                    )}
                    {l.status === "escrow" && (
                      <Btn
                        className="mt-3 w-full"
                        onClick={() => {
                          setErr("");
                          setCode("");
                          setAccKg(l.kg);
                          setReason("");
                          setNote("");
                          setDone(null);
                          setConfirm(l);
                        }}
                      >
                        {t("Confirm delivery & release payment", "डिलीवरी पक्की करें")}
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <Modal
          open={!!buy}
          onClose={() => setBuy(null)}
          title={t("Pay into escrow", "एस्क्रो भुगतान")}
        >
          {buy && (
            <UpiPay
              amount={Math.round(buy.kg * priceNow(buy))}
              payee={`Escrow · ${buy.farmer_name}`}
              onPaid={() => order(buy)}
              charge={{ purpose: "lot", lotId: buy.id }}
              onSettled={() => {
                setBuy(null);
                inv("lots");
                setTab("orders");
              }}
            />
          )}
        </Modal>
        <Modal
          open={!!confirm}
          onClose={() => setConfirm(null)}
          title={t("Confirm delivery", "डिलीवरी पुष्टि")}
        >
          {confirm &&
            (done ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
                <p className="mt-2 text-xl font-bold text-success">
                  {done.accepted_kg
                    ? t("Payment released to grower", "उत्पादक को भुगतान जारी")
                    : t("Lot rejected", "लॉट लौटाया गया")}
                </p>
                <p className="text-sm">
                  {t(
                    `${done.accepted_kg} kg accepted · ${inr(done.released)} released`,
                    `${done.accepted_kg} किग्रा स्वीकार · ${inr(done.released)} जारी`,
                  )}
                  {done.rejected_kg > 0 &&
                    t(
                      ` · ${done.rejected_kg} kg rejected · ${inr(done.refund)} back to you`,
                      ` · ${done.rejected_kg} किग्रा लौटाया · ${inr(done.refund)} आपको वापस`,
                    )}
                </p>
                <p className="font-mono text-sm">Ref: {done.utr}</p>
                <Btn className="mt-4 w-full" onClick={() => setConfirm(null)}>
                  {t("Done", "हो गया")}
                </Btn>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  {t(
                    "Ask the grower for the 6-digit delivery code shown in their app:",
                    "उत्पादक से 6 अंकों का डिलीवरी कोड लें:",
                  )}
                </p>
                <input
                  className={inputCls + " font-mono tracking-[0.3em]"}
                  inputMode="numeric"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
                <Field
                  label={t(
                    `Weight you accept (of ${confirm.kg} kg)`,
                    `आप कितना स्वीकार करते हैं (${confirm.kg} किग्रा में से)`,
                  )}
                >
                  <input
                    type="number"
                    min={0}
                    max={confirm.kg}
                    className={inputCls}
                    value={accKg}
                    onChange={(e) => setAccKg(Math.max(0, Math.floor(+e.target.value || 0)))}
                  />
                </Field>
                {accKg < confirm.kg && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        `Why are ${confirm.kg - accKg} kg rejected? The grower sees this.`,
                        `${confirm.kg - accKg} किग्रा क्यों लौटाया? उत्पादक यह देखेगा।`,
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECT_REASONS.map(([en, hi]) => (
                        <button
                          key={en}
                          type="button"
                          onClick={() => setReason(en)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${reason === en ? "border-primary/40 bg-accent text-primary" : "border-border text-muted-foreground"}`}
                        >
                          {t(en, hi)}
                        </button>
                      ))}
                    </div>
                    <input
                      className={inputCls}
                      maxLength={120}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("Details (optional)", "विवरण (वैकल्पिक)")}
                    />
                  </div>
                )}
                <p className="rounded-lg bg-popover p-3 text-xs">
                  {t(
                    `${inr(Math.round(accKg * Number(confirm.price_per_kg)))} goes to the grower`,
                    `${inr(Math.round(accKg * Number(confirm.price_per_kg)))} उत्पादक को`,
                  )}
                  {accKg < confirm.kg &&
                    t(
                      ` · ${inr(Math.round((confirm.kg - accKg) * Number(confirm.price_per_kg)))} back to you`,
                      ` · ${inr(Math.round((confirm.kg - accKg) * Number(confirm.price_per_kg)))} आपको वापस`,
                    )}
                </p>
                {err && <p className="text-xs text-destructive">{err}</p>}
                <Btn className="w-full" onClick={confirmDelivery}>
                  {accKg < confirm.kg
                    ? t("Confirm partial delivery", "आंशिक डिलीवरी पक्की करें")
                    : t("Confirm & release", "पुष्टि करें")}
                </Btn>
              </div>
            ))}
        </Modal>
      </div>
    </RepsProvider>
  );
}

/** Buyer posts what they need before harvest; growers accept and the money goes into escrow. */
function Preorders() {
  const { t, session } = useStore();
  const pre = usePreorders();
  const meta = useTransportMeta();
  const rate = useRate();
  const inv = useInvalidate();
  const [crop, setCrop] = useState("strawberry");
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [kg, setKg] = useState(200);
  const [price, setPrice] = useState(() => rate("strawberry", cropBy("strawberry").rate).rate);
  const [needBy, setNeedBy] = useState(addDays(todayIST(), 7));
  const [district, setDistrict] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = (pre.data ?? []).filter((p) => p.buyer_id === session?.user.id);

  const post = async () => {
    setBusy(true);
    setErr("");
    const r = await api.createPreorder({
      crop,
      grade,
      kg,
      price,
      needBy,
      ...(district ? { district } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    setNotes("");
    inv("preorders");
  };
  const cancel = async (id: string) => {
    const r = await api.cancelPreorder(id);
    if (r.error) setErr(r.error.message);
    inv("preorders");
  };

  return (
    <>
      <SectionTitle
        icon={ClipboardList}
        title={t("Pre-orders", "प्री-ऑर्डर")}
        sub={t(
          "Tell growers what you need before harvest. When one accepts, payment is held in escrow.",
          "तोड़ने से पहले उत्पादकों को अपनी ज़रूरत बताएँ। स्वीकार होते ही भुगतान एस्क्रो में रहेगा।",
        )}
      />
      <div className="card-classic mb-5 space-y-3 p-4">
        <Field label={t("Produce", "माल")}>
          <CropSelect
            value={crop}
            onChange={(k) => {
              setCrop(k);
              setPrice(rate(k, cropBy(k).rate).rate);
            }}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("Min. grade", "न्यूनतम ग्रेड")}>
            <select
              className={inputCls}
              value={grade}
              onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C ({t("processing", "प्रोसेसिंग")})</option>
            </select>
          </Field>
          <Field label={t("Quantity (kg)", "मात्रा (किग्रा)")}>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={kg}
              onChange={(e) => setKg(Math.max(0, Math.floor(+e.target.value || 0)))}
            />
          </Field>
          <Field label={t("Price ₹/kg", "भाव ₹/किग्रा")}>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(Math.max(0, +e.target.value))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Needed by", "कब तक चाहिए")}>
            <input
              type="date"
              className={inputCls}
              min={todayIST()}
              max={addDays(todayIST(), 120)}
              value={needBy}
              onChange={(e) => setNeedBy(e.target.value)}
            />
          </Field>
          <Field label={t("Deliver to (district)", "कहाँ (ज़िला)")}>
            <select
              className={inputCls}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="">{t("— any —", "— कोई भी —")}</option>
              {(meta.data?.districts ?? []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}, {d.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("Notes for growers (optional)", "उत्पादकों के लिए नोट (वैकल्पिक)")}>
          <input
            className={inputCls}
            maxLength={200}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("e.g. 250 g punnets, 18–22 mm berries", "जैसे 250 ग्रा. डिब्बे")}
          />
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-popover p-3 text-sm">
          <span>{t("Escrow on acceptance", "स्वीकार होने पर एस्क्रो")}</span>
          <b className="text-primary">{inr(Math.round(kg * price))}</b>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Btn className="w-full" disabled={busy || kg < 1 || price <= 0} onClick={post}>
          <Plus className="h-4 w-4" />
          {busy ? "…" : t("Post pre-order", "प्री-ऑर्डर डालें")}
        </Btn>
      </div>
      <div className="space-y-2">
        {mine.map((p) => (
          <div key={p.id} className="card-classic flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="flex-1">
              {cropBy(p.crop).emoji} {p.kg} kg {t(cropBy(p.crop).en, cropBy(p.crop).hi)} ·{" "}
              {t("grade", "ग्रेड")} {p.min_grade} · ₹{p.price_per_kg}/kg · {t("by", "तक")}{" "}
              {p.need_by}
            </span>
            <Badge
              tone={
                p.status === "matched"
                  ? "green"
                  : p.status === "open"
                    ? p.kg_remaining < p.kg
                      ? "gold"
                      : "amber"
                    : "muted"
              }
            >
              {p.status === "matched"
                ? t("Fully taken", "पूरा भरा")
                : p.status === "open" && p.kg_remaining < p.kg
                  ? t(
                      `${p.kg - p.kg_remaining} of ${p.kg} kg taken`,
                      `${p.kg} में से ${p.kg - p.kg_remaining} किग्रा भरा`,
                    )
                  : p.status === "open"
                    ? t("Waiting", "इंतज़ार")
                    : t("Cancelled", "रद्द")}
            </Badge>
            {p.status === "open" && (
              <Btn v="ghost" className="px-2 py-1 text-xs" onClick={() => cancel(p.id)}>
                {t("Cancel", "रद्द करें")}
              </Btn>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
