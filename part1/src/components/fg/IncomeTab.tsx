import { useState } from "react";
import { Lock, TrendingUp } from "lucide-react";
import { cropBy, useStore } from "@/lib/store";
import { CropSelect } from "./CropSelect";
import { useRate } from "@/lib/data";
import { compare, inr } from "@/lib/income";
import { Btn, Field, SectionTitle, inputCls } from "./ui";
import { ListLotModal } from "./ScanTab";

export function IncomeTab() {
  const { set, t } = useStore();
  const rate = useRate();
  const [crop, setCrop] = useState("strawberry");
  const [w, setW] = useState(1000);
  const [p, setP] = useState(30);
  const [d, setD] = useState(3);
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const r = compare({ weight: w, price: p, days: d });
  const live = rate(crop, 0);
  const L = ({ k, v, neg }: { k: string; v: number; neg?: boolean }) => (
    <div className="flex justify-between border-b border-dotted border-border py-1 text-xs">
      <span>{k}</span>
      <span className={neg ? "text-destructive" : ""}>
        {neg ? "− " : ""}
        {inr(v)}
      </span>
    </div>
  );
  return (
    <div>
      <SectionTitle
        icon={TrendingUp}
        title={t("My Income & Estimator", "मेरी आय")}
        sub={t(
          "Selling without a cold chain vs the ChillChain route",
          "बिना कोल्ड चेन बनाम चिलचेन",
        )}
      />
      <div className="card-classic grid grid-cols-2 gap-3 p-4">
        <Field label={t("Select Crop", "फसल चुनें")}>
          <CropSelect
            value={crop}
            onChange={(k) => {
              setCrop(k);
              setP(rate(k, cropBy(k).rate).rate);
            }}
          />
        </Field>
        <Field label={t("Harvest Weight (kg)", "वज़न")}>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={w}
            onChange={(e) => setW(Math.max(0, +e.target.value))}
          />
        </Field>
        <Field label={t("Fair Market Price (₹/kg)", "भाव")}>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={p}
            onChange={(e) => setP(Math.max(0, +e.target.value))}
          />
        </Field>
        <Field label={t("Storage Days", "भंडारण दिन")}>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={d}
            onChange={(e) => setD(Math.max(0, +e.target.value))}
          />
        </Field>
        {live.live && (
          <button
            onClick={() => setP(live.rate)}
            className="col-span-2 rounded-md bg-success/10 px-2 py-1 text-left text-xs font-semibold text-success"
          >
            ↻ {t("Use today's market price", "आज का भाव")}: ₹{live.rate}/kg · {live.market} ·{" "}
            {live.date}
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="card-classic border-t-4 border-t-destructive p-4">
          <p className="text-sm text-muted-foreground">
            {t("Without ChillChain", "पारंपरिक मंडी")}
          </p>
          <p className="text-3xl font-semibold text-destructive">{inr(r.a.net)}</p>
          <div className="mt-2">
            <L k={`38% spoilage (${Math.round(r.a.loss)} kg lost)`} v={r.a.loss * p} neg />
            <L k="Sale value" v={r.a.gross} />
            <L k="Middleman commission 12%" v={r.a.commission} neg />
            <L k="Individual transport" v={r.a.transport} neg />
            <L k="Market fees & handling" v={r.a.fees} neg />
          </div>
        </div>
        <div className="card-classic border-t-4 border-t-success p-4">
          <p className="text-sm text-muted-foreground">{t("With ChillChain", "चिलचेन से")}</p>
          <p className="text-3xl font-semibold text-primary">{inr(r.b.net)}</p>
          <div className="mt-2">
            <L k={`Only 8% loss (${Math.round(r.b.loss)} kg)`} v={r.b.loss * p} neg />
            <L k="Direct buyer value" v={r.b.gross} />
            <L k={`Cold room (${r.b.crates} crates × ${d}d)`} v={r.b.cold} neg />
            <L k="Pooled FPO transport" v={r.b.transport} neg />
            <L k="FPO service 8%" v={r.b.commission} neg />
            <L k="Escrow fee" v={r.b.escrowFee} neg />
          </div>
        </div>
      </div>
      <div className="hero-band mt-4 rounded-2xl p-5 text-center">
        <TrendingUp className="mx-auto h-6 w-6 text-primary" />
        <p className="text-2xl font-semibold">
          {r.diff >= 0 ? "+" : ""}
          {r.pct}% {t("Net Income Difference", "शुद्ध आय अंतर")}
        </p>
        <p className="text-sm opacity-90">
          ({r.diff >= 0 ? "+" : "−"}
          {inr(Math.abs(r.diff))} {t("Extra Profit", "अतिरिक्त लाभ")})
        </p>
        <Btn
          v="gold"
          className="mt-4 w-full"
          onClick={() => setOpen(true)}
          disabled={w <= 0 || p <= 0}
        >
          <Lock className="h-4 w-4" />
          {t("List This Harvest as a Sale Lot", "बिक्री लॉट बनाएँ")}
        </Btn>
        {locked && (
          <button
            onClick={() => set((x) => ({ ...x, tab: "pay" }))}
            className="mt-2 text-xs font-semibold underline"
          >
            {t("Lot published — view in Payments →", "लॉट बना — भुगतान देखें →")}
          </button>
        )}
      </div>
      <p className="mt-3 text-[0.65rem] text-muted-foreground">
        {t(
          "Spoilage and fee percentages are typical estimates for perishables, not guarantees.",
          "ये अनुमान हैं, गारंटी नहीं।",
        )}
      </p>
      {open && (
        <ListLotModal
          open
          onClose={() => setOpen(false)}
          crop={crop}
          grade="A"
          preset={{
            kg: Math.round(w * 0.92),
            price: p,
            cold: Math.round(r.b.cold),
            transport: Math.round(r.b.transport),
          }}
          onDone={() => {
            setOpen(false);
            setLocked(true);
          }}
        />
      )}
    </div>
  );
}
