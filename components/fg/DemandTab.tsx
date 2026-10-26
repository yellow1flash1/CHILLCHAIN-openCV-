import { useState } from "react";
import { CalendarDays, Handshake, MapPin, Megaphone, Store } from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import { useInvalidate, useLots, usePreorders, useSettings } from "@/lib/data";
import { inr } from "@/lib/income";
import { CHANNEL, channelFor, priceFactor } from "@/lib/shelf";
import { Badge, Btn, Empty, Field, Label, Modal, SectionTitle, inputCls } from "./ui";
import { BUYER_TYPES } from "./roles";
import { RepsProvider, UserRep } from "./KrishiSaakh";
import { SellClock, useNow } from "./SellClock";
import type { Preorder } from "@/lib/types";

/** Grower: buyer demand posted before harvest, plus their own lots on the market with the live price. */
export function DemandTab() {
  const { s, set, t, session } = useStore();
  const pre = usePreorders();
  const lots = useLots();
  const settings = useSettings();
  const inv = useInvalidate();
  const now = useNow();
  const [mineOnly, setMineOnly] = useState(true);
  const [take, setTake] = useState<Preorder | null>(null);
  const [takeKg, setTakeKg] = useState(0); // a grower may take only part of a pre-order
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const uid = session?.user.id;
  const myCrops = settings.data?.settings.crops ?? [];
  const open = (pre.data ?? []).filter(
    (p) => p.status === "open" && p.kg_remaining > 0 && p.buyer_id !== uid && !p.my_kg,
  );
  const shown = open.filter((p) => !mineOnly || !myCrops.length || myCrops.includes(p.crop));
  const taken = (pre.data ?? []).filter((p) => p.my_kg > 0);
  const listed = (lots.data ?? []).filter((l) => l.farmer_id === uid && l.status === "open");
  const name = (k: string) => t(cropBy(k).en, cropBy(k).hi);
  const buyerType = (k: string | null) => BUYER_TYPES.find((b) => b.k === k);

  const accept = async () => {
    if (!take) return;
    if (takeKg < 1 || takeKg > take.kg_remaining)
      return setErr(
        t(`Enter 1 to ${take.kg_remaining} kg`, `1 से ${take.kg_remaining} किग्रा डालें`),
      );
    setBusy(true);
    setErr("");
    const r = await api.acceptPreorder(take.id, takeKg);
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    setTake(null);
    inv("preorders", "lots");
  };

  return (
    <RepsProvider ids={open.map((p) => p.buyer_id)}>
      <div>
        <SectionTitle
          icon={Megaphone}
          title={t("Buyer demand", "खरीदार की माँग")}
          sub={t(
            "Lock a price before you harvest: buyers pay into escrow when you accept",
            "तोड़ने से पहले भाव पक्का करें: आपके स्वीकार करते ही खरीदार एस्क्रो में भुगतान करता है",
          )}
        />
        {myCrops.length > 0 && (
          <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            {t("Only crops I grow (Settings → My farm)", "सिर्फ़ मेरी फसलें (सेटिंग → मेरा खेत)")}
          </label>
        )}
        {pre.isLoading ? null : shown.length === 0 ? (
          <Empty
            icon={Store}
            title={t("No open pre-orders right now", "अभी कोई खुला प्री-ऑर्डर नहीं")}
            sub={t(
              "Quick-commerce, hotels, exporters and florists post what they need here. You can still list a scanned lot on the market.",
              "क्विक-कॉमर्स, होटल, निर्यातक और फूलवाले अपनी ज़रूरत यहाँ डालते हैं। आप स्कैन किया लॉट बाज़ार में डाल सकते हैं।",
            )}
            action={
              <Btn v="outline" onClick={() => set((x) => ({ ...x, tab: "scan" }))}>
                {t("Scan a lot", "लॉट स्कैन करें")}
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((p) => {
              const bt = buyerType(p.buyer_type);
              return (
                <div key={p.id} className="card-classic p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">
                        {cropBy(p.crop).emoji} {p.kg_remaining.toLocaleString("en-IN")} kg{" "}
                        {name(p.crop)}
                      </p>
                      {p.kg_remaining < p.kg && (
                        <p className="text-xs text-success">
                          {t(
                            `${p.kg - p.kg_remaining} of ${p.kg} kg already taken by other growers`,
                            `${p.kg} में से ${p.kg - p.kg_remaining} किग्रा दूसरे उत्पादक ले चुके`,
                          )}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {p.buyer_name}
                        {bt ? ` · ${t(bt.en, bt.hi)}` : ""}
                      </p>
                      <div className="mt-1">
                        <UserRep id={p.buyer_id} flow={5} />
                      </div>
                    </div>
                    <Badge tone="green">
                      {t("Grade", "ग्रेड")} {p.min_grade}
                      {p.min_grade !== "A" ? "+" : ""}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge tone="muted">
                      <CalendarDays className="h-3 w-3" />
                      {t("Needed by", "कब तक")} {p.need_by}
                    </Badge>
                    {p.deliver_district && (
                      <Badge tone="muted">
                        <MapPin className="h-3 w-3" />
                        {p.deliver_district}
                      </Badge>
                    )}
                  </div>
                  {p.notes && (
                    <p className="mt-2 rounded bg-popover px-2 py-1.5 text-xs text-muted-foreground">
                      “{p.notes}”
                    </p>
                  )}
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-sm">₹{p.price_per_kg}/kg</p>
                    <p className="text-xl font-semibold text-primary">
                      {inr(Math.round(p.kg_remaining * p.price_per_kg))}
                    </p>
                  </div>
                  <Btn
                    className="mt-3 w-full"
                    onClick={() => {
                      setErr("");
                      setTakeKg(p.kg_remaining);
                      setTake(p);
                    }}
                  >
                    <Handshake className="h-4 w-4" />
                    {t("Accept & lock price", "स्वीकार करें, भाव पक्का")}
                  </Btn>
                </div>
              );
            })}
          </div>
        )}

        {taken.length > 0 && (
          <div className="mt-6">
            <Label>{t("Pre-orders you took", "आपके लिए प्री-ऑर्डर")}</Label>
            <div className="ios-list">
              {taken.map((p) => (
                <button
                  key={p.id}
                  onClick={() => set((x) => ({ ...x, tab: "pay" }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm active:bg-secondary"
                >
                  <span className="flex-1">
                    {cropBy(p.crop).emoji} {p.my_kg} kg {name(p.crop)} · {p.buyer_name} ·{" "}
                    {t("by", "तक")} {p.need_by}
                  </span>
                  <Badge tone="amber">{t("In escrow", "एस्क्रो में")}</Badge>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Share the 6-digit handover code from Money when you deliver.",
                "डिलीवरी पर पैसा टैब से 6 अंकों का कोड बताएँ।",
              )}
            </p>
          </div>
        )}

        <div className="mt-6">
          <Label>{t("Your lots on the market", "बाज़ार में आपके लॉट")}</Label>
          {listed.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                "Nothing listed. Scan a lot and tap “List for buyers”.",
                "कुछ सूचीबद्ध नहीं। लॉट स्कैन करके “खरीदारों के लिए डालें” दबाएँ।",
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {listed.map((l) => {
                const f = priceFactor(l.created_at, l.sell_by, now);
                const ch = CHANNEL[channelFor(l.grade, l.created_at, l.sell_by, now)];
                return (
                  <div key={l.id} className="card-classic p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {cropBy(l.crop).emoji} {l.kg} kg {name(l.crop)} · {l.lot_code}
                      </span>
                      <Badge tone={ch.tone}>{t(ch.en, ch.hi)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {l.sell_by && <SellClock sellBy={l.sell_by} from={l.created_at} />}
                      <span>
                        {f < 1 && (
                          <s className="mr-1 text-xs text-muted-foreground">₹{l.base_price}</s>
                        )}
                        <b className="text-primary">
                          ₹{Math.round(l.base_price * f * 100) / 100}/kg
                        </b>{" "}
                        <span className="text-xs text-muted-foreground">
                          {t("now", "अभी")} ({Math.round(f * 100)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Modal
          open={!!take}
          onClose={() => setTake(null)}
          title={t("Accept pre-order", "प्री-ऑर्डर स्वीकार करें")}
        >
          {take && (
            <div className="space-y-3 text-sm">
              <Field
                label={t(
                  `How much can you supply? (1–${take.kg_remaining} kg)`,
                  `आप कितना दे सकते हैं? (1–${take.kg_remaining} किग्रा)`,
                )}
              >
                <input
                  type="number"
                  min={1}
                  max={take.kg_remaining}
                  className={inputCls}
                  value={takeKg}
                  onChange={(e) => setTakeKg(Math.max(0, Math.floor(+e.target.value || 0)))}
                />
              </Field>
              <p>
                {t("You promise to deliver", "आप पहुँचाने का वादा करते हैं")}{" "}
                <b>
                  {takeKg} kg {name(take.crop)} ({t("grade", "ग्रेड")} {take.min_grade})
                </b>{" "}
                {t("to", "को")} <b>{take.buyer_name}</b> {t("by", "तक")} <b>{take.need_by}</b>.
                {takeKg < take.kg_remaining &&
                  t(
                    ` The other ${take.kg_remaining - takeKg} kg stays open for other growers.`,
                    ` बाकी ${take.kg_remaining - takeKg} किग्रा दूसरे उत्पादकों के लिए खुला रहेगा।`,
                  )}
              </p>
              <p className="rounded-lg bg-accent p-3">
                {inr(Math.round(takeKg * take.price_per_kg))}{" "}
                {t(
                  "goes into escrow now and is released to you when the buyer enters your handover code.",
                  "अभी एस्क्रो में जाएगा और खरीदार के आपका कोड डालते ही आपको मिलेगा।",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Missing a pre-order hurts your supplier rating. Test mode: no real money moves.",
                  "प्री-ऑर्डर चूकने से आपकी रेटिंग घटती है। टेस्ट मोड: असली पैसा नहीं।",
                )}
              </p>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <Btn className="w-full" disabled={busy} onClick={accept}>
                {busy ? "…" : t("Yes, accept", "हाँ, स्वीकार करें")}
              </Btn>
            </div>
          )}
        </Modal>
      </div>
    </RepsProvider>
  );
}
