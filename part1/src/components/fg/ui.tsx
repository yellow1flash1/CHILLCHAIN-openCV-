import { useId, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { Volume2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { langInfo } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type V = "primary" | "gold" | "outline" | "ghost" | "danger";
// iOS button styles: filled blue, tinted, grey, plain text and destructive.
const vs: Record<V, string> = {
  primary: "bg-primary text-primary-foreground",
  // "gold" is kept as a name for compatibility; it is the tinted secondary button.
  gold: "bg-accent text-primary",
  outline: "bg-secondary text-primary",
  ghost: "text-primary",
  danger: "bg-destructive text-destructive-foreground",
};
export function Btn({
  v = "primary",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { v?: V }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-[15px] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.98] active:opacity-70 disabled:opacity-40",
        vs[v],
        // full-width buttons are the large iOS action button
        className?.includes("w-full") && "rounded-[14px] py-3.5 text-[17px]",
        className,
      )}
    />
  );
}
export function Badge({
  children,
  tone = "gold",
}: {
  children: ReactNode;
  tone?: "gold" | "green" | "amber" | "red" | "muted";
}) {
  const m = {
    gold: "bg-primary/15 text-primary",
    green: "bg-success/15 text-success",
    amber: "bg-warning/15 text-warning",
    red: "bg-destructive/15 text-destructive",
    muted: "bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] font-semibold",
        m[tone],
      )}
    >
      {children}
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  // iOS bottom sheet on phones (grabber, spring), a centred card on wider screens.
  return (
    <div
      className="animate-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[92vh] w-full max-w-[680px] overflow-y-auto rounded-t-[14px] bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 max-sm:animate-sheet sm:rounded-[14px] sm:p-5",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mb-2 h-[5px] w-9 rounded-[3px] bg-border sm:hidden" aria-hidden />
        <div className="relative mb-3 px-10">
          <h3 className="text-center text-[20px] font-semibold text-foreground">{title}</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute right-0 top-0 grid h-[30px] w-[30px] place-items-center rounded-full bg-secondary text-muted-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
export const inputCls =
  "w-full rounded-[10px] border border-input bg-card px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/20";
/** iOS large title with a short subtitle; every tab of every role starts with one. `icon` is kept for
 *  existing callers but not drawn, as iOS large titles have none. */
export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string | undefined;
  icon?: ComponentType<{ className?: string }> | undefined;
  right?: ReactNode;
}) {
  return (
    <div className="mb-[18px] mt-1.5 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-[34px] font-bold leading-[1.12] tracking-[0.37px] text-foreground [overflow-wrap:anywhere]">
          {title}
        </h1>
        {sub && <p className="mt-0.5 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      <ReadAloud text={`${title}. ${sub ?? ""}`} />
      {right}
    </div>
  );
}
/** Speaker button (shown when "Read screens aloud" is on in Settings). */
export function ReadAloud({ text }: { text: string }) {
  const { s, t } = useStore();
  if (!s.readAloud || typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const say = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langInfo(s.lang).speech;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };
  return (
    <button
      type="button"
      onClick={say}
      aria-label={t("Read aloud", "पढ़कर सुनाएँ")}
      className="shrink-0 rounded-full p-2 text-primary active:opacity-60"
    >
      <Volume2 className="h-5 w-5" />
    </button>
  );
}
/** Grey placeholder shapes while data loads. */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-[14px] bg-card" />
      ))}
    </div>
  );
}
/** Friendly empty state with an optional next step. */
export function Empty({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-classic flex flex-col items-center gap-2 p-6 text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-secondary text-muted-foreground">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="font-medium text-foreground">{title}</p>
      {sub && <p className="max-w-sm text-sm text-muted-foreground">{sub}</p>}
      {action}
    </div>
  );
}
/** iOS grouped-list caption above a list or group. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mx-4 mb-1.5 mt-[22px] text-[13px] uppercase tracking-[-0.08px] text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}
/** The ChillChain mark in one colour (currentColor): a link with a leaf and berry locked into a link
 *  with a snowflake. The gaps where the links cross are cut out with masks, so the mark sits on any
 *  surface and follows the text colour in light and dark mode. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const link = { width: 52, height: 32, rx: 16, fill: "none" } as const;
  const flake = "M76 30 V50 M72.5 32.5 L76 35 L79.5 32.5 M72.5 47.5 L76 45 L79.5 47.5";
  const under = "M56.8 53.1 A16 16 0 0 1 50.2 42.8";
  const all = { x: 0, y: 0, width: 120, height: 70, fill: "white" } as const;
  return (
    <svg
      viewBox="6 0 100 60"
      width={(size * 100) / 60}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <mask id={`${id}a`} maskUnits="userSpaceOnUse">
        <rect {...all} />
        <rect {...link} x={10} y={18} stroke="black" strokeWidth={13} />
      </mask>
      <mask id={`${id}b`} maskUnits="userSpaceOnUse">
        <rect {...all} />
        <path d={under} fill="none" stroke="black" strokeWidth={13} />
      </mask>
      <mask id={`${id}c`} maskUnits="userSpaceOnUse">
        <rect {...all} />
        <path
          d="M19 17 Q 27 11, 35 5"
          fill="none"
          stroke="black"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </mask>
      <g fill="none" stroke="currentColor" strokeWidth={8}>
        <rect {...link} x={50} y={24} mask={`url(#${id}a)`} />
        <rect {...link} x={10} y={18} mask={`url(#${id}b)`} />
        <path d={under} />
      </g>
      <path
        d="M17 19 C 15 7, 27 1, 37 3 C 37 12, 29 20, 17 19 Z"
        fill="currentColor"
        mask={`url(#${id}c)`}
      />
      <circle cx={39} cy={28} r={3.6} fill="currentColor" />
      <g stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d={flake} />
        <path d={flake} transform="rotate(60 76 40)" />
        <path d={flake} transform="rotate(120 76 40)" />
      </g>
    </svg>
  );
}
/** "ChillChain" in the system font, in the text colour. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-bold", className)}>ChillChain</span>;
}
/** Full logo (mark + name), in one colour. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <LogoMark size={size} />
      <Wordmark
        className={size >= 40 ? "text-[34px] tracking-[0.37px]" : "text-[17px] font-semibold"}
      />
    </span>
  );
}
/** Kept as "Crest" so existing imports keep working. */
export const Crest = LogoMark;

/* ---------- iOS list parts (rows, icons, ring, rail) ---------- */

/** Section heading between groups (22px bold). */
export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between gap-3">
      <h2 className="text-[22px] font-bold tracking-[0.35px] text-foreground">{children}</h2>
      {right && <span className="text-[13px] text-muted-foreground">{right}</span>}
    </div>
  );
}
/** Grouped list card; rows inside get inset hairlines. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ios-list", className)}>{children}</div>;
}
/** 40px squircle: an emoji on a soft tint, or a white icon on a solid colour. */
export function Ico({
  children,
  color = "var(--blue)",
  solid,
}: {
  children: ReactNode;
  color?: string;
  solid?: boolean;
}) {
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[22px] leading-none"
      style={
        solid
          ? { background: color, color: "#fff" }
          : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }
      }
    >
      {children}
    </span>
  );
}
export function Chev() {
  return (
    <svg
      viewBox="0 0 8 13"
      className="h-[13px] w-2 shrink-0 text-muted-foreground/60"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 1.5l5 5-5 5" />
    </svg>
  );
}
/** One list row: optional leading icon, title over a subtitle, value or pill on the right. */
export function IRow({
  icon,
  title,
  sub,
  right,
  onClick,
  chevron = !!onClick,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <b className="block text-[17px] font-medium leading-snug text-foreground">{title}</b>
        {sub && <span className="block truncate text-[14px] text-muted-foreground">{sub}</span>}
      </span>
      {(right || chevron) && (
        <span className="flex shrink-0 items-center gap-1.5 text-[15px] text-muted-foreground">
          {right}
          {chevron && <Chev />}
        </span>
      )}
    </>
  );
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3 px-4 py-[11px] text-left",
    icon ? "[--sep-inset:68px]" : "",
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "active:bg-secondary")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
/** Circular progress gauge (116px) with a readout in the middle. */
export function Ring({
  pct,
  color = "var(--orange)",
  value,
  label,
}: {
  pct: number;
  color?: string;
  value: ReactNode;
  label: ReactNode;
}) {
  const c = 2 * Math.PI * 50;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative h-[116px] w-[116px] shrink-0">
      <svg width="116" height="116" viewBox="0 0 116 116" className="-rotate-90" aria-hidden>
        <circle cx="58" cy="58" r="50" fill="none" stroke="var(--fill)" strokeWidth="10" />
        <circle
          cx="58"
          cy="58"
          r="50"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center px-3 text-center">
        <b className="text-[22px] font-bold leading-tight text-foreground">{value}</b>
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
/** Sideways snap rail of tiles. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
/** Flat coloured tile in a rail (white text on an iOS system colour). */
export function Tile({
  color,
  kicker,
  title,
  sub,
  icon,
  onClick,
}: {
  color: string;
  kicker?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[150px] w-[236px] shrink-0 snap-start flex-col justify-between rounded-[18px] p-4 text-left text-white transition-[opacity,transform] duration-150 active:scale-[0.98] active:opacity-80"
      style={{ background: color }}
    >
      <span className="opacity-90">{icon}</span>
      <span>
        {kicker && (
          <small className="block text-[12px] font-semibold uppercase tracking-[0.5px] opacity-85">
            {kicker}
          </small>
        )}
        <b className="mb-1 mt-0.5 block text-[20px] font-semibold leading-tight">{title}</b>
        {sub && <span className="block text-[14px] opacity-90">{sub}</span>}
      </span>
    </button>
  );
}
