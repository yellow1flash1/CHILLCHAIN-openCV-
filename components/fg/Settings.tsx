import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useClerk } from "@clerk/tanstack-react-start";
import {
  ChevronLeft,
  Bell,
  Bot,
  CreditCard,
  Download,
  FileText,
  Globe,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  LogOut,
  MapPin,
  Plus,
  Settings2,
  ShieldCheck,
  Sprout,
  Star,
  Store,
  Trash2,
  Truck,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { CROPS, cropBy, useStore, type Layout, type Theme } from "@/lib/store";
import {
  useInvalidate,
  useIsAdmin,
  useMe,
  useMyReviews,
  useOwnerDashboard,
  useSaveProfile,
  useSettings,
  type Settings,
} from "@/lib/data";
import { goToTab } from "@/lib/nav";
import { FLOWS, type FlowId } from "@/lib/krishisaakh";
import type { Role } from "@/lib/types";
import { Badge, Btn, Chev, Field, Label, SectionTitle, inputCls } from "./ui";
import { CropSelect } from "./CropSelect";
import { MyRatingSummary, openKrishiSaakh } from "./KrishiSaakh";
import { DISTRICTS } from "./Onboarding";
import { LangList } from "./LangPicker";

export const APP_VERSION = "1.1.0";
const SUPPORT_PHONE = import.meta.env["VITE_SUPPORT_PHONE"] as string | undefined;
const SUPPORT_EMAIL = import.meta.env["VITE_SUPPORT_EMAIL"] as string | undefined;

/* ---------- open from the profile menu ---------- */
let open = false;
const subs = new Set<() => void>();
export const openSettings = () => {
  open = true;
  subs.forEach((f) => f());
};
const closeSettings = () => {
  open = false;
  subs.forEach((f) => f());
};
const useOpen = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => open,
    () => false,
  );

export function SettingsHost() {
  const shown = useOpen();
  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <SettingsPage />
    </div>
  );
}

/* ---------- small building blocks ---------- */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bell;
  title: string;
  children: ReactNode;
}) {
  // iOS grouped section: caption above, rows in one inset card. `icon` is kept for callers.
  void Icon;
  return (
    <section>
      <h3 className="mx-4 mb-1.5 text-[13px] font-normal uppercase tracking-[-0.08px] text-muted-foreground">
        {title}
      </h3>
      <div className="ios-list">{children}</div>
    </section>
  );
}
function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-[11px]">
      <div className="min-w-0">
        <p className="text-[17px] text-foreground">{label}</p>
        {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[250ms] disabled:opacity-40 ${on ? "bg-success" : "bg-secondary"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-[250ms] ${on ? "translate-x-5" : ""}`}
      />
    </button>
  );
}
function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-[9px] bg-secondary p-0.5 text-[13px]">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`rounded-[7px] px-2.5 py-1.5 font-medium text-foreground ${value === k ? "bg-card font-semibold shadow-sm" : ""}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
function LinkRow({
  icon: Icon,
  label,
  sub,
  onClick,
  danger,
}: {
  icon: typeof Bell;
  label: string;
  sub?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left [--sep-inset:58px] active:bg-secondary ${danger ? "text-destructive" : "text-foreground"}`}
    >
      <span
        className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-white ${danger ? "bg-destructive" : "bg-primary"}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px]">{label}</span>
        {sub && <span className="block text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      <Chev />
    </button>
  );
}
function Chips({
  all,
  value,
  onChange,
  render,
}: {
  all: string[];
  value: string[];
  onChange: (v: string[]) => void;
  render: (k: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-3">
      {all.map((k) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
          >
            {render(k)}
          </button>
        );
      })}
    </div>
  );
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- the page ---------- */
function SettingsPage() {
  const { s, t } = useStore();
  const { data: me } = useMe();
  const st = useSettings();
  const inv = useInvalidate();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const role = (me?.role ?? "farmer") as Role;
  const cur: Settings = st.data?.settings ?? {};
  const save = async (patch: Settings) => {
    const r = await api.saveSettings(patch);
    setMsg(
      r.error ? { ok: false, text: r.error.message } : { ok: true, text: t("Saved", "सेव हो गया") },
    );
    inv("settings");
    setTimeout(() => setMsg(null), 2000);
  };
  const go = (tab: string) => {
    closeSettings();
    setTimeout(() => goToTab(tab), 0);
  };

  return (
    <div
      className={`mx-auto px-4 pb-16 pt-4 ${s.mode === "desktop" ? "max-w-3xl" : "max-w-[680px]"}`}
    >
      <button
        onClick={closeSettings}
        className="-ml-2 mb-1 inline-flex items-center gap-0.5 px-1 py-2 text-[17px] text-primary active:opacity-60"
      >
        <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
        {t("Back", "वापस")}
      </button>
      <SectionTitle
        icon={Settings2}
        title={t("Settings", "सेटिंग")}
        sub={t(
          "Your account, app look, alerts, payments and privacy",
          "आपका खाता, ऐप का रूप, सूचनाएँ, भुगतान और गोपनीयता",
        )}
      />
      {msg && (
        <p
          role="status"
          className={`fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-full px-4 py-2 text-sm shadow-lg ${msg.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}
        >
          {msg.text}
        </p>
      )}
      {st.isError && (
        <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          {t("Some settings could not be loaded.", "कुछ सेटिंग लोड नहीं हुईं।")}{" "}
          {(st.error as Error).message}
        </p>
      )}
      <div className="space-y-[22px]">
        <AccountSection role={role} />
        <DisplaySection />
        <NotifySection cur={cur} save={save} />
        <PaymentsSection cur={cur} save={save} />
        <RatingSection />
        {role === "farmer" && <FarmerSection cur={cur} save={save} go={go} />}
        {role === "transporter" && (
          <TransporterSection
            cur={cur}
            save={save}
            go={go}
            available={st.data?.available ?? null}
          />
        )}
        {role === "buyer" && <BuyerSection cur={cur} save={save} />}
        {role === "owner" && <OwnerSection go={go} palledari={st.data?.palledari ?? null} />}
        <PrivacySection cur={cur} save={save} />
        <HelpSection role={role} go={go} />
      </div>
    </div>
  );
}

function AccountSection({ role }: { role: Role }) {
  const { t, signOut } = useStore();
  const clerk = useClerk();
  const { data: me } = useMe();
  const saveProfile = useSaveProfile();
  const p = me?.profile;
  const [f, setF] = useState({
    full_name: p?.full_name ?? "",
    phone: p?.phone ?? "",
    org_name: p?.org_name ?? "",
    state: p?.state ?? "Haryana",
    district: p?.district ?? "",
    village: p?.village ?? "",
  });
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (f.full_name.trim().length < 2) return setErr(t("Enter your full name", "पूरा नाम डालें"));
    if (!/^[6-9]\d{9}$/.test(f.phone))
      return setErr(t("Enter a valid 10-digit mobile", "सही मोबाइल नंबर डालें"));
    setErr("");
    saveProfile.mutate(
      {
        full_name: f.full_name.trim(),
        phone: f.phone,
        org_name: f.org_name.trim() || null,
        state: f.state,
        district: f.district,
        village: f.village.trim() || null,
      },
      { onSuccess: () => setEdit(false), onError: (e) => setErr((e as Error).message) },
    );
  };
  const everywhere = async () => {
    setBusy(true);
    await api.signOutEverywhere();
    setBusy(false);
    await signOut();
    closeSettings();
  };
  return (
    <Section icon={UserRound} title={t("Account", "खाता")}>
      {!edit ? (
        <>
          <Row
            label={p?.full_name || "—"}
            sub={[
              p?.phone,
              p?.org_name,
              [p?.village, p?.district, p?.state].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Btn v="outline" className="px-3 py-1.5 text-xs" onClick={() => setEdit(true)}>
              {t("Edit", "बदलें")}
            </Btn>
          </Row>
        </>
      ) : (
        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Full name", "पूरा नाम")}>
              <input
                className={inputCls}
                maxLength={60}
                value={f.full_name}
                onChange={(e) => setF({ ...f, full_name: e.target.value })}
              />
            </Field>
            <Field label={t("Mobile", "मोबाइल")}>
              <input
                className={inputCls}
                inputMode="numeric"
                maxLength={10}
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
          {role !== "farmer" && role !== "transporter" && (
            <Field
              label={
                role === "owner"
                  ? t("Cold room / company name", "कोल्ड रूम / कंपनी")
                  : t("Business / store name", "व्यवसाय का नाम")
              }
            >
              <input
                className={inputCls}
                maxLength={80}
                value={f.org_name}
                onChange={(e) => setF({ ...f, org_name: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("State", "राज्य")}>
              <select
                className={inputCls}
                value={f.state}
                onChange={(e) =>
                  setF({
                    ...f,
                    state: e.target.value,
                    district: DISTRICTS[e.target.value]?.[0] ?? "",
                  })
                }
              >
                {Object.keys(DISTRICTS).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label={t("District", "ज़िला")}>
              <select
                className={inputCls}
                value={f.district}
                onChange={(e) => setF({ ...f, district: e.target.value })}
              >
                {(DISTRICTS[f.state] ?? []).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          {role === "farmer" && (
            <Field label={t("Village", "गाँव")}>
              <input
                className={inputCls}
                maxLength={40}
                value={f.village}
                onChange={(e) => setF({ ...f, village: e.target.value })}
              />
            </Field>
          )}
          {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Btn v="outline" onClick={() => setEdit(false)}>
              {t("Cancel", "रद्द करें")}
            </Btn>
            <Btn className="flex-1" disabled={saveProfile.isPending} onClick={submit}>
              {t("Save", "सेव करें")}
            </Btn>
          </div>
        </div>
      )}
      <LinkRow
        icon={KeyRound}
        label={t("Email, password and login methods", "ईमेल, पासवर्ड और लॉगिन")}
        onClick={() => clerk.openUserProfile()}
      />
      <LinkRow
        icon={LogOut}
        label={t("Sign out", "लॉग आउट")}
        onClick={async () => {
          await signOut();
          closeSettings();
        }}
      />
      <LinkRow
        icon={LogOut}
        label={busy ? "…" : t("Sign out of all devices", "सभी डिवाइस से लॉग आउट")}
        sub={t("Use this if you lost a phone", "फ़ोन खोने पर इस्तेमाल करें")}
        onClick={everywhere}
      />
    </Section>
  );
}

function DisplaySection() {
  const { s, set, t } = useStore();
  return (
    <Section icon={Globe} title={t("Language and display", "भाषा और दिखावट")}>
      <div className="px-4 py-3">
        <p className="text-sm text-foreground">{t("Language", "भाषा")}</p>
        <p className="mb-2 text-xs text-muted-foreground">
          {t(
            "15 languages. Chill Sahayak and read-aloud follow your choice. Translations are machine-made; tell us if a word reads wrong.",
            "15 भाषाएँ। चिल सहायक और पढ़कर सुनाना आपकी भाषा में। अनुवाद मशीन से बने हैं; कोई शब्द गलत लगे तो बताएँ।",
          )}
        </p>
        <LangList grid onPick={(k) => set((x) => ({ ...x, lang: k }))} />
      </div>
      <Row label={t("Text size", "अक्षर का आकार")} sub={`${s.scale}px`}>
        <input
          type="range"
          min={14}
          max={21}
          value={s.scale}
          onChange={(e) => set((x) => ({ ...x, scale: +e.target.value }))}
          className="w-32 accent-primary"
          aria-label={t("Text size", "अक्षर का आकार")}
        />
      </Row>
      <Row label={t("Theme", "थीम")}>
        <Seg<Theme>
          value={s.theme}
          options={[
            ["light", t("Light", "हल्का")],
            ["dark", t("Dark", "गहरा")],
            ["system", t("Auto", "अपने-आप")],
          ]}
          onChange={(v) => set((x) => ({ ...x, theme: v }))}
        />
      </Row>
      <Row
        label={t("Layout", "लेआउट")}
        sub={t(
          "Auto picks phone or computer layout from screen size",
          "स्क्रीन के हिसाब से अपने-आप",
        )}
      >
        <Seg<Layout>
          value={s.layout}
          options={[
            ["auto", t("Auto", "अपने-आप")],
            ["mobile", t("Phone", "फ़ोन")],
            ["desktop", t("Computer", "कंप्यूटर")],
          ]}
          onChange={(v) => set((x) => ({ ...x, layout: v }))}
        />
      </Row>
      <Row
        label={t("Read screens aloud", "स्क्रीन पढ़कर सुनाएँ")}
        sub={t("Adds a speaker button to every page heading", "हर पेज के शीर्षक पर स्पीकर बटन")}
      >
        <Toggle
          on={s.readAloud}
          onChange={(v) => set((x) => ({ ...x, readAloud: v }))}
          label="Read aloud"
        />
      </Row>
    </Section>
  );
}

const TOPICS = [
  ["bookings", "Cold storage bookings", "कोल्ड स्टोरेज बुकिंग"],
  ["trips", "Truck trips", "ट्रक यात्राएँ"],
  ["payments", "Orders and payments", "ऑर्डर और भुगतान"],
  ["ratings", "New ratings", "नई रेटिंग"],
  ["prices", "Price alerts", "भाव अलर्ट"],
] as const;
function NotifySection({ cur, save }: { cur: Settings; save: (p: Settings) => void }) {
  const { t } = useStore();
  const n = cur.notify ?? {};
  const topics = {
    bookings: true,
    trips: true,
    payments: true,
    ratings: true,
    prices: true,
    ...n.topics,
  };
  const put = (patch: Partial<NonNullable<Settings["notify"]>>) =>
    save({ notify: { ...n, topics, ...patch } });
  return (
    <Section icon={Bell} title={t("Notifications", "सूचनाएँ")}>
      <Row
        label={t("Email", "ईमेल")}
        sub={t("Booking, trip and payment emails", "बुकिंग, ट्रिप और भुगतान ईमेल")}
      >
        <Toggle on={n.email !== false} onChange={(v) => put({ email: v })} label="Email" />
      </Row>
      <Row
        label={t("Alert sound", "अलर्ट आवाज़")}
        sub={t("Beep for new bookings and nearby loads", "नई बुकिंग और पास के माल पर आवाज़")}
      >
        <Toggle on={n.sound !== false} onChange={(v) => put({ sound: v })} label="Sound" />
      </Row>
      <Row label={t("WhatsApp and SMS", "WhatsApp और SMS")} sub={t("Coming soon", "जल्द आ रहा है")}>
        <Badge tone="muted">{t("Soon", "जल्द")}</Badge>
      </Row>
      <div className="px-4 py-3">
        <Label>{t("What to tell me about", "किस बारे में बताएँ")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS.map(([k, en, hi]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={topics[k]}
                onChange={(e) => put({ topics: { ...topics, [k]: e.target.checked } })}
              />
              {t(en, hi)}
            </label>
          ))}
        </div>
      </div>
      <Row
        label={t("Quiet hours", "शांत समय")}
        sub={
          n.quiet
            ? `${n.quietFrom ?? "22:00"} – ${n.quietTo ?? "06:00"}`
            : t("No sounds at night", "रात में आवाज़ नहीं")
        }
      >
        <Toggle
          on={!!n.quiet}
          onChange={(v) =>
            put({ quiet: v, quietFrom: n.quietFrom ?? "22:00", quietTo: n.quietTo ?? "06:00" })
          }
          label="Quiet hours"
        />
      </Row>
      {n.quiet && (
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <Field label={t("From", "से")}>
            <input
              type="time"
              className={inputCls}
              value={n.quietFrom ?? "22:00"}
              onChange={(e) => put({ quietFrom: e.target.value })}
            />
          </Field>
          <Field label={t("To", "तक")}>
            <input
              type="time"
              className={inputCls}
              value={n.quietTo ?? "06:00"}
              onChange={(e) => put({ quietTo: e.target.value })}
            />
          </Field>
        </div>
      )}
    </Section>
  );
}

function PaymentsSection({ cur, save }: { cur: Settings; save: (p: Settings) => void }) {
  const { t } = useStore();
  const { data: me } = useMe();
  const saveProfile = useSaveProfile();
  const [upi, setUpi] = useState(me?.profile?.upi_id ?? "");
  const [backup, setBackup] = useState(cur.upiBackup ?? "");
  const [err, setErr] = useState("");
  const ok = (x: string) => /^[\w.-]{3,}@[a-z]{2,}$/i.test(x);
  const exportCsv = async () => {
    const r = await api.getMyData();
    if (r.error || !r.data) return setErr(r.error?.message ?? "Failed");
    const d = r.data as unknown as {
      bookings: {
        created_at: string;
        pass_no: string;
        amount: number;
        paid: boolean;
        pay_method: string | null;
        utr: string | null;
      }[];
      lots: { created_at: string; lot_code: string; net_amount: number; status: string }[];
      trips: { created_at: string; trip_code: string; amount: number; status: string }[];
    };
    const rows = [
      ["date", "type", "reference", "amount_inr", "status", "method", "utr"],
      ...d.bookings.map((b) => [
        b.created_at.slice(0, 10),
        "cold storage",
        b.pass_no,
        b.amount,
        b.paid ? "paid" : "due",
        b.pay_method ?? "",
        b.utr ?? "",
      ]),
      ...d.lots.map((l) => [
        l.created_at.slice(0, 10),
        "lot sale",
        l.lot_code,
        l.net_amount,
        l.status,
        "",
        "",
      ]),
      ...d.trips.map((x) => [
        x.created_at.slice(0, 10),
        "truck trip",
        x.trip_code,
        x.amount,
        x.status,
        "",
        "",
      ]),
    ];
    download(
      "chillchain-payments.csv",
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"),
      "text/csv",
    );
  };
  return (
    <Section icon={CreditCard} title={t("Payments", "भुगतान")}>
      <div className="space-y-3 px-4 py-3">
        <Field label={t("Main UPI ID (you receive money here)", "मुख्य UPI ID (यहाँ पैसा आएगा)")}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={upi}
              maxLength={50}
              onChange={(e) => setUpi(e.target.value.trim())}
              placeholder="name@sbi"
            />
            <Btn
              v="outline"
              className="shrink-0"
              onClick={() => {
                if (!ok(upi))
                  return setErr(t("Enter a valid UPI ID like name@sbi", "सही UPI ID डालें"));
                setErr("");
                saveProfile.mutate({ upi_id: upi });
              }}
            >
              {t("Save", "सेव")}
            </Btn>
          </div>
        </Field>
        <Field label={t("Backup UPI ID (optional)", "दूसरी UPI ID (वैकल्पिक)")}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={backup}
              maxLength={50}
              onChange={(e) => setBackup(e.target.value.trim())}
              placeholder="name@okaxis"
            />
            <Btn
              v="outline"
              className="shrink-0"
              onClick={() => {
                if (backup && !ok(backup))
                  return setErr(t("Enter a valid backup UPI ID", "सही UPI ID डालें"));
                setErr("");
                save({ upiBackup: backup });
              }}
            >
              {t("Save", "सेव")}
            </Btn>
          </div>
        </Field>
        {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
      </div>
      <Row
        label={t("Bank account for payouts", "भुगतान के लिए बैंक खाता")}
        sub={t("Coming with real payments", "असली भुगतान के साथ आएगा")}
      >
        <Badge tone="muted">{t("Soon", "जल्द")}</Badge>
      </Row>
      <LinkRow
        icon={Download}
        label={t("Download payment history (CSV)", "भुगतान इतिहास डाउनलोड करें (CSV)")}
        sub={t("Opens in Excel or Google Sheets", "Excel या Google Sheets में खुलेगा")}
        onClick={exportCsv}
      />
    </Section>
  );
}

function RatingSection() {
  const { t } = useStore();
  const rev = useMyReviews();
  const inv = useInvalidate();
  const [disp, setDisp] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const send = async (id: string) => {
    const r = await api.raiseDispute(id, reason);
    if (r.error) return setErr(r.error.message);
    setDisp(null);
    setReason("");
    setErr("");
    inv("reviews");
  };
  return (
    <Section icon={Star} title={t("ChillScore rating", "चिलस्कोर रेटिंग")}>
      <div className="px-4 py-3">
        <MyRatingSummary onOpen={closeSettings} />
      </div>
      <LinkRow
        icon={Star}
        label={t("Rate my partners", "साथियों को रेट करें")}
        onClick={() => {
          closeSettings();
          openKrishiSaakh("rate");
        }}
      />
      <div className="px-4 py-3">
        <Label>{t("Ratings I received", "मुझे मिली रेटिंग")}</Label>
        {rev.isLoading && (
          <p className="text-xs text-muted-foreground">{t("Loading…", "लोड हो रहा है…")}</p>
        )}
        {!rev.isLoading && !(rev.data ?? []).length && (
          <p className="text-xs text-muted-foreground">
            {t(
              "No ratings yet. They appear here after the 48-hour reveal.",
              "अभी कोई रेटिंग नहीं। 48 घंटे बाद यहाँ दिखेंगी।",
            )}
          </p>
        )}
        <div className="space-y-2">
          {(rev.data ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {t(FLOWS[r.flow as FlowId].en, FLOWS[r.flow as FlowId].hi)} ·{" "}
                  <b>{Math.round(r.score)}/100</b>
                </span>
                <span className="text-muted-foreground">{r.created_at.slice(0, 10)}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("System", "सिस्टम")} {Math.round(r.system_score)} · {t("Partner", "साथी")}{" "}
                {Math.round(r.peer_score)}
              </p>
              {r.excluded ? (
                <Badge tone="muted">{t("Removed after review", "जाँच के बाद हटाई गई")}</Badge>
              ) : r.dispute ? (
                <Badge tone="amber">
                  {r.dispute === "open"
                    ? t("Dispute open", "विवाद खुला है")
                    : r.dispute === "upheld"
                      ? t("Dispute upheld", "विवाद सही माना गया")
                      : t("Dispute dismissed", "विवाद खारिज")}
                </Badge>
              ) : disp === r.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className={inputCls}
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("Why is this rating unfair?", "यह रेटिंग गलत क्यों है?")}
                  />
                  {err && <p className="font-semibold text-destructive">{err}</p>}
                  <div className="flex gap-2">
                    <Btn v="outline" className="px-3 py-1.5 text-xs" onClick={() => setDisp(null)}>
                      {t("Cancel", "रद्द करें")}
                    </Btn>
                    <Btn
                      className="px-3 py-1.5 text-xs"
                      disabled={reason.trim().length < 5}
                      onClick={() => send(r.id)}
                    >
                      {t("Send to ChillChain", "ChillChain को भेजें")}
                    </Btn>
                  </div>
                </div>
              ) : (
                <button
                  className="mt-1 font-medium text-navy underline"
                  onClick={() => setDisp(r.id)}
                >
                  {t("Raise a dispute", "विवाद दर्ज करें")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function FarmerSection({
  cur,
  save,
  go,
}: {
  cur: Settings;
  save: (p: Settings) => void;
  go: (tab: string) => void;
}) {
  const { t, s } = useStore();
  const { data: me } = useMe();
  const saveProfile = useSaveProfile();
  const [alert, setAlert] = useState({
    crop: "strawberry",
    dir: "above" as "above" | "below",
    price: "",
  });
  const [id, setId] = useState({
    id_type: me?.profile?.id_type ?? "Aadhaar",
    id_number: me?.profile?.id_number ?? "",
  });
  const crops = cur.crops ?? [];
  const alerts = cur.priceAlerts ?? [];
  return (
    <Section icon={Sprout} title={t("My farm", "मेरा खेत")}>
      <LinkRow
        icon={Sprout}
        label={t("Farm details for ProfitPlanter", "प्रॉफ़िटप्लांटर के लिए खेत की जानकारी")}
        sub={t(
          "Climate, land, budget, water, distance to a city",
          "जलवायु, ज़मीन, बजट, पानी, शहर से दूरी",
        )}
        onClick={() => go("advisor")}
      />
      <div className="pt-3">
        <p className="px-4 text-sm text-foreground">{t("Crops I grow", "मेरी फसलें")}</p>
        <p className="px-4 text-xs text-muted-foreground">
          {t("Shown first in market rates and buyer demand", "बाज़ार भाव और माँग में पहले दिखेंगी")}
        </p>
        <Chips
          all={CROPS.map((c) => c.key)}
          value={crops}
          onChange={(v) => save({ crops: v })}
          render={(k) => `${cropBy(k).emoji} ${t(cropBy(k).en, cropBy(k).hi)}`}
        />
      </div>
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-foreground">{t("Price alerts", "भाव अलर्ट")}</p>
        <p className="text-xs text-muted-foreground">
          {t(
            "Shown on Home when today's market price crosses your number",
            "आज का मंडी भाव आपकी सीमा पार करे तो होम पर दिखेगा",
          )}
        </p>
        {alerts.map((a, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"
          >
            <span>
              {cropBy(a.crop).emoji} {cropBy(a.crop).en} {a.dir === "above" ? "≥" : "≤"} ₹{a.price}
              /kg
            </span>
            <button
              aria-label={t("Remove", "हटाएँ")}
              onClick={() => save({ priceAlerts: alerts.filter((_, j) => j !== i) })}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto_5rem_auto] items-end gap-2">
          <CropSelect value={alert.crop} onChange={(k) => setAlert({ ...alert, crop: k })} />
          <select
            className={`${inputCls} w-auto`}
            value={alert.dir}
            onChange={(e) => setAlert({ ...alert, dir: e.target.value as "above" | "below" })}
          >
            <option value="above">{t("above", "से ऊपर")}</option>
            <option value="below">{t("below", "से नीचे")}</option>
          </select>
          <input
            className={inputCls}
            type="number"
            min={1}
            placeholder="₹/kg"
            value={alert.price}
            onChange={(e) => setAlert({ ...alert, price: e.target.value })}
          />
          <Btn
            className="px-3"
            aria-label={t("Add alert", "अलर्ट जोड़ें")}
            disabled={!(+alert.price > 0)}
            onClick={() => {
              save({
                priceAlerts: [...alerts, { crop: alert.crop, dir: alert.dir, price: +alert.price }],
              });
              setAlert({ ...alert, price: "" });
            }}
          >
            <Plus className="h-4 w-4" />
          </Btn>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-foreground">
          {t("Farmer ID (Aadhaar / KCC / PM-Kisan)", "किसान पहचान (आधार / KCC / PM-Kisan)")}
        </p>
        <div className="flex gap-2">
          <select
            className={`${inputCls} w-auto`}
            value={id.id_type}
            onChange={(e) => setId({ ...id, id_type: e.target.value })}
          >
            {["Aadhaar", "KCC", "PM-Kisan"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            className={inputCls}
            maxLength={20}
            value={id.id_number}
            onChange={(e) => setId({ ...id, id_number: e.target.value })}
          />
          <Btn
            v="outline"
            className="shrink-0"
            onClick={() =>
              saveProfile.mutate({ id_type: id.id_type, id_number: id.id_number.trim() || null })
            }
          >
            {t("Save", "सेव")}
          </Btn>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {t(
            "Saved to your profile. Your FPO verifies it.",
            "आपकी प्रोफ़ाइल में सेव। आपका FPO इसकी जाँच करेगा।",
          )}
        </p>
      </div>
    </Section>
  );
}

const DAYS = [
  ["mon", "Mon", "सोम"],
  ["tue", "Tue", "मंगल"],
  ["wed", "Wed", "बुध"],
  ["thu", "Thu", "गुरु"],
  ["fri", "Fri", "शुक्र"],
  ["sat", "Sat", "शनि"],
  ["sun", "Sun", "रवि"],
] as const;
function TransporterSection({
  cur,
  save,
  go,
  available,
}: {
  cur: Settings;
  save: (p: Settings) => void;
  go: (tab: string) => void;
  available: boolean | null;
}) {
  const { t } = useStore();
  const inv = useInvalidate();
  const [routes, setRoutes] = useState(cur.routes ?? "");
  return (
    <Section icon={Truck} title={t("Driving", "ड्राइविंग")}>
      <Row
        label={
          available
            ? t("Online: getting load alerts", "ऑनलाइन: माल के अलर्ट मिल रहे हैं")
            : t("Offline: no new loads", "ऑफ़लाइन: नया माल नहीं")
        }
        sub={t("Turn off when you are not taking trips", "ट्रिप न लेने पर बंद करें")}
      >
        <Toggle
          on={!!available}
          disabled={available === null}
          onChange={async (v) => {
            await api.setAvailability(v);
            inv("settings", "driver");
          }}
          label="Online"
        />
      </Row>
      <div className="pt-3">
        <p className="px-4 text-sm text-foreground">
          {t("Days I usually drive", "आमतौर पर किन दिनों चलाता हूँ")}
        </p>
        <Chips
          all={DAYS.map((d) => d[0])}
          value={cur.days ?? []}
          onChange={(v) => save({ days: v as NonNullable<Settings["days"]> })}
          render={(k) => {
            const d = DAYS.find((x) => x[0] === k)!;
            return t(d[1], d[2]);
          }}
        />
      </div>
      <div className="px-4 py-3">
        <Field label={t("Preferred routes or markets", "पसंदीदा रास्ते या बाज़ार")}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              maxLength={200}
              value={routes}
              onChange={(e) => setRoutes(e.target.value)}
              placeholder="Sonipat → Azadpur, Karnal → Panipat"
            />
            <Btn v="outline" className="shrink-0" onClick={() => save({ routes })}>
              {t("Save", "सेव")}
            </Btn>
          </div>
        </Field>
      </div>
      <LinkRow
        icon={ShieldCheck}
        label={t("My vehicle, documents and radius", "मेरी गाड़ी, दस्तावेज़ और दायरा")}
        onClick={() => go("vehicle")}
      />
    </Section>
  );
}

function BuyerSection({ cur, save }: { cur: Settings; save: (p: Settings) => void }) {
  const { t, s } = useStore();
  const [gst, setGst] = useState(cur.gst ?? "");
  const [addr, setAddr] = useState("");
  const addresses = cur.addresses ?? [];
  const districts = Object.values(DISTRICTS).flat();
  return (
    <Section icon={Store} title={t("Buying preferences", "खरीद की पसंद")}>
      <div className="pt-3">
        <p className="px-4 text-sm text-foreground">{t("Crops I buy", "जो फसलें खरीदता हूँ")}</p>
        <p className="px-4 text-xs text-muted-foreground">
          {t("These lots appear first in the market", "ये लॉट बाज़ार में पहले दिखेंगे")}
        </p>
        <Chips
          all={CROPS.map((c) => c.key)}
          value={cur.buyCrops ?? []}
          onChange={(v) => save({ buyCrops: v })}
          render={(k) => `${cropBy(k).emoji} ${t(cropBy(k).en, cropBy(k).hi)}`}
        />
      </div>
      <div className="pt-1">
        <p className="px-4 text-sm text-foreground">
          {t("Districts I buy from", "जिन ज़िलों से खरीदता हूँ")}
        </p>
        <Chips
          all={districts}
          value={cur.buyDistricts ?? []}
          onChange={(v) => save({ buyDistricts: v })}
          render={(k) => k}
        />
      </div>
      <div className="px-4 py-3">
        <Field label={t("GST number (GSTIN)", "GST नंबर (GSTIN)")}>
          <div className="flex gap-2">
            <input
              className={`${inputCls} uppercase`}
              maxLength={15}
              value={gst}
              onChange={(e) => setGst(e.target.value)}
              placeholder="06ABCDE1234F1Z5"
            />
            <Btn v="outline" className="shrink-0" onClick={() => save({ gst })}>
              {t("Save", "सेव")}
            </Btn>
          </div>
        </Field>
      </div>
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-foreground">{t("Delivery addresses", "डिलीवरी पते")}</p>
        {addresses.map((a, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"
          >
            <span>
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
              {a}
            </span>
            <button
              aria-label={t("Remove", "हटाएँ")}
              onClick={() => save({ addresses: addresses.filter((_, j) => j !== i) })}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className={inputCls}
            maxLength={200}
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder={t("Shop no., mandi, city", "दुकान नं., मंडी, शहर")}
          />
          <Btn
            className="shrink-0 px-3"
            aria-label={t("Add address", "पता जोड़ें")}
            disabled={addr.trim().length < 5}
            onClick={() => {
              save({ addresses: [...addresses, addr.trim()] });
              setAddr("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Btn>
        </div>
      </div>
    </Section>
  );
}

function OwnerSection({ go, palledari }: { go: (tab: string) => void; palledari: number | null }) {
  const { t } = useStore();
  const dash = useOwnerDashboard();
  const inv = useInvalidate();
  const room = dash.data?.room;
  const [rate, setRate] = useState(palledari === null ? "" : String(palledari));
  const [err, setErr] = useState("");
  return (
    <Section icon={Warehouse} title={t("My cold room", "मेरा कोल्ड रूम")}>
      <LinkRow
        icon={Warehouse}
        label={t("Room details, rate and capacity", "कक्ष, रेट और क्षमता")}
        onClick={() => go("room")}
      />
      {room && (
        <Row
          label={t("Accept new bookings", "नई बुकिंग लें")}
          sub={
            room.accepting_bookings
              ? t("Farmers can book now", "किसान अभी बुक कर सकते हैं")
              : t("Paused", "रोका गया")
          }
        >
          <Toggle
            on={room.accepting_bookings}
            onChange={async (v) => {
              await api.updateRoom({
                rate: room.rate_per_crate_day,
                slots: room.total_slots,
                temp: room.temp_c,
                humidity: room.humidity,
                phone: room.phone ?? "",
                accepting: v,
              });
              inv("owner", "cold_rooms");
            }}
            label="Accept bookings"
          />
        </Row>
      )}
      <div className="px-4 py-3">
        <Field label={t("Palledari (loading / unloading) ₹ per crate", "पल्लेदारी ₹ प्रति क्रेट")}>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={500}
              className={inputCls}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 3"
            />
            <Btn
              v="outline"
              className="shrink-0"
              onClick={async () => {
                const r = await api.setPalledari(rate === "" ? null : Math.round(+rate));
                setErr(r.error?.message ?? "");
                inv("settings", "cold_rooms");
              }}
            >
              {t("Save", "सेव")}
            </Btn>
          </div>
        </Field>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          {t(
            "Shown to farmers on your room card, so the final bill has no surprises.",
            "किसानों को आपके कार्ड पर दिखेगा, ताकि बिल में कोई छिपा शुल्क न हो।",
          )}
        </p>
        {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
      </div>
      <Row
        label={t("Staff accounts", "स्टाफ खाते")}
        sub={t("Let a gate manager check farmers in", "गेट मैनेजर को चेक-इन करने दें")}
      >
        <Badge tone="muted">{t("Soon", "जल्द")}</Badge>
      </Row>
    </Section>
  );
}

function PrivacySection({ cur, save }: { cur: Settings; save: (p: Settings) => void }) {
  const { t, signOut } = useStore();
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const exportJson = async () => {
    const r = await api.getMyData();
    if (r.error) return setErr(r.error.message);
    download("chillchain-my-data.json", JSON.stringify(r.data, null, 2), "application/json");
  };
  const remove = async () => {
    setBusy(true);
    const r = await api.deleteMyAccount();
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    closeSettings();
    await signOut();
  };
  return (
    <Section icon={ShieldCheck} title={t("Privacy and security", "गोपनीयता और सुरक्षा")}>
      <Row
        label={t("Use my location", "मेरी लोकेशन इस्तेमाल करें")}
        sub={t("For nearby cold rooms and distances", "पास के कोल्ड रूम और दूरी के लिए")}
      >
        <Toggle
          on={cur.location !== false}
          onChange={(v) => save({ location: v })}
          label="Location"
        />
      </Row>
      <LinkRow
        icon={Download}
        label={t("Download my data", "मेरा डेटा डाउनलोड करें")}
        sub={t(
          "Everything ChillChain stores about you (JSON)",
          "ChillChain में आपकी सारी जानकारी (JSON)",
        )}
        onClick={exportJson}
      />
      <LinkRow
        icon={FileText}
        label={t("Privacy policy and terms", "गोपनीयता नीति और शर्तें")}
        onClick={() => window.open("/privacy", "_blank")}
      />
      {!del ? (
        <LinkRow
          icon={Trash2}
          danger
          label={t("Delete my account", "मेरा खाता हटाएँ")}
          sub={t("Removes your login and personal details", "आपका लॉगिन और निजी जानकारी हटेगी")}
          onClick={() => setDel(true)}
        />
      ) : (
        <div className="space-y-2 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">
            {t("This cannot be undone.", "यह वापस नहीं हो सकता।")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Your login, name, phone, UPI, IDs and farm details are deleted. Past bookings and trips stay without your name so your partners' records stay correct.",
              "आपका लॉगिन, नाम, फ़ोन, UPI, पहचान और खेत की जानकारी हटेगी। पुरानी बुकिंग आपके नाम के बिना रहेंगी ताकि साथियों का हिसाब सही रहे।",
            )}
          </p>
          <input
            className={inputCls}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("Type DELETE to confirm", "पुष्टि के लिए DELETE लिखें")}
          />
          <div className="flex gap-2">
            <Btn
              v="outline"
              onClick={() => {
                setDel(false);
                setTyped("");
              }}
            >
              {t("Cancel", "रद्द करें")}
            </Btn>
            <Btn
              v="danger"
              className="flex-1"
              disabled={typed !== "DELETE" || busy}
              onClick={remove}
            >
              {busy ? "…" : t("Delete forever", "हमेशा के लिए हटाएँ")}
            </Btn>
          </div>
        </div>
      )}
      {err && <p className="px-4 py-2 text-xs font-semibold text-destructive">{err}</p>}
    </Section>
  );
}

const FAQ = [
  [
    "Are payments real?",
    "क्या भुगतान असली हैं?",
    "Not yet. Escrow, UPI and fares are in test mode; no real money moves.",
    "अभी नहीं। एस्क्रो, UPI और भाड़ा टेस्ट मोड में हैं; असली पैसा नहीं जाता।",
  ],
  [
    "How is my ChillScore made?",
    "मेरा चिलस्कोर कैसे बनता है?",
    "Each finished deal is scored from app records plus your partner's 3-tap answers. Open the rating panel to see the formula.",
    "हर पूरे सौदे का स्कोर ऐप रिकॉर्ड और साथी के 3-टैप जवाब से बनता है। फ़ॉर्मूला रेटिंग पैनल में देखें।",
  ],
  [
    "Who can see my phone number?",
    "मेरा फ़ोन नंबर कौन देख सकता है?",
    "Only the partner on a confirmed booking or trip. Cold room phone numbers are public so farmers can call.",
    "सिर्फ़ पक्की बुकिंग या ट्रिप वाला साथी। कोल्ड रूम का नंबर सबको दिखता है ताकि किसान कॉल कर सकें।",
  ],
] as const;
function HelpSection({ role, go }: { role: Role; go: (tab: string) => void }) {
  const { t } = useStore();
  const admin = useIsAdmin();
  return (
    <Section icon={HelpCircle} title={t("Help", "मदद")}>
      {role === "farmer" && (
        <LinkRow
          icon={Bot}
          label={t("Ask Chill Sahayak", "चिल सहायक से पूछें")}
          onClick={() => go("assist")}
        />
      )}
      {role === "transporter" && (
        <LinkRow
          icon={Bot}
          label={t("Ask Safar Sahayak", "सफ़र सहायक से पूछें")}
          onClick={() => go("help")}
        />
      )}
      {SUPPORT_PHONE && (
        <LinkRow
          icon={LifeBuoy}
          label={t("Call FPO support", "FPO सहायता को कॉल करें")}
          sub={SUPPORT_PHONE}
          onClick={() => {
            window.location.href = `tel:${SUPPORT_PHONE}`;
          }}
        />
      )}
      {SUPPORT_PHONE && (
        <LinkRow
          icon={LifeBuoy}
          label={t("WhatsApp support", "WhatsApp सहायता")}
          onClick={() =>
            window.open(`https://wa.me/91${SUPPORT_PHONE.replace(/\D/g, "").slice(-10)}`, "_blank")
          }
        />
      )}
      {SUPPORT_EMAIL && (
        <LinkRow
          icon={LifeBuoy}
          label={t("Report a problem", "समस्या बताएँ")}
          sub={SUPPORT_EMAIL}
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`ChillChain ${APP_VERSION} problem`)}`;
          }}
        />
      )}
      <div className="space-y-1 px-4 py-3">
        {FAQ.map(([qe, qh, ae, ah]) => (
          <details key={qe} className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">{t(qe, qh)}</summary>
            <p className="mt-1 text-xs text-muted-foreground">{t(ae, ah)}</p>
          </details>
        ))}
      </div>
      {admin.data && (
        <LinkRow
          icon={ShieldCheck}
          label={t("Admin console", "एडमिन कंसोल")}
          sub={t(
            "Verify drivers and rooms, resolve disputes",
            "ड्राइवर व कमरे सत्यापित करें, विवाद सुलझाएँ",
          )}
          onClick={() => window.open("/admin", "_blank")}
        />
      )}
      <Row label={t("App version", "ऐप संस्करण")}>
        <span className="text-xs text-muted-foreground">ChillChain {APP_VERSION}</span>
      </Row>
    </Section>
  );
}
