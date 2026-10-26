import { useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { cropBy, useStore } from "@/lib/store";
import {
  useColdRooms,
  usePreorders,
  useRate,
  useTransportMeta,
  useMe,
  type Scan,
} from "@/lib/data";
import { inr } from "@/lib/income";
import {
  GRADE_PRICE,
  PRECOOL_HOURS,
  PROCESSOR_PRICE,
  decide,
  type Blocker,
  type Move,
  type MoveKey,
} from "@/lib/decide";
import { hoursLeft, type Grade, type Ripeness } from "@/lib/shelf";
import { Btn, inputCls } from "./ui";
import { useNow } from "./SellClock";

const LABEL: Record<MoveKey, [string, string]> = {
  sell_now: ["Sell today as it is", "आज ही ऐसे ही बेचें"],
  precool: [
    `Pre-cool ${PRECOOL_HOURS} h, then sell`,
    `${PRECOOL_HOURS} घंटे प्री-कूल करें, फिर बेचें`,
  ],
  preorder: ["Fill a buyer's pre-order", "खरीदार का प्री-ऑर्डर भरें"],
  ripen: ["Ripen, then sell ready-to-eat", "पकाकर तैयार माल बेचें"],
  processor: ["Sell to a processor", "प्रोसेसर को बेचें"],
};
const BLOCKER: Record<Blocker, [string, string]> = {
  too_late: ["Not enough time left", "समय नहीं बचा"],
  no_precooler: ["No free pre-cooler within 150 km", "150 किमी में कोई खाली प्री-कूलर नहीं"],
  no_ripening: ["No free ripening chamber within 400 km", "400 किमी में कोई खाली पकाई कक्ष नहीं"],
};

/** "Best move now": compares the money each next step brings for this lot, after storage and truck costs. */
export function BestMove({
  scan,
  onList,
  onStore,
  onDemand,
}: {
  scan: Scan;
  /** Open the listing form with this weight, price and truck cost filled in. */
  onList: (p: { kg: number; price: number; transport: number }) => void;
  onStore: (facility: "precool" | "ripening") => void;
  onDemand: () => void;
}) {
  const { t, session } = useStore();
  const { data: me } = useMe();
  const rooms = useColdRooms();
  const pre = usePreorders();
  const meta = useTransportMeta();
  const rate = useRate();
  const now = useNow(60_000);
  const [kg, setKg] = useState(100);
  const crop = cropBy(scan.crop);
  const base = rate(crop.key, crop.rate);
  const reefer = meta.data?.vehicles.find((v) => v.key === "reefer");

  const d = useMemo(() => {
    if (!scan.sell_by) return null;
    const harvested = new Date(scan.harvested_at ?? scan.created_at).getTime();
    return decide({
      crop,
      grade: scan.grade as Grade,
      ripeness: (scan.ripeness ?? 3) as Ripeness,
      kg,
      hoursLeft: hoursLeft(scan.sell_by, now),
      hoursSinceHarvest: (now - harvested) / 3_600_000,
      coldChain: scan.cold_chain,
      basePrice: base.rate,
      district: me?.profile?.district ?? null,
      rooms: rooms.data ?? [],
      preorders: (pre.data ?? [])
        .filter((p) => p.status === "open" && p.buyer_id !== session?.user.id && !p.my_kg)
        .map((p) => ({ ...p, min_grade: p.min_grade as Grade })),
      reefer: reefer ?? { base_fare: 1500, per_km: 35, capacity_kg: 3000 },
    });
  }, [
    scan,
    crop,
    kg,
    now,
    base.rate,
    me?.profile?.district,
    rooms.data,
    pre.data,
    reefer,
    session,
  ]);

  if (!d) return null;
  const act = (m: Move) => {
    if (m.key === "precool") onStore("precool");
    else if (m.key === "ripen") onStore("ripening");
    else if (m.key === "preorder") onDemand();
    else onList({ kg, price: m.pricePerKg, transport: m.transport });
  };
  const detail = (m: Move) =>
    [
      `₹${m.pricePerKg}/kg`,
      m.storage ? `${t("storage", "भंडारण")} ${inr(m.storage)}` : null,
      `${t("truck", "ट्रक")} ${inr(m.transport)}`,
      m.hoursAtBuyer != null && m.feasible
        ? t(`${m.hoursAtBuyer} h left at buyer`, `खरीदार तक ${m.hoursAtBuyer} घंटे बचे`)
        : null,
      m.place,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-accent px-4 py-3">
        <p className="flex items-center gap-2 font-semibold text-primary">
          <Lightbulb className="h-5 w-5" />
          {t("Best move now", "अभी सबसे अच्छा कदम")}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("Lot size", "लॉट का वज़न")}
          <input
            type="number"
            min={1}
            className={inputCls + " w-24 py-1.5"}
            value={kg}
            onChange={(e) => setKg(Math.max(1, Math.floor(+e.target.value || 0)))}
          />
          kg
        </label>
      </div>
      {d.best && (
        <div className="space-y-2 border-b border-border p-4">
          <p className="text-lg font-semibold text-foreground">{t(...LABEL[d.best.key])}</p>
          <p className="text-3xl font-bold tracking-tight text-success">{inr(d.best.net)}</p>
          <p className="text-xs text-muted-foreground">
            {t("in hand after storage and truck", "भंडारण और ट्रक के बाद हाथ में")}
            {d.gainVsNow > 0 &&
              t(
                ` · ${inr(d.gainVsNow)} more than selling today`,
                ` · आज बेचने से ${inr(d.gainVsNow)} ज़्यादा`,
              )}
          </p>
          <p className="text-xs text-muted-foreground">{detail(d.best)}</p>
          <Btn className="w-full" onClick={() => act(d.best!)}>
            {t("Do this", "यही करें")}
          </Btn>
        </div>
      )}
      <ul className="divide-y divide-border">
        {d.moves
          .filter((m) => m !== d.best)
          .map((m) => (
            <li key={m.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{t(...LABEL[m.key])}</span>
                <span className="block text-xs text-muted-foreground">
                  {m.feasible && m.blocker === undefined
                    ? detail(m)
                    : t(...BLOCKER[m.blocker ?? "too_late"])}
                </span>
              </span>
              {m.feasible ? (
                <button
                  onClick={() => act(m)}
                  className="shrink-0 text-right text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {inr(m.net)}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">—</span>
              )}
            </li>
          ))}
      </ul>
      <p className="bg-secondary px-4 py-2 text-[0.68rem] text-muted-foreground">
        {t(
          `Estimates. Market price ₹${base.rate}/kg for grade A (${base.live ? base.market : t("indicative", "अनुमानित")}); B sells about ${Math.round((1 - GRADE_PRICE.B) * 100)}% lower; processors pay about ${Math.round(PROCESSOR_PRICE * 100)}%; buyers pay less as shelf life runs out; shared reefer to ${d.city}.`,
          `अनुमान। ग्रेड A का बाज़ार भाव ₹${base.rate}/किग्रा (${base.live ? base.market : "अनुमानित"}); B लगभग ${Math.round((1 - GRADE_PRICE.B) * 100)}% कम; प्रोसेसर लगभग ${Math.round(PROCESSOR_PRICE * 100)}% देते हैं; समय कम होने पर भाव घटता है; ${d.city} तक साझा रीफ़र।`,
        )}
      </p>
    </div>
  );
}
