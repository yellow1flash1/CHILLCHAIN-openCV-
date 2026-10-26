import { useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Landmark, ShieldCheck } from "lucide-react";
import { SignIn, SignUp } from "@clerk/tanstack-react-start";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { Logo } from "./ui";
import { LangPicker } from "./LangPicker";
import { ROLES, getPickedRole, roleInfo, setPickedRole } from "./roles";

/** Signed-out flow: pick who you are first, then log in or create an account. */
export function Auth() {
  const [role, setRole] = useState<Role | null>(getPickedRole);
  const pick = (r: Role | null) => {
    setPickedRole(r);
    setRole(r);
  };
  return role ? <SignInPanel role={role} onBack={() => pick(null)} /> : <Welcome onPick={pick} />;
}

function LangSwitch() {
  return <LangPicker end />;
}

function Welcome({ onPick }: { onPick: (r: Role) => void }) {
  const { t } = useStore();
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-6">
      <div className="flex justify-end">
        <LangSwitch />
      </div>
      <div className="mb-8 mt-4 text-center">
        <h1 className="mx-auto mb-3 flex w-fit">
          <Logo size={48} />
        </h1>
        <p className="text-[17px] font-semibold text-foreground">
          {t("Every hour counts.", "हर घंटा कीमती है।")}
        </p>
        <p className="mx-auto mt-1 max-w-md text-[15px] text-muted-foreground">
          {t(
            "Grade, cool, move and sell exotic fruit, short-life fruit, flowers and mushrooms before the clock runs out.",
            "विदेशी फल, जल्दी खराब होने वाले फल, फूल और मशरूम को समय रहते ग्रेड करें, ठंडा रखें, भेजें और बेचें।",
          )}
        </p>
        <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2 text-xs">
          {[
            ["🍓", t("Strawberry", "स्ट्रॉबेरी")],
            ["🐉", t("Dragon fruit", "ड्रैगन फ्रूट")],
            ["🔴", t("Litchi", "लीची")],
            ["🌹", t("Flowers", "फूल")],
            ["🍄", t("Mushrooms", "मशरूम")],
            ["🍇", t("Export grapes", "निर्यात अंगूर")],
          ].map(([e, l]) => (
            <span
              key={l}
              className="rounded-full bg-card px-2.5 py-1 text-[13px] text-muted-foreground"
            >
              {e} {l}
            </span>
          ))}
        </div>
      </div>
      <h2 className="mx-4 mb-1.5 text-[13px] font-normal uppercase tracking-[-0.08px] text-muted-foreground">
        {t("Who are you?", "आप कौन हैं?")}
      </h2>
      <div className="ios-list [--sep-inset:68px]">
        {ROLES.map(({ k, I, en, hi, descEn, descHi }) => (
          <button
            key={k}
            onClick={() => onPick(k)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-[11px] text-left active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
              <I className="h-[22px] w-[22px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-medium text-foreground">{t(en, hi)}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted-foreground">
                {t(descEn, descHi)}
              </span>
            </span>
            <ChevronRight
              className="h-[18px] w-[18px] shrink-0 text-muted-foreground/60"
              strokeWidth={2.5}
            />
          </button>
        ))}
      </div>
      <TrustSeals />
    </div>
  );
}

function SignInPanel({ role, onBack }: { role: Role; onBack: () => void }) {
  const { t } = useStore();
  const [mode, setMode] = useState<"login" | "reg">("login");
  const r = roleInfo(role);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="-ml-2 inline-flex items-center gap-0.5 px-1 py-2 text-[17px] text-primary active:opacity-60"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
          {t("Back", "वापस")}
        </button>
        <LangSwitch />
      </div>
      <div className="mb-5 mt-2 text-center">
        <h1 className="mx-auto mb-2 flex w-fit">
          <Logo size={44} />
        </h1>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">
          <r.I className="h-3.5 w-3.5" />
          {t(r.en, r.hi)}
        </span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-0.5 rounded-[9px] bg-secondary p-0.5">
        {(["login", "reg"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md py-2 text-sm font-medium ${mode === m ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "login" ? t("Log in", "लॉग इन") : t("Create account", "पंजीकरण")}
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        {mode === "login" ? <SignIn routing="hash" /> : <SignUp routing="hash" />}
      </div>
      <TrustSeals />
    </div>
  );
}

function TrustSeals() {
  const { t } = useStore();
  // Kept factual: payments are still in test mode.
  const items = [
    [ShieldCheck, t("Secure sign-in", "सुरक्षित लॉगिन")],
    [BadgeCheck, t("Built for growers & FPOs", "उत्पादकों व FPO के लिए")],
    [Landmark, t("Test-mode payments for now", "अभी टेस्ट मोड भुगतान")],
  ] as const;
  return (
    <div className="mx-auto mt-8 grid w-full max-w-md grid-cols-3 gap-2 text-center text-[0.68rem] font-semibold text-primary">
      {items.map(([Icon, l]) => (
        <div key={l} className="seal flex flex-col items-center gap-1 rounded-xl px-1 py-2">
          <Icon className="h-5 w-5" />
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}
