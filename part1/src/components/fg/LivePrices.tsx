import { useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CROPS, cropBy, useStore } from "@/lib/store";
import { useCropMarkets, useLivePrices, useMe, useSettings } from "@/lib/data";
import { refreshLivePrices, type CropPrice } from "@/lib/mandi.functions";
import { useOnline } from "@/lib/net";
import { fmtKg as fmt, priceChange } from "@/lib/prices";
import { Modal, inputCls } from "./ui";

/** Up/down chip for a day-on-day change. */
export function Change({ pct }: { pct: number | null }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const I = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${up ? "text-success" : "text-destructive"}`}
    >
      <I className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Two-week trend of the all-India middle price (days with at least 3 markets reporting). */
function Trend({ series }: { series: CropPrice["series"] }) {
  const { t } = useStore();
  if (series.length < 3) return null;
  const v = series.map((x) => x.median);
  const lo = Math.min(...v),
    hi = Math.max(...v);
  const W = 300,
    H = 56;
  const pts = v
    .map(
      (y, i) =>
        `${(i / (v.length - 1)) * W},${hi === lo ? H / 2 : H - 4 - ((y - lo) / (hi - lo)) * (H - 8)}`,
    )
    .join(" ");
  return (
    <figure className="mb-3">
      <figcaption className="mb-1 flex justify-between text-[12px] text-muted-foreground">
        <span>{t("Middle price, last 2 weeks", "बीच का भाव, पिछले 2 हफ़्ते")}</span>
        <span>
          ₹{fmt(lo)}–₹{fmt(hi)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
        <polyline
          points={pts}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-primary"
        />
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{ddmm(series[0]!.day)}</span>
        <span>{ddmm(series[series.length - 1]!.day)}</span>
      </div>
    </figure>
  );
}

/** Live mandi prices for every crop: today's price, change, two-week trend and each market. */
export function LivePricesSheet({
  open,
  onClose,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  focus?: string | null;
}) {
  const { t, s } = useStore();
  const { data: me } = useMe();
  const st = useSettings();
  const online = useOnline();
  const qc = useQueryClient();
  const myState = me?.profile?.state || null;
  const [scope, setScope] = useState<"state" | "india">(myState ? "state" : "india");
  const live = useLivePrices(myState);
  const [query, setQuery] = useState("");
  const [openCrop, setOpenCrop] = useState<string | null>(focus ?? null);
  const [busy, setBusy] = useState(false);
  const mine = st.data?.settings.crops ?? [];
  const byCrop = useMemo(
    () => new Map((live.data?.crops ?? []).map((c) => [c.crop, c])),
    [live.data],
  );
  const name = (k: string) => t(cropBy(k).en, cropBy(k).hi);

  const rows = CROPS.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || c.en.toLowerCase().includes(q) || name(c.key).toLowerCase().includes(q);
  }).sort((a, b) => {
    const rank = (k: string) => (mine.includes(k) ? 0 : byCrop.has(k) ? 1 : 2);
    return rank(a.key) - rank(b.key);
  });

  const refresh = async () => {
    setBusy(true);
    await refreshLivePrices().catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ["live-prices"] });
    await qc.invalidateQueries({ queryKey: ["markets"] });
    await qc.invalidateQueries({ queryKey: ["mandi"] });
    setBusy(false);
  };
  const updated = live.data?.updatedAt
    ? new Date(live.data.updatedAt).toLocaleString(s.lang === "en" ? "en-IN" : s.lang, {
        hour: "numeric",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <Modal open={open} onClose={onClose} title={t("Live mandi prices", "लाइव मंडी भाव")} wide>
      <p className="mb-3 text-[13px] text-muted-foreground">
        {t(
          "Today's prices from government mandis (Agmarknet), per kg. The middle price across markets, with the change since the last report.",
          "सरकारी मंडियों (एगमार्कनेट) से आज के भाव, प्रति किलो। सभी मंडियों का बीच का भाव और पिछली रिपोर्ट से बदलाव।",
        )}
      </p>
      {live.data && !live.data.connected && !live.data.crops.length && (
        <p className="mb-3 rounded-[10px] bg-warning/15 px-3 py-2 text-[13px]">
          {t(
            "Live prices are not connected yet, so the rates below are indicative.",
            "लाइव भाव अभी जुड़े नहीं हैं, इसलिए नीचे के भाव अनुमानित हैं।",
          )}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {myState && (
          <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-secondary p-0.5 text-sm">
            {(
              [
                ["state", myState],
                ["india", t("All-India", "अखिल भारत")],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`rounded-md px-3 py-1.5 font-medium ${scope === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <label className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search a crop", "फसल खोजें")}
            className={`${inputCls} pl-8`}
          />
        </label>
      </div>
      <div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
        <span>
          {updated
            ? t(
                `Updated ${updated} · Agmarknet, Govt. of India`,
                `अपडेट ${updated} · एगमार्कनेट, भारत सरकार`,
              )
            : t("Not updated yet", "अभी अपडेट नहीं हुआ")}
        </span>
        {live.data?.connected && online && (
          <button
            onClick={refresh}
            disabled={busy}
            className="flex items-center gap-1 font-semibold text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {t("Refresh", "रीफ़्रेश")}
          </button>
        )}
      </div>
      {live.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div className="ios-list overflow-hidden rounded-[12px] bg-card">
        {rows.map((c) => {
          const p = byCrop.get(c.key);
          const local = scope === "state" && p?.stateMedian != null;
          const price = p ? (local ? p.stateMedian! : p.median) : null;
          const isOpen = openCrop === c.key;
          return (
            <div key={c.key}>
              <button
                onClick={() => setOpenCrop(isOpen ? null : c.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary"
              >
                <span className="text-2xl">{c.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium leading-tight">{name(c.key)}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {p
                      ? local
                        ? t(
                            `${p.stateMarkets} markets in ${myState}`,
                            `${myState} में ${p.stateMarkets} मंडियाँ`,
                          )
                        : t(`${p.markets} markets in India`, `भारत में ${p.markets} मंडियाँ`)
                      : t("No mandi reports · indicative", "मंडी रिपोर्ट नहीं · अनुमानित")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[16px] font-semibold">
                    ₹{fmt(price ?? c.rate)}
                    <span className="text-[12px] font-normal text-muted-foreground">/kg</span>
                  </span>
                  {p ? (
                    <Change pct={priceChange(p)} />
                  ) : (
                    <span className="text-[12px] text-muted-foreground">*</span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && <Markets crop={c.key} state={myState} summary={p} />}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        {t(
          "* No government mandi report for this crop; the rate is an indicative farm-gate price. Mandi prices are wholesale and vary by variety and grade.",
          "* इस फसल की सरकारी मंडी रिपोर्ट नहीं; भाव अनुमानित खेत भाव है। मंडी भाव थोक भाव हैं और किस्म व ग्रेड से बदलते हैं।",
        )}
      </p>
    </Modal>
  );
}

/** Each market's latest report for one crop. */
function Markets({
  crop,
  state,
  summary,
}: {
  crop: string;
  state: string | null;
  summary: CropPrice | undefined;
}) {
  const { t } = useStore();
  const m = useCropMarkets(summary ? crop : null, state);
  const [all, setAll] = useState(false);
  if (!summary)
    return (
      <p className="bg-secondary/50 px-4 py-3 text-[13px] text-muted-foreground">
        {t(
          "Government mandis have not reported this crop recently.",
          "सरकारी मंडियों ने हाल में इस फसल की रिपोर्ट नहीं दी।",
        )}
      </p>
    );
  const list = m.data ?? [];
  const shown = all ? list : list.slice(0, 12);
  return (
    <div className="bg-secondary/50 px-4 py-3">
      <Trend series={summary.series} />
      <p className="mb-2 text-[13px]">
        {t(
          `Most markets: ₹${fmt(summary.low)}–₹${fmt(summary.high)}/kg`,
          `ज़्यादातर मंडियाँ: ₹${fmt(summary.low)}–₹${fmt(summary.high)}/किलो`,
        )}
      </p>
      {m.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
      <ul className="space-y-1.5">
        {shown.map((r) => (
          <li
            key={`${r.state}|${r.market}|${r.variety}|${r.grade}`}
            className="flex items-start justify-between gap-3 text-[13px]"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.market}</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {[r.district, r.state, r.variety !== "Other" ? r.variety : "", r.grade]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · {ddmm(r.day)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <b>₹{fmt(r.modal)}</b>
              {r.min !== r.max && (
                <span className="block text-[11px] text-muted-foreground">
                  ₹{fmt(r.min)}–{fmt(r.max)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {list.length > 12 && (
        <button
          onClick={() => setAll((a) => !a)}
          className="mt-2 text-[13px] font-semibold text-primary"
        >
          {all
            ? t("Show fewer", "कम दिखाएँ")
            : t(`Show all ${list.length} markets`, `सभी ${list.length} मंडियाँ दिखाएँ`)}
        </button>
      )}
    </div>
  );
}
