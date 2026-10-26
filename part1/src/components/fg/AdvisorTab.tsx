import { useEffect, useMemo, useState } from "react";
import { Clock, Droplets, Landmark, Sprout, TrendingUp, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useFarm, useInvalidate, useMe } from "@/lib/data";
import { inr } from "@/lib/income";
import {
  REGIONS,
  pickHighlights,
  rankOptions,
  type AdvisorInput,
  type Region,
  type Result,
  type Water,
} from "@/lib/advisor";
import { Badge, Btn, Field, Label, SectionTitle, inputCls } from "./ui";

// A reasonable starting guess from the grower's state, until they save their own answers.
const REGION_BY_STATE: Record<string, Region> = {
  "Himachal Pradesh": "hills",
  "Jammu and Kashmir": "hills",
  "Arunachal Pradesh": "hills",
  Kerala: "humid",
  Karnataka: "humid",
  Maharashtra: "semiarid",
  Telangana: "semiarid",
  "Tamil Nadu": "semiarid",
  Bihar: "plains",
  "Uttar Pradesh": "plains",
  Punjab: "plains",
  Haryana: "plains",
  "West Bengal": "plains",
  Gujarat: "arid",
  Rajasthan: "arid",
  Delhi: "urban",
};

export function AdvisorTab() {
  const { t } = useStore();
  const { data: me } = useMe();
  const farm = useFarm();
  const inv = useInvalidate();
  const [f, setF] = useState<AdvisorInput>({
    region: REGION_BY_STATE[me?.profile?.state ?? ""] ?? "semiarid",
    acres: 1,
    budget: 500000,
    water: "medium",
    nearCity: true,
  });
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (farm.data) setF(farm.data);
  }, [farm.data]);
  const results = useMemo(() => rankOptions(f), [f]);
  const hl = useMemo(() => pickHighlights(results), [results]);
  const save = async () => {
    const r = await api.saveFarm(f);
    setSaved(r.error ? r.error.message : t("Saved", "सेव हो गया"));
    if (!r.error) inv("farm");
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Sprout}
        title={t("ProfitPlanter: what should I plant?", "प्रॉफ़िटप्लांटर: क्या लगाऊँ?")}
        sub={t(
          "High-value crops ranked for your climate, water, land and budget",
          "आपकी जलवायु, पानी, ज़मीन और बजट के हिसाब से ऊँचे दाम वाली फसलें",
        )}
      />

      <div className="card-classic space-y-3 p-4">
        <div>
          <Label>{t("Where is your farm?", "आपका खेत कहाँ है?")}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGIONS.map((r) => (
              <button
                key={r.k}
                type="button"
                onClick={() => setF({ ...f, region: r.k })}
                className={`rounded-lg border-2 p-2 text-left text-xs ${f.region === r.k ? "border-primary bg-accent" : "border-border"}`}
              >
                <b className="block text-sm text-foreground">{t(r.en, r.hi)}</b>
                <span className="text-muted-foreground">{t(r.egEn, r.egHi)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Land (acres)", "ज़मीन (एकड़)")}>
            <input
              type="number"
              min={0}
              step={0.25}
              className={inputCls}
              value={f.acres}
              onChange={(e) => setF({ ...f, acres: Math.max(0, +e.target.value || 0) })}
            />
          </Field>
          <Field label={t("Budget to invest (₹)", "लगाने का बजट (₹)")}>
            <input
              type="number"
              min={10000}
              step={10000}
              className={inputCls}
              value={f.budget}
              onChange={(e) =>
                setF({ ...f, budget: Math.max(10000, Math.floor(+e.target.value || 0)) })
              }
            />
          </Field>
        </div>
        <div>
          <Label>{t("Water available", "पानी की उपलब्धता")}</Label>
          <div className="grid grid-cols-3 gap-0.5 rounded-[9px] bg-secondary p-0.5">
            {(
              [
                ["low", t("Low / rainfed", "कम / बारानी")],
                ["medium", t("Medium (drip)", "मध्यम (ड्रिप)")],
                ["high", t("Plenty", "भरपूर")],
              ] as [Water, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setF({ ...f, water: k })}
                className={`min-h-9 rounded-md text-xs font-medium ${f.water === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.nearCity}
            onChange={(e) => setF({ ...f, nearCity: e.target.checked })}
          />
          {t(
            "A city, pack-house or quick-commerce hub is within ~3 hours",
            "शहर, पैक-हाउस या क्विक-कॉमर्स हब ~3 घंटे में है",
          )}
        </label>
        <div className="flex items-center gap-2">
          <Btn v="outline" onClick={save}>
            {t("Save my farm", "मेरा खेत सेव करें")}
          </Btn>
          {saved && <span className="text-xs text-muted-foreground">{saved}</span>}
        </div>
      </div>

      {hl ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Highlight r={hl.best} icon={Trophy} label={t("Best fit for you", "आपके लिए सबसे सही")} />
          <Highlight
            r={hl.fastest}
            icon={Clock}
            label={t("Quickest payback", "सबसे जल्दी वसूली")}
          />
          <Highlight
            r={hl.richest}
            icon={TrendingUp}
            label={t("Most profit in 5 years", "5 साल में सबसे ज़्यादा मुनाफ़ा")}
          />
        </div>
      ) : (
        <p className="card-classic p-4 text-sm text-muted-foreground">
          {t(
            "Nothing fits these answers yet. Try a bigger budget or more land.",
            "इन जवाबों में कुछ फिट नहीं। बजट या ज़मीन बढ़ाकर देखें।",
          )}
        </p>
      )}

      <div>
        <Label>{t("All options, ranked", "सभी विकल्प, क्रम से")}</Label>
        <div className="space-y-2">
          {results.map((r) => (
            <OptionRow key={r.o.key} r={r} />
          ))}
        </div>
      </div>

      <p className="flex gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        <Landmark className="h-4 w-4 shrink-0" />
        {t(
          "Costs, yields and prices are planning estimates. Subsidy shares follow the usual MIDH / NHB pattern (often 40%, 50% for protected cultivation and hill/NE states) and are usually paid after setup, so your budget must cover the full cost first. Check current rules with your district horticulture office or KVK.",
          "खर्च, उपज और भाव योजना के लिए अनुमान हैं। सब्सिडी आम MIDH / NHB ढाँचे पर है (अक्सर 40%, संरक्षित खेती व पहाड़ी/पूर्वोत्तर राज्यों में 50%) और आमतौर पर बनने के बाद मिलती है, इसलिए पहले पूरा खर्च बजट से हो। ताज़ा नियम ज़िला बागवानी कार्यालय या KVK से पूछें।",
        )}
      </p>
    </div>
  );
}

function Highlight({ r, icon: Icon, label }: { r: Result; icon: typeof Trophy; label: string }) {
  const { t } = useStore();
  return (
    <div className="card-classic overflow-hidden">
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-saffron-strong">
          <Icon className="h-4 w-4" />
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {r.o.emoji} {t(r.o.en, r.o.hi)}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.scale} {t(r.o.unitEn, r.o.unitHi)} · {t("score", "स्कोर")} {r.score}/100
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{t("Payback", "वसूली")}</dt>
            <dd className="font-semibold">
              {r.paybackYears === null
                ? t("over 5 years", "5 साल से ज़्यादा")
                : t(`${r.paybackYears} years`, `${r.paybackYears} साल`)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("5-year profit", "5 साल मुनाफ़ा")}</dt>
            <dd className={`font-semibold ${r.profit5 >= 0 ? "text-success" : "text-destructive"}`}>
              {inr(r.profit5)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function OptionRow({ r }: { r: Result }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className={`card-classic p-3 ${r.ok ? "" : "opacity-60"}`}>
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-2xl">{r.o.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{t(r.o.en, r.o.hi)}</span>
          <span className="block text-xs text-muted-foreground">
            {r.ok
              ? `${t("First harvest: year", "पहली फसल: साल")} ${r.firstHarvestYear} · ${t("payback", "वसूली")} ${r.paybackYears ?? ">5"} ${t("yr", "साल")}`
              : t(r.whyNotEn ?? "", r.whyNotHi ?? "")}
          </span>
        </span>
        {r.ok && (
          <Badge tone={r.score >= 70 ? "green" : r.score >= 50 ? "amber" : "muted"}>
            {r.score}/100
          </Badge>
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
          <p className="text-muted-foreground">{t(r.o.noteEn, r.o.noteHi)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat k={t("Setup", "लागत")} v={`${inr(r.o.setup)} / ${t(r.o.unitEn, r.o.unitHi)}`} />
            <Stat k={t("Yearly cost", "सालाना खर्च")} v={inr(r.o.opex)} />
            <Stat
              k={t("Price", "भाव")}
              v={`₹${r.o.price}/${r.o.sellUnit === "kg" ? t("kg", "किग्रा") : t("stem", "डंडी")}`}
            />
            <Stat
              k={t("Subsidy (est.)", "सब्सिडी (अनुमान)")}
              v={r.o.subsidy ? `${Math.round(r.o.subsidy * 100)}% · ${inr(r.subsidyAmt)}` : "—"}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="muted">
              {t("Climate fit", "जलवायु")} {r.sub.climate}
            </Badge>
            <Badge tone="muted">
              <Droplets className="h-3 w-3" />
              {t("Water", "पानी")} {r.sub.water}
            </Badge>
            <Badge tone="muted">
              {t("Payback", "वसूली")} {r.sub.payback}
            </Badge>
            <Badge tone="muted">
              {t("Profit", "मुनाफ़ा")} {r.sub.profit}
            </Badge>
          </div>
          {r.ok && (
            <div>
              <p className="mb-1 text-muted-foreground">
                {t(
                  "Cash in hand after subsidy, by year",
                  "सब्सिडी के बाद हाथ में पैसा, साल दर साल",
                )}
              </p>
              <div className="flex items-end gap-1">
                {r.cash.map((c, y) => {
                  const max = Math.max(...r.cash.map(Math.abs), 1);
                  return (
                    <div key={y} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end justify-center">
                        <div
                          className={`w-full rounded-t ${c >= 0 ? "bg-primary-2" : "bg-berry"}`}
                          style={{ height: `${Math.max(4, (Math.abs(c) / max) * 64)}px` }}
                          title={inr(c)}
                        />
                      </div>
                      <span className="text-[0.65rem] text-muted-foreground">
                        {t("Y", "सा")}
                        {y}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-secondary px-2 py-1.5">
      <p className="text-muted-foreground">{k}</p>
      <p className="font-semibold text-foreground">{v}</p>
    </div>
  );
}
