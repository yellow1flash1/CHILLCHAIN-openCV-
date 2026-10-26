import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, ChevronDown, Search } from "lucide-react";
import { CROPS, cropBy, useStore } from "@/lib/store";
import { CROP_GROUPS, type Crop } from "@/lib/crops";
import { cn } from "@/lib/utils";

/**
 * Searchable "Choose crop" dropdown. The AI-trained crops are always pinned in positions 1–3,
 * then every other crop follows grouped by type. `allowAll` adds an "All crops" option (for filters).
 */
export function CropSelect({
  value,
  onChange,
  allowAll,
  only,
  className,
}: {
  value: string;
  onChange: (key: string) => void;
  allowAll?: boolean;
  only?: string[];
  className?: string;
}) {
  const { s, t } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const name = (c: Crop) => t(c.en, c.hi);

  const flat = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = CROPS.filter((c) => !only || only.includes(c.key));
    const match = (c: Crop) =>
      !needle ||
      c.en.toLowerCase().includes(needle) ||
      c.hi.includes(needle) ||
      c.key.includes(needle);
    // Group order = CROP_GROUPS order, so the trained crops always come first.
    return CROP_GROUPS.flatMap((g) => pool.filter((c) => c.group === g.k && match(c)));
  }, [q, only]);
  const options = useMemo(
    () => [...(allowAll && !q ? [{ key: "all" } as const] : []), ...flat],
    [allowAll, q, flat],
  );

  useEffect(() => {
    if (!open) return undefined;
    setHi(0);
    setTimeout(() => input.current?.focus(), 0);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (k: string) => {
    onChange(k);
    setOpen(false);
    setQ("");
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[hi];
      if (o) choose(o.key);
    } else if (e.key === "Escape") setOpen(false);
  };

  const cur = value === "all" ? null : cropBy(value);
  let lastGroup = "";
  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-input bg-card px-3 py-2.5 text-left text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/15"
      >
        <span className="text-2xl leading-none">{cur ? cur.emoji : "🧺"}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">
            {cur ? name(cur) : t("All crops", "सभी फसलें")}
          </span>
          {cur?.trained && (
            <span className="text-[0.68rem] font-medium text-success">
              {t("AI Trained • Full Data", "एआई प्रशिक्षित • पूरा डेटा")}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={onKey}
              placeholder={t("Search crop, e.g. wheat or गेहूँ", "फसल खोजें, जैसे गेहूँ")}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("No crop found", "कोई फसल नहीं मिली")}
              </li>
            )}
            {options.map((o, i) => {
              if (o.key === "all")
                return (
                  <li
                    key="all"
                    role="option"
                    aria-selected={value === "all"}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => choose("all")}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${hi === i ? "bg-secondary" : ""}`}
                  >
                    🧺 {t("All crops", "सभी फसलें")}
                    {value === "all" && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </li>
                );
              const c = o as Crop;
              const g = CROP_GROUPS.find((x) => x.k === c.group)!;
              const header = g.k !== lastGroup ? ((lastGroup = g.k), g) : null;
              return (
                <li key={c.key} role="none">
                  {header && (
                    <p
                      className={`flex items-center gap-1 px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wide ${header.k === "trained" ? "text-success" : "text-muted-foreground"}`}
                    >
                      {header.k === "trained" && <BadgeCheck className="h-3 w-3" />}
                      {t(header.en, header.hi)}
                    </p>
                  )}
                  <div
                    role="option"
                    aria-selected={value === c.key}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => choose(c.key)}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${hi === i ? "bg-secondary" : ""}`}
                  >
                    <span className="text-lg leading-none">{c.emoji}</span>
                    <span className="flex-1 text-foreground">
                      {name(c)}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {s.lang === "en" ? c.hi : c.en}
                      </span>
                    </span>
                    {c.trained && (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-success">
                        AI
                      </span>
                    )}
                    {value === c.key && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
