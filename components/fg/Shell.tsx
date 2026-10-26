import { useCallback } from "react";
import {
  Bot,
  Home,
  IndianRupee,
  Megaphone,
  ScanLine,
  Snowflake,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { useStore, type Tab } from "@/lib/store";
import { useTabEvents } from "@/lib/nav";
import { TopBar } from "./TopBar";
import { HomeTab } from "./HomeTab";
import { ScanTab } from "./ScanTab";
import { ColdTab } from "./ColdTab";
import { PayTab } from "./PayTab";
import { TransportTab } from "./TransportTab";
import { IncomeTab } from "./IncomeTab";
import { AssistTab } from "./AssistTab";
import { AdvisorTab } from "./AdvisorTab";
import { DemandTab } from "./DemandTab";
import { RatePrompt } from "./KrishiSaakh";

type Group = {
  k: string;
  en: string;
  hi: string;
  I: typeof Home;
  tabs: { k: Tab; en: string; hi: string; I: typeof Home }[];
};
// Five groups keep the phone bar readable; groups with several screens get a switch at the top.
// The order follows the logo's chain: plan → scan → store/move → sell.
const GROUPS: Group[] = [
  {
    k: "home",
    en: "Home",
    hi: "होम",
    I: Home,
    tabs: [
      { k: "home", en: "Home", hi: "होम", I: Home },
      { k: "scan", en: "Scan & clock", hi: "स्कैन व घड़ी", I: ScanLine },
    ],
  },
  {
    k: "plan",
    en: "Plan",
    hi: "योजना",
    I: Sprout,
    tabs: [{ k: "advisor", en: "ProfitPlanter", hi: "प्रॉफ़िटप्लांटर", I: Sprout }],
  },
  {
    k: "store",
    en: "Cool/Move",
    hi: "ठंडा/ढुलाई",
    I: Warehouse,
    tabs: [
      { k: "cold", en: "Storage", hi: "भंडारण", I: Snowflake },
      { k: "transport", en: "Reefer truck", hi: "रीफ़र ट्रक", I: Truck },
    ],
  },
  {
    k: "sell",
    en: "Sell",
    hi: "बेचें",
    I: Store,
    tabs: [
      { k: "demand", en: "Buyer demand", hi: "माँग", I: Megaphone },
      { k: "pay", en: "Money", hi: "पैसा", I: IndianRupee },
      { k: "income", en: "Income", hi: "आय", I: TrendingUp },
    ],
  },
  {
    k: "help",
    en: "Help",
    hi: "सहायक",
    I: Bot,
    tabs: [{ k: "assist", en: "Chill Sahayak", hi: "चिल सहायक", I: Bot }],
  },
];

export function Shell() {
  const { s, set, t } = useStore();
  const go = useCallback(
    (k: Tab) => {
      set((x) => ({ ...x, tab: k }));
      window.scrollTo({ top: 0 });
    },
    [set],
  );
  useTabEvents(
    useCallback(
      (k: string) => {
        if (GROUPS.some((g) => g.tabs.some((x) => x.k === k))) go(k as Tab);
      },
      [go],
    ),
  );
  const desktop = s.mode === "desktop";
  const group = GROUPS.find((g) => g.tabs.some((x) => x.k === s.tab)) ?? GROUPS[0]!;
  return (
    <div className="min-h-screen">
      <TopBar />
      <div
        className={`mx-auto ${desktop ? "flex max-w-6xl gap-8 px-4 py-6" : "max-w-[680px] pb-[calc(96px+env(safe-area-inset-bottom))]"}`}
      >
        {desktop && (
          <nav
            className="sticky top-20 h-fit w-56 shrink-0 space-y-3"
            aria-label={t("Sections", "भाग")}
          >
            {GROUPS.map((g) => (
              <div key={g.k}>
                {g.tabs.length > 1 && (
                  <p className="mb-1 px-3 text-[13px] uppercase text-muted-foreground">
                    {t(g.en, g.hi)}
                  </p>
                )}
                {g.tabs.map(({ k, en, hi, I }) => (
                  <button
                    key={k}
                    onClick={() => go(k)}
                    aria-current={s.tab === k ? "page" : undefined}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[15px] ${s.tab === k ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-secondary"}`}
                  >
                    <I className={`h-5 w-5 shrink-0 ${s.tab === k ? "" : "text-primary"}`} />
                    {t(en, hi)}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
        <main className={`min-w-0 flex-1 ${desktop ? "" : "px-4 pt-2"}`}>
          {!desktop && group.tabs.length > 1 && (
            <div className="mb-3.5 flex rounded-[9px] bg-secondary p-0.5" role="tablist">
              {group.tabs.map(({ k, en, hi }) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={s.tab === k}
                  onClick={() => go(k)}
                  className={`flex-1 rounded-[7px] px-1 py-2 text-[13px] leading-none text-foreground transition-all ${s.tab === k ? "bg-card font-semibold shadow-sm" : "font-medium"}`}
                >
                  {t(en, hi)}
                </button>
              ))}
            </div>
          )}
          {s.tab !== "home" && s.tab !== "advisor" && s.tab !== "assist" && <RatePrompt />}
          {s.tab === "home" && <HomeTab />}
          {s.tab === "advisor" && <AdvisorTab />}
          {s.tab === "demand" && <DemandTab />}
          {s.tab === "scan" && <ScanTab />}
          {s.tab === "cold" && <ColdTab />}
          {s.tab === "transport" && <TransportTab />}
          {s.tab === "pay" && <PayTab />}
          {s.tab === "income" && <IncomeTab />}
          {s.tab === "assist" && <AssistTab />}
        </main>
      </div>
      {!desktop && (
        <nav
          className="ios-bar fixed inset-x-0 bottom-0 z-40 border-t-[0.5px] border-border pb-[env(safe-area-inset-bottom)]"
          aria-label={t("Sections", "भाग")}
        >
          <div className="mx-auto grid max-w-[680px] grid-cols-5">
            {GROUPS.map((g) => {
              const on = g === group;
              return (
                <button
                  key={g.k}
                  onClick={() => go(g.tabs[0]!.k)}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[49px] flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium ${on ? "text-primary" : "text-muted-foreground"}`}
                >
                  <g.I className="h-[26px] w-[26px]" strokeWidth={on ? 2.2 : 1.8} />
                  <span className="leading-none">{t(g.en, g.hi)}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
