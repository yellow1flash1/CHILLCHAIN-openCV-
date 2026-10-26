import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useStore, utr } from "@/lib/store";
import { useMe, usePayConfig } from "@/lib/data";
import { api } from "@/lib/api";
import { openCheckout } from "@/lib/razorpay";
import type { PayFor } from "@/lib/pay.functions";
import { inr } from "@/lib/income";
import { Btn, inputCls } from "./ui";

const APPS = ["GPay", "PhonePe", "Paytm", "BHIM"];

export interface Settled {
  ref: string;
  booking?: unknown;
}

/** Pay screen. With Razorpay keys on the server and a `charge`, it opens Razorpay Checkout (test mode) and
 *  the server places the order or booking itself, then calls `onSettled`. Otherwise it simulates a UPI
 *  payment and calls `onPaid`, and the caller completes the action. */
export function UpiPay({
  amount,
  payee,
  onPaid,
  charge,
  onSettled,
}: {
  amount: number;
  payee: string;
  onPaid: (utr: string, method: string) => void;
  charge?: PayFor;
  onSettled?: (r: Settled) => void;
}) {
  const { t } = useStore();
  const { data: me } = useMe();
  const cfg = usePayConfig();
  if (charge && onSettled && cfg.data?.razorpay)
    return <RazorpayPay amount={amount} payee={payee} charge={charge} onSettled={onSettled} />;
  return <SimulatedPay amount={amount} payee={payee} onPaid={onPaid} me={me} t={t} />;
}

function RazorpayPay({
  amount,
  payee,
  charge,
  onSettled,
}: {
  amount: number;
  payee: string;
  charge: PayFor;
  onSettled: (r: Settled) => void;
}) {
  const { t } = useStore();
  const [state, setState] = useState<"idle" | "proc" | "done">("idle");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const pay = async () => {
    setErr("");
    setState("proc");
    try {
      const start = await api.startPayment(charge);
      if (start.error || !start.data) throw new Error(start.error?.message);
      const o = start.data;
      const r = await openCheckout({
        keyId: o.keyId,
        orderId: o.orderId,
        amount: o.amount,
        description: payee,
        name: o.name,
        phone: o.phone,
      });
      if (!r) return setState("idle"); // closed without paying
      const fin = await api.finishPayment({
        orderId: r.razorpay_order_id,
        paymentId: r.razorpay_payment_id,
        signature: r.razorpay_signature,
      });
      if (fin.error || !fin.data) throw new Error(fin.error?.message);
      const done = fin.data;
      setRef(done.ref);
      setState("done");
      setTimeout(() => onSettled(done), 1400);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("Payment failed", "भुगतान नहीं हुआ"));
      setState("idle");
    }
  };
  if (state === "done")
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <p className="mt-2 text-xl font-bold text-success">
          {t("Payment Successful", "भुगतान सफल")}
        </p>
        <p className="text-sm">{inr(amount)}</p>
        <p className="mt-1 font-mono text-xs">Razorpay: {ref}</p>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-secondary p-3 text-center">
        <p className="text-xs text-muted-foreground">
          {t("Paying", "भुगतान")} {payee} · {t("Razorpay test mode", "Razorpay टेस्ट मोड")}
        </p>
        <p className="text-3xl font-semibold">{inr(amount)}</p>
      </div>
      <p className="rounded-lg bg-primary/10 px-3 py-2 text-[13px] text-foreground">
        {t(
          "Test mode: no real money moves. In the Razorpay window, pay by UPI with the ID success@razorpay.",
          "टेस्ट मोड: असली पैसा नहीं कटेगा। Razorpay में UPI ID success@razorpay से भुगतान करें।",
        )}
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Btn className="w-full" disabled={state === "proc"} onClick={pay}>
        {state === "proc" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          `${t("Pay with Razorpay", "Razorpay से भुगतान करें")} ${inr(amount)}`
        )}
      </Btn>
    </div>
  );
}

function SimulatedPay({
  amount,
  payee,
  onPaid,
  me,
  t,
}: {
  amount: number;
  payee: string;
  onPaid: (utr: string, method: string) => void;
  me: ReturnType<typeof useMe>["data"];
  t: ReturnType<typeof useStore>["t"];
}) {
  const [method, setMethod] = useState("GPay");
  const [upi, setUpi] = useState(me?.profile?.upi_id ?? "");
  const [view, setView] = useState<"app" | "qr" | "kcc">("app");
  const [state, setState] = useState<"idle" | "proc" | "done">("idle");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const pay = () => {
    if (view === "app" && !/^[\w.-]{3,}@[a-z]{2,}$/i.test(upi))
      return setErr(t("Enter a valid UPI ID", "सही UPI ID डालें"));
    setErr("");
    setState("proc");
    setTimeout(() => {
      const u = utr();
      setRef(u);
      setState("done");
      setTimeout(() => onPaid(u, view === "kcc" ? "Kisan Credit Card" : method), 1400);
    }, 2000);
  };
  if (state !== "idle")
    return (
      <div className="py-8 text-center">
        {state === "proc" ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <p className="mt-3 font-semibold">
              {t("Processing test payment…", "NPCI द्वारा प्रोसेस…")}
            </p>
            <p className="text-xs text-muted-foreground">
              {inr(amount)} → {payee}
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <p className="mt-2 text-xl font-bold text-success">
              {t("Payment Successful", "भुगतान सफल")}
            </p>
            <p className="text-sm">{inr(amount)}</p>
            <p className="mt-1 font-mono text-xs">UTR: {ref}</p>
          </>
        )}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-secondary p-3 text-center">
        <p className="text-xs text-muted-foreground">
          {t("Paying", "भुगतान")} {payee} · {t("test mode, no real money moves", "टेस्ट मोड")}
        </p>
        <p className="text-3xl font-semibold">{inr(amount)}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-card p-1 text-xs font-semibold">
        {(
          [
            ["app", "UPI App"],
            ["qr", "Scan QR"],
            ["kcc", "Kisan Card"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`rounded py-1.5 ${view === k ? "bg-background text-primary shadow" : ""}`}
          >
            {l}
          </button>
        ))}
      </div>
      {view === "app" && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {APPS.map((a) => (
              <button
                key={a}
                onClick={() => setMethod(a)}
                className={`rounded-lg border-2 py-2 text-xs font-bold ${method === a ? "border-primary bg-accent" : "border-border"}`}
              >
                {a}
              </button>
            ))}
          </div>
          <input
            className={inputCls}
            value={upi}
            maxLength={50}
            onChange={(e) => setUpi(e.target.value.trim())}
            placeholder="yourname@upi"
          />
        </>
      )}
      {view === "qr" && (
        <div className="flex flex-col items-center">
          <div className="rounded-lg border border-border bg-popover p-3">
            <QRCodeSVG
              value={`upi://pay?pa=chillchain.escrow@sbi&pn=${encodeURIComponent(payee)}&am=${amount}&cu=INR`}
              size={150}
              fgColor="#1B4332"
              bgColor="transparent"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            chillchain.escrow@sbi · {t("Scan with any UPI app", "किसी भी UPI ऐप से स्कैन करें")}
          </p>
        </div>
      )}
      {view === "kcc" && (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
          <CreditCard className="h-8 w-8 text-muted-foreground" />
          <div>
            <b>Kisan Credit Card •••• {me?.profile?.phone?.slice(-4)}</b>
            <p className="text-xs text-muted-foreground">
              {t("Test mode — card is not charged", "टेस्ट मोड — कार्ड से पैसा नहीं कटेगा")}
            </p>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Btn className="w-full" onClick={pay}>
        {view === "qr"
          ? t("I have scanned & paid", "मैंने भुगतान किया")
          : t("Pay", "भुगतान करें") + " " + inr(amount)}
      </Btn>
    </div>
  );
}
