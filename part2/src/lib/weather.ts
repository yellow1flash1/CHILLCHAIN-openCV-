// Weather for the grower's district (from Open-Meteo, fetched on the server) and the alerts it raises.
// Pure, so the home card, the scan screen and the tests share it.
import { heatFactor } from "./shelf";

export interface Forecast {
  /** Air temperature now, °C. */
  now: number;
  /** Average air temperature over the next 24 hours, °C: what an open-air clock uses. */
  avg24: number;
  /** Today's high and low, °C. */
  max: number;
  min: number;
  /** Rain expected today, mm, and the highest chance of rain today, %. */
  rainMm: number;
  rainProb: number;
}

export type AlertKind = "heat" | "hot" | "rain" | "cold" | "good";
export interface WeatherAlert {
  kind: AlertKind;
  en: string;
  hi: string;
}

/** Practical advice for harvesting and moving perishables today. */
export function weatherAlerts(f: Forecast): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  const faster = heatFactor(f.max).toFixed(1);
  if (f.max >= 38)
    out.push({
      kind: "heat",
      en: `Severe heat, up to ${Math.round(f.max)}°C: harvest before 8 am, keep crates in shade and pre-cool within 1 hour. Open-air produce spoils about ${faster}× faster than at 25°C.`,
      hi: `तेज़ गर्मी, ${Math.round(f.max)}°C तक: सुबह 8 बजे से पहले तोड़ें, क्रेट छाया में रखें और 1 घंटे में प्री-कूल करें। खुले में माल 25°C से लगभग ${faster} गुना जल्दी खराब होगा।`,
    });
  else if (f.max >= 33)
    out.push({
      kind: "hot",
      en: `Hot day, up to ${Math.round(f.max)}°C: harvest early and move produce to cold storage the same morning.`,
      hi: `गर्म दिन, ${Math.round(f.max)}°C तक: जल्दी तोड़ें और उसी सुबह कोल्ड स्टोरेज में पहुँचाएँ।`,
    });
  if (f.rainProb >= 70 || f.rainMm >= 10)
    out.push({
      kind: "rain",
      en: `Rain likely (${f.rainProb}%, ${Math.round(f.rainMm)} mm): harvest and load before it starts, cover crates, and don't pack wet fruit, which rots faster.`,
      hi: `बारिश की संभावना (${f.rainProb}%, ${Math.round(f.rainMm)} मिमी): बारिश से पहले तोड़ें और लादें, क्रेट ढकें, गीला फल पैक न करें, वह जल्दी सड़ता है।`,
    });
  if (f.min <= 4)
    out.push({
      kind: "cold",
      en: `Cold night, down to ${Math.round(f.min)}°C: protect chill-sensitive fruit (mango, banana, papaya, avocado) from chill injury.`,
      hi: `ठंडी रात, ${Math.round(f.min)}°C तक: आम, केला, पपीता, एवोकाडो जैसे फलों को ठंड से बचाएँ।`,
    });
  if (!out.length)
    out.push({
      kind: "good",
      en: "Good weather for harvest and transport today.",
      hi: "आज तुड़ाई और ढुलाई के लिए मौसम ठीक है।",
    });
  return out;
}
