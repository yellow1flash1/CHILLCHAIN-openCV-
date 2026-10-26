import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BadgeCheck, FileText, Landmark, Printer, QrCode, X } from "lucide-react";
import { api } from "@/lib/api";
import { cropBy, useStore } from "@/lib/store";
import {
  useBookings,
  useColdRooms,
  useInvalidate,
  useLots,
  useMe,
  useRate,
  type Booking,
  type Lot,
} from "@/lib/data";
import { PROCESSOR_PRICE } from "@/lib/decide";
import { ListLotModal } from "./ScanTab";
import { inr } from "@/lib/income";
import { Badge, Btn, Modal, SectionTitle } from "./ui";
import { UpiPay } from "./UpiPay";
import { RepsProvider, UserRep } from "./KrishiSaakh";

type Entry = {
  id: string;
  type: "sale" | "cold";
  title: string;
  amount: number;
  status: string;
  date: string;
  utr: string | null;
  lot?: Lot;
  booking?: Booking;
};

export function PayTab() {
  const { t } = useStore();
  const { data: me } = useMe();
  const lots = useLots();
  const bookings = useBookings();
  const rooms = useColdRooms();
  const inv = useInvalidate();
  const [qr, setQr] = useState<Lot | null>(null);
  const rate = useRate();
  const [offer, setOffer] = useState<Lot | null>(null); // rejected weight offered to processors
  const [offered, setOffered] = useState<string[]>([]);
  const [payDues, setPayDues] = useState(false);
  const [filter, setFilter] = useState<"all" | "sale" | "cold">("all");
  const [receipt, setReceipt] = useState<Entry | null>(null);
  const L = lots.data ?? [];
  const B = bookings.data ?? [];
  const earned = L.filter((l) => l.status === "settled").reduce((a, l) => a + l.net_amount, 0);
  const escrow = L.filter((l) => l.status === "escrow");
  const open = L.filter((l) => l.status === "open");
  const escrowSum = escrow.reduce((a, l) => a + l.net_amount, 0);
  const rejectedLots = L.filter((l) => l.rejected_kg > 0);
  const dues = B.filter((b) => !b.paid);
  const dueSum = dues.reduce((a, b) => a + b.amount, 0);
  const roomName = (id: string) => rooms.data?.find((r) => r.id === id)?.name ?? "Cold room";

  const entries: Entry[] = useMemo(
    () =>
      [
        ...L.filter((l) => l.status !== "cancelled").map((l) => ({
          id: l.lot_code,
          type: "sale" as const,
          title: `${cropBy(l.crop).en} ${l.kg.toLocaleString("en-IN")} kg${l.buyer_name ? ` — ${l.buyer_name}` : " — awaiting buyer"}${l.rejected_kg ? ` (${l.rejected_kg} kg rejected)` : ""}`,
          amount: l.net_amount,
          status: l.status,
          date: (l.settled_at ?? l.ordered_at ?? l.created_at).slice(0, 10),
          utr: l.utr,
          lot: l,
        })),
        ...B.map((b) => ({
          id: b.pass_no,
          type: "cold" as const,
          title: `${roomName(b.cold_room_id)} — ${b.crates} crates × ${b.days} day${b.days > 1 ? "s" : ""}`,
          amount: -b.amount,
          status: b.paid ? "paid" : "due",
          date: b.created_at.slice(0, 10),
          utr: b.utr,
          booking: b,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    [L, B, rooms.data],
  );

  const settleDues = async (u: string, method: string) => {
    const { error } = await api.payBookingDues(
      dues.map((d) => d.id),
      u,
      method,
    );
    if (!error) inv("bookings");
    setPayDues(false);
  };
  const cancel = async (l: Lot) => {
    await api.cancelLot(l.id);
    inv("lots");
  };
  const shown = entries.filter((x) => filter === "all" || x.type === filter);
  return (
    <RepsProvider ids={(lots.data ?? []).map((l) => l.buyer_id)}>
      <div>
        <SectionTitle
          icon={Landmark}
          title={t("Payments & Khata", "भुगतान और खाता")}
          sub={t("Escrow settlements, dues and your passbook", "एस्क्रो, बकाया और बही-खाता")}
        />
        <p className="text-sm text-muted-foreground">{t("Total earned", "कुल कमाई")}</p>
        <p className="text-4xl font-semibold tracking-tight text-foreground">{inr(earned)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-secondary p-3">
            <p className="text-muted-foreground">{t("In escrow", "एस्क्रो में")}</p>
            <p className="text-lg font-semibold">{inr(escrowSum)}</p>
            <p className="text-xs text-muted-foreground">
              {t(`${escrow.length} awaiting delivery`, `${escrow.length} डिलीवरी बाकी`)}
            </p>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <p className="text-muted-foreground">{t("Cold room dues", "कोल्ड स्टोर बकाया")}</p>
            <p className="text-lg font-semibold">{inr(dueSum)}</p>
            <p className="text-xs text-muted-foreground">
              {t(`${dues.length} unpaid`, `${dues.length} बाकी`)}
            </p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" />
          {t("Payouts to", "भुगतान खाता")} {me?.profile?.upi_id} ·{" "}
          {t("test mode, no real money moves", "टेस्ट मोड, असली पैसा नहीं")}
        </p>

        <h3 className="mb-2.5 mt-7 text-[22px] font-bold tracking-[0.35px] text-foreground">
          {t("Buyer Orders in Escrow", "एस्क्रो ऑर्डर")}
        </h3>
        {escrow.length === 0 && (
          <p className="card-classic p-4 text-sm text-muted-foreground">
            {t(
              "No buyer orders yet. When a buyer orders one of your lots, it appears here.",
              "अभी कोई ऑर्डर नहीं।",
            )}
          </p>
        )}
        <div className="space-y-3">
          {escrow.map((o) => (
            <div key={o.id} className="card-classic p-4">
              <div className="flex justify-between">
                <div>
                  <Badge tone="amber">ESCROW · {o.lot_code}</Badge>
                  <p className="mt-1 font-bold text-primary">
                    {o.kg.toLocaleString("en-IN")} kg {cropBy(o.crop).en} {cropBy(o.crop).emoji}
                  </p>
                  <p className="text-xs text-muted-foreground">{o.buyer_name}</p>
                  <div className="mt-1">
                    <UserRep id={o.buyer_id} flow={5} />
                  </div>
                </div>
                <p className="text-xl font-semibold text-success">{inr(o.net_amount)}</p>
              </div>
              <Btn v="outline" className="mt-3 w-full" onClick={() => setQr(o)}>
                <QrCode className="h-4 w-4" />
                {t("Show Delivery QR to Buyer", "डिलीवरी QR दिखाएँ")}
              </Btn>
            </div>
          ))}
        </div>

        {rejectedLots.length > 0 && (
          <>
            <h3 className="mb-2.5 mt-7 text-[22px] font-bold tracking-[0.35px] text-foreground">
              {t("Rejected at delivery", "डिलीवरी पर लौटाया गया")}
            </h3>
            <div className="space-y-2">
              {rejectedLots.map((l) => (
                <div key={l.id} className="card-classic p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {cropBy(l.crop).emoji} {l.lot_code} · {l.buyer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      `${l.accepted_kg ?? 0} kg accepted and paid · ${l.rejected_kg} kg rejected: "${l.reject_reason ?? ""}"`,
                      `${l.accepted_kg ?? 0} किग्रा स्वीकार व भुगतान · ${l.rejected_kg} किग्रा लौटाया: "${l.reject_reason ?? ""}"`,
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Btn
                      v="outline"
                      className="px-3 py-1.5 text-xs"
                      disabled={offered.includes(l.id)}
                      onClick={() => setOffer(l)}
                    >
                      {offered.includes(l.id)
                        ? t("Offered to processors", "प्रोसेसर को दिया")
                        : t(
                            `Offer ${l.rejected_kg} kg to processors`,
                            `${l.rejected_kg} किग्रा प्रोसेसर को दें`,
                          )}
                    </Btn>
                    <span className="self-center text-[0.68rem] text-muted-foreground">
                      {t(
                        "Disagree? Rate the buyer and raise a dispute from ChillScore.",
                        "असहमत? खरीदार को रेट करें और चिलस्कोर से विवाद उठाएँ।",
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {offer && (
          <ListLotModal
            key={offer.id}
            open
            onClose={() => setOffer(null)}
            crop={offer.crop}
            grade="C"
            preset={{
              kg: offer.rejected_kg,
              price: Math.max(
                1,
                Math.round(rate(offer.crop, cropBy(offer.crop).rate).rate * PROCESSOR_PRICE),
              ),
              cold: 0,
              transport: Math.round(offer.rejected_kg * 2.2),
            }}
            onDone={() => {
              setOffered((x) => [...x, offer.id]);
              setOffer(null);
            }}
          />
        )}

        {open.length > 0 && (
          <>
            <h3 className="mb-2.5 mt-7 text-[22px] font-bold tracking-[0.35px] text-foreground">
              {t("Listed — Waiting for Buyers", "बिक्री के लिए सूचीबद्ध")}
            </h3>
            <div className="space-y-2">
              {open.map((o) => (
                <div
                  key={o.id}
                  className="card-classic flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>
                    {cropBy(o.crop).emoji} {o.lot_code} · {o.kg} kg @ ₹{Number(o.price_per_kg)}
                  </span>
                  <button
                    aria-label="Cancel listing"
                    onClick={() => cancel(o)}
                    className="flex items-center gap-1 text-xs text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="card-classic mt-5 flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-primary">{t("Cold Storage Dues", "कोल्ड स्टोर बकाया")}</p>
            <p className="text-xs text-muted-foreground">{dues.length} pending · FPO credit</p>
          </div>
          {dueSum > 0 ? (
            <Btn v="gold" onClick={() => setPayDues(true)}>
              Pay {inr(dueSum)}
            </Btn>
          ) : (
            <Badge tone="green">✔ All clear</Badge>
          )}
        </div>

        <h3 className="mb-2.5 mt-7 text-[22px] font-bold tracking-[0.35px] text-foreground">
          {t("Kisan Passbook", "किसान बही-खाता")}
        </h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["sale", "Crate Sales"],
              ["cold", "Cold Room"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${filter === k ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="ios-list">
          {shown.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {t("No entries yet.", "अभी कोई प्रविष्टि नहीं।")}
            </p>
          )}
          {shown.map((x) => (
            <div key={x.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{x.title}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {x.date} · {x.id}
                  {x.utr ? ` · Ref ${x.utr}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-bold ${x.amount > 0 ? "text-success" : "text-destructive"}`}
                >
                  {x.amount > 0 ? "+" : "−"}
                  {inr(Math.abs(x.amount))}
                </p>
                <Badge
                  tone={
                    x.status === "settled" || x.status === "paid"
                      ? "green"
                      : x.status === "escrow" || x.status === "open"
                        ? "amber"
                        : "red"
                  }
                >
                  {statusLabel(x.status, t)}
                </Badge>
              </div>
              <button
                aria-label="View receipt"
                onClick={() => setReceipt(x)}
                className="rounded p-1.5 text-primary hover:bg-secondary"
              >
                <FileText className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Modal
          open={!!qr}
          onClose={() => setQr(null)}
          title={t("Delivery QR for Buyer", "खरीदार के लिए QR")}
        >
          {qr && <HandoverCode lot={qr} />}
        </Modal>
        <Modal
          open={payDues}
          onClose={() => setPayDues(false)}
          title={t("Pay Cold Room Dues", "बकाया भुगतान")}
        >
          <UpiPay
            amount={dueSum}
            payee="ChillChain FPO Cold Network"
            onPaid={settleDues}
            charge={{ purpose: "dues", ids: dues.map((d) => d.id) }}
            onSettled={() => {
              inv("bookings");
              setPayDues(false);
            }}
          />
        </Modal>
        <Modal open={!!receipt} onClose={() => setReceipt(null)} title="e-Receipt" wide>
          {receipt && <Receipt x={receipt} />}
        </Modal>
      </div>
    </RepsProvider>
  );
}

function Receipt({ x }: { x: Entry }) {
  const { data: me } = useMe();
  const p = me?.profile;
  const rows: [string, string][] = [
    ["Receipt No.", x.id],
    ["Date", x.date],
    ["Farmer", p?.full_name ?? ""],
    ["FPO ID", p?.fpo_id ?? "—"],
    ["Village", `${p?.village}, ${p?.district}, ${p?.state}`],
    ["Particulars", x.title],
  ];
  if (x.lot)
    rows.push(
      ["Crop", cropBy(x.lot.crop).en],
      ["Weight", `${x.lot.kg.toLocaleString("en-IN")} kg`],
      ["Grade", `Grade ${x.lot.grade}`],
      ["Rate", `₹${Number(x.lot.price_per_kg)}/kg`],
      ["Gross Value", inr(x.lot.gross)],
      ["Cold Room Deduction", "− " + inr(x.lot.cold_deduction)],
      ["Pooled Transport Deduction", "− " + inr(x.lot.transport_deduction)],
    );
  if (x.booking) rows.push(["Payment Method", x.booking.pay_method ?? "FPO Credit"]);
  const done = x.status === "settled" || x.status === "paid";
  return (
    <div>
      <div className="print-area certificate relative p-5 text-sm">
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <p className="text-xl font-semibold text-primary">ChillChain Settlement Receipt</p>
            <p className="text-[0.65rem] text-muted-foreground">
              Generated by ChillChain · Test-mode payment reference
            </p>
          </div>
          <div className="seal flex h-16 w-16 rounded-full shrink-0 flex-col items-center justify-center text-center text-[0.5rem] font-bold leading-tight">
            <BadgeCheck className="h-5 w-5" />
            FPO
            <br />
            SEAL
          </div>
        </div>
        <dl className="mt-3 space-y-1">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-4 border-b border-dotted border-border py-1"
            >
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-accent p-3">
          <span className="font-bold">{x.amount > 0 ? "Net Payout" : "Amount"}</span>
          <span className="text-2xl font-semibold text-primary">{inr(Math.abs(x.amount))}</span>
        </div>
        <p className="mt-2 font-mono text-xs">Ref: {x.utr ?? "Pending"}</p>
        {done && <span className="stamp absolute bottom-6 right-6 px-3 py-1">Paid</span>}
      </div>
      <Btn className="mt-3 w-full" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Download / Print Receipt
      </Btn>
    </div>
  );
}

/** Secret 6-digit handover code. Only the farmer can read it (RLS); the buyer types it in on delivery. */
function HandoverCode({ lot }: { lot: Lot }) {
  const { t } = useStore();
  const [code, setCode] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => {
    const { data, error } = await api.getHandover(lot.id);
    if (error) return setErr(error.message);
    setCode(data?.code ?? null);
    setLocked((data?.attempts ?? 0) >= 5);
  };
  const reset = async () => {
    setErr("");
    const { data, error } = await api.regenerateHandover(lot.id);
    if (error) return setErr(error.message);
    setCode(data);
    setLocked(false);
  };
  useEffect(() => {
    load();
  }, [lot.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="text-center">
      {code ? (
        <>
          <div className="mx-auto w-fit rounded-xl border border-border bg-popover p-4">
            <QRCodeSVG value={code} size={200} fgColor="#1B4332" bgColor="transparent" />
          </div>
          <p className="mt-3 font-mono text-3xl font-semibold tracking-[0.3em]">{code}</p>
        </>
      ) : (
        !err && (
          <p className="py-6 text-sm text-muted-foreground">
            {t("Loading code…", "कोड लोड हो रहा है…")}
          </p>
        )
      )}
      <p className="text-sm">
        {lot.lot_code} · {inr(lot.net_amount)}
      </p>
      {locked && (
        <p className="mt-2 text-xs text-destructive">
          {t(
            "Too many wrong attempts. Generate a new code before handing over.",
            "बहुत गलत कोशिशें। नया कोड बनाएँ।",
          )}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "Show this code only at delivery, when you hand over the produce. The buyer enters it and escrow is released to you.",
          "यह कोड सिर्फ डिलीवरी पर दिखाएँ। खरीदार इसे डालेगा, फिर भुगतान जारी होगा।",
        )}
      </p>
      <button onClick={reset} className="mt-3 text-xs font-semibold text-primary underline">
        {t("Generate a new code", "नया कोड बनाएँ")}
      </button>
    </div>
  );
}

/** Plain-language status names for the khata. */
function statusLabel(st: string, t: (en: string, hi: string) => string) {
  const m: Record<string, [string, string]> = {
    open: ["Listed", "सूचीबद्ध"],
    escrow: ["Awaiting delivery", "डिलीवरी बाकी"],
    settled: ["Paid out", "भुगतान मिला"],
    rejected: ["Rejected by buyer", "खरीदार ने लौटाया"],
    paid: ["Paid", "चुकाया"],
    due: ["Due", "बकाया"],
    cancelled: ["Cancelled", "रद्द"],
  };
  const v = m[st];
  return v ? t(v[0], v[1]) : st;
}
