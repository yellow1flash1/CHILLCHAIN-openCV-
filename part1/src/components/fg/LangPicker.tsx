import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { useStore } from "@/lib/store";
import { LANGS, langInfo, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Top bar / welcome screen: the current language, opening a list of all 15. */
export function LangPicker({ className, end }: { className?: string; end?: boolean }) {
  const { s, set, t } = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className={cn("relative", className)} ref={box}>
      <button
        aria-label={t("Change language", "भाषा बदलें")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2.5 py-2 text-[17px] text-primary active:opacity-60"
      >
        <Languages className="h-[18px] w-[18px]" />
        {langInfo(s.lang).native}
      </button>
      {open && (
        <div
          className={`absolute ${end ? "end-0" : "start-0"} top-full z-50 mt-2 max-h-[70vh] w-60 overflow-y-auto rounded-[14px] bg-card p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.2)]`}
        >
          <LangList
            onPick={(k) => {
              set((x) => ({ ...x, lang: k }));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** All 15 languages, each in its own script with the English name beside it. */
export function LangList({ onPick, grid }: { onPick: (k: Lang) => void; grid?: boolean }) {
  const { s } = useStore();
  return (
    <div className={grid ? "grid grid-cols-2 gap-1.5 sm:grid-cols-3" : "space-y-0.5"}>
      {LANGS.map((l) => {
        const on = s.lang === l.k;
        return (
          <button
            key={l.k}
            lang={l.k}
            dir={l.rtl ? "rtl" : "ltr"}
            onClick={() => onPick(l.k)}
            aria-pressed={on}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm",
              grid && "border",
              on
                ? "border-primary/40 bg-accent font-semibold text-primary"
                : "border-border text-foreground hover:bg-secondary",
            )}
          >
            <span>{l.native}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
              {l.k !== "en" && l.name}
              {on && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
