import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtLeft, hoursLeft, urgency, type Urgency } from "@/lib/shelf";
import { cn } from "@/lib/utils";

/** Current time, refreshed every `ms` so countdowns move on their own. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(h);
  }, [ms]);
  return now;
}

// iOS system colours: green while fresh, orange when it should go soon, red when urgent.
const TONE: Record<Urgency, { bar: string; text: string; bg: string; color: string }> = {
  fresh: { bar: "bg-success", text: "text-success", bg: "bg-success/15", color: "var(--green)" },
  soon: { bar: "bg-warning", text: "text-warning", bg: "bg-warning/15", color: "var(--orange)" },
  urgent: {
    bar: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/15",
    color: "var(--red)",
  },
  expired: {
    bar: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-secondary",
    color: "var(--label2)",
  },
};

/** "Sell within 1 d 4 h" countdown. `from` is when the clock started (harvest, or when the lot was listed). */
export function SellClock({
  sellBy,
  from,
  size = "sm",
  className,
}: {
  sellBy: string;
  from: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { t } = useStore();
  const now = useNow();
  const left = hoursLeft(sellBy, now);
  const windowH = Math.max(1, hoursLeft(sellBy, new Date(from).getTime()));
  const u = urgency(left, windowH);
  const tone = TONE[u];
  const label =
    u === "expired"
      ? t("Past sell-by: processor price only", "समय निकल गया: केवल प्रोसेसर भाव")
      : t(`Sell within ${fmtLeft(left)}`, `${fmtLeft(left)} में बेचें`);
  if (size === "sm")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] font-semibold",
          tone.bg,
          tone.text,
          className,
        )}
      >
        <Timer className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  const pct = Math.max(0, Math.min(100, (left / windowH) * 100));
  return (
    <div className={cn("rounded-[14px] p-4", tone.bg, className)}>
      <p className={cn("flex items-center gap-2 text-sm font-medium", tone.text)}>
        <Timer className="h-5 w-5" />
        {u === "expired" ? label : t("Sell within", "इतने समय में बेचें")}
      </p>
      {u !== "expired" && (
        <p className={cn("mt-1 text-4xl font-bold tracking-tight", tone.text)}>{fmtLeft(left)}</p>
      )}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Deadline", "आख़िरी समय")}:{" "}
        {new Date(sellBy).toLocaleString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
