import { CloudRain, Snowflake, Sun, ThermometerSun } from "lucide-react";
import { useStore } from "@/lib/store";
import { useWeather } from "@/lib/data";
import { heatFactor } from "@/lib/shelf";
import { weatherAlerts, type AlertKind } from "@/lib/weather";
import { cn } from "@/lib/utils";

const ICON: Record<AlertKind, typeof Sun> = {
  heat: ThermometerSun,
  hot: ThermometerSun,
  rain: CloudRain,
  cold: Snowflake,
  good: Sun,
};
const TONE: Record<AlertKind, string> = {
  heat: "border-berry bg-berry-soft text-berry",
  hot: "border-chill bg-saffron-soft text-saffron-strong",
  rain: "border-chill bg-saffron-soft text-saffron-strong",
  cold: "border-chill bg-navy-soft text-navy",
  good: "border-primary/30 bg-accent text-primary",
};

/** Home: today's weather in the grower's district and what it means for harvest and transport. */
export function WeatherCard() {
  const { t } = useStore();
  const w = useWeather();
  const f = w.data?.forecast;
  if (!f) return null;
  return (
    <div className="card-classic p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground">
          {t("Weather", "मौसम")}
          {w.data?.district ? ` · ${w.data.district}` : ""}
        </p>
        <span className="text-xs text-muted-foreground">
          {Math.round(f.now)}°C {t("now", "अभी")} · {Math.round(f.min)}–{Math.round(f.max)}°C ·{" "}
          {t("rain", "बारिश")} {f.rainProb}%
        </span>
      </div>
      <div className="space-y-2">
        {weatherAlerts(f).map((a) => {
          const I = ICON[a.kind];
          return (
            <p
              key={a.kind}
              className={cn("flex gap-2 rounded-lg border p-2.5 text-sm", TONE[a.kind])}
            >
              <I className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-foreground">{t(a.en, a.hi)}</span>
            </p>
          );
        })}
      </div>
      <p className="mt-2 text-[0.68rem] text-muted-foreground">
        {t("Forecast: Open-Meteo", "पूर्वानुमान: Open-Meteo")}
      </p>
    </div>
  );
}

/** Scan screen: how today's heat changes an open-air clock. */
export function HeatLine({ cooled }: { cooled: boolean }) {
  const { t } = useStore();
  const f = useWeather().data?.forecast;
  if (!f || cooled) return null;
  const x = heatFactor(f.avg24);
  const msg =
    x >= 1.05
      ? t(
          `${Math.round(f.avg24)}°C average for the next 24 h: produce in open air spoils about ${x.toFixed(1)}× faster than at 25°C. The clock accounts for it.`,
          `अगले 24 घंटे औसत ${Math.round(f.avg24)}°C: खुले में माल 25°C से लगभग ${x.toFixed(1)} गुना जल्दी खराब होगा। घड़ी इसका हिसाब रखती है।`,
        )
      : x <= 0.95
        ? t(
            `${Math.round(f.avg24)}°C average for the next 24 h: cooler air gives a little more time. The clock accounts for it.`,
            `अगले 24 घंटे औसत ${Math.round(f.avg24)}°C: ठंडी हवा से थोड़ा ज़्यादा समय मिलेगा। घड़ी इसका हिसाब रखती है।`,
          )
        : null;
  if (!msg) return null;
  return (
    <p className="mb-4 flex gap-2 rounded-lg bg-saffron-soft px-3 py-2 text-xs text-saffron-strong">
      <ThermometerSun className="h-4 w-4 shrink-0" />
      {msg}
    </p>
  );
}
