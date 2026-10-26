import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, useClerk, useUser } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { isLang, langInfo, loadDict, makeT, type Dict, type Lang } from "./i18n";
import { useOnline } from "./net";
import { clearOffline, readLastUser, rememberUser } from "./offline";
import { setApiT } from "./api";

export interface Session {
  user: { id: string; email: string | null };
}
export type { Lang } from "./i18n";
export type Tab =
  "home" | "advisor" | "scan" | "cold" | "transport" | "demand" | "pay" | "income" | "assist";

export { CROPS, cropBy, type Crop } from "./crops";

export const rid = (p: string, n = 4) =>
  `${p}${Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1))}`;
export const utr = () => String(Math.floor(100000000000 + Math.random() * 899999999999));

export type Layout = "auto" | "mobile" | "desktop";
export type Theme = "system" | "light" | "dark";
// Device-only preferences (kept in this browser). Account-level settings live in the database.
interface Prefs {
  lang: Lang;
  scale: number;
  layout: Layout;
  theme: Theme;
  readAloud: boolean;
  tab: Tab;
  prefillCrop: string | null;
  // Hand-offs from a scan: which storage to show, and the lot's sell-by time for the truck deadline.
  prefillFacility: "cold_room" | "precool" | "ripening" | null;
  prefillSellBy: string | null;
  mode: "mobile" | "desktop"; // derived from `layout` and the screen width; never stored
}
const DEFAULT: Prefs = {
  lang: "en",
  scale: 16,
  layout: "auto",
  theme: "light",
  readAloud: false,
  tab: "home",
  prefillCrop: null,
  prefillFacility: null,
  prefillSellBy: null,
  mode: "mobile",
};
const KEY = "chillchain-prefs-v1";

interface Ctx {
  s: Prefs;
  set: (fn: (s: Prefs) => Prefs) => void;
  t: (en: string, hi: string) => string;
  session: Session | null;
  /** A real sign-in session (false when the app runs offline on the remembered account). */
  signedIn: boolean;
  authReady: boolean;
  signOut: () => Promise<void>;
}
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [s, setS] = useState<Prefs>(DEFAULT);
  const [ready, setReady] = useState(false);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const online = useOnline();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Offline, the sign-in service cannot be reached: the last account signed in on this phone is used,
  // with the data saved on the phone. Nothing reaches the server until the real session is back.
  const offlineUser = !online && !isSignedIn ? readLastUser() : null;
  const session: Session | null =
    isSignedIn && userId
      ? { user: { id: userId, email } }
      : offlineUser
        ? { user: offlineUser }
        : null;
  const authReady = isLoaded || !!offlineUser;
  useEffect(() => {
    if (isSignedIn && userId) rememberUser({ id: userId, email });
  }, [isSignedIn, userId, email]);
  // If the sign-in service failed to load while offline, reload once the network is back (at most
  // once a minute, so a network that is up but not passing data cannot cause a reload loop).
  useEffect(() => {
    if (!online || isLoaded) return;
    const h = setInterval(() => {
      if (clerk.status !== "error") return;
      try {
        const last = Number(sessionStorage.getItem("chillchain-auth-reload") ?? 0);
        if (Date.now() - last < 60_000) return;
        sessionStorage.setItem("chillchain-auth-reload", String(Date.now()));
      } catch {
        return;
      }
      location.reload();
    }, 2_000);
    return () => clearInterval(h);
  }, [online, isLoaded, clerk]);
  const [wide, setWide] = useState(false);
  const [darkOs, setDarkOs] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Prefs>;
        if (saved.lang !== undefined && !isLang(saved.lang)) delete saved.lang;
        setS({
          ...DEFAULT,
          ...saved,
          prefillCrop: null,
          prefillFacility: null,
          prefillSellBy: null,
        });
      }
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia("(min-width: 1024px)"),
      dq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setWide(mq.matches);
      setDarkOs(dq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    dq.addEventListener("change", sync);
    setReady(true);
    return () => {
      mq.removeEventListener("change", sync);
      dq.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    if (ready) {
      const { mode: _m, ...keep } = s;
      try {
        localStorage.setItem(KEY, JSON.stringify(keep));
      } catch {
        /* storage blocked */
      }
    }
  }, [s, ready]);
  useEffect(() => {
    document.documentElement.style.setProperty("--fg-scale", `${s.scale}px`);
  }, [s.scale]);
  const dark = s.theme === "dark" || (s.theme === "system" && darkOs);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset["theme"] = dark ? "dark" : "light";
  }, [dark]);
  // The chosen language's dictionary is loaded on demand; until it arrives, texts fall back as usual.
  const [dict, setDict] = useState<{ lang: Lang; d: Dict }>({ lang: "en", d: {} });
  useEffect(() => {
    let live = true;
    loadDict(s.lang)
      .then((d) => live && setDict({ lang: s.lang, d }))
      .catch(() => live && setDict({ lang: s.lang, d: {} }));
    const info = langInfo(s.lang);
    document.documentElement.lang = info.k;
    document.documentElement.dir = info.rtl ? "rtl" : "ltr";
    return () => {
      live = false;
    };
  }, [s.lang]);
  const t = useMemo(() => makeT(s.lang, dict.lang === s.lang ? dict.d : {}), [s.lang, dict]) as (
    en: string,
    hi: string,
  ) => string;
  useEffect(() => setApiT(t), [t]);
  const eff: Prefs = { ...s, mode: s.layout === "auto" ? (wide ? "desktop" : "mobile") : s.layout };
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await clearOffline();
    try {
      sessionStorage.removeItem("chillchain-picked-role");
    } catch {
      /* storage blocked */
    }
    // Offline there is no sign-in service to tell; forgetting the account on the phone is enough.
    await clerk.signOut().catch(() => undefined);
    setS((x) => ({ ...x, tab: "home" }));
  };
  if (!ready) return null;
  return (
    <C.Provider
      value={{ s: eff, set: setS, t, session, signedIn: !!isSignedIn, authReady, signOut }}
    >
      {children}
    </C.Provider>
  );
}
export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("no store");
  return c;
}
