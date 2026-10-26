import { useEffect, useRef, useState } from "react";
import { LogOut, Settings2, ThumbsUp, UserCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/data";
import { LogoMark } from "./ui";
import { LangPicker } from "./LangPicker";
import { OfflineBar } from "./OfflineBar";
import { KrishiSaakhHost, MyRatingSummary, openKrishiSaakh } from "./KrishiSaakh";
import { SettingsHost, openSettings } from "./Settings";

const ROLE_CHIP = {
  farmer: ["Grower", "उत्पादक"],
  transporter: ["Reefer & transport", "रीफ़र व ट्रांसपोर्ट"],
  buyer: ["Buyer", "खरीदार"],
  owner: ["Storage owner", "स्टोरेज मालिक"],
} as const;

/** iOS navigation bar: the one-colour logo, language switch and the profile menu (rating, settings,
 *  sign out). Translucent; its hairline appears once the page scrolls under it, as with a large title. */
export function TopBar() {
  const { s, set, t, signOut } = useStore();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const desktop = s.mode === "desktop";
  const p = me?.profile;
  const role = me?.role ?? null;
  const business = role === "buyer" || role === "owner";
  const chip = role ? ROLE_CHIP[role] : null;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item =
    "flex w-full items-center justify-between gap-2 px-4 py-[11px] text-left text-[17px] active:bg-secondary";
  return (
    <>
      <header
        className={`ios-bar sticky top-0 z-40 border-b-[0.5px] pt-[env(safe-area-inset-top)] transition-colors duration-200 ${scrolled || desktop ? "border-border" : "border-transparent"}`}
      >
        <div
          className={`mx-auto grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 ${desktop ? "max-w-6xl" : "max-w-[680px]"}`}
        >
          <LangPicker className="-ml-2.5 justify-self-start" />
          <span className="flex items-center gap-1.5 text-foreground">
            <LogoMark size={18} />
            <b
              className={`overflow-hidden whitespace-nowrap text-[17px] font-semibold transition-opacity duration-200 ${scrolled || desktop ? "opacity-100" : "w-0 opacity-0"}`}
            >
              ChillChain
            </b>
          </span>
          <div className="flex items-center justify-self-end">
            <div className="relative" ref={menu}>
              <button
                aria-label={t("Profile, rating and settings", "प्रोफ़ाइल, रेटिंग और सेटिंग")}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="rounded-full p-1 text-primary active:opacity-60"
              >
                <UserCircle2 className="h-7 w-7" strokeWidth={1.6} />
              </button>
              {open && (
                <div className="ios-list absolute right-0 top-full mt-2 w-72 shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
                  <div className="px-4 py-3">
                    <p className="text-[17px] font-semibold text-foreground">
                      {(business ? p?.org_name : p?.full_name) || "—"}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {role === "farmer"
                        ? `${t("Grower ID", "उत्पादक आईडी")}: ${p?.fpo_id ?? "—"}`
                        : chip
                          ? t(`${chip[0]} account`, `${chip[1]} खाता`)
                          : ""}
                    </p>
                    <MyRatingSummary onOpen={() => setOpen(false)} />
                  </div>
                  <button
                    className={item}
                    onClick={() => {
                      setOpen(false);
                      openSettings();
                    }}
                  >
                    {t("Settings", "सेटिंग")}
                    <Settings2 className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <button
                    className={item}
                    onClick={() => {
                      setOpen(false);
                      openKrishiSaakh("rate");
                    }}
                  >
                    {t("Rate my partners", "साथियों को रेट करें")}
                    <ThumbsUp className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <button
                    className={`${item} text-destructive`}
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    {t("Sign out", "लॉग आउट")}
                    <LogOut className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <OfflineBar />
      </header>
      <KrishiSaakhHost />
      <SettingsHost />
    </>
  );
}
